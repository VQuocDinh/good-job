/** Extracts unique @mention tokens ("Thanks @alice!" -> ["alice"]). */
export function extractMentionTokens(text: string): string[] {
  const tokens = new Set<string>();
  for (const match of text.matchAll(/@([\w.-]+)/g)) {
    tokens.add(match[1].toLowerCase());
  }
  return [...tokens];
}
