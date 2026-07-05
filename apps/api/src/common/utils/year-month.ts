/** Returns the current year-month in "YYYY-MM" format (UTC). */
export function currentYearMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}
