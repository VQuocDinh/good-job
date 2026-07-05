/** Ledger entry types. Balance = SUM(delta) of all entries for a user. */
export const LedgerType = {
  KUDO_RECEIVED: 'KUDO_RECEIVED',
  KUDO_REVOKED: 'KUDO_REVOKED',
  REDEMPTION: 'REDEMPTION',
} as const;

export type LedgerType = (typeof LedgerType)[keyof typeof LedgerType];
