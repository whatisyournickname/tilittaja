import { calculateBalances } from './accounting';
import { Account, Entry } from './types';

interface VatReportDetail {
  accountId: number;
  accountNumber: string;
  accountName: string;
  amount: number;
  vatPercentage: number | null;
}

export interface VatReportLine {
  id: string;
  label: string;
  amount: number;
  details: VatReportDetail[];
}

export interface VatReportTotals {
  salesBase: number;
  purchaseBase: number;
  outputVat: number;
  deductibleVat: number;
  payableVat: number;
  receivableVat: number;
}

export interface VatReport {
  lines: VatReportLine[];
  totals: VatReportTotals;
}

export interface VatSettlementSourceLine {
  accountId: number;
  accountNumber: string;
  accountName: string;
  balance: number;
  debit: boolean;
  amount: number;
}

export interface VatSettlementPreview {
  settlementAccountId: number;
  settlementAccountNumber: string;
  settlementAccountName: string;
  settlementBalance: number;
  settlementDebit: boolean;
  settlementAmount: number;
  sourceLines: VatSettlementSourceLine[];
}

interface VatRowDefinition {
  id: string;
  label: string;
  vatCode: number;
  kind: 'base' | 'tax';
  taxField?: 'vat_account1_id' | 'vat_account2_id';
  sign?: 1 | -1;
}

const VAT_ROWS: VatRowDefinition[] = [
  {
    id: 'domestic-sales-base',
    label: 'Domestic taxable sales',
    vatCode: 4,
    kind: 'base',
  },
  {
    id: 'domestic-sales-tax',
    label: 'Tax on domestic sales',
    vatCode: 4,
    kind: 'tax',
    taxField: 'vat_account1_id',
    sign: 1,
  },
  {
    id: 'domestic-purchases-base',
    label: 'Domestic taxable purchases',
    vatCode: 5,
    kind: 'base',
  },
  {
    id: 'domestic-purchases-deductible-tax',
    label: 'Deductible tax on domestic purchases',
    vatCode: 5,
    kind: 'tax',
    taxField: 'vat_account1_id',
    sign: -1,
  },
  {
    id: 'eu-sales-base',
    label: 'Intra-Community sales and EU service sales',
    vatCode: 8,
    kind: 'base',
  },
  {
    id: 'eu-purchases-base',
    label: 'Intra-Community purchases and EU service purchases',
    vatCode: 9,
    kind: 'base',
  },
  {
    id: 'eu-purchases-output-tax',
    label: 'Output tax on intra-Community purchases',
    vatCode: 9,
    kind: 'tax',
    taxField: 'vat_account2_id',
    sign: 1,
  },
  {
    id: 'eu-purchases-deductible-tax',
    label: 'Deductible tax on intra-Community purchases',
    vatCode: 9,
    kind: 'tax',
    taxField: 'vat_account1_id',
    sign: -1,
  },
  {
    id: 'construction-sales-base',
    label: 'Construction service sales (reverse charge)',
    vatCode: 10,
    kind: 'base',
  },
  {
    id: 'construction-purchases-base',
    label: 'Construction service purchases (reverse charge)',
    vatCode: 11,
    kind: 'base',
  },
  {
    id: 'construction-purchases-output-tax',
    label: 'Output tax on construction service purchases',
    vatCode: 11,
    kind: 'tax',
    taxField: 'vat_account2_id',
    sign: 1,
  },
  {
    id: 'construction-purchases-deductible-tax',
    label: 'Deductible tax on construction service purchases',
    vatCode: 11,
    kind: 'tax',
    taxField: 'vat_account1_id',
    sign: -1,
  },
];

