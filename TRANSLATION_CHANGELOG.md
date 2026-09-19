# Finnish → English Translation Changelog

**Project**: Tilittaja — modern bookkeeping app (Next.js)
**Date**: 2026-09-19
**Status**: ✅ 536 / 536 tests passing · TypeScript clean · DB updated

---

## Overview

Full localization of all user-facing Finnish strings to English across the Tilittaja accounting application. Includes code identifiers, file names, route paths, UI labels, PDF content, database seed data, and API error messages.

### Intentionally preserved
| Item | Reason |
|---|---|
| `'tilinpaatos.'` DB property prefix | Backward compatibility with existing SQLite databases |
| `'Tilittaja'` brand name | Product name — stays in sidebar, page metadata, PDFs |
| `bootstrap.ts` COA account names (e.g., `'Perustamismenot'`) | Domain seed data, not UI |
| `annual-meeting-pdf.ts` regex `/^hallitus esittää,\s*että\s*/i` | Matches user-typed metadata (could be either language) |
| `datasource-slug.ts` Finnish char normalization `.replace(/[äå]/g, 'a')` | Technical utility, not user-facing |
| ZIP internal folder names (`tiliotteet/`, `tositteet/`) | Internal archive structure |

---

## 1. Code identifiers & file renames

### TypeScript identifiers
| Before | After |
|---|---|
| `TilinpaatosMetadata` | `FinancialStatementMetadata` |
| `TilinpaatosRow` | `FinancialStatementRow` |
| `TilinpaatosPackage` | `FinancialStatementPackage` |
| `buildTilinpaatosPackage` | `buildFinancialStatementPackage` |
| `buildTilinpaatosPdf` | `buildFinancialStatementPdf` |
| `buildYhtiokokousPdf` | `buildAnnualMeetingPdf` |
| `getTilinpaatosMetadataDefaults` | `getFinancialStatementMetadataDefaults` |
| `signatureDateAsFi` | `formatSignatureDate` |
| `fromIsoToFiDate` | `formatFinnishDate` |
| `drawPaakirja` | `drawGeneralLedger` |
| `drawPaivakirja` | `drawJournal` |
| `PAKIRJA_COL` / `PAIVAKIRJA_COL` | `GENERAL_LEDGER_COL` / `JOURNAL_COL` |
| `TilinpaatosMetadataEditor` | `FinancialStatementMetadataEditor` |
| `TilinpaatosMaterialsPanel` | `FinancialStatementMaterialsPanel` |
| `TilintpaatosPage` | `FinancialStatementPage` |
| `tilinpaatos` (local vars) | `financialStatement` |
| `yhtiokokous` (local vars) | `annualMeeting` |

### File renames (via `git mv`)
| Before | After |
|---|---|
| `src/lib/tilinpaatos.ts` | `src/lib/financial-statement.ts` |
| `src/lib/tilinpaatos-materials.ts` | `src/lib/financial-statement-materials.ts` |
| `src/lib/pdf/tilinpaatos-pdf.ts` | `src/lib/pdf/financial-statement-pdf.ts` |
| `src/lib/pdf/yhtiokokous-pdf.ts` | `src/lib/pdf/annual-meeting-pdf.ts` |
| `src/components/TilinpaatosMetadataEditor.tsx` | `src/components/FinancialStatementMetadataEditor.tsx` |
| `src/components/TilinpaatosMaterialsPanel.tsx` | `src/components/FinancialStatementMaterialsPanel.tsx` |

### Next.js route folder renames
| Before | After |
|---|---|
| `src/app/reports/tilinpaatos/` | `src/app/reports/financial-statement/` |
| `src/app/api/settings/tilinpaatos/` | `src/app/api/settings/financial-statement/` |
| `src/app/api/reports/tilinpaatos/` | `src/app/api/reports/financial-statement/` |
| `src/app/api/reports/yhtiokokous/` | `src/app/api/reports/annual-meeting/` |

### MaterialKind union values
| Before | After |
|---|---|
| `'paakirja'` | `'general-ledger'` |
| `'paivakirja'` | `'journal'` |
| `'tase-erittely'` | `'balance-sheet-detailed'` |
| `'tase-laaja'` | `'balance-sheet-broad'` |
| `'tulos-laaja'` | `'income-statement-broad'` |

