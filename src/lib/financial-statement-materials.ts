import PDFDocument from 'pdfkit';
import {
  getAccounts,
  getAllEntriesWithDetails,
  getEntriesForPeriod,
  getPeriods,
  getReportStructure,
} from '@/lib/db/documents';
import { getSettings } from '@/lib/db/settings';
import {
  calculateBalances,
  calculateReportAmounts,
  formatDate,
  formatNumber,
  getDetailRows,
  getEntrySign,
  isDetailReportRow,
  parseReportStructure,
  periodFilenamePart,
  periodLabel,
  sanitizeForFilename,
} from '@/lib/accounting';
import { ReportRow } from '@/lib/types';

export type MaterialKind =
  | 'paakirja'
  | 'paivakirja'
  | 'tase-erittely'
  | 'tase-laaja'
  | 'tulos-laaja';

export const MATERIALS: Record<
  MaterialKind,
  {
    title: string;
    filenamePrefix: string;
  }
> = {
  paakirja: {
    title: 'Pääkirja',
    filenamePrefix: 'paakirja',
  },
  paivakirja: {
    title: 'Päiväkirja',
    filenamePrefix: 'paivakirja',
  },
  'tase-erittely': {
    title: 'Tase-erittely',
    filenamePrefix: 'tase-erittely',
  },
  'tase-laaja': {
    title: 'Tase (laaja)',
    filenamePrefix: 'tase-laaja',
  },
  'tulos-laaja': {
    title: 'Tuloslaskelma (laaja)',
    filenamePrefix: 'tulos-laaja',
  },
};

const LEFT = 50;
const RIGHT = 545;
const BOTTOM = 770;
const PAKIRJA_COL = {
  dateX: LEFT,
  dateW: 58,
  voucherX: LEFT + 62,
  voucherW: 42,
  descX: LEFT + 108,
  descW: 188,
  debitX: LEFT + 300,
  debitW: 68,
  creditX: LEFT + 372,
  creditW: 68,
  balanceX: LEFT + 444,
  balanceW: 66,
} as const;

const PAIVAKIRJA_COL = {
  accountNumberX: LEFT,
  accountNumberW: 44,
  accountNameX: LEFT + 48,
  accountNameW: 152,
  descX: LEFT + 204,
  descW: 197,
  debitX: RIGHT - 140,
  debitW: 68,
  creditX: RIGHT - 68,
  creditW: 68,
} as const;

