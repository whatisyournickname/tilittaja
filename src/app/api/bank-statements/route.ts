import { NextRequest, NextResponse } from 'next/server';
import {
  getAccounts,
  createBankStatement,
  createBankStatementEntry,
  bankStatementArchiveIdExists,
} from '@/lib/db';
import { withDb, jsonError } from '@/lib/api-helpers';
import type { BankStatementImportApiSuccess } from '@/lib/import-types';
import { bankStatementCreateSchema } from '@/lib/validation';

export const POST = withDb(async (request: NextRequest) => {
  const body = await request.json();
  const parsed = bankStatementCreateSchema.parse(body);

  const accounts = getAccounts();
  const accountByNumber = new Map(accounts.map((a) => [a.number, a]));
  const bankAccount = parsed.accountNumber
    ? accountByNumber.get(parsed.accountNumber)
    : accounts.find(
        (a) => parseInt(a.number) >= 1910 && parseInt(a.number) <= 1950,
      );

  if (!bankAccount) {
    return jsonError('Bank account not found', 400);
  }

  const statement = createBankStatement({
    account_id: bankAccount.id,
    iban: parsed.iban,
    period_start: parsed.periodStart,
    period_end: parsed.periodEnd,
    opening_balance: parsed.openingBalance,
    closing_balance: parsed.closingBalance,
    source_file: parsed.sourceFile,
  });

  let created = 0;
  let skipped = 0;

  for (const entry of parsed.entries) {
    if (entry.archiveId && bankStatementArchiveIdExists(entry.archiveId)) {
      skipped++;
      continue;
    }

    const counterpartAccount = entry.counterpartAccountNumber
      ? accountByNumber.get(entry.counterpartAccountNumber)
      : null;

    createBankStatementEntry({
      bank_statement_id: statement.id,
      entry_date: entry.entryDate,
      value_date: entry.valueDate || entry.entryDate,
      archive_id: entry.archiveId,
      counterparty: entry.counterparty,
      counterparty_iban: entry.counterpartyIban,
      reference: entry.reference,
      message: entry.message,
      payment_type: entry.paymentType,
      transaction_number: entry.transactionNumber,
      amount: entry.amount,
      counterpart_account_id: counterpartAccount?.id ?? null,
    });
    created++;
  }

  const response: BankStatementImportApiSuccess = {
    id: statement.id,
    created,
    skipped,
  };
  return NextResponse.json(response);
}, 'Failed to create bank statement');