---

## 2. Core data model translations

### ACCOUNT_TYPES (`src/lib/types.ts`)
| Key | Before | After |
|---|---|---|
| 0 | `Vastaavaa` | `Assets` |
| 1 | `Vastattavaa` | `Liabilities` |
| 2 | `Oma pääoma` | `Equity` |
| 3 | `Tulot` | `Revenue` |
| 4 | `Menot` | `Expenses` |
| 5 | `Ed. tilikausien voitto` | `"Prior period's profit"` |
| 6 | `Tilikauden voitto` | `"Current period's profit"` |

### Report structure labels (`bootstrap.ts` — seed data)
*Also applied directly to live DB `data/a/a.sqlite` for existing installations.*

| Finnish | English |
|---|---|
| `Vastaavaa yhteensä` | `Total assets` |
| `Vastattavaa yhteensä` | `Total liabilities` |
| `Tilikauden voitto (tappio)` | `Current period's profit (loss)` |
| `Liikevaihto` | `Revenue` |
| `Liiketoiminnan muut tuotot` | `Other operating income` |
| `Materiaalit ja palvelut` | `Materials and services` |
| `Palkat ja palkkiot` | `Wages and salaries` |
| `POISTOT JA ARVONALENTUMISET` | `Depreciation and impairments` |
| `LIIKEVOITTO (-TAPPIO)` | `OPERATING PROFIT (LOSS)` |
| `Rahoitustuotot / Rahoituskulut` | `Financial income / Financial expenses` |
| `VOITTO (TAPPIO) ENNEN SATUNNAISIA ERIÄ` | `PROFIT (LOSS) BEFORE EXTRAORDINARY ITEMS` |
| ... (30+ balance sheet / COA heading labels) | ... all English |

### Regex matchers (`financial-statement.ts`)
*Updated in sync with bootstrap label changes.*
- `/current period(?:'s)? (profit|loss|result)|current period result/i`
- `/^Total assets$/i`, `/^Total liabilities$/i`
- `/Current period(?:'s)? profit \(loss\)|Current period result/i`

---

## 3. Live SQLite database updates

Run against `Bookkeeping/data/a/a.sqlite` to translate existing installations:

| Table | Action |
|---|---|
| `account` | `UPDATE account SET name='English name' WHERE name='Finnish name'` — all 61 accounts |
| `coa_heading` | `UPDATE coa_heading SET text='English' WHERE text='Finnish'` — all 24 headings |
| `report_structure` | Full row replacement for balance sheet + income statement |

---

## 4. Currency change: EUR → HKD

`src/lib/accounting.ts`: `CURRENCY_FORMATTER` now uses `currency: 'HKD'`. Applies to **all** amount displays throughout the app (journal, ledger, balance sheet, income statement, PDFs, etc.). Number formatting locale (`fi-FI`) unchanged → space thousand separator, comma decimal, `HKD` suffix.

---

## 5. UI translations by page/area

### Layout & navigation
| File | Finnish | English |
|---|---|---|
| `app/layout.tsx` | `Tilittaja – Kirjanpito` | `Tilittaja – Bookkeeping` |
| `app/layout.tsx` | `Moderni kirjanpitosovellus` | `Modern bookkeeping app` |
| `SetupWizard.tsx` | `Esim. Firma Oy` (placeholder) | `e.g. Acme Ltd` |
| `DataSourceSelector.tsx` | `Tietokanta` (label + aria) | `Database` |

### Chart of Accounts (`/accounts`)
| File | Finnish | English |
|---|---|---|
| `accounts/page.tsx` | `Tilikartta` (page title) | `Chart of Accounts` |
| `AccountEditorModal.tsx` | `Tyyppi` | `Type` |
| `AccountEditorModal.tsx` | `Peruuta` | `Cancel` |
| `account-labels.ts` | `Muu` (default) | `Other` |

