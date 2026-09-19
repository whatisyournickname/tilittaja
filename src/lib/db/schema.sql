-- Ledgely database schema
-- Single source of truth for the expected SQLite table structure.
--
-- Legacy tables (created by the original Java Tilitin application and
-- already present in shipped .sqlite files):

CREATE TABLE settings (
  version    INTEGER NOT NULL,
  name       TEXT    NOT NULL DEFAULT '',
  business_id TEXT   NOT NULL DEFAULT '',
  current_period_id INTEGER NOT NULL,
  document_type_id  INTEGER,
  properties TEXT    NOT NULL DEFAULT ''
);

CREATE TABLE period (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  start_date INTEGER NOT NULL,  -- milliseconds since epoch
  end_date   INTEGER NOT NULL,  -- milliseconds since epoch
  locked     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE document (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  number    INTEGER NOT NULL,
  period_id INTEGER NOT NULL REFERENCES period(id),
  date      INTEGER NOT NULL   -- milliseconds since epoch
);

CREATE TABLE entry (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES document(id),
  account_id  INTEGER NOT NULL REFERENCES account(id),
  debit       INTEGER NOT NULL,  -- 0 = credit, 1 = debit
  amount      REAL    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  row_number  INTEGER NOT NULL,
  flags       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE account (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  number          TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL DEFAULT '',
  type            INTEGER NOT NULL,  -- 0..6 per ACCOUNT_TYPES
  vat_code        INTEGER NOT NULL DEFAULT 0,
  vat_percentage  INTEGER NOT NULL DEFAULT 0,
  vat_account1_id INTEGER,
  vat_account2_id INTEGER,
  flags           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE coa_heading (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT    NOT NULL,
  text   TEXT    NOT NULL DEFAULT '',
  level  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE report_structure (
  id   TEXT PRIMARY KEY,
  data TEXT NOT NULL DEFAULT ''
);

CREATE TABLE document_type (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  number       INTEGER NOT NULL,
  name         TEXT    NOT NULL DEFAULT '',
  number_start INTEGER NOT NULL DEFAULT 0,
  number_end   INTEGER NOT NULL DEFAULT 0
);

-- Application-managed tables (created at runtime via ensureAppTables
-- in migrations.ts when a connection is first opened):

CREATE TABLE IF NOT EXISTS app_schema_version (
  version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_statement (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id      INTEGER NOT NULL,
  iban            TEXT    NOT NULL,
  period_start    INTEGER NOT NULL,
  period_end      INTEGER NOT NULL,
  opening_balance REAL    NOT NULL DEFAULT 0,
  closing_balance REAL    NOT NULL DEFAULT 0,
  source_file     TEXT    NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bank_statement_entry (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_statement_id      INTEGER NOT NULL REFERENCES bank_statement(id),
  entry_date             INTEGER NOT NULL,
  value_date             INTEGER NOT NULL,
  archive_id             TEXT    NOT NULL DEFAULT '',
  counterparty           TEXT    NOT NULL DEFAULT '',
  counterparty_iban      TEXT,
  reference              TEXT,
  message                TEXT,
  payment_type           TEXT    NOT NULL DEFAULT '',
  transaction_number     INTEGER NOT NULL DEFAULT 0,
  amount                 REAL    NOT NULL,
  document_id            INTEGER,
  counterpart_account_id INTEGER
);

CREATE TABLE IF NOT EXISTS document_metadata (
  document_id INTEGER PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS document_receipt_link (
  document_id INTEGER PRIMARY KEY REFERENCES document(id) ON DELETE CASCADE,
  pdf_path    TEXT    NOT NULL,
  linked_at   INTEGER NOT NULL
);
