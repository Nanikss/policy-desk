import { randomUUID } from "crypto";
import { addYears, daysBetween, IsoDate, parseIsoDate } from "./dates";
import { computeFees, FeeBreakdown, scheduleFor, totalFees } from "./fees";
import { Cents, roundHalfUp } from "./money";

export type PolicyStatus = "QUOTED" | "IN_FORCE" | "CANCELLED";
export type TransactionType = "ISSUE" | "ENDORSE" | "CANCEL" | "REINSTATE";
export type CancelMethod = "PRO_RATA" | "FLAT";

export interface PolicyTransaction {
  id: string;
  type: TransactionType;
  effectiveDate: IsoDate;
  /** Premium written by this transaction (negative = return premium). */
  premium: Cents;
  fees: FeeBreakdown;
  /** premium + all taxes/fees for this transaction. */
  total: Cents;
  note: string;
}

export interface Policy {
  id: string;
  insuredName: string;
  state: string;
  effectiveDate: IsoDate;
  expirationDate: IsoDate;
  /** Current annualised premium (changes with endorsements). */
  annualPremium: Cents;
  status: PolicyStatus;
  transactions: PolicyTransaction[];
}

export class PolicyRuleError extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new PolicyRuleError(message);
}

function termDays(p: Policy): number {
  return daysBetween(p.effectiveDate, p.expirationDate);
}

function assertWithinTerm(p: Policy, date: IsoDate): void {
  const t = parseIsoDate(date);
  assert(
    t >= parseIsoDate(p.effectiveDate) && t < parseIsoDate(p.expirationDate),
    `Date ${date} is outside the policy term ${p.effectiveDate} to ${p.expirationDate}`,
  );
}

function makeTransaction(
  p: Policy,
  type: TransactionType,
  effectiveDate: IsoDate,
  premium: Cents,
  fees: FeeBreakdown,
  note: string,
): PolicyTransaction {
  return { id: randomUUID(), type, effectiveDate, premium, fees, total: premium + totalFees(fees), note };
}

/** Net written premium across all transactions. */
export function writtenPremium(p: Policy): Cents {
  return p.transactions.reduce((sum, t) => sum + t.premium, 0);
}

export function totalBilled(p: Policy): Cents {
  return p.transactions.reduce((sum, t) => sum + t.total, 0);
}

export function createQuote(input: {
  insuredName: string;
  state: string;
  effectiveDate: IsoDate;
  annualPremium: Cents;
}): Policy {
  assert(input.insuredName.trim().length > 0, "Insured name is required");
  assert(Number.isInteger(input.annualPremium) && input.annualPremium > 0, "Annual premium must be a positive amount in cents");
  scheduleFor(input.state); // validates the state is supported
  parseIsoDate(input.effectiveDate);
  return {
    id: randomUUID(),
    insuredName: input.insuredName.trim(),
    state: input.state.toUpperCase(),
    effectiveDate: input.effectiveDate,
    expirationDate: addYears(input.effectiveDate, 1),
    annualPremium: input.annualPremium,
    status: "QUOTED",
    transactions: [],
  };
}

/** Issue (bind) a quoted policy: writes the full-term premium plus all taxes and flat fees. */
export function issue(p: Policy): Policy {
  assert(p.status === "QUOTED", `Only quoted policies can be issued (status is ${p.status})`);
  const fees = computeFees(p.state, p.annualPremium, true);
  const txn = makeTransaction(p, "ISSUE", p.effectiveDate, p.annualPremium, fees, "New business");
  return { ...p, status: "IN_FORCE", transactions: [...p.transactions, txn] };
}

/**
 * Mid-term change of annual premium. The difference is charged/returned
 * pro rata for the remaining days of the term.
 */
export function endorse(p: Policy, newAnnualPremium: Cents, effectiveDate: IsoDate): Policy {
  assert(p.status === "IN_FORCE", `Only in-force policies can be endorsed (status is ${p.status})`);
  assert(Number.isInteger(newAnnualPremium) && newAnnualPremium > 0, "New annual premium must be positive cents");
  assertWithinTerm(p, effectiveDate);
  const remaining = daysBetween(effectiveDate, p.expirationDate);
  const delta = roundHalfUp(((newAnnualPremium - p.annualPremium) * remaining) / termDays(p));
  const fees = computeFees(p.state, delta, false);
  const txn = makeTransaction(p, "ENDORSE", effectiveDate, delta, fees, `Annual premium ${p.annualPremium} -> ${newAnnualPremium}`);
  return { ...p, annualPremium: newAnnualPremium, transactions: [...p.transactions, txn] };
}

/**
 * Unearned premium at `asOf`. Each premium-bearing transaction earns evenly from its
 * own effective date to expiration, so endorsements are handled exactly. Rounded once
 * at the end to avoid accumulating penny errors.
 */
export function unearnedPremium(p: Policy, asOf: IsoDate): Cents {
  const asOfMs = parseIsoDate(asOf);
  let unearned = 0;
  for (const t of p.transactions) {
    if (t.type === "CANCEL" || t.type === "REINSTATE") continue;
    const start = parseIsoDate(t.effectiveDate) > asOfMs ? t.effectiveDate : asOf;
    const span = daysBetween(t.effectiveDate, p.expirationDate);
    if (span <= 0) continue;
    unearned += (t.premium * daysBetween(start, p.expirationDate)) / span;
  }
  return roundHalfUp(unearned);
}

/**
 * Cancel the policy.
 * - FLAT: only allowed on the effective date; returns all written premium.
 * - PRO_RATA: returns the unearned premium.
 * Percentage-based taxes are refunded in proportion; flat filing fees are fully earned.
 */
export function cancel(p: Policy, effectiveDate: IsoDate, method: CancelMethod): Policy {
  assert(p.status === "IN_FORCE", `Only in-force policies can be cancelled (status is ${p.status})`);
  assertWithinTerm(p, effectiveDate);
  let returnPremium: Cents;
  if (method === "FLAT") {
    assert(effectiveDate === p.effectiveDate, "Flat cancellation is only allowed on the policy effective date");
    returnPremium = writtenPremium(p);
  } else {
    returnPremium = unearnedPremium(p, effectiveDate);
  }
  const fees = computeFees(p.state, -returnPremium, false);
  const txn = makeTransaction(p, "CANCEL", effectiveDate, -returnPremium, fees, `${method} cancellation`);
  return { ...p, status: "CANCELLED", transactions: [...p.transactions, txn] };
}

/** Reinstate a cancelled policy by exactly reversing the cancellation transaction. */
export function reinstate(p: Policy): Policy {
  assert(p.status === "CANCELLED", `Only cancelled policies can be reinstated (status is ${p.status})`);
  const lastCancel = [...p.transactions].reverse().find((t) => t.type === "CANCEL");
  assert(lastCancel, "No cancellation found to reverse");
  const fees: FeeBreakdown = {
    surplusLinesTax: -lastCancel.fees.surplusLinesTax,
    stampingFee: -lastCancel.fees.stampingFee,
    filingFee: -lastCancel.fees.filingFee,
  };
  const txn = makeTransaction(p, "REINSTATE", lastCancel.effectiveDate, -lastCancel.premium, fees, "Reinstatement");
  return { ...p, status: "IN_FORCE", transactions: [...p.transactions, txn] };
}
