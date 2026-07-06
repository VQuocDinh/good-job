import { extractMentionTokens } from './mentions';

describe('extractMentionTokens', () => {
  it('extracts a single mention', () => {
    expect(extractMentionTokens('great work @alice!')).toEqual(['alice']);
  });

  it('extracts multiple unique mentions, lowercased', () => {
    expect(extractMentionTokens('@Alice and @bob and @alice again')).toEqual([
      'alice',
      'bob',
    ]);
  });

  it('supports dots and dashes in tokens', () => {
    expect(extractMentionTokens('cc @mary.jane @jean-luc')).toEqual([
      'mary.jane',
      'jean-luc',
    ]);
  });

  it('returns empty array when there are no mentions', () => {
    expect(extractMentionTokens('no mentions here')).toEqual([]);
    expect(extractMentionTokens('email me a@ nothing')).toEqual([]);
  });
});
