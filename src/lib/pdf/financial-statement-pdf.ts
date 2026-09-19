import PDFDocument from 'pdfkit';
import { FinancialStatementPackage, FinancialStatementRow } from '@/lib/financial-statement';
import { formatCurrencyForPdf } from '@/lib/accounting';

function formatAmountForPdf(amount?: number): string {
  if (amount === undefined) return '';
  return formatCurrencyForPdf(amount);
}

function drawStatementTable(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  rows: FinancialStatementRow[],
) {
  const LABEL_BASE_X = 50;
  const CURRENT_X = 330;
  const PREVIOUS_X = 430;
  const LABEL_MAX_WIDTH = 260;
  const TABLE_RIGHT_X = 520;
  const BOTTOM_Y = 760;
  const ROW_GAP = 4;
  const TABLE_WIDTH = TABLE_RIGHT_X - LABEL_BASE_X;

  const drawColumns = () => {
    const headerY = doc.y;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Item', LABEL_BASE_X, headerY, {
      width: LABEL_MAX_WIDTH,
      lineBreak: false,
    });
    doc.text('Current', CURRENT_X, headerY, {
      width: 90,
      align: 'right',
      lineBreak: false,
    });
    doc.text('Comparative', PREVIOUS_X, headerY, {
      width: 90,
      align: 'right',
      lineBreak: false,
    });
    doc.y = headerY + doc.currentLineHeight(true) + ROW_GAP;
  };

  const ensureFits = (requiredHeight: number) => {
    if (doc.y + requiredHeight <= BOTTOM_Y) return;
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).text(`${title} (continued)`);
    doc.moveDown(0.4);
    drawColumns();
  };

  doc.moveDown(1.2);
  const titleY = doc.y;
  doc.font('Helvetica-Bold').fontSize(12).text(title, LABEL_BASE_X, titleY, {
    width: TABLE_WIDTH,
    align: 'left',
  });
  doc.y = titleY + doc.currentLineHeight(true) + ROW_GAP;
  drawColumns();

  for (const row of rows) {
    if (!row.visible) continue;
    if (row.type === '-') {
      ensureFits(8);
      doc
        .moveTo(LABEL_BASE_X, doc.y + 2)
        .lineTo(TABLE_RIGHT_X, doc.y + 2)
        .strokeColor('#cccccc')
        .lineWidth(0.5)
        .stroke();
      doc.strokeColor('#000000');
      doc.y += 8;
      continue;
    }

    const labelX = LABEL_BASE_X + row.level * 12;
    const labelWidth = LABEL_MAX_WIDTH - row.level * 12;
    const style = row.style === 'B' ? 'Helvetica-Bold' : 'Helvetica';
    doc.font(style).fontSize(9);
    const lineHeight = doc.currentLineHeight(true);
    const labelHeight = doc.heightOfString(row.label, {
      width: labelWidth,
      align: 'left',
    });
    const rowHeight = Math.max(lineHeight, labelHeight);
    ensureFits(rowHeight + ROW_GAP);
    const rowY = doc.y;

    doc
      .font(style)
      .fontSize(9)
      .text(row.label, labelX, rowY, { width: labelWidth, align: 'left' });

    const current =
      row.type === 'H' || row.type === 'G'
        ? ''
        : formatAmountForPdf(row.currentAmount);
    const previous =
      row.type === 'H' || row.type === 'G'
        ? ''
        : formatAmountForPdf(row.previousAmount);
    doc
      .font(style)
      .fontSize(9)
      .text(current, CURRENT_X, rowY, {
        width: 90,
        align: 'right',
        lineBreak: false,
      })
      .text(previous, PREVIOUS_X, rowY, {
        width: 90,
        align: 'right',
        lineBreak: false,
      });
    doc.y = rowY + rowHeight + ROW_GAP;
  }
}

export async function buildFinancialStatementPdf(
  pkg: FinancialStatementPackage,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const coverWidth = doc.page.width - 100;
  const hasBusinessId = pkg.businessId.trim().length > 0;
  const periodY = hasBusinessId ? 444 : 421;
  doc.font('Helvetica-Bold').fontSize(22).text('FINANCIAL STATEMENTS', 50, 276, {
    width: coverWidth,
    align: 'center',
  });
  doc.font('Helvetica-Bold').fontSize(18).text(pkg.companyName, 50, 315, {
    width: coverWidth,
    align: 'center',
  });
  if (hasBusinessId) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Business ID: ${pkg.businessId}`, 50, 398, {
        width: coverWidth,
        align: 'center',
      });
  }
  doc.text(`${pkg.periodStart} - ${pkg.periodEnd}`, 50, periodY, {
    width: coverWidth,
    align: 'center',
  });
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(
      `These financial statements must be retained for at least 10 years from the end of the period and the voucher material for at least 6 years.`,
      50,
      603,
      {
        width: coverWidth,
        align: 'center',
      },
    );

  doc.addPage();

  drawStatementTable(doc, 'Balance sheet', pkg.balanceSheetRows);
  drawStatementTable(doc, 'Income statement', pkg.incomeStatementRows);

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(12).text('Notes to the financial statements');
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(10);
  for (const note of pkg.notes) {
    doc.text(note, { paragraphGap: 6 });
  }
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Changes in equity');
  doc
    .font('Helvetica')
    .text(
      `Prior periods' profit: ${formatAmountForPdf(
        pkg.equity.previousPeriodsProfit,
      )}`,
    )
    .text(
      `Current period result: ${formatAmountForPdf(pkg.equity.currentPeriodProfit)}`,
    )
    .text(
      `Total distributable equity: ${formatAmountForPdf(
        pkg.equity.distributableEquity,
      )}`,
    );

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(12).text('Signatures');
  doc.moveDown(2);
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(
      `${pkg.metadata.place}, ${pkg.metadata.signatureDate
        .split('-')
        .reverse()
        .join('.')}`,
    );
  doc.moveDown(1.2);
  doc.text('<electronic signature>');
  doc.text(pkg.metadata.signerName);
  doc.text(pkg.metadata.signerTitle);

  doc.moveDown(2);
  doc.font('Helvetica-Bold').text('List of accounting records and materials');
  doc
    .font('Helvetica')
    .text('- Journal: Electronic archive')
    .text('- General ledger: Electronic archive')
    .text('- Financial statements: Electronic archive')
    .text('- Balance sheet details: Electronic archive')
    .text('- Documents: Electronic archive');

  doc.end();
  return done;
}
