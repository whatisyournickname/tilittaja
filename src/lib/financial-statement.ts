import {
  getAccounts,
  getDocumentBalances,
  getDocuments,
  getEntriesForPeriod,
  getPeriods,
  getReportStructure,
} from '@/lib/db/documents';
import { getSettingProperties, getSettings } from '@/lib/db/settings';
import {
  getBankStatements,
  getUnlinkedBankStatementEntriesForPeriod,
} from '@/lib/db/bank-statements';
import {
  getDocumentMetadataMap,
  getDocumentReceiptLinks,
} from '@/lib/db/metadata-receipts';
import {
  resolveDocumentReceiptsForSource,
  buildEntryDescriptionsByDocumentId,
} from '@/lib/receipt-resolution';
import {
  calculateBalances,
  calculateReportAmounts,
  formatCurrency,
  parseReportStructure,
  periodLabel,
  periodToDateString,
  withImplicitCurrentPeriodProfit,
} from '@/lib/accounting';
import { Account, AccountType, Period, ReportRow } from '@/lib/types';
import { resolveDocumentLabels } from '@/lib/document-labels';
import {
  buildVatSettlementPreview,
  calculateVatReport,
} from '@/lib/vat-report';

export interface FinancialStatementMetadata {
  place: string;
  signatureDate: string;
  preparedBy: string;
  signerName: string;
  signerTitle: string;
  microDeclaration: string;
  boardProposal: string;
  parentCompany: string;
  shareInfo: string;
  personnelCount: string;
  archiveNote: string;
  meetingDate: string;
  attendees: string;
  dischargeTarget: DischargeTarget;
}

export type DischargeTarget = 'board' | 'ceo' | 'board-and-ceo';

export function normalizeDischargeTarget(value?: string): DischargeTarget {
  switch (value) {
    case 'board':
    case 'ceo':
    case 'board-and-ceo':
      return value;
    default:
      return 'board-and-ceo';
  }
}

export interface FinancialStatementRow {
  type: ReportRow['type'];
  style: ReportRow['style'];
  level: number;
  label: string;
  visible: boolean;
  currentAmount?: number;
  previousAmount?: number;
}

export interface ComplianceCheck {
  id: string;
  label: string;
  severity: 'error' | 'warning' | 'info';
  ok: boolean;
  details: string;
}

export interface FinancialStatementPackage {
  companyName: string;
  businessId: string;
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  comparisonPeriodLabel: string | null;
  metadata: FinancialStatementMetadata;
  balanceSheetRows: FinancialStatementRow[];
  incomeStatementRows: FinancialStatementRow[];
  notes: string[];
  equity: {
    shareCapital: number;
    previousPeriodsProfit: number;
    currentPeriodProfit: number;
    distributableEquity: number;
    comparison?: {
      shareCapital: number;
      previousPeriodsProfit: number;
      currentPeriodProfit: number;
    };
  };
  compliance: {
    checks: ComplianceCheck[];
    hardErrors: number;
    warnings: number;
  };
}

const PROPERTY_PREFIX = 'tilinpaatos.';

/** Calendar date (yyyy-mm-dd) in Finnish time zone; not UTC-toISOString(). */
function toIsoDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Helsinki',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

