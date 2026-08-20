export type AccountingLineV10 = {
  account: string;
  debit: number;
  credit: number;
};

export type AccountingEntryV10 = {
  id: string;
  day: number;
  memo: string;
  lines: AccountingLineV10[];
};

export type EntityLedgerV10 = {
  entries: AccountingEntryV10[];
  postedEntryIds: string[];
  carriedBalances: Record<string, number>;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export function createEntityLedgerV10(
  openingCash: number,
  entityId: string,
): EntityLedgerV10 {
  const ledger: EntityLedgerV10 = {
    entries: [],
    postedEntryIds: [],
    carriedBalances: {},
  };
  if (openingCash > 0) {
    postAccountingEntryV10(ledger, {
      id: `${entityId}:opening-balance`,
      day: 0,
      memo: "Opening capitalization",
      lines: [
        { account: "cash", debit: openingCash, credit: 0 },
        { account: "paid_in_capital", debit: 0, credit: openingCash },
      ],
    });
  }
  return ledger;
}

export function postAccountingEntryV10(
  ledger: EntityLedgerV10,
  entry: AccountingEntryV10,
): boolean {
  if (ledger.postedEntryIds.includes(entry.id)) return false;
  if (!entry.lines.length) throw new Error("ACCOUNTING_ENTRY_EMPTY");
  const debit = roundMoney(entry.lines.reduce((sum, line) => sum + line.debit, 0));
  const credit = roundMoney(entry.lines.reduce((sum, line) => sum + line.credit, 0));
  if (!Number.isFinite(debit) || !Number.isFinite(credit)) {
    throw new Error("ACCOUNTING_NON_FINITE_ENTRY");
  }
  if (entry.lines.some((line) =>
    !line.account || !Number.isFinite(line.debit) || !Number.isFinite(line.credit) ||
    line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0)
  )) throw new Error("ACCOUNTING_INVALID_LINE");
  if (Math.abs(debit - credit) > 0.005) throw new Error("ACCOUNTING_ENTRY_UNBALANCED");
  ledger.entries.push(structuredClone(entry));
  ledger.postedEntryIds.push(entry.id);
  if (ledger.entries.length > 2_000) {
    const compacted = ledger.entries.splice(0, 500);
    for (const oldEntry of compacted) {
      for (const line of oldEntry.lines) {
        ledger.carriedBalances[line.account] = roundMoney(
          (ledger.carriedBalances[line.account] ?? 0) + line.debit - line.credit,
        );
      }
    }
  }
  ledger.postedEntryIds = ledger.postedEntryIds.slice(-10_000);
  return true;
}

export function accountingBalanceV10(
  ledger: EntityLedgerV10,
  account: string,
): number {
  return roundMoney(ledger.entries.reduce((balance, entry) =>
    balance + entry.lines.filter((line) => line.account === account)
      .reduce((subtotal, line) => subtotal + line.debit - line.credit, 0), ledger.carriedBalances[account] ?? 0));
}

export function assertLedgerV10(ledger: EntityLedgerV10): void {
  if (new Set(ledger.postedEntryIds).size !== ledger.postedEntryIds.length) {
    throw new Error("ACCOUNTING_DUPLICATE_ENTRY");
  }
  const postedIds = new Set(ledger.postedEntryIds);
  if (ledger.entries.some((entry) => !postedIds.has(entry.id))) {
    throw new Error("ACCOUNTING_ENTRY_INDEX_MISSING");
  }
  if (
    Object.values(ledger.carriedBalances).some((value) => !Number.isFinite(value)) ||
    Math.abs(Object.values(ledger.carriedBalances).reduce((sum, value) => sum + value, 0)) > 0.005
  ) {
    throw new Error("ACCOUNTING_CARRIED_BALANCE_INVALID");
  }
  for (const entry of ledger.entries) {
    const debit = roundMoney(entry.lines.reduce((sum, line) => sum + line.debit, 0));
    const credit = roundMoney(entry.lines.reduce((sum, line) => sum + line.credit, 0));
    if (Math.abs(debit - credit) > 0.005) throw new Error("ACCOUNTING_ENTRY_UNBALANCED");
  }
  const cash = accountingBalanceV10(ledger, "cash");
  if (!Number.isFinite(cash) || cash < -0.005) throw new Error("ACCOUNTING_INVALID_CASH");
}