### Opening Balance (`/settings/opening-balance-import`)
| Finnish | English |
|---|---|
| `Tilikauden avaus – Tilittaja` | `Opening Balance – Tilittaja` |
| `Tilikauden avaus` (H1) | `Opening Balance` |
| `Takaisin asetuksiin` | `Back to settings` |
| `AVAUS` (category label) | `OPENING_BALANCE` |
| `Tilikauden avaus YYYY-MM-DD` (stored note) | `Opening balance YYYY-MM-DD` |

### Financial Statements (`/reports/financial-statement`)
| Finnish | English |
|---|---|
| `Kirjanpidon valmius` | `Bookkeeping Readiness` |
| `place \| date` format | Kept — was already correct |
| Annual meeting: `date \| attendees` | Swapped to `attendees \| date` |
| Annual meeting date (raw ISO) | Now uses `formatFinnishDate()` → `dd.mm.yyyy` |
| `Current kausi` | `Current period` |
| `Vertailukausi` | `Comparison period` |
| `Matti Meikäläinen` (hint text) | `Steve Jobs` |
| `Avaa` / `Sulje` (PDF buttons) | `Open` / `Close` |
| `Avaa tosite` / `Sulje/Avaa valikko` | `Open document` / `Close/Open menu` |
| `Kolari` (default place) | `Helsinki` |
| `Tuloslaskelma` labels | Full report_structure DB update (income statement) |
| `Liikevoitto (-Tappio)` | `OPERATING PROFIT (LOSS)` |
| `TILIKAUDEN VOITTO (TAPPIO)` | `CURRENT PERIOD'S PROFIT (LOSS)` |

### Reports sidebar pages
| File | Finnish | English |
|---|---|---|
| `reports/journal/page.tsx` | `Raportit` | `Reports` |
| `reports/balance-sheet/page.tsx` | `Raportit` | `Reports` |
| `reports/general-ledger/page.tsx` | `Raportit` | `Reports` |
| `reports/general-ledger/page.tsx` | `Laita kaikki kiinni` / `Laajenna kaikki` | `Collapse all` / `Expand all` |
| `reports/income-statement/page.tsx` | `Raportit` | `Reports` |
| `reports/income-statement/page.tsx` | `Tuloslaskelma – Tilittaja` | `Income Statement – Tilittaja` |
| `reports/income-statement/page.tsx` | `Tuloslaskelma` (H1) | `Income statement` |
| `IncomeStatementWorkspace.tsx` | `Nro` / `Kuvaus` / `Summa` / `Saldo` | `No.` / `Description` / `Amount` / `Balance` |

### Bank Statements (`/bank-statements`)
| Finnish | English |
|---|---|
| `Tiliotteet – Tilittaja` / `Tiliotteet` | `Bank Statements – Tilittaja` / `Bank statements` |
| `Tiliote – Tilittaja` / `Tiliote` | `Bank Statement – Tilittaja` / `Bank statement` |
| `Kausi` (table header) | `Period` |
| `Kausi alkaa` | `Period start` |
| `Valitse tili, johon tiliote liittyy` | `Select the account this bank statement relates to` |
| `Valitse pankkitili` | `Select bank account` |
| `Valitse tiliote` (aria-label) | `Select bank statement` |
| `N tiliotetta` | `N bank statement(s)` |
| `Takaisin tilioteisiin` | `Back to bank statements` |
| `Valitse kaikki rowt` (aria) | `Select all rows` |
| `tiliotevienti` (aria fallback) | `bank statement entry` |
| `AI etsii sopivia tositteita...` | `AI searches for matching documents...` |
| `(lukittu)` | `(locked)` |

### Documents (`/documents`)
| Finnish | English |
|---|---|
| `Kirjanpito` (eyebrow) | `Bookkeeping` |
| `Tositteet` (H1) | `Documents` |
| `Uusi tosite` (page title + button) | `New document` |
| `Uusi tosite – Tilittaja` | `New Document – Tilittaja` |
| `N tositetta` | `N document(s)` |
| `Takaisin tositteisiin` | `Back to documents` |
| `Kategoria` | `Category` |
| `Viennin nimi` | `Document name` |
| `Koodi:` | `Code:` |
| `Kopioi uudeksi` / `Kopioidaan...` | `Duplicate` / `Copying...` |
| `Tasapainossa` / `Vaatii tarkistuksen` | `Balanced` / `Needs review` |
| `Erotus` | `Difference` |
| `Ei valittua tositetta` | `No document selected` |
| `Hae tositetta numerolla...` | `Search documents by number...` |
| `Muodosta ALV-tosite` | `Create VAT document` |