export function isMaterialKind(value: string): value is MaterialKind {
  return value in MATERIALS;
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function addHeader(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  companyName: string,
  periodText: string,
) {
  doc
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(title, LEFT, 50, { width: RIGHT - LEFT });
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(companyName, LEFT, 68, { width: RIGHT - LEFT, lineBreak: false })
    .text(periodText, LEFT, 68, {
      width: RIGHT - LEFT,
      align: 'right',
      lineBreak: false,
    });
  doc
    .moveTo(LEFT, 84)
    .lineTo(RIGHT, 84)
    .strokeColor('#cccccc')
    .lineWidth(0.5)
    .stroke();
  doc.strokeColor('#000000').lineWidth(1);
  doc.y = 92;
}

function ensureFits(
  doc: InstanceType<typeof PDFDocument>,
  requiredHeight: number,
  redraw: () => void,
) {
  if (doc.y + requiredHeight <= BOTTOM) return;
  doc.addPage();
  redraw();
}

function drawPaakirja(
  doc: InstanceType<typeof PDFDocument>,
  companyName: string,
  periodText: string,
  periodId: number,
) {
  const entries = getAllEntriesWithDetails(periodId);
  const accounts = getAccounts();
  const accountTypeById = new Map(
    accounts.map((account) => [account.id, account.type]),
  );
  addHeader(doc, 'Pääkirja', companyName, periodText);

  const grouped = new Map<number, typeof entries>();
  for (const entry of entries) {
    if (!grouped.has(entry.account_id)) grouped.set(entry.account_id, []);
    grouped.get(entry.account_id)!.push(entry);
  }

  const sortedGroups = [...grouped.entries()].sort(
    (a, b) =>
      a[1][0]?.account_number.localeCompare(b[1][0]?.account_number || '') || 0,
  );

  for (const [, groupEntries] of sortedGroups) {
    const first = groupEntries[0];
    if (!first) continue;

    const drawAccountHeader = () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`${first.account_number} ${first.account_name}`, LEFT, doc.y, {
          width: RIGHT - LEFT,
          lineBreak: false,
        });
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(8);
      const headerY = doc.y;
      doc.text('Pvm', PAKIRJA_COL.dateX, headerY, {
        width: PAKIRJA_COL.dateW,
        lineBreak: false,
      });
      doc.text('Tosite', PAKIRJA_COL.voucherX, headerY, {
        width: PAKIRJA_COL.voucherW,
        lineBreak: false,
      });
      doc.text('Selite', PAKIRJA_COL.descX, headerY, {
        width: PAKIRJA_COL.descW,
        lineBreak: false,
      });
      doc.text('Debet', PAKIRJA_COL.debitX, headerY, {
        width: PAKIRJA_COL.debitW,
        align: 'right',
        lineBreak: false,
      });
      doc.text('Kredit', PAKIRJA_COL.creditX, headerY, {
        width: PAKIRJA_COL.creditW,
        align: 'right',
        lineBreak: false,
      });
      doc.text('Saldo', PAKIRJA_COL.balanceX, headerY, {
        width: PAKIRJA_COL.balanceW,
        align: 'right',
        lineBreak: false,
      });
      doc.y = headerY + 12;
    };
    const redrawCurrentAccountPage = () => {
      addHeader(doc, 'Pääkirja (jatkuu)', companyName, periodText);
      drawAccountHeader();
    };

    ensureFits(doc, 42, redrawCurrentAccountPage);
    drawAccountHeader();

    let runningBalance = 0;
    const accountType = accountTypeById.get(first.account_id) ?? 0;
    for (const entry of groupEntries) {
      const rowHeight = 12;
      ensureFits(doc, rowHeight, redrawCurrentAccountPage);
      const sign = getEntrySign(accountType, Boolean(entry.debit));
      runningBalance += entry.amount * sign;
      const y = doc.y;
      doc.font('Helvetica').fontSize(8);
      doc.text(formatDate(entry.document_date), PAKIRJA_COL.dateX, y, {
        width: PAKIRJA_COL.dateW,
        lineBreak: false,
      });
      doc.text(String(entry.document_number), PAKIRJA_COL.voucherX, y, {
        width: PAKIRJA_COL.voucherW,
        lineBreak: false,
      });
      doc.text(
        truncateText(entry.description || '', 46),
        PAKIRJA_COL.descX,
        y,
        {
          width: PAKIRJA_COL.descW,
          lineBreak: false,
        },
      );
      doc.text(
        Boolean(entry.debit) ? formatNumber(entry.amount) : '',
        PAKIRJA_COL.debitX,
        y,
        {
          width: PAKIRJA_COL.debitW,
          align: 'right',
          lineBreak: false,
        },
      );
      doc.text(
        Boolean(entry.debit) ? '' : formatNumber(entry.amount),
        PAKIRJA_COL.creditX,
        y,
        {
          width: PAKIRJA_COL.creditW,
          align: 'right',
          lineBreak: false,
        },
      );
      doc.text(formatNumber(runningBalance), PAKIRJA_COL.balanceX, y, {
        width: PAKIRJA_COL.balanceW,
        align: 'right',
        lineBreak: false,
      });
      doc.y = y + 12;
    }
    doc.moveDown(0.4);
  }
}

