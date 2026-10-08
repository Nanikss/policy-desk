import { Cents, percentOf } from "./money";

/**
 * Surplus lines tax and fee configuration per state.
 * Rates below are illustrative sample values, not a regulatory reference.
 */
export interface StateFeeSchedule {
  /** Surplus lines premium tax, % of premium. Refundable pro rata. */
  surplusLinesTaxPct: number;
  /** Stamping office fee, % of premium. Refundable pro rata. */
  stampingFeePct: number;
  /** Flat policy/filing fee charged at issue. Fully earned (never refunded). */
  filingFeeCents: Cents;
}

export const SAMPLE_FEE_SCHEDULES: Record<string, StateFeeSchedule> = {
  CA: { surplusLinesTaxPct: 3.0, stampingFeePct: 0.18, filingFeeCents: 2500 },
  NY: { surplusLinesTaxPct: 3.6, stampingFeePct: 0.15, filingFeeCents: 0 },
  TX: { surplusLinesTaxPct: 4.85, stampingFeePct: 0.04, filingFeeCents: 0 },
  FL: { surplusLinesTaxPct: 4.94, stampingFeePct: 0.06, filingFeeCents: 1000 },
};

export interface FeeBreakdown {
  surplusLinesTax: Cents;
  stampingFee: Cents;
  filingFee: Cents;
}

export function scheduleFor(state: string): StateFeeSchedule {
  const schedule = SAMPLE_FEE_SCHEDULES[state.toUpperCase()];
  if (!schedule) throw new Error(`No fee schedule configured for state "${state}"`);
  return schedule;
}

/**
 * Taxes/fees on a premium amount (which may be negative for a refund).
 * The flat filing fee only applies when `includeFlatFees` is set (i.e. at issue).
 */
export function computeFees(state: string, premium: Cents, includeFlatFees: boolean): FeeBreakdown {
  const s = scheduleFor(state);
  return {
    surplusLinesTax: percentOf(premium, s.surplusLinesTaxPct),
    stampingFee: percentOf(premium, s.stampingFeePct),
    filingFee: includeFlatFees ? s.filingFeeCents : 0,
  };
}

export function totalFees(f: FeeBreakdown): Cents {
  return f.surplusLinesTax + f.stampingFee + f.filingFee;
}
