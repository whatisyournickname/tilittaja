import PDFDocument from 'pdfkit';
import {
  type DischargeTarget,
  FinancialStatementPackage,
  formatFinnishDate,
} from '@/lib/financial-statement';
import { formatNumber } from '@/lib/accounting';

const L = 50;
const R = 545;

function normalizeDecisionText(boardProposal: string, isLoss: boolean): string {
  const proposal = boardProposal.trim();
  if (!proposal) {
    return isLoss
      ? 'It was resolved, in accordance with the board proposal, that the period loss is recorded against prior periods\' profit/loss account.'
      : 'It was resolved, in accordance with the board proposal, that the period profit is transferred as an addition to profit reserves and no dividend is distributed.';
  }

  const withoutTrailingDot = proposal.replace(/[.]+$/, '');
  const stripped = withoutTrailingDot.replace(
    /^hallitus esittää,\s*että\s*/i,
    '',
  );
  const normalized = stripped.charAt(0).toLowerCase() + stripped.slice(1);
  return `It was resolved, in accordance with the board proposal, that ${normalized}.`;
}

function formatPeriodForMinutes(
  periodStart: string,
  periodEnd: string,
): string {
  const parseFiDate = (value: string): [number, number, number] | null => {
    const [dayRaw, monthRaw, yearRaw] = value.split('.');
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    if (!day || !month || !year) return null;
    return [day, month, year];
  };

  const start = parseFiDate(periodStart);
  const end = parseFiDate(periodEnd);
  if (!start || !end) return `${periodStart} - ${periodEnd}`;

  const [sDay, sMonth, sYear] = start;
  const [eDay, eMonth, eYear] = end;
  if (sYear === eYear) {
    return `${sDay}.${sMonth}. - ${eDay}.${eMonth}.${eYear}`;
  }
  return `${sDay}.${sMonth}.${sYear} - ${eDay}.${eMonth}.${eYear}`;
}

function buildSection4Text(
  currentPeriodProfit: number,
  distributableEquity: number,
  boardProposal: string,
): string {
  const isProfit = currentPeriodProfit >= 0;
  const resultWord = isProfit ? 'profit of' : 'loss of';
  const resultAmount = formatNumber(Math.abs(currentPeriodProfit));
  const distributableAmount = formatNumber(distributableEquity);

  const line1 = `It was noted that the confirmed financial statements show a ${resultWord} ${resultAmount} euros and distributable funds of ${distributableAmount} euros.`;
  const line2 = normalizeDecisionText(boardProposal, !isProfit);
  return `${line1} ${line2}`;
}

export function buildDischargeText(
  dischargeTarget: DischargeTarget,
  periodShort: string,
): string {
  const recipient = (() => {
    switch (dischargeTarget) {
      case 'board':
        return 'the board';
      case 'ceo':
        return 'the chief executive officer';
      case 'board-and-ceo':
      default:
        return 'the board and chief executive officer';
    }
  })();

  return `It was resolved to grant discharge from liability to ${recipient} for the ended period ${periodShort}.`;
}

export async function buildAnnualMeetingPdf(
  pkg: FinancialStatementPackage,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const pageW = doc.page.width - 100;
  const meetingDateFi = formatFinnishDate(pkg.metadata.meetingDate);
  const sigDateFi = formatFinnishDate(pkg.metadata.signatureDate);

  const attendeesText =
    pkg.metadata.attendees.trim() ||
    (pkg.metadata.signerName
      ? `${pkg.metadata.signerName} owning the entire share capital of the company.`
      : '');

  const periodShort = formatPeriodForMinutes(pkg.periodStart, pkg.periodEnd);

  const headerY = 50;
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(pkg.companyName, L, headerY, { width: pageW / 2, lineBreak: false });
  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .text('Annual general meeting', L, headerY, {
      width: pageW - 30,
      align: 'center',
      lineBreak: false,
    });
  doc.font('Helvetica-Bold').fontSize(10).text('1(1)', L, headerY, {
    width: pageW,
    align: 'right',
    lineBreak: false,
  });
  doc.y = headerY + doc.currentLineHeight(true) + 2;

  if (pkg.businessId.trim()) {
    doc.font('Helvetica').fontSize(10).text(`Business ID ${pkg.businessId}`);
  }
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(12).text('MINUTES');
  doc.moveDown(0.6);

  const infoFont = 'Helvetica';
  const colSplit = 100;

  const infoRows: [string, string][] = [
    ['Date:', meetingDateFi || sigDateFi],
    ['Place:', pkg.metadata.place || ''],
    ['Present:', attendeesText],
  ];
  for (const [label, val] of infoRows) {
    const y = doc.y;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(label, L, y, { width: colSplit, lineBreak: false });
    const textWidth = pageW - colSplit;
    doc
      .font(infoFont)
      .fontSize(10)
      .text(val, L + colSplit, y, { width: textWidth });
    if (doc.y < y + doc.currentLineHeight(true) + 4) {
      doc.y = y + doc.currentLineHeight(true) + 4;
    }
  }
  doc.moveDown(0.8);

  const sectionGap = 0.6;
  const sectionNumberWidth = 24;

  function writeSection(num: string, title: string, body: string) {
    const y = doc.y;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(num, L, y, { width: sectionNumberWidth, lineBreak: false });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(title, L + sectionNumberWidth + 6, y, {
        width: pageW - sectionNumberWidth - 6,
      });
    doc.font('Helvetica').fontSize(10).text(body, { paragraphGap: 0 });
    doc.moveDown(sectionGap);
  }

  writeSection(
    '1§',
    'Opening and organization of the meeting',
    pkg.metadata.signerName
      ? `${pkg.metadata.signerName} opened the meeting. They were elected as chairperson of the meeting.`
      : 'The meeting was opened. The chairperson was elected.',
  );

  writeSection(
    '2§',
    'Lawfulness and quorum',
    'The meeting was noted as lawful and having a quorum.',
  );

  writeSection(
    '3§',
    'Approval of the financial statements',
    `The financial statements for the period ${periodShort} were discussed and approved.`,
  );

  writeSection(
    '4§',
    'Disposition of the result',
    buildSection4Text(
      pkg.equity.currentPeriodProfit,
      pkg.equity.distributableEquity,
      pkg.metadata.boardProposal,
    ),
  );

  writeSection(
    '5§',
    'Granting of discharge from liability',
    buildDischargeText(pkg.metadata.dischargeTarget, periodShort),
  );

  writeSection(
    '6§',
    'Closing of the meeting',
    'As there were no other matters, the chairperson closed the meeting.',
  );

  doc.moveDown(0.5);
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(pkg.metadata.signerName || '');
  doc
    .font('Helvetica')
    .fontSize(10)
    .text((pkg.metadata.signerTitle || 'member of the board').toLowerCase());

  doc.moveDown(1);
  doc
    .moveTo(L, doc.y)
    .lineTo(R, doc.y)
    .strokeColor('#cccccc')
    .lineWidth(0.5)
    .stroke();
  doc.strokeColor('#000000').lineWidth(1);
  doc.y += 6;
  const attachmentY = doc.y;
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .text('Attachment 1', L, attachmentY, { width: 50, lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(`Financial statements ${periodShort}.`, L + 50, attachmentY);

  doc.end();
  return done;
}
