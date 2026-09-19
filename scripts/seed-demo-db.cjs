/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.resolve(process.cwd(), '..', 'data');
const schemaPath = path.resolve(process.cwd(), 'src/lib/db/schema.sql');

const BALANCE_SHEET_STRUCTURE = `HP;TASE
HB;Vastaavaa
HP1;PYSYVÄT VASTAAVAT
HP2;Aineettomat hyödykkeet
SP0;1000;1099;Aineettomat hyödykkeet
HP2;Aineelliset hyödykkeet
SP0;1100;1299;Aineelliset hyödykkeet
HP2;Sijoitukset
SP0;1300;1499;Sijoitukset
SB1;1000;1499;Pysyvät vastaavat yhteensä
-
HP1;VAIHTUVAT VASTAAVAT
HP2;Saamiset
SP0;1500;1699;Saamiset
HP2;Siirtosaamiset
SP0;1700;1799;Siirtosaamiset
HP2;Rahoitusarvopaperit
SP0;1800;1899;Rahoitusarvopaperit
HP2;Rahat ja pankkisaamiset
SP0;1900;1999;Rahat ja pankkisaamiset
SB1;1500;1999;Vaihtuvat vastaavat yhteensä
-
SB0;1000;1999;Vastaavaa yhteensä
-
HB;Vastattavaa
HP1;OMA PÄÄOMA
SP0;2000;2099;Osake-, osuus- tai muu vastaava pääoma
SP0;2010;2049;Ylikurssirahasto
SP0;2050;2099;Muut rahastot
SP0;2100;2199;SVOP-rahasto
SP0;2250;2369;Edellisten tilikausien voitto (tappio)
SP0;2370;2399;Tilikauden voitto (tappio)
SB1;2000;2399;Oma pääoma yhteensä
-
HP1;VIERAS PÄÄOMA
HP2;Pitkäaikainen vieras pääoma
SP0;2400;2579;Pitkäaikainen vieras pääoma
HP2;Lyhytaikainen vieras pääoma
SP0;2580;2999;Lyhytaikainen vieras pääoma
SB1;2400;2999;Vieras pääoma yhteensä
-
SB0;2000;2999;Vastattavaa yhteensä`;

const INCOME_STATEMENT_STRUCTURE = `HP;TULOSLASKELMA
SP0;3000;3050;Liikevaihto
SP0;3500;3999;Liiketoiminnan muut tuotot
-
SP0;4000;4050;Materiaalit ja palvelut
SP0;4200;4200;Varastojen muutos
SP0;5000;5999;Ulkopuoliset palvelut
-
SP0;6000;6099;Palkat ja palkkiot
SP0;6100;6299;Henkilösivukulut
SP0;6300;6399;Poistot ja arvonalentumiset
SP0;7000;7999;Liiketoiminnan muut kulut
-
SB0;3000;7999;LIIKEVOITTO (-TAPPIO)
-
SP0;8000;8499;Rahoitustuotot
SP0;8500;8999;Rahoituskulut
-
SB0;3000;8999;VOITTO (TAPPIO) ENNEN SATUNNAISIA ERIÄ
-
SP0;9000;9099;Satunnaiset tuotot
SP0;9100;9199;Satunnaiset kulut
SP0;9500;9999;Tuloverot
-
SB0;3000;9999;TILIKAUDEN VOITTO (TAPPIO)`;