function roundAmount(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function hasAmount(amount: number): boolean {
  return Math.abs(amount) >= 0.005;
}

function buildBaseLine(
  definition: VatRowDefinition,
  accounts: Account[],
  balances: Map<number, number>,
): VatReportLine {
  const details = accounts
    .filter((account) => account.vat_code === definition.vatCode)
    .map((account) => ({
      accountId: account.id,
      accountNumber: account.number,
      accountName: account.name,
      amount: roundAmount(balances.get(account.id) ?? 0),
      vatPercentage: account.vat_percentage || null,
    }))
    .filter((detail) => hasAmount(detail.amount))
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  return {
    id: definition.id,
    label: definition.label,
    amount: roundAmount(
      details.reduce((sum, detail) => sum + detail.amount, 0),
    ),
    details,
  };
}

function buildTaxLine(
  definition: VatRowDefinition,
  accounts: Account[],
  balances: Map<number, number>,
): VatReportLine {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const taxAccountIds = new Set<number>();

  accounts
    .filter((account) => account.vat_code === definition.vatCode)
    .forEach((account) => {
      const taxAccountId = definition.taxField
        ? account[definition.taxField]
        : null;
      if (taxAccountId != null) {
        taxAccountIds.add(taxAccountId);
      }
    });

  const details = [...taxAccountIds]
    .map((taxAccountId): VatReportDetail | null => {
      const account = accountMap.get(taxAccountId);
      if (!account) return null;

      return {
        accountId: account.id,
        accountNumber: account.number,
        accountName: account.name,
        amount: roundAmount(
          (balances.get(account.id) ?? 0) * (definition.sign ?? 1),
        ),
        vatPercentage: null,
      };
    })
    .filter(
      (detail): detail is VatReportDetail =>
        detail !== null && hasAmount(detail.amount),
    )
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  return {
    id: definition.id,
    label: definition.label,
    amount: roundAmount(
      details.reduce((sum, detail) => sum + detail.amount, 0),
    ),
    details,
  };
}

function getLineAmount(lines: VatReportLine[], id: string): number {
  return lines.find((line) => line.id === id)?.amount ?? 0;
}

export function buildVatSettlementPreview(
  entries: Entry[],
  accounts: Account[],
): VatSettlementPreview | null {
  const balances = calculateBalances(entries, accounts);
  const settlementAccount =
    accounts.find((account) => account.vat_code === 1) ??
    accounts.find((account) => account.number === '2939');

  if (!settlementAccount) {
    return null;
  }

  const sourceLines = accounts
    .filter((account) => account.vat_code === 2 || account.vat_code === 3)
    .map((account) => {
      const balance = roundAmount(balances.get(account.id) ?? 0);
      if (!hasAmount(balance)) return null;

      return {
        accountId: account.id,
        accountNumber: account.number,
        accountName: account.name,
        balance,
        debit: balance > 0,
        amount: Math.abs(balance),
      };
    })
    .filter((line): line is VatSettlementSourceLine => line !== null)
    .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber));

  if (sourceLines.length === 0) {
    return null;
  }

  const settlementBalance = roundAmount(
    sourceLines.reduce((sum, line) => sum + line.balance, 0),
  );

  if (!hasAmount(settlementBalance)) {
    return null;
  }

  return {
    settlementAccountId: settlementAccount.id,
    settlementAccountNumber: settlementAccount.number,
    settlementAccountName: settlementAccount.name,
    settlementBalance,
    settlementDebit: settlementBalance < 0,
    settlementAmount: Math.abs(settlementBalance),
    sourceLines,
  };
}

export function calculateVatReport(
  entries: Entry[],
  accounts: Account[],
): VatReport {
  const balances = calculateBalances(entries, accounts);
  const lines = VAT_ROWS.map((definition) =>
    definition.kind === 'base'
      ? buildBaseLine(definition, accounts, balances)
      : buildTaxLine(definition, accounts, balances),
  );

  const salesBase = roundAmount(
    getLineAmount(lines, 'domestic-sales-base') +
      getLineAmount(lines, 'eu-sales-base') +
      getLineAmount(lines, 'construction-sales-base'),
  );
  const purchaseBase = roundAmount(
    getLineAmount(lines, 'domestic-purchases-base') +
      getLineAmount(lines, 'eu-purchases-base') +
      getLineAmount(lines, 'construction-purchases-base'),
  );
  const outputVat = roundAmount(
    getLineAmount(lines, 'domestic-sales-tax') +
      getLineAmount(lines, 'eu-purchases-output-tax') +
      getLineAmount(lines, 'construction-purchases-output-tax'),
  );
  const deductibleVat = roundAmount(
    getLineAmount(lines, 'domestic-purchases-deductible-tax') +
      getLineAmount(lines, 'eu-purchases-deductible-tax') +
      getLineAmount(lines, 'construction-purchases-deductible-tax'),
  );
  const netVat = roundAmount(outputVat - deductibleVat);

  return {
    lines,
    totals: {
      salesBase,
      purchaseBase,
      outputVat,
      deductibleVat,
      payableVat: netVat > 0 ? netVat : 0,
      receivableVat: netVat < 0 ? Math.abs(netVat) : 0,
    },
  };
}
