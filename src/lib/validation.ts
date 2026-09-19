import { z } from 'zod';

const positiveInt = z
  .number({ error: 'Virheellinen arvo' })
  .int({ error: 'Arvon pitää olla kokonaisluku' })
  .positive({ error: 'Arvon pitää olla positiivinen' });
const nonEmptyTrimmedString = z
  .string({ error: 'Puuttuva arvo' })
  .trim()
  .min(1, { error: 'Arvo on pakollinen' });

export const accountFormSchema = z.object({
  number: nonEmptyTrimmedString,
  name: nonEmptyTrimmedString,
  type: z.number().int().min(0).max(6),
  vat_code: z.number().int().min(0).optional(),
  vat_percentage: z.number().int().min(0).max(100).optional(),
});

export const accountCloneSchema = z.object({
  number: nonEmptyTrimmedString,
  name: z.string().trim().optional(),
});

export const companyInfoSchema = z.object({
  name: z.string().trim().min(1, { error: 'Yrityksen nimi on pakollinen' }),
  businessId: z.string().trim().optional().default(''),
});

export const datasourceSchema = z.object({
  slug: nonEmptyTrimmedString,
});

export const documentCreateSchema = z.object({
  periodId: positiveInt,
  date: z.number().finite().positive({ error: 'Puuttuvia tietoja' }),
  entries: z
    .array(
      z.object({
        accountNumber: nonEmptyTrimmedString,
        description: z.string().optional().default(''),
        debit: z.boolean(),
        amount: z.number().finite().nonnegative(),
        rowNumber: z.number().int().nonnegative(),
      }),
    )
    .min(1, { error: 'Puuttuvia tietoja' }),
});

export const documentUpdateSchema = z.object({
  date: z.number().finite().positive(),
  category: nonEmptyTrimmedString,
  name: z.string().trim(),
});

export const documentBulkDeleteSchema = z.object({
  documentIds: z.array(positiveInt).min(1, {
    error: 'Valitse vähintään yksi tosite',
  }),
});

export const documentEntriesUpdateSchema = z.object({
  entries: z
    .array(
      z.object({
        id: positiveInt,
        amount: z.number().finite().nonnegative(),
      }),
    )
    .min(1),
  deletedEntryIds: z.array(positiveInt).optional().default([]),
});

export const entryDescriptionSchema = z.object({
  description: z.string(),
});

export const entryAccountSchema = z.object({
  accountId: positiveInt,
});

export const receiptLinkSchema = z.object({
  receiptPath: z.string().trim().min(1).nullable(),
});

export const vatSettlementSchema = z.object({
  periodId: z
    .number({ error: 'Virheellinen tilikausi tai päiväys' })
    .int({ error: 'Virheellinen tilikausi tai päiväys' })
    .positive({ error: 'Virheellinen tilikausi tai päiväys' }),
  date: z
    .number({ error: 'Virheellinen tilikausi tai päiväys' })
    .finite({ error: 'Virheellinen tilikausi tai päiväys' })
    .positive({ error: 'Virheellinen tilikausi tai päiväys' }),
});

export const periodLockSchema = z.object({
  periodId: positiveInt,
  locked: z.boolean(),
});

export const recurringRentGenerateSchema = z.object({
  periodId: positiveInt,
});

export const bankStatementEntryLinkSchema = z.object({
  entryId: positiveInt,
  documentId: positiveInt.nullable(),
});

export const bankStatementCreateDocumentsSchema = z.object({
  statementId: positiveInt,
  entryIds: z.array(positiveInt).optional().default([]),
});

export const bankStatementAiSuggestSchema = z.object({
  statementId: positiveInt,
  entryIds: z.array(positiveInt).optional().default([]),
});

export const bankStatementAiApplySchema = z.object({
  statementId: positiveInt,
  links: z
    .array(
      z.object({
        entryId: positiveInt,
        documentId: positiveInt,
      }),
    )
    .min(1, { error: 'Valitse vähintään yksi AI-ehdotus' }),
});

export const bankStatementCreateSchema = z.object({
  iban: nonEmptyTrimmedString,
  periodStart: z.number().finite(),
  periodEnd: z.number().finite(),
  openingBalance: z.number().finite().optional().default(0),
  closingBalance: z.number().finite().optional().default(0),
  sourceFile: z.string().optional().default(''),
  accountNumber: z.string().optional(),
  entries: z
    .array(
      z.object({
        entryDate: z.number().finite(),
        valueDate: z.number().finite().optional(),
        archiveId: z.string().optional().default(''),
        counterparty: z.string().optional().default(''),
        counterpartyIban: z.string().nullable().optional().default(null),
        reference: z.string().nullable().optional().default(null),
        message: z.string().nullable().optional().default(null),
        paymentType: z.string().optional().default(''),
        transactionNumber: z.number().int().optional().default(0),
        amount: z.number().finite(),
        counterpartAccountNumber: z.string().nullable().optional().default(null),
      }),
    )
    .min(1),
});

export const bankStatementManualCreateSchema = z.object({
  accountId: positiveInt,
  iban: z.string().trim().optional().default(''),
  periodStart: z.number().finite(),
  periodEnd: z.number().finite(),
  openingBalance: z.number().finite().optional().default(0),
  closingBalance: z.number().finite().optional().default(0),
  entries: z
    .array(
      z.object({
        entryDate: z.number().finite(),
        counterparty: z.string().optional().default(''),
        message: z.string().nullable().optional().default(null),
        reference: z.string().nullable().optional().default(null),
        amount: z.number().finite(),
      }),
    )
    .min(1, { error: 'Lisää vähintään yksi rivi' }),
});

export const bankStatementEntryPatchSchema = z.object({
  entryId: positiveInt,
  counterpartAccountId: positiveInt.nullable().optional(),
  documentId: positiveInt.nullable().optional(),
});

export const setupNewDatabaseSchema = z.object({
  companyName: nonEmptyTrimmedString,
  businessId: z.string().trim().optional(),
  periodYear: z.number().int().min(2000).max(2099),
});

export const setupExternalDatabaseSchema = z.object({
  filePath: nonEmptyTrimmedString,
  name: z.string().trim().optional(),
});

export const financialStatementMetadataSchema = z.object({
  place: z.string().trim().optional(),
  signatureDate: z.string().trim().optional(),
  preparedBy: z.string().trim().optional(),
  signerName: z.string().trim().optional(),
  signerTitle: z.string().trim().optional(),
  microDeclaration: z.string().trim().optional(),
  boardProposal: z.string().trim().optional(),
  parentCompany: z.string().trim().optional(),
  shareInfo: z.string().trim().optional(),
  personnelCount: z.string().trim().optional(),
  archiveNote: z.string().trim().optional(),
  meetingDate: z.string().trim().optional(),
  attendees: z.string().trim().optional(),
  dischargeTarget: z.enum(['board', 'ceo', 'board-and-ceo']).optional(),
});