const ACCOUNTS = [
  { number: '1000', name: 'Perustamismenot', type: 0 },
  { number: '1010', name: 'Kehittämismenot', type: 0 },
  { number: '1060', name: 'Aineettomat oikeudet', type: 0 },
  { number: '1100', name: 'Maa- ja vesialueet', type: 0 },
  { number: '1120', name: 'Rakennukset ja rakennelmat', type: 0 },
  { number: '1150', name: 'Koneet ja kalusto', type: 0 },
  { number: '1170', name: 'Muut aineelliset hyödykkeet', type: 0 },
  { number: '1300', name: 'Osuudet saman konsernin yrityksissä', type: 0 },
  { number: '1500', name: 'Myyntisaamiset', type: 0 },
  { number: '1510', name: 'Saamiset saman konsernin yrityksiltä', type: 0 },
  { number: '1530', name: 'Lainasaamiset', type: 0 },
  { number: '1560', name: 'Muut saamiset', type: 0 },
  { number: '1700', name: 'Siirtosaamiset', type: 0 },
  { number: '1800', name: 'Rahoitusarvopaperit', type: 0 },
  { number: '1900', name: 'Pankkitili', type: 0 },
  { number: '1910', name: 'Kassa', type: 0 },
  { number: '2000', name: 'Osake-, osuus- tai muu vastaava pääoma', type: 2 },
  { number: '2010', name: 'Ylikurssirahasto', type: 2 },
  { number: '2020', name: 'Arvonkorotusrahasto', type: 2 },
  { number: '2050', name: 'Muut rahastot', type: 2 },
  { number: '2100', name: 'SVOP-rahasto', type: 2 },
  { number: '2250', name: 'Edellisten tilikausien voitto (tappio)', type: 5 },
  { number: '2370', name: 'Tilikauden voitto (tappio)', type: 6 },
  { number: '2400', name: 'Pääomalainat', type: 1 },
  { number: '2460', name: 'Lainat rahoituslaitoksilta', type: 1 },
  { number: '2580', name: 'Saadut ennakot', type: 1 },
  { number: '2620', name: 'Ostovelat', type: 1 },
  { number: '2740', name: 'Muut velat', type: 1 },
  { number: '2870', name: 'Siirtovelat', type: 1 },
  { number: '2939', name: 'Arvonlisäverovelka', type: 1 },
  { number: '3000', name: 'Myynti', type: 3 },
  { number: '3010', name: 'Myynti 25,5 %', type: 3 },
  { number: '3020', name: 'Myynti 14 %', type: 3 },
  { number: '3030', name: 'Myynti 10 %', type: 3 },
  { number: '3040', name: 'Myynti 0 %', type: 3 },
  { number: '3500', name: 'Liiketoiminnan muut tuotot', type: 3 },
  { number: '4000', name: 'Ostot', type: 4 },
  {
    number: '4010',
    name: 'Ostot 25,5 %',
    type: 4,
    vat_percentage: 255,
    vat_account1_number: '2939',
  },
  {
    number: '4020',
    name: 'Ostot 14 %',
    type: 4,
    vat_percentage: 140,
    vat_account1_number: '2939',
  },
  {
    number: '4030',
    name: 'Ostot 10 %',
    type: 4,
    vat_percentage: 100,
    vat_account1_number: '2939',
  },
  { number: '4040', name: 'Ostot 0 %', type: 4 },
  { number: '4200', name: 'Varastojen muutos', type: 4 },
  {
    number: '5000',
    name: 'Ulkopuoliset palvelut',
    type: 4,
    vat_percentage: 255,
    vat_account1_number: '2939',
  },
  { number: '6000', name: 'Palkat ja palkkiot', type: 4 },
  { number: '6100', name: 'Eläkekulut', type: 4 },
  { number: '6140', name: 'Muut henkilösivukulut', type: 4 },
  { number: '6300', name: 'Poistot', type: 4 },
  { number: '7000', name: 'Toimitilakulut', type: 4 },
  { number: '7100', name: 'Ajoneuvokulut', type: 4 },
  { number: '7200', name: 'Matkakulut', type: 4 },
  { number: '7300', name: 'Edustuskulut', type: 4 },
  {
    number: '7400',
    name: 'Myynti- ja markkinointikulut',
    type: 4,
    vat_percentage: 255,
    vat_account1_number: '2939',
  },
  { number: '7500', name: 'Hallintokulut', type: 4 },
  {
    number: '7600',
    name: 'Tietoliikennekulut',
    type: 4,
    vat_percentage: 255,
    vat_account1_number: '2939',
  },
  { number: '7680', name: 'Pankki- ja rahoituskulut', type: 4 },
  { number: '7700', name: 'Muut liikekulut', type: 4 },
  { number: '8000', name: 'Rahoitustuotot', type: 3 },
  { number: '8500', name: 'Rahoituskulut', type: 4 },
  { number: '9000', name: 'Satunnaiset tuotot', type: 3 },
  { number: '9100', name: 'Satunnaiset kulut', type: 4 },
  { number: '9500', name: 'Tuloverot', type: 4 },
];

const COA_HEADINGS = [
  ['1000', 'VASTAAVAA', 0],
  ['1000', 'Pysyvät vastaavat', 1],
  ['1000', 'Aineettomat hyödykkeet', 2],
  ['1100', 'Aineelliset hyödykkeet', 2],
  ['1300', 'Sijoitukset', 2],
  ['1500', 'Vaihtuvat vastaavat', 1],
  ['1500', 'Saamiset', 2],
  ['1800', 'Rahoitusarvopaperit', 2],
  ['1900', 'Rahat ja pankkisaamiset', 2],
  ['2000', 'VASTATTAVAA', 0],
  ['2000', 'Oma pääoma', 1],
  ['2400', 'Vieras pääoma', 1],
  ['2400', 'Pitkäaikainen vieras pääoma', 2],
  ['2580', 'Lyhytaikainen vieras pääoma', 2],
  ['3000', 'TULOSLASKELMA', 0],
  ['3000', 'Liikevaihto', 1],
  ['3500', 'Liiketoiminnan muut tuotot', 1],
  ['4000', 'Materiaalit ja palvelut', 1],
  ['6000', 'Henkilöstökulut', 1],
  ['6300', 'Poistot ja arvonalentumiset', 1],
  ['7000', 'Liiketoiminnan muut kulut', 1],
  ['8000', 'Rahoitustuotot ja -kulut', 1],
  ['9000', 'Satunnaiset erät', 1],
  ['9500', 'Tilinpäätössiirrot ja verot', 1],
];

