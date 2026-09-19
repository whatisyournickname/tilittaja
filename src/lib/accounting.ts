import {
  Account,
  AccountType,
  Entry,
  ReportRow,
  ReportRowType,
  ReportRowStyle,
} from './types';

type BalanceEntry = Pick<Entry, 'account_id' | 'debit' | 'amount'>;

export function calculateBalances(
  entries: BalanceEntry[],
  accounts: Account[],
): Map<number, number> {
  const accountMap = new Map<number, Account>();
  accounts.forEach((a) => accountMap.set(a.id, a));

  const balances = new Map<number, number>();

  for (const entry of entries) {
    const account = accountMap.get(entry.account_id);
    if (!account) continue;

    const current = balances.get(entry.account_id) || 0;
    const sign = getEntrySign(account.type, entry.debit);
    balances.set(entry.account_id, current + entry.amount * sign);
  }

  return balances;
}

export function getEntrySign(
  accountType: AccountType,
  isDebit: boolean,
): number {
  switch (accountType) {
    case 0: // Assets
    case 4: // Expenses
      return isDebit ? 1 : -1;
    case 1: // Liabilities
    case 2: // Equity
    case 3: // Revenue
    case 5: // Prior year profit
    case 6: // Current year profit
      return isDebit ? -1 : 1;
    default:
      return isDebit ? 1 : -1;
  }
}

export function parseReportStructure(data: string): ReportRow[] {
  const lines = data.split('\n');
  const rows: ReportRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === '-' || trimmed === '--') {
      rows.push({
        type: '-',
        style: 'P',
        level: 0,
        accountRanges: [],
        label: '',
      });
      continue;
    }

    const parts = trimmed.split(';');
    if (parts.length < 2) continue;

    const typeStr = parts[0];
    if (typeStr.length < 2) continue;

    const type = typeStr[0] as ReportRowType;
    const style = typeStr[1] as ReportRowStyle;
    const level = parseInt(typeStr.substring(2)) || 0;

    const label = parts[parts.length - 1];
    const numberParts = parts.slice(1, -1).map((p) => parseInt(p));

    const accountRanges: [number, number][] = [];
    for (let i = 0; i < numberParts.length; i += 2) {
      if (i + 1 < numberParts.length) {
        accountRanges.push([numberParts[i], numberParts[i + 1]]);
      }
    }

    rows.push({ type, style, level, accountRanges, label });
  }

  return rows;
}

function accountInRange(
  accountNumber: string,
  start: number,
  end: number,
): boolean {
  const parsed = parseInt(accountNumber);
  if (Number.isNaN(parsed)) return false;
  if (parsed >= start && parsed < end) return true;

  const rangeDigits = `${start}`.length;
  if (accountNumber.length <= rangeDigits) return false;

  const prefix = parseInt(accountNumber.slice(0, rangeDigits));
  return !Number.isNaN(prefix) && prefix >= start && prefix < end;
}

function reportAmountForAccountType(
  accountType: AccountType,
  balance: number,
): number {
  // Reports show expenses as negative values.
  if (accountType === 4) return -balance;
  return balance;
}

function findCurrentPeriodProfitAccount(accounts: Account[]): Account | null {
  return (
    accounts.find((account) => account.type === 6 || account.number === '2370') ||
    null
  );
}

function createSyntheticCurrentPeriodProfitAccount(accounts: Account[]): Account {
  const syntheticId =
    accounts.reduce((lowestId, account) => Math.min(lowestId, account.id), 0) - 1;
  return {
    id: syntheticId,
    number: '2370',
    name: 'Tilikauden voitto (tappio)',
    type: 6,
    vat_code: 0,
    vat_percentage: 0,
    vat_account1_id: null,
    vat_account2_id: null,
    flags: 0,
  };
}

function calculateCurrentPeriodProfit(
  balances: Map<number, number>,
  accounts: Account[],
): number {
  const accountMap = new Map<number, Account>();
  accounts.forEach((account) => accountMap.set(account.id, account));

  let currentPeriodProfit = 0;
  for (const [accountId, balance] of balances) {
    const account = accountMap.get(accountId);
    if (!account) continue;
    if (account.type !== 3 && account.type !== 4) continue;
    currentPeriodProfit += reportAmountForAccountType(account.type, balance);
  }

  return currentPeriodProfit;
}

export function withImplicitCurrentPeriodProfit(
  balanceSheetBalances: Map<number, number>,
  incomeStatementBalances: Map<number, number>,
  accounts: Account[],
): { accounts: Account[]; balances: Map<number, number> } {
  const profitAccount =
    findCurrentPeriodProfitAccount(accounts) ||
    createSyntheticCurrentPeriodProfitAccount(accounts);
  const nextAccounts =
    findCurrentPeriodProfitAccount(accounts) != null
      ? accounts
      : [...accounts, profitAccount];
  const nextBalances = new Map(balanceSheetBalances);
  const existingProfitBalance = nextBalances.get(profitAccount.id) || 0;

  // Prefer an existing current-period profit balance over a synthetic one.
  if (Math.round(existingProfitBalance * 100) !== 0) {
    return { accounts: nextAccounts, balances: nextBalances };
  }

  const currentPeriodProfit = calculateCurrentPeriodProfit(
    incomeStatementBalances,
    accounts,
  );
  if (Math.round(currentPeriodProfit * 100) === 0) {
    return { accounts: nextAccounts, balances: nextBalances };
  }

  nextBalances.set(profitAccount.id, currentPeriodProfit);
  return { accounts: nextAccounts, balances: nextBalances };
}

