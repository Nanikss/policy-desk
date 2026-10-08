/**
 * Money is stored as integer cents everywhere to avoid floating-point drift.
 * All rounding goes through roundHalfUp so results are deterministic.
 */
export type Cents = number;

export function roundHalfUp(value: number): Cents {
  // Math.round rounds .5 toward +Infinity, which is wrong for negatives (refunds).
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function percentOf(amount: Cents, ratePercent: number): Cents {
  return roundHalfUp((amount * ratePercent) / 100);
}

export function formatCents(amount: Cents): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}