function timestamp(year, month, day) {
  return new Date(year, month - 1, day).getTime();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function encodePropertyValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

function serializeProperties(properties) {
  return Object.entries(properties)
    .sort(([a], [b]) => a.localeCompare(b, 'fi'))
    .map(([key, value]) => `${key}=${encodePropertyValue(value)}`)
    .join('\n');
}

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildTinyPdf(lines) {
  const content = [
    'BT',
    '/F1 14 Tf',
    '50 780 Td',
    ...lines.flatMap((line, index) =>
      index === 0
        ? [`(${escapePdfText(line)}) Tj`]
        : ['0 -18 Td', `(${escapePdfText(line)}) Tj`],
    ),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'utf8')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, 'utf8');
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

function writePdf(filePath, title, subtitle) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(
    filePath,
    buildTinyPdf([
      title,
      subtitle,
      'Tilittaja fixture PDF',
      new Date().toISOString().slice(0, 10),
    ]),
  );
}

function seedRealisticDatabase(options = {}) {
  const currentYear = Number(options.currentYear || new Date().getFullYear());
  const previousYear = currentYear - 1;
  const slug = options.slug || 'demo-realistic';
  const companyName = options.companyName || 'Tunturi Studio Oy';
  const businessId = options.businessId || '3478621-5';
  const signerName = options.signerName || 'Kaisa Kaikkonen';
  const place = options.place || 'Kittila';

  const sourceDir = path.join(dataDir, slug);
  const dbPath = path.join(sourceDir, `${slug}.sqlite`);
  const pdfRoot = path.join(sourceDir, 'pdf');
  const receiptsPreviousRoot = path.join(pdfRoot, 'tositteet', String(previousYear));
  const receiptsCurrentRoot = path.join(pdfRoot, 'tositteet', String(currentYear));
  const bankStatementsRoot = path.join(pdfRoot, 'tiliotteet');
  const invoicesRoot = path.join(pdfRoot, 'myyntilaskut', String(currentYear));

  fs.rmSync(sourceDir, { recursive: true, force: true });
  ensureDir(sourceDir);
  ensureDir(receiptsPreviousRoot);
  ensureDir(receiptsCurrentRoot);
  ensureDir(bankStatementsRoot);
  ensureDir(invoicesRoot);

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  try {
    db.exec(fs.readFileSync(schemaPath, 'utf8'));

    const insertPeriod = db.prepare(
      'INSERT INTO period (start_date, end_date, locked) VALUES (?, ?, ?)',
    );
    const previousPeriodId = Number(
      insertPeriod.run(
        timestamp(previousYear, 1, 1),
        timestamp(previousYear, 12, 31),
        1,
      ).lastInsertRowid,
    );
    const currentPeriodId = Number(
      insertPeriod.run(
        timestamp(currentYear, 1, 1),
        timestamp(currentYear, 12, 31),
        0,
      ).lastInsertRowid,
    );

    const settingsProperties = serializeProperties({
      'financialStatement.archiveNote':
        'Tilinpaatos sailytetaan vahintaan 10 vuotta tilikauden paattymisesta ja tositeaineisto vahintaan 6 vuotta.',
      'financialStatement.attendees': `${signerName}, Juho Tunturinen`,
      'financialStatement.boardProposal':
        'Hallitus esittaa, etta tilikauden voitto siirretaan edellisten tilikausien voittovaroihin, eika osinkoa jaeta.',
      'financialStatement.dischargeTarget': 'board-and-ceo',
      'financialStatement.meetingDate': `${currentYear + 1}-03-20`,
      'financialStatement.microDeclaration':
        'Yritys on kirjanpitolain mukainen mikroyritys ja financialStatement on laadittu PMA 4 luvun mikroyrityssaannosten mukaisesti.',
      'financialStatement.parentCompany': '',
      'financialStatement.personnelCount': '2',
      'financialStatement.place': place,
      'financialStatement.preparedBy': companyName,
      'financialStatement.shareInfo':
        'Yhtiossa on 100 osaketta, joilla kaikilla on yhtalaiset aanioikeudet ja oikeus osinkoon.',
      'financialStatement.signatureDate': `${currentYear + 1}-03-15`,
      'financialStatement.signerName': signerName,
      'financialStatement.signerTitle': 'Toimitusjohtaja',
    });

    db.prepare(
      `INSERT INTO settings
       (version, name, business_id, current_period_id, document_type_id, properties)
       VALUES (?, ?, ?, ?, NULL, ?)`,
    ).run(6, companyName, businessId, currentPeriodId, settingsProperties);

    const insertAccount = db.prepare(
      `INSERT INTO account
       (number, name, type, vat_code, vat_percentage, vat_account1_id, vat_account2_id, flags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const accountIdByNumber = new Map();

    for (const account of ACCOUNTS) {
      const result = insertAccount.run(
        account.number,
        account.name,
        account.type,
        account.vat_code || 0,
        account.vat_percentage || 0,
        null,
        null,
        account.flags || 0,
      );
      accountIdByNumber.set(account.number, Number(result.lastInsertRowid));
    }

    const updateVatConfig = db.prepare(
      `UPDATE account
       SET vat_percentage = ?, vat_account1_id = ?
       WHERE number = ?`,
    );
    for (const account of ACCOUNTS) {
      if (!account.vat_account1_number) continue;
      updateVatConfig.run(
        account.vat_percentage || 0,
        accountIdByNumber.get(account.vat_account1_number) || null,
        account.number,
      );
    }

    const insertHeading = db.prepare(
      'INSERT INTO coa_heading (number, text, level) VALUES (?, ?, ?)',
    );
    for (const [number, text, level] of COA_HEADINGS) {
      insertHeading.run(number, text, level);
    }

    const insertStructure = db.prepare(
      'INSERT INTO report_structure (id, data) VALUES (?, ?)',
    );
    insertStructure.run('income-statement-detailed', INCOME_STATEMENT_STRUCTURE);
    insertStructure.run('balance-sheet-detailed', BALANCE_SHEET_STRUCTURE);
    insertStructure.run('income-statement', INCOME_STATEMENT_STRUCTURE);
    insertStructure.run('balance-sheet', BALANCE_SHEET_STRUCTURE);

    const nextDocumentNumberByPeriod = new Map([
      [previousPeriodId, 1],
      [currentPeriodId, 1],
    ]);

    const insertDocument = db.prepare(
      'INSERT INTO document (number, period_id, date) VALUES (?, ?, ?)',
    );
    const insertEntry = db.prepare(
      `INSERT INTO entry
       (document_id, account_id, debit, amount, description, row_number, flags)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
    );
    const insertMetadata = db.prepare(
      `INSERT INTO document_metadata (document_id, category, name)
       VALUES (?, ?, ?)`,
    );
    const insertReceiptLink = db.prepare(
      `INSERT INTO document_receipt_link (document_id, pdf_path, linked_at)
       VALUES (?, ?, ?)`,
    );

    function createDocument(definition) {
      const documentNumber =
        nextDocumentNumberByPeriod.get(definition.periodId) || 1;
      const result = insertDocument.run(
        documentNumber,
        definition.periodId,
        definition.date,
      );
      const documentId = Number(result.lastInsertRowid);

      let debitTotal = 0;
      let creditTotal = 0;
      definition.entries.forEach((entry, index) => {
        const accountId = accountIdByNumber.get(entry.accountNumber);
        if (!accountId) {
          throw new Error(`Tilinumeroa ${entry.accountNumber} ei loydy fixtureista.`);
        }
        if (entry.debit) debitTotal += entry.amount;
        else creditTotal += entry.amount;
        insertEntry.run(
          documentId,
          accountId,
          entry.debit ? 1 : 0,
          entry.amount,
          entry.description || definition.description,
          index + 1,
        );
      });

      if (Math.abs(debitTotal - creditTotal) >= 0.005) {
        throw new Error(
          `Tosite ${definition.name} ei ole tasapainossa: ${debitTotal} vs ${creditTotal}`,
        );
      }

      insertMetadata.run(
        documentId,
        definition.category || '',
        definition.name || definition.description,
      );

      if (definition.receiptPath) {
        insertReceiptLink.run(documentId, definition.receiptPath, Date.now());
      }

      nextDocumentNumberByPeriod.set(definition.periodId, documentNumber + 1);
      return {
        id: documentId,
        number: documentNumber,
        periodId: definition.periodId,
        receiptPath: definition.receiptPath || null,
      };
    }

    const previousDocs = {
      founding: createDocument({
        periodId: previousPeriodId,
        date: timestamp(previousYear, 1, 2),
        category: 'PAAOMA',
        name: 'Osakepääoma ja SVOP',
        description: 'Perustajien sijoitus yrityksen pankkitilille',
        entries: [
          { accountNumber: '1900', debit: true, amount: 15000.0 },
          { accountNumber: '2000', debit: false, amount: 2500.0 },
          { accountNumber: '2100', debit: false, amount: 12500.0 },
        ],
      }),
      sale: createDocument({
        periodId: previousPeriodId,
        date: timestamp(previousYear, 2, 15),
        category: 'MYYNTI',
        name: 'Asiakasprojekti Aurora Adventures',
        description: 'Verkkosivuprojekti, lasku 1001',
        receiptPath: `tositteet/${previousYear}/MU2.pdf`,
        entries: [
          { accountNumber: '1900', debit: true, amount: 5020.0 },
          { accountNumber: '3010', debit: false, amount: 4000.0 },
          { accountNumber: '2939', debit: false, amount: 1020.0 },
        ],
      }),
      branding: createDocument({
        periodId: previousPeriodId,
        date: timestamp(previousYear, 3, 8),
        category: 'KULU',
        name: 'Brandi- ja verkkosivutyot',
        description: 'Brandiuudistus ja sivupohjat',
        receiptPath: `tositteet/${previousYear}/MU3.pdf`,
        entries: [
          { accountNumber: '5000', debit: true, amount: 1200.0 },
          { accountNumber: '2939', debit: true, amount: 306.0 },
          { accountNumber: '1900', debit: false, amount: 1506.0 },
        ],
      }),
      rent: createDocument({
        periodId: previousPeriodId,
        date: timestamp(previousYear, 6, 30),
        category: 'KULU',
        name: 'Toimistovuokra kesakuu',
        description: 'Coworking-tila Rovaniemella',
        receiptPath: `tositteet/${previousYear}/MU4.pdf`,
        entries: [
          { accountNumber: '7000', debit: true, amount: 950.0 },
          { accountNumber: '1900', debit: false, amount: 950.0 },
        ],
      }),
      bankFees: createDocument({
        periodId: previousPeriodId,
        date: timestamp(previousYear, 11, 29),
        category: 'RAHOITUS',
        name: 'Pankin palvelumaksut',
        description: 'Yritystilin kuukausi- ja korttimaksut',
        receiptPath: `tositteet/${previousYear}/MU5.pdf`,
        entries: [
          { accountNumber: '7680', debit: true, amount: 86.4 },
          { accountNumber: '1900', debit: false, amount: 86.4 },
        ],
      }),
    };

    const currentDocs = {
      januarySale: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 1, 3),
        category: 'MYYNTI',
        name: 'Asiakasprojekti Revontuli',
        description: 'Lasku 2001, kayttoliittymasuunnittelu',
        receiptPath: `tositteet/${currentYear}/MU1.pdf`,
        entries: [
          { accountNumber: '1900', debit: true, amount: 3137.5 },
          { accountNumber: '3010', debit: false, amount: 2500.0 },
          { accountNumber: '2939', debit: false, amount: 637.5 },
        ],
      }),
      januaryRent: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 1, 5),
        category: 'KULU',
        name: 'Toimistovuokra tammikuu',
        description: 'Studiohallin vuokra',
        receiptPath: `tositteet/${currentYear}/MU2.pdf`,
        entries: [
          { accountNumber: '7000', debit: true, amount: 1250.0 },
          { accountNumber: '1900', debit: false, amount: 1250.0 },
        ],
      }),
      bookkeeping: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 1, 8),
        category: 'KULU',
        name: 'Tilitoimistopalvelu',
        description: 'Kirjanpito ja palkat, tammikuu',
        receiptPath: `tositteet/${currentYear}/MU3.pdf`,
        entries: [
          { accountNumber: '5000', debit: true, amount: 480.0 },
          { accountNumber: '2939', debit: true, amount: 122.4 },
          { accountNumber: '1900', debit: false, amount: 602.4 },
        ],
      }),
      telecom: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 1, 15),
        category: 'KULU',
        name: 'Pilvipalvelut ja mobiililiittymat',
        description: 'Telia, Google Workspace ja Canva',
        receiptPath: `tositteet/${currentYear}/MU4.pdf`,
        entries: [
          { accountNumber: '7600', debit: true, amount: 89.9 },
          { accountNumber: '2939', debit: true, amount: 22.92 },
          { accountNumber: '1900', debit: false, amount: 112.82 },
        ],
      }),
      februarySale: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 2, 10),
        category: 'MYYNTI',
        name: 'Asiakasprojekti Retkikota',
        description: 'Lasku 2007, sisaltosuunnittelu ja toteutus',
        receiptPath: `tositteet/${currentYear}/MU5.pdf`,
        entries: [
          { accountNumber: '1900', debit: true, amount: 6287.5 },
          { accountNumber: '3010', debit: false, amount: 5010.0 },
          { accountNumber: '2939', debit: false, amount: 1277.5 },
        ],
      }),
      ads: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 2, 14),
        category: 'KULU',
        name: 'Meta-mainokset kevatkampanja',
        description: 'Hakija- ja tunnettuuskampanja',
        receiptPath: `tositteet/${currentYear}/MU6.pdf`,
        entries: [
          { accountNumber: '7400', debit: true, amount: 398.41 },
          { accountNumber: '2939', debit: true, amount: 101.59 },
          { accountNumber: '1900', debit: false, amount: 500.0 },
        ],
      }),
      februaryBankFees: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 2, 28),
        category: 'RAHOITUS',
        name: 'Pankin palvelumaksut',
        description: 'Yritystilin palvelu- ja korttimaksut',
        receiptPath: `tositteet/${currentYear}/MU7.pdf`,
        entries: [
          { accountNumber: '7680', debit: true, amount: 18.5 },
          { accountNumber: '1900', debit: false, amount: 18.5 },
        ],
      }),
      travelExpense: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 3, 5),
        category: 'KULU',
        name: 'Matkalasku Oulu',
        description: 'Juna, taksi ja paivaraha asiakastapaamiseen',
        receiptPath: `tositteet/${currentYear}/MU8.pdf`,
        entries: [
          { accountNumber: '7200', debit: true, amount: 186.4 },
          { accountNumber: '2740', debit: false, amount: 186.4 },
        ],
      }),
      vatPayment: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 3, 18),
        category: 'ALV',
        name: 'ALV-maksu 01-02',
        description: 'Verohallinnon oma-aloitteisten verojen maksu',
        receiptPath: `tositteet/${currentYear}/MU9.pdf`,
        entries: [
          { accountNumber: '2939', debit: true, amount: 1668.09 },
          { accountNumber: '1900', debit: false, amount: 1668.09 },
        ],
      }),
      interestIncome: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 3, 25),
        category: 'RAHOITUS',
        name: 'Korkotuotto kayttotililta',
        description: 'Pankin hyvityskorko',
        receiptPath: `tositteet/${currentYear}/MU10.pdf`,
        entries: [
          { accountNumber: '1900', debit: true, amount: 4.32 },
          { accountNumber: '8000', debit: false, amount: 4.32 },
        ],
      }),
      supplierInvoice: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 3, 27),
        category: 'KULU',
        name: 'Palvelinympariston vuosimaksu',
        description: 'Pilvipalvelu, maksamatta tilikauden paatteessa',
        receiptPath: `tositteet/${currentYear}/MU11.pdf`,
        entries: [
          { accountNumber: '5000', debit: true, amount: 640.0 },
          { accountNumber: '2939', debit: true, amount: 163.2 },
          { accountNumber: '2620', debit: false, amount: 803.2 },
        ],
      }),
      salaryAccrual: createDocument({
        periodId: currentPeriodId,
        date: timestamp(currentYear, 3, 31),
        category: 'PALKKA',
        name: 'Palkkajaksotus maaliskuu',
        description: 'Maaliskuun palkat maksuun huhtikuussa',
        receiptPath: `tositteet/${currentYear}/MU12.pdf`,
        entries: [
          { accountNumber: '6000', debit: true, amount: 2500.0 },
          { accountNumber: '2870', debit: false, amount: 2500.0 },
        ],
      }),
    };

    const insertStatement = db.prepare(
      `INSERT INTO bank_statement
       (account_id, iban, period_start, period_end, opening_balance, closing_balance, source_file, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertStatementEntry = db.prepare(
      `INSERT INTO bank_statement_entry
       (bank_statement_id, entry_date, value_date, archive_id, counterparty, counterparty_iban, reference, message, payment_type, transaction_number, amount, document_id, counterpart_account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const bankAccountId = accountIdByNumber.get('1900');
    const iban = 'FI2112345600000785';
    const statementCreatedAt = Date.now();

    function createBankStatement(definition) {
      const statementId = Number(
        insertStatement.run(
          bankAccountId,
          iban,
          definition.periodStart,
          definition.periodEnd,
          definition.openingBalance,
          definition.closingBalance,
          definition.sourceFile,
          statementCreatedAt,
        ).lastInsertRowid,
      );

      definition.entries.forEach((entry, index) => {
        insertStatementEntry.run(
          statementId,
          entry.entryDate,
          entry.valueDate || entry.entryDate,
          entry.archiveId,
          entry.counterparty,
          entry.counterpartyIban || null,
          entry.reference || null,
          entry.message || null,
          entry.paymentType || 'SEPA',
          index + 1,
          entry.amount,
          entry.documentId || null,
          entry.counterpartAccountNumber
            ? accountIdByNumber.get(entry.counterpartAccountNumber) || null
            : null,
        );
      });

      return statementId;
    }

    createBankStatement({
      periodStart: timestamp(currentYear, 1, 1),
      periodEnd: timestamp(currentYear, 1, 31),
      openingBalance: 17477.6,
      closingBalance: 18649.88,
      sourceFile: `tiliote-${currentYear}-01.pdf`,
      entries: [
        {
          archiveId: `BS-${currentYear}-01-001`,
          entryDate: timestamp(currentYear, 1, 3),
          counterparty: 'Aurora Adventures Oy',
          counterpartyIban: 'FI5512345600999999',
          reference: '2001',
          message: 'Lasku 2001 / UI-suunnittelu',
          amount: 3137.5,
          documentId: currentDocs.januarySale.id,
          counterpartAccountNumber: '3010',
        },
        {
          archiveId: `BS-${currentYear}-01-002`,
          entryDate: timestamp(currentYear, 1, 5),
          counterparty: 'Rovaniemen Luova Tila Oy',
          counterpartyIban: 'FI0918000134567890',
          reference: '55102',
          message: 'Tammikuun vuokra',
          amount: -1250.0,
          documentId: currentDocs.januaryRent.id,
          counterpartAccountNumber: '7000',
        },
        {
          archiveId: `BS-${currentYear}-01-003`,
          entryDate: timestamp(currentYear, 1, 8),
          counterparty: 'Napapiirin Tilipalvelu Oy',
          counterpartyIban: 'FI7012345600001122',
          reference: 'TK-01',
          message: 'Kirjanpito ja palkat',
          amount: -602.4,
          documentId: currentDocs.bookkeeping.id,
          counterpartAccountNumber: '5000',
        },
        {
          archiveId: `BS-${currentYear}-01-004`,
          entryDate: timestamp(currentYear, 1, 15),
          counterparty: 'Telia Finland / Google',
          counterpartyIban: null,
          reference: null,
          message: 'Mobiili ja SaaS-palvelut',
          paymentType: 'CARD',
          amount: -112.82,
          documentId: currentDocs.telecom.id,
          counterpartAccountNumber: '7600',
        },
      ],
    });

    createBankStatement({
      periodStart: timestamp(currentYear, 2, 1),
      periodEnd: timestamp(currentYear, 2, 28),
      openingBalance: 18649.88,
      closingBalance: 24418.88,
      sourceFile: `tiliote-${currentYear}-02.pdf`,
      entries: [
        {
          archiveId: `BS-${currentYear}-02-001`,
          entryDate: timestamp(currentYear, 2, 10),
          counterparty: 'Retkikota Finland Oy',
          counterpartyIban: 'FI1412345600007788',
          reference: '2007',
          message: 'Lasku 2007 / sisallontuotanto',
          amount: 6287.5,
          documentId: currentDocs.februarySale.id,
          counterpartAccountNumber: '3010',
        },
        {
          archiveId: `BS-${currentYear}-02-002`,
          entryDate: timestamp(currentYear, 2, 14),
          counterparty: 'Meta Platforms Ireland',
          counterpartyIban: null,
          reference: null,
          message: 'Kevatkampanja',
          paymentType: 'CARD',
          amount: -500.0,
          documentId: currentDocs.ads.id,
          counterpartAccountNumber: '7400',
        },
        {
          archiveId: `BS-${currentYear}-02-003`,
          entryDate: timestamp(currentYear, 2, 28),
          counterparty: 'Nordic Business Bank',
          counterpartyIban: null,
          reference: null,
          message: 'Palvelumaksu',
          amount: -18.5,
          documentId: currentDocs.februaryBankFees.id,
          counterpartAccountNumber: '7680',
        },
      ],
    });

    createBankStatement({
      periodStart: timestamp(currentYear, 3, 1),
      periodEnd: timestamp(currentYear, 3, 31),
      openingBalance: 24418.88,
      closingBalance: 22706.21,
      sourceFile: `tiliote-${currentYear}-03.pdf`,
      entries: [
        {
          archiveId: `BS-${currentYear}-03-001`,
          entryDate: timestamp(currentYear, 3, 18),
          counterparty: 'Verohallinto',
          counterpartyIban: 'FI2250001520000023',
          reference: 'VERO-ALV',
          message: 'Oma-aloitteiset verot 01-02',
          amount: -1668.09,
          documentId: currentDocs.vatPayment.id,
          counterpartAccountNumber: '2939',
        },
        {
          archiveId: `BS-${currentYear}-03-002`,
          entryDate: timestamp(currentYear, 3, 21),
          counterparty: 'Ravintola Valkea',
          counterpartyIban: null,
          reference: null,
          message: 'Asiakastapaaminen / korttiosto',
          paymentType: 'CARD',
          amount: -48.9,
          counterpartAccountNumber: '7300',
        },
        {
          archiveId: `BS-${currentYear}-03-003`,
          entryDate: timestamp(currentYear, 3, 25),
          counterparty: 'Nordic Business Bank',
          counterpartyIban: null,
          reference: null,
          message: 'Hyvityskorko',
          amount: 4.32,
          documentId: currentDocs.interestIncome.id,
          counterpartAccountNumber: '8000',
        },
      ],
    });

    [
      [`tositteet/${previousYear}/MU2.pdf`, 'Asiakasprojekti Aurora Adventures'],
      [`tositteet/${previousYear}/MU3.pdf`, 'Brandi- ja verkkosivutyot'],
      [`tositteet/${previousYear}/MU4.pdf`, 'Toimistovuokra'],
      [`tositteet/${previousYear}/MU5.pdf`, 'Pankin palvelumaksut'],
      [`tositteet/${currentYear}/MU1.pdf`, 'Lasku 2001'],
      [`tositteet/${currentYear}/MU2.pdf`, 'Studiohallin vuokra'],
      [`tositteet/${currentYear}/MU3.pdf`, 'Tilitoimistopalvelu'],
      [`tositteet/${currentYear}/MU4.pdf`, 'Pilvipalvelut ja liittymat'],
      [`tositteet/${currentYear}/MU5.pdf`, 'Lasku 2007'],
      [`tositteet/${currentYear}/MU6.pdf`, 'Meta-mainokset'],
      [`tositteet/${currentYear}/MU7.pdf`, 'Pankin palvelumaksut'],
      [`tositteet/${currentYear}/MU8.pdf`, 'Matkalasku Oulu'],
      [`tositteet/${currentYear}/MU9.pdf`, 'ALV-maksu 01-02'],
      [`tositteet/${currentYear}/MU10.pdf`, 'Korkotuotto kayttotililta'],
      [`tositteet/${currentYear}/MU11.pdf`, 'Palvelinympariston vuosimaksu'],
      [`tositteet/${currentYear}/MU12.pdf`, 'Palkkajaksotus maaliskuu'],
    ].forEach(([relativePath, title]) => {
      writePdf(path.join(pdfRoot, relativePath), title, companyName);
    });

    [
      [`tiliote-${currentYear}-01.pdf`, `Tiliote 01/${currentYear}`],
      [`tiliote-${currentYear}-02.pdf`, `Tiliote 02/${currentYear}`],
      [`tiliote-${currentYear}-03.pdf`, `Tiliote 03/${currentYear}`],
    ].forEach(([fileName, title]) => {
      writePdf(path.join(bankStatementsRoot, fileName), title, iban);
    });

    [
      [`ML1-${currentYear}.pdf`, `Myyntilasku ${currentDocs.januarySale.number}`],
      [`ML5-${currentYear}.pdf`, `Myyntilasku ${currentDocs.februarySale.number}`],
    ].forEach(([fileName, title]) => {
      writePdf(path.join(invoicesRoot, fileName), title, companyName);
    });

    return {
      slug,
      sourceDir,
      dbPath,
      currentYear,
      previousYear,
      companyName,
      documentCount:
        Object.keys(previousDocs).length + Object.keys(currentDocs).length,
      bankStatementCount: 3,
    };
  } finally {
    db.close();
  }
}

module.exports = {
  seedRealisticDatabase,
};

if (require.main === module) {
  const result = seedRealisticDatabase({
    slug: process.env.FIXTURE_SOURCE_SLUG,
    companyName: process.env.FIXTURE_COMPANY_NAME,
    businessId: process.env.FIXTURE_BUSINESS_ID,
    currentYear: process.env.FIXTURE_CURRENT_YEAR
      ? Number(process.env.FIXTURE_CURRENT_YEAR)
      : undefined,
    signerName: process.env.FIXTURE_SIGNER_NAME,
    place: process.env.FIXTURE_PLACE,
  });

  console.log(
    `Seeded realistic fixtures for ${result.companyName} (${result.slug}) at ${result.dbPath}`,
  );
}