export function calculateReportAmounts(
  rows: ReportRow[],
  accounts: Account[],
  balances: Map<number, number>,
): ReportRow[] {
  const accountMap = new Map<number, Account>();
  accounts.forEach((a) => accountMap.set(a.id, a));

  const accountsByNumber = new Map<string, Account>();
  accounts.forEach((a) => accountsByNumber.set(a.number, a));

  return rows.map((row) => {
    if (row.type === '-') return { ...row, visible: true };

    if (
      row.type === 'H' ||
      row.type === 'G' ||
      row.type === 'S' ||
      row.type === 'T' ||
      row.type === 'D' ||
      row.type === 'F'
    ) {
      let amount = 0;

      for (const [start, end] of row.accountRanges) {
        for (const [accountId, balance] of balances) {
          const account = accountMap.get(accountId);
          if (!account) continue;
          if (accountInRange(account.number, start, end)) {
            amount += reportAmountForAccountType(account.type, balance);
          }
        }
      }

      const nonZero = Math.round(amount * 100) !== 0;
      const visible =
        row.type === 'F' ||
        (row.type === 'H' && row.accountRanges.length === 0) ||
        nonZero;

      return { ...row, amount, visible };
    }

    return { ...row, visible: true };
  });
}

export function isDetailReportRow(row: ReportRow): boolean {
  // Support both legacy `D...` rows and current `SP...` detail rows.
  return (
    row.type === 'D' ||
    (row.type === 'S' && row.style === 'P' && row.accountRanges.length > 0)
  );
}

export function getDetailRows(
  row: ReportRow,
  accounts: Account[],
  balances: Map<number, number>,
): { accountNumber: string; accountName: string; amount: number }[] {
  return getDetailRowsWithIds(row, accounts, balances).map((detail) => ({
    accountNumber: detail.accountNumber,
    accountName: detail.accountName,
    amount: detail.amount,
  }));
}

export function getDetailRowsWithIds(
  row: ReportRow,
  accounts: Account[],
  balances: Map<number, number>,
): {
  accountId: number;
  accountNumber: string;
  accountName: string;
  amount: number;
}[] {
  const accountMap = new Map<number, Account>();
  accounts.forEach((a) => accountMap.set(a.id, a));

  const details: {
    accountId: number;
    accountNumber: string;
    accountName: string;
    amount: number;
  }[] = [];

  for (const [start, end] of row.accountRanges) {
    for (const [accountId, balance] of balances) {
      const account = accountMap.get(accountId);
      if (!account) continue;
      if (accountInRange(account.number, start, end)) {
        const amount = reportAmountForAccountType(account.type, balance);
        if (Math.round(amount * 100) !== 0) {
          details.push({
            accountId,
            accountNumber: account.number,
            accountName: account.name,
            amount,
          });
        }
      }
    }
  }

  return details.sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));
}

/**
 * Filter calculated report rows to only visible ones, collapsing redundant
 * separators (no leading/trailing/consecutive separator rows).
 */
export function filterVisibleReportRows(rows: ReportRow[]): ReportRow[] {
  return rows.filter((row, index) => {
    if (!row.visible) return false;
    if (row.type !== '-') return true;

    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = rows[i];
      if (!candidate.visible) continue;
      if (candidate.type === '-') return false;
      break;
    }

    for (let i = index + 1; i < rows.length; i += 1) {
      const candidate = rows[i];
      if (!candidate.visible) continue;
      return candidate.type !== '-';
    }

    return false;
  });
}

/** Kalenteripäivät kirjanpidossa: aina Suomen aikaa (myös palvelin UTC:ssä). */
const FI_DATE: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Helsinki',
};

const LOCALE = 'fi-FI';
const FRACTION_DIGITS = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
} as const;

function normalizeCurrencyDisplayAmount(amount: number): number {
  return Math.round(amount * 100) === 0 ? 0 : amount;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'HKD',
  ...FRACTION_DIGITS,
});

const NUMBER_FORMATTER = new Intl.NumberFormat(LOCALE, FRACTION_DIGITS);

/** Replace Intl unicode whitespace/minus with plain ASCII for PDF rendering. */
function pdfSafe(text: string): string {
  return text
    .replace(/\u2212/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\u202f/g, ' ');
}

/** Format with € symbol for browser display. */
export function formatCurrency(amount: number): string {
  return CURRENCY_FORMATTER.format(normalizeCurrencyDisplayAmount(amount));
}

/** Format with € symbol, PDF-safe ASCII characters. */
export function formatCurrencyForPdf(amount: number): string {
  return pdfSafe(formatCurrency(amount));
}

/** Format without currency symbol, PDF-safe ASCII characters. */
export function formatNumber(amount: number): string {
  return pdfSafe(
    NUMBER_FORMATTER.format(normalizeCurrencyDisplayAmount(amount)),
  );
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('fi-FI', FI_DATE);
}

export function periodToDateString(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('fi-FI', FI_DATE);
}

export function periodLabel(startDate: number, endDate: number): string {
  return `${periodToDateString(startDate)} – ${periodToDateString(endDate)}`;
}

export function sanitizeForFilename(name: string): string {
  return name
    .trim()
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '-');
}

export function periodFilenamePart(startDate: number, endDate: number): string {
  const start = formatDate(startDate).replaceAll('.', '');
  const end = formatDate(endDate).replaceAll('.', '');
  return `${start}-${end}`;
}