function drawPaivakirja(
  doc: InstanceType<typeof PDFDocument>,
  companyName: string,
  periodText: string,
  periodId: number,
) {
  const entries = getEntriesForPeriod(periodId);
  const accounts = getAccounts();
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  addHeader(doc, 'Päiväkirja', companyName, periodText);
  const grouped = new Map<number, typeof entries>();
  for (const entry of entries) {
    if (!grouped.has(entry.document_number))
      grouped.set(entry.document_number, []);
    grouped.get(entry.document_number)!.push(entry);
  }
  const sortedDocs = [...grouped.entries()].sort((a, b) => a[0] - b[0]);

  for (const [documentNumber, documentEntries] of sortedDocs) {
    const first = documentEntries[0];
    if (!first) continue;

    const drawDocumentHeader = () => {
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .text(
          `Tosite ${documentNumber} | ${formatDate(first.document_date)}`,
          LEFT,
          doc.y,
          {
            width: RIGHT - LEFT,
          },
        );
      doc.moveDown(0.15);
      const headerY = doc.y;
      doc.font('Helvetica-Bold').fontSize(8);
      doc.text('Tili', PAIVAKIRJA_COL.accountNumberX, headerY, {
        width: PAIVAKIRJA_COL.accountNumberW,
        lineBreak: false,
      });
      doc.text('Tilin nimi', PAIVAKIRJA_COL.accountNameX, headerY, {
        width: PAIVAKIRJA_COL.accountNameW,
        lineBreak: false,
      });
      doc.text('Selite', PAIVAKIRJA_COL.descX, headerY, {
        width: PAIVAKIRJA_COL.descW,
        lineBreak: false,
      });
      doc.text('Debet', PAIVAKIRJA_COL.debitX, headerY, {
        width: PAIVAKIRJA_COL.debitW,
        align: 'right',
        lineBreak: false,
      });
      doc.text('Kredit', PAIVAKIRJA_COL.creditX, headerY, {
        width: PAIVAKIRJA_COL.creditW,
        align: 'right',
        lineBreak: false,
      });
      doc.y = headerY + 12;
    };

    const redrawCurrentDocumentPage = () => {
      addHeader(doc, 'Päiväkirja (jatkuu)', companyName, periodText);
      drawDocumentHeader();
    };

    ensureFits(doc, 30, () =>
      addHeader(doc, 'Päiväkirja (jatkuu)', companyName, periodText),
    );
    drawDocumentHeader();

    let debitTotal = 0;
    let creditTotal = 0;
    for (const entry of documentEntries) {
      ensureFits(doc, 12, redrawCurrentDocumentPage);
      const account = accountById.get(entry.account_id);
      const y = doc.y;
      doc.font('Helvetica').fontSize(8);
      doc.text(account?.number || '', PAIVAKIRJA_COL.accountNumberX, y, {
        width: PAIVAKIRJA_COL.accountNumberW,
        lineBreak: false,
      });
      doc.text(
        truncateText(account?.name || '', 30),
        PAIVAKIRJA_COL.accountNameX,
        y,
        {
          width: PAIVAKIRJA_COL.accountNameW,
          lineBreak: false,
        },
      );
      doc.text(
        truncateText(entry.description || '', 34),
        PAIVAKIRJA_COL.descX,
        y,
        {
          width: PAIVAKIRJA_COL.descW,
          lineBreak: false,
        },
      );
      doc.text(
        Boolean(entry.debit) ? formatNumber(entry.amount) : '',
        PAIVAKIRJA_COL.debitX,
        y,
        {
          width: PAIVAKIRJA_COL.debitW,
          align: 'right',
          lineBreak: false,
        },
      );
      doc.text(
        Boolean(entry.debit) ? '' : formatNumber(entry.amount),
        PAIVAKIRJA_COL.creditX,
        y,
        {
          width: PAIVAKIRJA_COL.creditW,
          align: 'right',
          lineBreak: false,
        },
      );
      doc.y = y + 12;
      if (Boolean(entry.debit)) debitTotal += entry.amount;
      else creditTotal += entry.amount;
    }

    ensureFits(doc, 14, redrawCurrentDocumentPage);
    doc.font('Helvetica-Bold').fontSize(8);
    const totalY = doc.y;
    doc.text('Yhteensä', PAIVAKIRJA_COL.descX, totalY, {
      width: PAIVAKIRJA_COL.debitX - PAIVAKIRJA_COL.descX - 4,
      align: 'right',
      lineBreak: false,
    });
    doc.text(formatNumber(debitTotal), PAIVAKIRJA_COL.debitX, totalY, {
      width: PAIVAKIRJA_COL.debitW,
      align: 'right',
      lineBreak: false,
    });
    doc.text(formatNumber(creditTotal), PAIVAKIRJA_COL.creditX, totalY, {
      width: PAIVAKIRJA_COL.creditW,
      align: 'right',
      lineBreak: false,
    });
    doc.y = totalY + 14;
    doc.moveDown(0.15);
  }
}

function getBalanceSheetBalances(periodEndDate: number) {
  const periods = getPeriods();
  const accounts = getAccounts();
  const allEntries: { account_id: number; debit: boolean; amount: number }[] =
    [];
  for (const period of periods) {
    if (period.end_date <= periodEndDate)
      allEntries.push(...getEntriesForPeriod(period.id));
  }
  return { balances: calculateBalances(allEntries, accounts), accounts };
}