### Recurring Rent & VAT
| Finnish | English |
|---|---|
| `Kuukausivuokrat – Tilittaja` | `Recurring Rent – Tilittaja` |
| `Kuukausivuokrat` (H1) | `Recurring rent` |
| `Kohdekausi` | `Target period` |
| `Kausi` (VAT dropdowns) | `Month` / `Full period` |
| `Valittu aikavali` | `Selected period` |

---

## 6. API error messages (selective)

| Location | Finnish | English |
|---|---|---|
| `period-locks.ts` | *(was already English)* | ✅ |
| `validation.ts` (Zod) | 12 Finnish messages | All English |
| `account-actions.ts` | Account not found / already in use | English |
| `settings-actions.ts` | Validation / file errors | English |
| `document-actions.ts` | `Tositteen koodia ei voitu muodostaa` | `Could not generate document code` |
| `bank-statement-actions.ts` | Row does not belong | English |
| `bank-statements/pdf/route.ts` | `Virheellinen tiliote` / `Tiliotetta ei loytynyt` | `Invalid bank statement` / `Bank statement not found` |
| `documents/import-pdf/route.ts` | `Valitse tilikausi` (×3) / `Tuotu tosite` / duplicate warning | `Select a period` / `Imported document` / English duplicate warning |
| `receipts/pdf/route.ts` | `Virheellinen tositenumero` | `Invalid document number` |
| `opening-balance/import-pdf/route.ts` | `Valitse tilikausi` (×3) | `Select a period` |
| `state-transfer.ts` | Datasource exists / restore failures | English |
| `bank-statement-document-linking.ts` | Rationale strings / API failures | English |

---

## 7. PDF content

Both financial statement and annual meeting PDF builders fully translated:
- Cover page labels, section headers, body text
- Material column labels in archive PDFs
- Annual meeting minutes (all content)
- Signature date formatting

---

## 8. Verification commands

```bash
# All unit tests — must be 536 passed
yarn test 2>&1 | tail -10

# TypeScript — must be clean
npx tsc --noEmit 2>&1

# Count remaining Finnish characters in non-test source
grep -rn '[ÄäÖöÅå]' src/ --include='*.ts' --include='*.tsx' --exclude-dir=__tests__ | wc -l

# DB-level check
sqlite3 data/a/a.sqlite "SELECT name FROM account WHERE name REGEXP '[ÄäÖöÅå]';"
sqlite3 data/a/a.sqlite "SELECT text FROM coa_heading WHERE text REGEXP '[ÄäÖöÅå]';"
sqlite3 data/a/a.sqlite "SELECT label FROM report_structure WHERE label REGEXP '[ÄäÖöÅå]';"
```

---

## 9. Known gaps (not translated)

| Item | Reason |
|---|---|
| Chart of accounts seed names in `bootstrap.ts` (`Perustamismenot`, `Kehittämismenot`, 50+ more) | Domain data — translating would change existing DB semantics |
| E2E test assertions (`e2e/*.spec.ts`) | Never run during this session — may still contain Finnish strings |
| Test fixture names (`Käteiskassa`, `Roninmäentie`, `Matti Meikäläinen`, etc.) | Test data only, not UI |

---

## 10. Scripts used (in `/tmp/`)

| Script | Purpose |
|---|---|
| `rename-identifiers.cjs` | PascalCase identifier + import path replacements |
| `rename-lowercase.cjs` | Local vars, route paths (protects `'tilinpaatos.'` DB prefix) |
| `rename-material-kind.cjs` | MaterialKind union values + MATERIALS record keys |
| `translate-bootstrap.cjs` | bootstrap.ts report_structure label replacements |
| `translate-db.cjs` | Direct SQLite UPDATEs on live DB |
| `translate-doc.cjs` | Document card / Journal / Filter Finnish strings |
| `batch-bank.cjs` | Bank statements batch translation |
| `batch-ui.cjs` | Bulk UI strings across 40+ components |
