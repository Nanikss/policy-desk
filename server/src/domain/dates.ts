/** Dates are ISO calendar dates (YYYY-MM-DD) handled in UTC to avoid DST issues. */
export type IsoDate = string;

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoDate(date: IsoDate): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid date "${date}", expected YYYY-MM-DD`);
  }
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid date "${date}"`);
  return ms;
}

/** Whole days from start (inclusive) to end (exclusive). */
export function daysBetween(start: IsoDate, end: IsoDate): number {
  return Math.round((parseIsoDate(end) - parseIsoDate(start)) / DAY_MS);
}

export function addYears(date: IsoDate, years: number): IsoDate {
  const d = new Date(parseIsoDate(date));
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}