function drawStructuredStatement(
  doc: InstanceType<typeof PDFDocument>,
  companyName: string,
  periodText: string,
  title: string,
  rows: ReportRow[],
  accounts: ReturnType<typeof getAccounts>,
  balances: Map<number, number>,
  detailOnly = false,
) {
  addHeader(doc, title, companyName, periodText);
  doc.font('Helvetica-Bold').fontSize(8);
  const tableHeaderY = doc.y;
  doc.text('Erä', LEFT, tableHeaderY, { width: 360, lineBreak: false });
  doc.text('Summa', LEFT + 364, tableHeaderY, {
    width: 130,
    align: 'right',
    lineBreak: false,
  });
  doc.y = tableHeaderY + 12;

  for (const row of rows) {
    if (!row.visible) continue;
    if (row.type === '-') {
      // Skip separator rows in PDF output.
      continue;
    }

    if (isDetailReportRow(row)) {
      const details = getDetailRows(row, accounts, balances);
      if (!details.length) continue;
      ensureFits(doc, 12, () =>
        addHeader(doc, `${title} (jatkuu)`, companyName, periodText),
      );
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .text(row.label, LEFT + row.level * 12, doc.y, {
          width: 360 - row.level * 12,
        });
      doc.moveDown(0.1);
      for (const detail of details) {
        ensureFits(doc, 12, () =>
          addHeader(doc, `${title} (jatkuu)`, companyName, periodText),
        );
        const y = doc.y;
        doc.text(
          `${detail.accountNumber} ${detail.accountName}`,
          LEFT + row.level * 12 + 12,
          y,
          {
            width: 340 - row.level * 12,
            lineBreak: false,
          },
        );
        doc.text(formatNumber(detail.amount), LEFT + 364, y, {
          width: 130,
          align: 'right',
          lineBreak: false,
        });
        doc.y = y + 12;
      }
      continue;
    }

    if (detailOnly) continue;
    ensureFits(doc, 12, () =>
      addHeader(doc, `${title} (jatkuu)`, companyName, periodText),
    );
    const y = doc.y;
    const style = row.style === 'B' ? 'Helvetica-Bold' : 'Helvetica';
    doc
      .font(style)
      .fontSize(8)
      .text(row.label, LEFT + row.level * 12, y, {
        width: 360 - row.level * 12,
        lineBreak: false,
      });
    const showAmount = row.type !== 'H' && row.type !== 'G';
    doc.text(showAmount ? formatNumber(row.amount || 0) : '', LEFT + 364, y, {
      width: 130,
      align: 'right',
      lineBreak: false,
    });
    doc.y = y + 12;
  }
}

export async function buildMaterialPdf(
  kind: MaterialKind,
  periodId?: number,
): Promise<{
  buffer: Buffer;
  filename: string;
  title: string;
}> {
  const settings = getSettings();
  const periods = getPeriods();
  const selectedPeriod =
    (periodId ? periods.find((period) => period.id === periodId) : undefined) ||
    periods.find((period) => period.id === settings.current_period_id) ||
    periods[0];
  if (!selectedPeriod) throw new Error('Tilikautta ei löytynyt.');

  const material = MATERIALS[kind];
  const periodText = periodLabel(
    selectedPeriod.start_date,
    selectedPeriod.end_date,
  );
  const companyName = settings.name;

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  if (kind === 'paakirja') {
    drawPaakirja(doc, companyName, periodText, selectedPeriod.id);
  } else if (kind === 'paivakirja') {
    drawPaivakirja(doc, companyName, periodText, selectedPeriod.id);
  } else if (kind === 'tulos-laaja') {
    const structure = getReportStructure('income-statement-detailed');
    if (!structure)
      throw new Error('Tuloslaskelman laajaa rakennetta ei löytynyt.');
    const accounts = getAccounts();
    const balances = calculateBalances(
      getEntriesForPeriod(selectedPeriod.id),
      accounts,
    );
    const rows = calculateReportAmounts(
      parseReportStructure(structure.data),
      accounts,
      balances,
    );
    drawStructuredStatement(
      doc,
      companyName,
      periodText,
      'Tuloslaskelma (laaja)',
      rows,
      accounts,
      balances,
    );
  } else {
    const structure = getReportStructure('balance-sheet-detailed');
    if (!structure) throw new Error('Taseen laajaa rakennetta ei löytynyt.');
    const { balances, accounts } = getBalanceSheetBalances(
      selectedPeriod.end_date,
    );
    const rows = calculateReportAmounts(
      parseReportStructure(structure.data),
      accounts,
      balances,
    );
    if (kind === 'tase-erittely') {
      drawStructuredStatement(
        doc,
        companyName,
        periodText,
        'Tase-erittely',
        rows,
        accounts,
        balances,
        true,
      );
    } else {
      drawStructuredStatement(
        doc,
        companyName,
        periodText,
        'Tase (laaja)',
        rows,
        accounts,
        balances,
      );
    }
  }

  doc.end();
  const buffer = await done;
  const companySlug = sanitizeForFilename(companyName);
  const periodSlug = periodFilenamePart(
    selectedPeriod.start_date,
    selectedPeriod.end_date,
  );
  return {
    buffer,
    filename: `${material.filenamePrefix}-${companySlug}-${periodSlug}.pdf`,
    title: material.title,
  };
}
