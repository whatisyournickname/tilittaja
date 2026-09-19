import PDFDocument from 'pdfkit';
import { TilinpaatosPackage, TilinpaatosRow } from '@/lib/tilinpaatos';
import { formatCurrencyForPdf } from '@/lib/accounting';

function formatAmountForPdf(amount?: number): string {
  if (amount === undefined) return '';
  return formatCurrencyForPdf(amount);
}

function retentionDate(periodEnd: string): string {
  const [day, month, year] = periodEnd.split('.');
  const yearNumber = Number(year);
  if (!day || !month || !year || Number.isNaN(yearNumber)) return periodEnd;
  return `${day}.${month}.${yearNumber + 10}`;
}

function drawStatementTable(
  doc: InstanceType<typeof PDFDocument>,
  title: string,
  rows: TilinpaatosRow[],
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
    doc.text('Erä', LABEL_BASE_X, headerY, {
      width: LABEL_MAX_WIDTH,
      lineBreak: false,
    });
    doc.text('Nykyinen', CURRENT_X, headerY, {
      width: 90,
      align: 'right',
      lineBreak: false,
    });
    doc.text('Vertailu', PREVIOUS_X, headerY, {
      width: 90,
      align: 'right',
      lineBreak: false,
    });
    doc.y = headerY + doc.currentLineHeight(true) + ROW_GAP;
  };

  const ensureFits = (requiredHeight: number) => {
    if (doc.y + requiredHeight <= BOTTOM_Y) return;
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(12).text(`${title} (jatkuu)`);
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

export async function buildTilinpaatosPdf(
  pkg: TilinpaatosPackage,
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
  doc.font('Helvetica-Bold').fontSize(22).text('TILINPÄÄTÖS', 50, 276, {
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
      .text(`Y-tunnus: ${pkg.businessId}`, 50, 398, {
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
      `Tämä tilinpäätös on säilytettävä ${retentionDate(pkg.periodEnd)} asti`,
      50,
      603,
      {
        width: coverWidth,
        align: 'center',
      },
    );

  doc.addPage();

  drawStatementTable(doc, 'Tase', pkg.balanceSheetRows);
  drawStatementTable(doc, 'Tuloslaskelma', pkg.incomeStatementRows);

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(12).text('Tilinpäätöksen liitetiedot');
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(10);
  for (const note of pkg.notes) {
    doc.text(note, { paragraphGap: 6 });
  }
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text('Oman pääoman muutokset');
  doc
    .font('Helvetica')
    .text(
      `Edellisten tilikausien voitto: ${formatAmountForPdf(
        pkg.equity.previousPeriodsProfit,
      )}`,
    )
    .text(
      `Tilikauden tulos: ${formatAmountForPdf(pkg.equity.currentPeriodProfit)}`,
    )
    .text(
      `Jakokelpoinen oma pääoma yhteensä: ${formatAmountForPdf(
        pkg.equity.distributableEquity,
      )}`,
    );

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(12).text('Tilinpäätöksen allekirjoitus');
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
  doc.text('<sähköinen allekirjoitus>');
  doc.text(pkg.metadata.signerName);
  doc.text(pkg.metadata.signerTitle);

  doc.moveDown(2);
  doc.font('Helvetica-Bold').text('Luettelo kirjanpidoista ja aineistoista');
  doc
    .font('Helvetica')
    .text('- Päiväkirja: Sähköinen arkisto')
    .text('- Pääkirja: Sähköinen arkisto')
    .text('- Tilinpäätös: Sähköinen arkisto')
    .text('- Tase-erittelyt: Sähköinen arkisto')
    .text('- Tositteet: Sähköinen arkisto');

  doc.end();
  return done;
}
