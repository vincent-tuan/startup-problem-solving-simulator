import type { JournalLine, SimulationState } from "../types";
import { finite, round } from "../kernel/math";

const balance = (lines: JournalLine[]) => round(lines.reduce((sum, line) => sum + line.debit - line.credit, 0));

export function postJournal(state: SimulationState, memo: string, sourceId: string, lines: JournalLine[]) {
  if (!lines.length || balance(lines) !== 0) throw new Error("UNBALANCED_JOURNAL_ENTRY");
  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0 || (line.debit > 0 && line.credit > 0)) throw new Error("INVALID_JOURNAL_LINE");
  }
  state.finance.journal.push({ id: `journal_${state.sequence}_${state.finance.journal.length + 1}`, day: state.calendar.absoluteDay, memo, sourceId, lines: lines.map((line) => ({ ...line, debit: round(line.debit), credit: round(line.credit) })) });
  state.finance.journal = state.finance.journal.slice(-1_200);
  for (const line of lines) {
    const movement = line.debit - line.credit;
    if (line.account === "cash") state.finance.companyCash = round(state.finance.companyCash + movement);
    if (line.account === "accounts_receivable") state.finance.accountsReceivable = round(state.finance.accountsReceivable + movement);
    if (line.account === "accounts_payable") state.finance.accountsPayable = round(state.finance.accountsPayable - movement);
    if (line.account === "deferred_revenue") state.finance.deferredRevenue = round(state.finance.deferredRevenue - movement);
    if (line.account === "revenue") state.finance.recognizedRevenue = round(state.finance.recognizedRevenue + line.credit - line.debit);
    if (line.account === "payroll_expense") state.finance.payrollExpense = round(state.finance.payrollExpense + movement);
    if (line.account === "variable_cost") state.finance.variableCosts = round(state.finance.variableCosts + movement);
    if (line.account === "tax_reserve") state.finance.taxReserve = round(state.finance.taxReserve - movement);
    if (line.account === "founder_loan") state.finance.founderLoanBalance = round(state.finance.founderLoanBalance + line.credit - line.debit);
  }
}

export function resetOpeningJournal(state: SimulationState, memo = "Opening balance") {
  state.finance.journal = [];
  if (state.finance.companyCash >= 0) {
    state.finance.journal.push({ id: "journal_opening", day: state.calendar.absoluteDay, memo, sourceId: "opening", lines: [
      { account: "cash", debit: round(state.finance.companyCash), credit: 0 },
      { account: "opening_equity", debit: 0, credit: round(state.finance.companyCash) },
    ] });
  }
}

export function journalCashBalance(state: SimulationState) {
  return round(state.finance.journal.flatMap((entry) => entry.lines).filter((line) => line.account === "cash").reduce((sum, line) => sum + line.debit - line.credit, 0));
}

export function validateFinance(state: SimulationState) {
  const numeric: Array<[string, number]> = [
    ["companyCash", state.finance.companyCash], ["personalCash", state.finance.personalCash], ["personalDebt", state.finance.personalDebt],
    ["founderLoanBalance", state.finance.founderLoanBalance], ["mrr", state.finance.mrr], ["accountsReceivable", state.finance.accountsReceivable],
    ["accountsPayable", state.finance.accountsPayable], ["deferredRevenue", state.finance.deferredRevenue], ["taxReserve", state.finance.taxReserve],
  ];
  numeric.forEach(([label, value]) => finite(value, `finance.${label}`));
  if (state.finance.personalDebt < 0 || state.finance.founderLoanBalance < 0 || state.finance.accountsReceivable < 0 || state.finance.deferredRevenue < 0) throw new Error("NEGATIVE_FINANCIAL_BALANCE");
  for (const entry of state.finance.journal) if (balance(entry.lines) !== 0) throw new Error(`UNBALANCED_JOURNAL_ENTRY:${entry.id}`);
  if (Math.abs(journalCashBalance(state) - state.finance.companyCash) > 0.02) throw new Error("CASH_LEDGER_MISMATCH");
}

export function monthlyBurn(state: SimulationState) {
  const payroll = state.organization.members.reduce((sum, member) => sum + member.monthlyCost, 0);
  return Math.max(0, state.finance.monthlyFixedCosts - state.finance.monthlyFixedSavings + payroll + state.finance.variableCosts - state.finance.mrr);
}
