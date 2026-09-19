import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { ensureAppTables } from './migrations';

function getDataDir(): string {
  return path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    '..',
    'data',
  );
}

interface BootstrapOptions {
  companyName: string;
  businessId?: string;
  periodStartDate: number;
  periodEndDate: number;
}

/**
 * Creates a brand-new Ledgerly SQLite database with all required legacy tables,
 * a default Finnish chart of accounts, report structures, and a first period.
 * Returns the slug (directory name) under DATA_DIR.
 */
export function createNewDatabase(
  slug: string,
  options: BootstrapOptions,
): string {
  const dataDir = getDataDir();
  const dirPath = path.join(dataDir, slug);
  fs.mkdirSync(dirPath, { recursive: true });

  const dbPath = path.join(dirPath, `${slug}.sqlite`);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE settings (
      version INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      business_id TEXT NOT NULL DEFAULT '',
      current_period_id INTEGER NOT NULL,
      document_type_id INTEGER,
      properties TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_date INTEGER NOT NULL,
      end_date INTEGER NOT NULL,
      locked INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE document (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL,
      period_id INTEGER NOT NULL REFERENCES period(id),
      date INTEGER NOT NULL
    );

    CREATE TABLE entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES document(id),
      account_id INTEGER NOT NULL REFERENCES account(id),
      debit INTEGER NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      row_number INTEGER NOT NULL,
      flags INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      type INTEGER NOT NULL,
      vat_code INTEGER NOT NULL DEFAULT 0,
      vat_percentage INTEGER NOT NULL DEFAULT 0,
      vat_account1_id INTEGER,
      vat_account2_id INTEGER,
      flags INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE coa_heading (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      level INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE report_structure (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE document_type (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      number_start INTEGER NOT NULL DEFAULT 0,
      number_end INTEGER NOT NULL DEFAULT 0
    );
  `);

  ensureAppTables(db);

  const periodResult = db
    .prepare(
      'INSERT INTO period (start_date, end_date, locked) VALUES (?, ?, 0)',
    )
    .run(options.periodStartDate, options.periodEndDate);
  const periodId = periodResult.lastInsertRowid as number;

  db.prepare(
    "INSERT INTO settings (version, name, business_id, current_period_id, document_type_id, properties) VALUES (?, ?, ?, ?, NULL, '')",
  ).run(6, options.companyName, options.businessId || '', periodId);

  seedAccounts(db);
  seedCOAHeadings(db);
  seedReportStructures(db);

  db.close();
  return slug;
}

/**
 * Validates that an external SQLite file has the expected Ledgerly schema.
 * Copies it into DATA_DIR so the app can manage it uniformly.
 */
export function linkExternalDatabase(
  externalPath: string,
  slug: string,
): string {
  if (!fs.existsSync(externalPath)) {
    throw new Error('File not found: ' + externalPath);
  }

  const db = new Database(externalPath, { readonly: true });
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];
    const tableNames = new Set(tables.map((t) => t.name));
    const required = ['settings', 'period', 'account', 'entry', 'document'];
    const missing = required.filter((t) => !tableNames.has(t));
    if (missing.length > 0) {
      throw new Error('Database missing tables: ' + missing.join(', '));
    }

    const requiredColumns: Record<string, string[]> = {
      period: ['start_date', 'end_date', 'locked'],
      account: ['number', 'name', 'type'],
      document: ['number', 'period_id', 'date'],
      entry: ['document_id', 'account_id', 'debit', 'amount', 'row_number'],
    };
    for (const [table, columns] of Object.entries(requiredColumns)) {
      const info = db.prepare(`PRAGMA table_info(${table})`).all() as {
        name: string;
      }[];
      const colNames = new Set(info.map((c) => c.name));
      const missingCols = columns.filter((c) => !colNames.has(c));
      if (missingCols.length > 0) {
        throw new Error(
          `Table '${table}' missing columns: ${missingCols.join(', ')}`,
        );
      }
    }
  } finally {
    db.close();
  }

  const dirPath = path.join(getDataDir(), slug);
  fs.mkdirSync(dirPath, { recursive: true });
  const destPath = path.join(dirPath, `${slug}.sqlite`);
  fs.copyFileSync(externalPath, destPath);

  const destDb = new Database(destPath);
  destDb.pragma('journal_mode = WAL');
  ensureAppTables(destDb);
  destDb.close();

  return slug;
}

// Account types: 0=Assets, 1=Liabilities, 2=Equity, 3=Revenue, 4=Expenses, 5=Prior periods' profit, 6=Current period profit
type AccountSeed = [string, string, number];

const DEFAULT_ACCOUNTS: AccountSeed[] = [
  // Assets (Assets)
  ['1000', "Formation expenses", 0],
  ['1010', "Development expenses", 0],
  ['1060', "Intangible rights", 0],
  ['1100', "Land and water areas", 0],
  ['1120', "Buildings and structures", 0],
  ['1150', "Machinery and equipment", 0],
  ['1170', "Other tangible assets", 0],
  ['1300', "Shares in group companies", 0],
  ['1500', "Trade receivables", 0],
  ['1510', "Receivables from group companies", 0],
  ['1530', "Loan receivables", 0],
  ['1560', "Other receivables", 0],
  ['1700', 'Prepayments and accrued income', 0],
  ['1800', 'Financial securities', 0],
  ['1900', "Bank account", 0],
  ['1910', "Cash", 0],
  // Oma pääoma (Equity)
  ['2000', "Share capital", 2],
  ['2010', 'Share premium reserve', 2],
  ['2020', "Revaluation reserve", 2],
  ['2050', 'Other reserves', 2],
  ['2100', 'SVOP reserve', 2],
  ['2250', "Prior periods' profit (loss)", 5],
  ['2370', "Current period's profit (loss)", 6],
  // Liabilities / Vieras pääoma (Liabilities)
  ['2400', "Capital loans", 1],
  ['2460', "Bank loans", 1],
  ['2580', "Advances received", 1],
  ['2620', "Trade payables", 1],
  ['2740', "Other payables", 1],
  ['2870', "Accrued expenses", 1],
  ['2939', "VAT payable", 1],
  // Tulot (Revenue)
  ['3000', "Sales", 3],
  ['3010', "Sales 25.5%", 3],
  ['3020', "Sales 14%", 3],
  ['3030', "Sales 10%", 3],
  ['3040', "Sales 0%", 3],
  ['3500', 'Other operating income', 3],
  // Menot (Expenses)
  ['4000', "Purchases", 4],
  ['4010', "Purchases 25.5%", 4],
  ['4020', "Purchases 14%", 4],
  ['4030', "Purchases 10%", 4],
  ['4040', "Purchases 0%", 4],
  ['4200', 'Change in inventories', 4],
  ['5000', 'External services', 4],
  ['6000', 'Wages and salaries', 4],
  ['6100', "Pension costs", 4],
  ['6140', "Other personnel expenses", 4],
  ['6300', "Depreciation", 4],
  ['7000', "Premises costs", 4],
  ['7100', "Vehicle costs", 4],
  ['7200', "Travel expenses", 4],
  ['7300', "Entertainment expenses", 4],
  ['7400', "Sales and marketing expenses", 4],
  ['7500', "Administrative expenses", 4],
  ['7600', "IT and communication costs", 4],
  ['7680', "Bank and financing costs", 4],
  ['7700', "Other operating expenses", 4],
  ['8000', 'Financial income', 3],
  ['8500', 'Financial expenses', 4],
  ['9000', 'Extraordinary income', 3],
  ['9100', 'Extraordinary expenses', 4],
  ['9500', 'Income taxes', 4],
];

function seedAccounts(db: Database.Database): void {
  const stmt = db.prepare(
    'INSERT INTO account (number, name, type, vat_code, vat_percentage, vat_account1_id, vat_account2_id, flags) VALUES (?, ?, ?, 0, 0, NULL, NULL, 0)',
  );
  const tx = db.transaction((accounts: AccountSeed[]) => {
    for (const [number, name, type] of accounts) {
      stmt.run(number, name, type);
    }
  });
  tx(DEFAULT_ACCOUNTS);
}

type HeadingSeed = [string, string, number];

const DEFAULT_COA_HEADINGS: HeadingSeed[] = [
  ['1000', "Formation expenses", 0],
  ['1000', "Formation expenses", 1],
  ['1000', "Formation expenses", 2],
  ['1100', "Land and water areas", 2],
  ['1300', "Shares in group companies", 2],
  ['1500', "Trade receivables", 1],
  ['1500', "Trade receivables", 2],
  ['1800', 'Financial securities', 2],
  ['1900', "Bank account", 2],
  ['2000', "Share capital", 0],
  ['2000', "Share capital", 1],
  ['2400', "Capital loans", 1],
  ['2400', "Capital loans", 2],
  ['2580', "Advances received", 2],
  ['3000', "Sales", 0],
  ['3000', "Sales", 1],
  ['3500', 'Other operating income', 1],
  ['4000', "Purchases", 1],
  ['6000', 'Henkilöstökulut', 1],
  ['6300', "Depreciation", 1],
  ['7000', "Premises costs", 1],
  ['8000', 'Financial income ja -kulut', 1],
  ['9000', 'Satunnaiset erät', 1],
  ['9500', 'Tilinpäätössiirrot ja verot', 1],
];

function seedCOAHeadings(db: Database.Database): void {
  const stmt = db.prepare(
    'INSERT INTO coa_heading (number, text, level) VALUES (?, ?, ?)',
  );
  const tx = db.transaction((headings: HeadingSeed[]) => {
    for (const [number, text, level] of headings) {
      stmt.run(number, text, level);
    }
  });
  tx(DEFAULT_COA_HEADINGS);
}

const INCOME_STATEMENT_STRUCTURE = `HP;INCOME STATEMENT
SP0;3000;3050;Revenue
SP0;3500;3999;Other operating income
-
SP0;4000;4050;Materials and services
SP0;4200;4200;Change in inventories
SP0;5000;5999;External services
-
SP0;6000;6099;Wages and salaries
SP0;6100;6299;Personnel expenses
SP0;6300;6399;Depreciation and impairments
SP0;7000;7999;Other operating expenses
-
SB0;3000;7999;OPERATING PROFIT (LOSS)
-
SP0;8000;8499;Financial income
SP0;8500;8999;Financial expenses
-
SB0;3000;8999;PROFIT (LOSS) BEFORE EXTRAORDINARY ITEMS
-
SP0;9000;9099;Extraordinary income
SP0;9100;9199;Extraordinary expenses
SP0;9500;9999;Income taxes
-
SB0;3000;9999;CURRENT PERIOD'S PROFIT (LOSS)`;

const BALANCE_SHEET_STRUCTURE = `HP;BALANCE SHEET
HB;Assets
HP1;NON-CURRENT ASSETS
HP2;Intangible assets
SP0;1000;1099;Intangible assets
HP2;Tangible assets
SP0;1100;1299;Tangible assets
HP2;Investments
SP0;1300;1499;Investments
SB1;1000;1499;Total non-current assets
-
HP1;CURRENT ASSETS
HP2;Receivables
SP0;1500;1699;Receivables
HP2;Prepayments and accrued income
SP0;1700;1799;Prepayments and accrued income
HP2;Financial securities
SP0;1800;1899;Financial securities
HP2;Cash and bank balances
SP0;1900;1999;Cash and bank balances
SB1;1500;1999;Total current assets
-
SB0;1000;1999;Total assets
-
HB;Liabilities
HP1;EQUITY
SP0;2000;2099;Share capital
SP0;2010;2049;Share premium reserve
SP0;2050;2099;Other reserves
SP0;2100;2199;SVOP reserve
SP0;2250;2369;Prior periods' profit (loss)
SP0;2370;2399;Current period's profit (loss)
SB1;2000;2399;Total equity
-
HP1;LIABILITIES
HP2;Non-current liabilities
SP0;2400;2579;Non-current liabilities
HP2;Current liabilities
SP0;2580;2999;Current liabilities
SB1;2400;2999;Total liabilities
-
SB0;2000;2999;Total liabilities`;

function seedReportStructures(db: Database.Database): void {
  const stmt = db.prepare(
    'INSERT INTO report_structure (id, data) VALUES (?, ?)',
  );
  stmt.run('income-statement-detailed', INCOME_STATEMENT_STRUCTURE);
  stmt.run('balance-sheet-detailed', BALANCE_SHEET_STRUCTURE);
}
