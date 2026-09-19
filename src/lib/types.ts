export const ACCOUNT_TYPES = {
  0: 'Assets',
  1: 'Liabilities',
  2: 'Equity',
  3: 'Revenue',
  4: 'Expenses',
  5: "Prior periods' profit",
  6: "Current period's profit",
} as const;

export type AccountType = keyof typeof ACCOUNT_TYPES;

export interface Account {
  id: number;
  number: string;
  name: string;
  type: AccountType;
  vat_code: number;
  vat_percentage: number;
  vat_account1_id: number | null;
  vat_account2_id: number | null;
  flags: number;
}

export interface Period {
  id: number;
  start_date: number; // Unix timestamp in milliseconds
  end_date: number;
  locked: boolean;
}

export interface Document {
  id: number;
  number: number;
  period_id: number;
  date: number; // Unix timestamp in milliseconds
}

export interface DocumentMetadata {
  document_id: number;
  category: string;
  name: string;
}

export interface Entry {
  id: number;
  document_id: number;
  account_id: number;
  debit: boolean;
  amount: number;
  description: string;
  row_number: number;
  flags: number;
}

export interface EntryWithAccount extends Entry {
  account_number: string;
  account_name: string;
}

export interface COAHeading {
  id: number;
  number: string;
  text: string;
  level: number;
}

export interface Settings {
  version: number;
  name: string;
  business_id: string;
  current_period_id: number;
  document_type_id: number | null;
  properties: string;
}

export interface ReportStructure {
  id: string;
  data: string;
}

export type ReportRowType = 'H' | 'G' | 'S' | 'T' | 'D' | 'F' | '-';
export type ReportRowStyle = 'P' | 'B' | 'I';

export interface ReportRow {
  type: ReportRowType;
  style: ReportRowStyle;
  level: number;
  accountRanges: [number, number][];
  label: string;
  amount?: number;
  visible?: boolean;
}

export interface BankStatement {
  id: number;
  account_id: number;
  iban: string;
  period_start: number;
  period_end: number;
  opening_balance: number;
  closing_balance: number;
  source_file: string;
  created_at: number;
}

export interface BankStatementEntry {
  id: number;
  bank_statement_id: number;
  entry_date: number;
  value_date: number;
  archive_id: string;
  counterparty: string;
  counterparty_iban: string | null;
  reference: string | null;
  message: string | null;
  payment_type: string;
  transaction_number: number;
  amount: number;
  document_id: number | null;
  counterpart_account_id: number | null;
}

export interface BankStatementWithStats extends BankStatement {
  entry_count: number;
  processed_count: number;
  account_number: string;
  account_name: string;
}

export interface AccountOption {
  id: number;
  number: string;
  name: string;
  type: number;
  vat_percentage: number;
}

export interface BankStatementEntryWithAccount extends BankStatementEntry {
  counterpart_account_number: string | null;
  counterpart_account_name: string | null;
  document_number: number | null;
}

export type RouteIdParams = { params: Promise<{ id: string }> };
