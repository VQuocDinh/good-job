import { currentYearMonth } from './year-month';

describe('currentYearMonth (giving-budget monthly reset key)', () => {
  it('formats as YYYY-MM', () => {
    expect(currentYearMonth(new Date('2026-07-06T10:00:00Z'))).toBe('2026-07');
  });

  it('rolls over at the month boundary (UTC)', () => {
    expect(currentYearMonth(new Date('2026-07-31T23:59:59Z'))).toBe('2026-07');
    expect(currentYearMonth(new Date('2026-08-01T00:00:00Z'))).toBe('2026-08');
  });

  it('rolls over at the year boundary', () => {
    expect(currentYearMonth(new Date('2026-12-31T23:59:59Z'))).toBe('2026-12');
    expect(currentYearMonth(new Date('2027-01-01T00:00:00Z'))).toBe('2027-01');
  });

  it('pads single-digit months', () => {
    expect(currentYearMonth(new Date('2026-03-15T12:00:00Z'))).toBe('2026-03');
  });
});