export function formatFinnishDate(isoDate: string): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}.${month}.${year}`;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function reportRowsToComparativeRows(
  currentRows: ReportRow[],
  previousRows: ReportRow[],
): FinancialStatementRow[] {
  return currentRows.map((row, index) => {
    const previous = previousRows[index];
    return {
      type: row.type,
      style: row.style,
      level: row.level,
      label: row.label,
      visible: Boolean(row.visible),
      currentAmount: row.amount,
      previousAmount: previous?.amount,
    };
  });
}

function findComparisonPeriod(
  currentPeriod: Period,
  periods: Period[],
): Period | null {
  return (
    periods
      .filter((period) => period.end_date < currentPeriod.end_date)
      .sort((a, b) => b.end_date - a.end_date)[0] || null
  );
}

function getCumulativeEntries(periods: Period[], endDateInclusive: number) {
  const entries: { account_id: number; debit: boolean; amount: number }[] = [];
  for (const period of periods) {
    if (period.end_date > endDateInclusive) continue;
    entries.push(...getEntriesForPeriod(period.id));
  }
  return entries;
}

function sumByAccountType(
  balances: Map<number, number>,
  accounts: Account[],
  accountType: AccountType,
): number {
  const typeById = new Map(
    accounts.map((account) => [account.id, account.type]),
  );
  let sum = 0;
  for (const [accountId, balance] of balances) {
    if (typeById.get(accountId) === accountType) {
      sum += balance;
    }
  }
  return sum;
}

function getMetadataDefaults(
  companyName: string,
  businessId: string,
  periodEndDate: number,
): FinancialStatementMetadata {
  const defaultMeetingDate = toIsoDate(
    addMonths(new Date(periodEndDate), 3).getTime(),
  );
  return {
    place: 'Helsinki',
    signatureDate: toIsoDate(periodEndDate),
    preparedBy: companyName,
    signerName: '',
    signerTitle: 'Member of the board',
    microDeclaration:
      'The company/association is a micro-enterprise within the meaning of the Accounting Act and the financial statements have been prepared in accordance with the micro-enterprise provisions of Chapter 4 of the PMA.',
    boardProposal:
      'The board proposes that the period profit be transferred as an addition to profit reserves and no dividend be distributed.',
    parentCompany: '',
    shareInfo:
      'The company has 100,000 par value shares with equal rights. The articles of association contain a redemption clause for the shares.',
    personnelCount: '0',
    archiveNote:
      'The financial statements must be retained for at least 10 years from the end of the period and the voucher material for at least 6 years.',
    meetingDate: defaultMeetingDate,
    attendees: '',
    dischargeTarget: 'board-and-ceo',
  };
}

function getMetadata(
  companyName: string,
  businessId: string,
  periodEndDate: number,
): FinancialStatementMetadata {
  const defaults = getMetadataDefaults(companyName, businessId, periodEndDate);
  const allProperties = getSettingProperties();
  return {
    place: allProperties[`${PROPERTY_PREFIX}place`] || defaults.place,
    signatureDate:
      allProperties[`${PROPERTY_PREFIX}signatureDate`] ||
      defaults.signatureDate,
    preparedBy:
      allProperties[`${PROPERTY_PREFIX}preparedBy`] || defaults.preparedBy,
    signerName:
      allProperties[`${PROPERTY_PREFIX}signerName`] || defaults.signerName,
    signerTitle:
      allProperties[`${PROPERTY_PREFIX}signerTitle`] || defaults.signerTitle,
    microDeclaration:
      allProperties[`${PROPERTY_PREFIX}microDeclaration`] ||
      defaults.microDeclaration,
    boardProposal:
      allProperties[`${PROPERTY_PREFIX}boardProposal`] ||
      defaults.boardProposal,
    parentCompany:
      allProperties[`${PROPERTY_PREFIX}parentCompany`] ||
      defaults.parentCompany,
    shareInfo:
      allProperties[`${PROPERTY_PREFIX}shareInfo`] || defaults.shareInfo,
    personnelCount:
      allProperties[`${PROPERTY_PREFIX}personnelCount`] ||
      defaults.personnelCount,
    archiveNote:
      allProperties[`${PROPERTY_PREFIX}archiveNote`] || defaults.archiveNote,
    meetingDate:
      allProperties[`${PROPERTY_PREFIX}meetingDate`] || defaults.meetingDate,
    attendees:
      allProperties[`${PROPERTY_PREFIX}attendees`] || defaults.attendees,
    dischargeTarget: normalizeDischargeTarget(
      allProperties[`${PROPERTY_PREFIX}dischargeTarget`] ||
        defaults.dischargeTarget,
    ),
  };
}

export function metadataToProperties(
  metadata: FinancialStatementMetadata,
): Record<string, string> {
  return {
    [`${PROPERTY_PREFIX}place`]: metadata.place,
    [`${PROPERTY_PREFIX}signatureDate`]: metadata.signatureDate,
    [`${PROPERTY_PREFIX}preparedBy`]: metadata.preparedBy,
    [`${PROPERTY_PREFIX}signerName`]: metadata.signerName,
    [`${PROPERTY_PREFIX}signerTitle`]: metadata.signerTitle,
    [`${PROPERTY_PREFIX}microDeclaration`]: metadata.microDeclaration,
    [`${PROPERTY_PREFIX}boardProposal`]: metadata.boardProposal,
    [`${PROPERTY_PREFIX}parentCompany`]: metadata.parentCompany,
    [`${PROPERTY_PREFIX}shareInfo`]: metadata.shareInfo,
    [`${PROPERTY_PREFIX}personnelCount`]: metadata.personnelCount,
    [`${PROPERTY_PREFIX}archiveNote`]: metadata.archiveNote,
    [`${PROPERTY_PREFIX}meetingDate`]: metadata.meetingDate,
    [`${PROPERTY_PREFIX}attendees`]: metadata.attendees,
    [`${PROPERTY_PREFIX}dischargeTarget`]: normalizeDischargeTarget(
      metadata.dischargeTarget,
    ),
  };
}

function calculateStatementRows(
  structureId: string,
  accounts: Account[],
  currentBalances: Map<number, number>,
  previousBalances?: Map<number, number>,
): FinancialStatementRow[] {
  const structure = getReportStructure(structureId);
  if (!structure) return [];
  const baseRows = parseReportStructure(structure.data);
  const currentRows = calculateReportAmounts(
    baseRows,
    accounts,
    currentBalances,
  );
  const previousRows = previousBalances
    ? calculateReportAmounts(baseRows, accounts, previousBalances)
    : [];
  return reportRowsToComparativeRows(currentRows, previousRows);
}

function getIncomeStatementResultRow(
  rows: FinancialStatementRow[],
): FinancialStatementRow | undefined {
  const resultLabelPattern = /current period(?:'s)? (profit|loss|result)|current period result/i;

  return (
    [...rows]
      .reverse()
      .find(
        (row) =>
          row.visible &&
          typeof row.currentAmount === 'number' &&
          resultLabelPattern.test(row.label),
      ) ??
    [...rows]
      .reverse()
      .find((row) => row.visible && typeof row.currentAmount === 'number')
  );
}

export function getFinancialStatementMetadataDefaults(): FinancialStatementMetadata {
  const settings = getSettings();
  const periods = getPeriods();
  const current =
    periods.find((period) => period.id === settings.current_period_id) ||
    periods[0];
  return getMetadataDefaults(
    settings.name,
    settings.business_id,
    current.end_date,
  );
}

export function buildFinancialStatementPackage(periodId?: number): FinancialStatementPackage {
  const settings = getSettings();
  const periods = getPeriods();
  const selectedPeriod =
    (periodId ? periods.find((period) => period.id === periodId) : undefined) ||
    periods.find((period) => period.id === settings.current_period_id) ||
    periods[0];

  if (!selectedPeriod) {
    throw new Error('No periods found.');
  }

  const comparisonPeriod = findComparisonPeriod(selectedPeriod, periods);
  const accounts = getAccounts();

  const currentBalanceEntries = getCumulativeEntries(
    periods,
    selectedPeriod.end_date,
  );
  const currentBalanceSheetBalances = calculateBalances(
    currentBalanceEntries,
    accounts,
  );

  const previousBalanceSheetBalances = comparisonPeriod
    ? calculateBalances(
        getCumulativeEntries(periods, comparisonPeriod.end_date),
        accounts,
      )
    : undefined;

  const currentIncomeBalances = calculateBalances(
    getEntriesForPeriod(selectedPeriod.id),
    accounts,
  );
  const previousIncomeBalances = comparisonPeriod
    ? calculateBalances(getEntriesForPeriod(comparisonPeriod.id), accounts)
    : undefined;

  const currentBalanceSheetData = withImplicitCurrentPeriodProfit(
    currentBalanceSheetBalances,
    currentIncomeBalances,
    accounts,
  );
  const previousBalanceSheetData =
    previousBalanceSheetBalances && previousIncomeBalances
      ? withImplicitCurrentPeriodProfit(
          previousBalanceSheetBalances,
          previousIncomeBalances,
          accounts,
        )
      : undefined;
  const balanceSheetAccounts =
    previousBalanceSheetData?.accounts.length &&
    previousBalanceSheetData.accounts.length >
      currentBalanceSheetData.accounts.length
      ? previousBalanceSheetData.accounts
      : currentBalanceSheetData.accounts;

  const balanceSheetRows = calculateStatementRows(
    'balance-sheet',
    balanceSheetAccounts,
    currentBalanceSheetData.balances,
    previousBalanceSheetData?.balances,
  );
  const incomeStatementRows = calculateStatementRows(
    'income-statement',
    accounts,
    currentIncomeBalances,
    previousIncomeBalances,
  );

  const metadata = getMetadata(
    settings.name,
    settings.business_id,
    selectedPeriod.end_date,
  );
  const shareCapital = sumByAccountType(
    currentBalanceSheetBalances,
    accounts,
    2,
  );
  const previousPeriodsProfit = sumByAccountType(
    currentBalanceSheetBalances,
    accounts,
    5,
  );
  const incomeStatementResultRow =
    getIncomeStatementResultRow(incomeStatementRows);
  const currentPeriodProfit =
    incomeStatementResultRow?.currentAmount ??
    sumByAccountType(currentBalanceSheetBalances, accounts, 6);
  const distributableEquity = Math.max(
    0,
    previousPeriodsProfit + currentPeriodProfit,
  );

  const comparisonEquity = previousBalanceSheetBalances
    ? {
        shareCapital: sumByAccountType(
          previousBalanceSheetBalances,
          accounts,
          2,
        ),
        previousPeriodsProfit: sumByAccountType(
          previousBalanceSheetBalances,
          accounts,
          5,
        ),
        currentPeriodProfit:
          incomeStatementResultRow?.previousAmount ??
          sumByAccountType(previousBalanceSheetBalances, accounts, 6),
      }
    : undefined;

  const checks: ComplianceCheck[] = [
    {
      id: 'balance-structure',
      label: 'Balance sheet structure available',
      severity: 'error',
      ok: balanceSheetRows.length > 0,
      details:
        balanceSheetRows.length > 0
          ? 'Balance sheet formed.'
          : 'Balance sheet structure not found in database.',
    },
    {
      id: 'income-structure',
      label: 'Income statement structure available',
      severity: 'error',
      ok: incomeStatementRows.length > 0,
      details:
        incomeStatementRows.length > 0
          ? 'Income statement formed.'
          : 'Income statement structure not found in database.',
    },
    {
      id: 'comparative-figures',
      label: 'Comparison period found',
      severity: 'warning',
      ok: Boolean(comparisonPeriod),
      details: comparisonPeriod
        ? `Comparison period: ${periodLabel(comparisonPeriod.start_date, comparisonPeriod.end_date)}`
        : 'No comparison period found for the selected period.',
    },
    {
      id: 'micro-declaration',
      label: 'Micro declaration provided',
      severity: 'error',
      ok: metadata.microDeclaration.trim().length > 0,
      details:
        metadata.microDeclaration.trim().length > 0
          ? 'Text on micro enterprise regulation provided.'
          : 'Add micro enterprise declaration before final export.',
    },
    {
      id: 'signature-data',
      label: 'Signature details provided',
      severity: 'error',
      ok:
        metadata.signerName.trim().length > 0 &&
        metadata.place.trim().length > 0 &&
        metadata.signatureDate.trim().length > 0,
      details:
        metadata.signerName.trim().length > 0 &&
        metadata.place.trim().length > 0 &&
        metadata.signatureDate.trim().length > 0
          ? 'Signature page can be generated.'
          : 'Complete signer, place, and date.',
    },
  ];

  const notes = [
    metadata.microDeclaration,
    `Number of employees: ${metadata.personnelCount}`,
    ...(metadata.parentCompany
      ? [
          `The company belongs to a group whose parent company is ${metadata.parentCompany}.`,
        ]
      : []),
    metadata.shareInfo,
    'The calculation of distributable free equity pursuant to Section 13:5 of the Companies Act is included.',
    metadata.boardProposal,
    metadata.archiveNote,
  ];

  return {
    companyName: settings.name,
    businessId: settings.business_id,
    periodLabel: periodLabel(
      selectedPeriod.start_date,
      selectedPeriod.end_date,
    ),
    periodStart: periodToDateString(selectedPeriod.start_date),
    periodEnd: periodToDateString(selectedPeriod.end_date),
    comparisonPeriodLabel: comparisonPeriod
      ? periodLabel(comparisonPeriod.start_date, comparisonPeriod.end_date)
      : null,
    metadata,
    balanceSheetRows,
    incomeStatementRows,
    notes,
    equity: {
      shareCapital,
      previousPeriodsProfit,
      currentPeriodProfit,
      distributableEquity,
      comparison: comparisonEquity,
    },
    compliance: {
      checks,
      hardErrors: checks.filter(
        (check) => check.severity === 'error' && !check.ok,
      ).length,
      warnings: checks.filter(
        (check) => check.severity === 'warning' && !check.ok,
      ).length,
    },
  };
}

export function formatAmount(amount?: number): string {
  if (amount === undefined) return '';
  return formatCurrency(amount);
}

export interface StatementSummary {
  ok: boolean;
  text: string;
}

function getLatestRowAmount(
  rows: FinancialStatementRow[],
  matcher: RegExp,
): number | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (!row.visible || row.currentAmount === undefined) continue;
    if (matcher.test(row.label)) return row.currentAmount;
  }
  return null;
}

export function getBalanceSheetSummary(
  rows: FinancialStatementRow[],
): StatementSummary {
  const assetsTotal = getLatestRowAmount(rows, /^Total assets$/i);
  const liabilitiesTotal = getLatestRowAmount(rows, /^Total liabilities$/i);

  if (assetsTotal === null || liabilitiesTotal === null) {
    return { ok: false, text: 'Totals not found' };
  }

  const difference = Math.abs(assetsTotal - liabilitiesTotal);
  if (difference < 0.005) {
    return { ok: true, text: 'Assets and liabilities match' };
  }

  return { ok: false, text: `Does not match (${formatAmount(difference)})` };
}

export function getIncomeStatementSummary(
  rows: FinancialStatementRow[],
): StatementSummary {
  const profitOrLoss = getLatestRowAmount(
    rows,
    /Current period(?:'s)? profit \(loss\)|Current period result/i,
  );

  if (profitOrLoss === null) {
    return {
      ok: rows.length > 0,
      text:
        rows.length > 0 ? 'Income statement formed' : 'Income statement missing',
    };
  }

  return { ok: true, text: `Period result ${formatAmount(profitOrLoss)}` };
}

export function formatSignatureDate(metadata: FinancialStatementMetadata): string {
  return formatFinnishDate(metadata.signatureDate);
}

interface ReadinessItem {
  label: string;
  ok: boolean;
  count?: number;
  total?: number;
  details: string;
}

export interface ReadinessSection {
  title: string;
  items: ReadinessItem[];
  allOk: boolean;
}

export interface ReadinessSummary {
  sections: ReadinessSection[];
  canLock: boolean;
  blockerCount: number;
  warningCount: number;
}

export function buildReadinessSummary(
  periodId: number,
  source?: string,
): ReadinessSummary {
  const periods = getPeriods();
  const period = periods.find((p) => p.id === periodId);
  if (!period) {
    return { sections: [], canLock: false, blockerCount: 1, warningCount: 0 };
  }

  const accounts = getAccounts();
  const entries = getEntriesForPeriod(periodId);
  const documentBalances = getDocumentBalances(periodId);
  const documents = getDocuments(periodId);
  const documentIds = documents.map((d) => d.id);
  const manualLinks = getDocumentReceiptLinks(documentIds);
  const entryDescriptionsByDocumentId =
    buildEntryDescriptionsByDocumentId(entries);
  const firstEntryDescriptionByDocumentId = new Map<number, string>();

  for (const entry of entries) {
    if (
      entry.row_number !== 1 ||
      firstEntryDescriptionByDocumentId.has(entry.document_id)
    ) {
      continue;
    }
    firstEntryDescriptionByDocumentId.set(entry.document_id, entry.description);
  }

  const emptyDocs = documentBalances.filter(
    (d) => d.total_debit === 0 && d.total_credit === 0,
  );
  const unbalancedDocs = documentBalances.filter(
    (d) =>
      Math.abs(d.total_debit - d.total_credit) >= 0.005 &&
      !(d.total_debit === 0 && d.total_credit === 0),
  );

  const receiptMap = source
    ? resolveDocumentReceiptsForSource({
        source,
        documents,
        entryDescriptionsByDocumentId,
        manualReceiptLinks: manualLinks,
      })
    : null;

  let docsWithReceiptCount: number;
  if (receiptMap) {
    docsWithReceiptCount = documentIds.filter(
      (id) => receiptMap.get(id)?.path != null,
    ).length;
  } else {
    docsWithReceiptCount = documentIds.filter((id) =>
      manualLinks.has(id),
    ).length;
  }
  const docsMissingReceipt = documentIds.length - docsWithReceiptCount;

  const metadataMap = getDocumentMetadataMap(documentIds);
  const labelMap = resolveDocumentLabels(
    documents.map((document) => ({
      id: document.id,
      number: document.number,
      storedCategory: metadataMap.get(document.id)?.category ?? '',
      storedName: metadataMap.get(document.id)?.name ?? '',
      fallbackDescription:
        firstEntryDescriptionByDocumentId.get(document.id) ?? '',
    })),
  );
  const vatDocuments = documents.filter(
    (document) =>
      (labelMap.get(document.id)?.category ?? '').toUpperCase() === 'ALV',
  );
  const vatDocumentsWithReceiptCount = vatDocuments.filter((document) =>
    receiptMap
      ? receiptMap.get(document.id)?.path != null
      : manualLinks.has(document.id),
  ).length;
  const vatDocumentsMissingReceipt =
    vatDocuments.length - vatDocumentsWithReceiptCount;
  const vatReport = calculateVatReport(entries, accounts);
  const vatSettlement = buildVatSettlementPreview(entries, accounts);
  const hasVatActivity =
    vatReport.lines.find((line) => Math.abs(line.amount) >= 0.005) != null;

  const documentSection: ReadinessSection = {
    title: 'Documents',
    items: [
      {
        label: 'Number of documents',
        ok: documents.length > 0,
        count: documents.length,
        details:
          documents.length > 0
            ? `${documents.length} documents in period`
            : 'No documents in this period',
      },
      {
        label: 'Unbalanced documents',
        ok: unbalancedDocs.length === 0,
        count: unbalancedDocs.length,
        total: documents.length,
        details:
          unbalancedDocs.length === 0
            ? 'All documents balance (debit = credit)'
            : `${unbalancedDocs.length} documents where debit ≠ credit: ${unbalancedDocs
                .slice(0, 5)
                .map((d) => `#${d.document_number}`)
                .join(', ')}${unbalancedDocs.length > 5 ? '...' : ''}`,
      },
      {
        label: 'Empty documents',
        ok: emptyDocs.length === 0,
        count: emptyDocs.length,
        details:
          emptyDocs.length === 0
            ? 'No empty documents'
            : `${emptyDocs.length} documents with no entries: ${emptyDocs
                .slice(0, 5)
                .map((d) => `#${d.document_number}`)
                .join(', ')}${emptyDocs.length > 5 ? '...' : ''}`,
      },
      {
        label: 'Document receipts',
        ok: docsMissingReceipt === 0,
        count: docsWithReceiptCount,
        total: documentIds.length,
        details:
          docsMissingReceipt === 0
            ? 'All documents have receipts'
            : `${docsMissingReceipt} documents missing receipts`,
      },
    ],
    allOk: false,
  };
  documentSection.allOk = documentSection.items.every((i) => i.ok);

  const bankStatements = getBankStatements();
  const periodStatements = bankStatements.filter(
    (bs) =>
      bs.period_start <= period.end_date && bs.period_end >= period.start_date,
  );
  const unlinkedEntries = getUnlinkedBankStatementEntriesForPeriod(
    period.start_date,
    period.end_date,
  );

  const totalBankEntries = periodStatements.reduce(
    (sum, bs) => sum + bs.entry_count,
    0,
  );
  const totalProcessed = periodStatements.reduce(
    (sum, bs) => sum + bs.processed_count,
    0,
  );

  const bankStatementSection: ReadinessSection = {
    title: 'Bank statements',
    items: [
      {
        label: 'Bank statements in period',
        ok: periodStatements.length > 0,
        count: periodStatements.length,
        details:
          periodStatements.length > 0
            ? `${periodStatements.length} bank statements imported`
            : 'No bank statements for this period',
      },
      {
        label: 'Unlinked bank transactions',
        ok: unlinkedEntries.length === 0,
        count: unlinkedEntries.length,
        total: totalBankEntries,
        details:
          unlinkedEntries.length === 0
            ? 'All bank transactions are linked to documents'
            : `${unlinkedEntries.length} bank transactions without a document`,
      },
      {
        label: 'Processed bank transactions',
        ok: totalProcessed === totalBankEntries && totalBankEntries > 0,
        count: totalProcessed,
        total: totalBankEntries,
        details:
          totalBankEntries === 0
            ? 'No bank transactions'
            : `${totalProcessed}/${totalBankEntries} processed`,
      },
    ],
    allOk: false,
  };
  bankStatementSection.allOk = bankStatementSection.items.every((i) => i.ok);

  const vatSection: ReadinessSection = {
    title: 'VAT',
    items: [
      {
        label: 'VAT net for period',
        ok: true,
        details: !hasVatActivity
          ? 'No VAT activity during the period'
          : vatReport.totals.payableVat > 0
            ? `VAT payable for period ${formatCurrency(vatReport.totals.payableVat)}`
            : vatReport.totals.receivableVat > 0
              ? `VAT receivable for period ${formatCurrency(vatReport.totals.receivableVat)}`
              : 'Period VAT nets to zero',
      },
      {
        label: 'VAT account settlement',
        ok: vatSettlement == null,
        details:
          vatSettlement == null
            ? 'VAT accounts are zeroed or there is no transferable balance.'
            : `${vatSettlement.settlementDebit ? 'Receivable' : 'Payable'} ${formatCurrency(vatSettlement.settlementAmount)} not yet transferred to account ${vatSettlement.settlementAccountNumber} ${vatSettlement.settlementAccountName}`.trim(),
      },
      {
        label: 'VAT return documents',
        ok:
          !hasVatActivity ||
          (vatDocuments.length > 0 && vatDocumentsMissingReceipt === 0),
        count: vatDocuments.length > 0 ? vatDocumentsWithReceiptCount : 0,
        total: vatDocuments.length > 0 ? vatDocuments.length : undefined,
        details:
          vatDocuments.length === 0
            ? hasVatActivity
              ? 'There is VAT activity during the period but no VAT documents have been prepared.'
              : 'No VAT documents for this period.'
            : vatDocumentsMissingReceipt === 0
              ? 'All VAT documents have attachments.'
              : `${vatDocumentsMissingReceipt} VAT documents missing attachments.`,
      },
    ],
    allOk: false,
  };
  vatSection.allOk = vatSection.items.every((item) => item.ok);

  const sections = [documentSection, bankStatementSection, vatSection];
  const allItems = sections.flatMap((s) => s.items);
  const blockerCount = allItems.filter((i) => !i.ok).length;

  return {
    sections,
    canLock: unbalancedDocs.length === 0,
    blockerCount,
    warningCount: 0,
  };
}
