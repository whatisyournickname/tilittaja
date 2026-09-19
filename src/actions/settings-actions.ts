'use server';

import {
  getPeriod,
  setPeriodLocked,
  updateCompanyInfo,
  updateSettingProperties,
} from '@/lib/db';
import { revalidateApp, runDbAction } from '@/actions/_helpers';
import {
  companyInfoSchema,
  periodLockSchema,
  recurringRentGenerateSchema,
  financialStatementMetadataSchema,
} from '@/lib/validation';
import { requireResource } from '@/lib/api-helpers';
import {
  getFinancialStatementMetadataDefaults,
  metadataToProperties,
  normalizeDischargeTarget,
  type FinancialStatementMetadata,
} from '@/lib/financial-statement';
import { requireUnlockedExistingPeriod } from '@/lib/period-locks';
import { createRecurringRentDocuments } from '@/lib/recurring-rent';

function normalizeMetadata(
  input: Partial<FinancialStatementMetadata>,
  defaults: FinancialStatementMetadata,
): FinancialStatementMetadata {
  return {
    place: (input.place ?? defaults.place).trim(),
    signatureDate: (input.signatureDate ?? defaults.signatureDate).trim(),
    preparedBy: (input.preparedBy ?? defaults.preparedBy).trim(),
    signerName: (input.signerName ?? defaults.signerName).trim(),
    signerTitle: (input.signerTitle ?? defaults.signerTitle).trim(),
    microDeclaration: (
      input.microDeclaration ?? defaults.microDeclaration
    ).trim(),
    boardProposal: (input.boardProposal ?? defaults.boardProposal).trim(),
    parentCompany: (input.parentCompany ?? defaults.parentCompany).trim(),
    shareInfo: (input.shareInfo ?? defaults.shareInfo).trim(),
    personnelCount: (input.personnelCount ?? defaults.personnelCount).trim(),
    archiveNote: (input.archiveNote ?? defaults.archiveNote).trim(),
    meetingDate: (input.meetingDate ?? defaults.meetingDate).trim(),
    attendees: (input.attendees ?? defaults.attendees).trim(),
    dischargeTarget: normalizeDischargeTarget(
      input.dischargeTarget ?? defaults.dischargeTarget,
    ),
  };
}

export async function updateCompanyInfoAction(input: unknown) {
  const parsed = companyInfoSchema.parse(input);

  return runDbAction(() => {
    updateCompanyInfo(parsed.name, parsed.businessId);
    revalidateApp(['/settings/recurring-rent']);
    return { ok: true };
  }, 'Failed to save company info.');
}

export async function updateFinancialStatementMetadataAction(
  input: Partial<FinancialStatementMetadata>,
) {
  const parsed = financialStatementMetadataSchema.parse(input);

  return runDbAction(() => {
    const defaults = getFinancialStatementMetadataDefaults();
    const metadata = normalizeMetadata(parsed, defaults);
    updateSettingProperties(metadataToProperties(metadata));
    revalidateApp(['/settings/recurring-rent']);
    return { ok: true, metadata };
  }, 'Failed to save financial statement metadata.');
}

export async function setPeriodLockAction(periodId: number, locked: boolean) {
  const parsed = periodLockSchema.parse({ periodId, locked });

  return runDbAction(() => {
    requireResource(getPeriod(parsed.periodId), 'Period not found');
    setPeriodLocked(parsed.periodId, parsed.locked);
    revalidateApp(['/settings/recurring-rent']);
    return { ok: true, locked: parsed.locked };
  }, 'Failed to save period lock.');
}

export async function generateRecurringRentDocumentsAction(input: unknown) {
  const parsed = recurringRentGenerateSchema.parse(input);

  return runDbAction(() => {
    requireUnlockedExistingPeriod(parsed.periodId);
    const result = createRecurringRentDocuments(parsed.periodId);
    revalidateApp(['/settings/recurring-rent']);
    return result;
  }, 'Failed to create recurring rent documents.');
}
