import PDFDocument from 'pdfkit';
import {
  type DischargeTarget,
  TilinpaatosPackage,
  fromIsoToFiDate,
} from '@/lib/tilinpaatos';
import { formatNumber } from '@/lib/accounting';

const L = 50;
const R = 545;

function normalizeDecisionText(boardProposal: string, isLoss: boolean): string {
  const proposal = boardProposal.trim();
  if (!proposal) {
    return isLoss
      ? 'Päätettiin hallituksen esityksen mukaisesti, että tilikauden tappio kirjataan edellisten tilikausien voitto/tappio -tilille.'
      : 'Päätettiin hallituksen esityksen mukaisesti, että tilikauden voitto siirretään voittovarojen lisäykseksi, eikä osinkoa jaeta.';
  }

  const withoutTrailingDot = proposal.replace(/[.]+$/, '');
  const stripped = withoutTrailingDot.replace(
    /^hallitus esittää,\s*että\s*/i,
    '',
  );
  const normalized = stripped.charAt(0).toLowerCase() + stripped.slice(1);
  return `Päätettiin hallituksen esityksen mukaisesti, että ${normalized}.`;
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
  const resultWord = isProfit ? 'voittoa' : 'tappiota';
  const resultAmount = formatNumber(Math.abs(currentPeriodProfit));
  const distributableAmount = formatNumber(distributableEquity);

  const line1 = `Todettiin, että vahvistettu tilinpäätös osoittaa ${resultWord} ${resultAmount} euroa ja voitonjakokelpoisia varoja ${distributableAmount} euroa.`;
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
        return 'hallitukselle';
      case 'ceo':
        return 'toimitusjohtajalle';
      case 'board-and-ceo':
      default:
        return 'hallitukselle ja toimitusjohtajalle';
    }
  })();

  return `Päätettiin myöntää ${recipient} vastuuvapaus päättyneeltä tilikaudelta ${periodShort}.`;
}

export async function buildYhtiokokousPdf(
  pkg: TilinpaatosPackage,
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const pageW = doc.page.width - 100;
  const meetingDateFi = fromIsoToFiDate(pkg.metadata.meetingDate);
  const sigDateFi = fromIsoToFiDate(pkg.metadata.signatureDate);

  const attendeesText =
    pkg.metadata.attendees.trim() ||
    (pkg.metadata.signerName
      ? `${pkg.metadata.signerName} omistaen yhtiön koko osakekannan.`
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
    .text('Varsinainen yhtiökokous', L, headerY, {
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
    doc.font('Helvetica').fontSize(10).text(`Y-tunnus ${pkg.businessId}`);
  }
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(12).text('PÖYTÄKIRJA');
  doc.moveDown(0.6);

  const infoFont = 'Helvetica';
  const colSplit = 100;

  const infoRows: [string, string][] = [
    ['Aika:', meetingDateFi || sigDateFi],
    ['Paikka:', pkg.metadata.place || ''],
    ['Läsnä:', attendeesText],
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
    'Kokouksen avaaminen ja järjestäytyminen',
    pkg.metadata.signerName
      ? `${pkg.metadata.signerName} avasi kokouksen. Hänet valittiin kokouksen puheenjohtajaksi.`
      : 'Kokous avattiin. Puheenjohtaja valittiin.',
  );

  writeSection(
    '2§',
    'Laillisuus ja päätösvaltaisuus',
    'Todettiin kokous lailliseksi ja päätösvaltaiseksi.',
  );

  writeSection(
    '3§',
    'Tilinpäätöksen vahvistaminen',
    `Käsiteltiin ja vahvistettiin tilinpäätös tilikaudelta ${periodShort}.`,
  );

  writeSection(
    '4§',
    'Tuloksen käsittely',
    buildSection4Text(
      pkg.equity.currentPeriodProfit,
      pkg.equity.distributableEquity,
      pkg.metadata.boardProposal,
    ),
  );

  writeSection(
    '5§',
    'Vastuuvapauden myöntäminen',
    buildDischargeText(pkg.metadata.dischargeTarget, periodShort),
  );

  writeSection(
    '6§',
    'Kokouksen päättäminen',
    'Koska muita asioita ei ollut, puheenjohtaja päätti kokouksen.',
  );

  doc.moveDown(0.5);
  doc
    .font('Helvetica')
    .fontSize(10)
    .text(pkg.metadata.signerName || '');
  doc
    .font('Helvetica')
    .fontSize(10)
    .text((pkg.metadata.signerTitle || 'hallituksen jäsen').toLowerCase());

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
    .text('Liite 1', L, attachmentY, { width: 50, lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(`Tilinpäätös ${periodShort}.`, L + 50, attachmentY);

  doc.end();
  return done;
}
