import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// text-embedding-004 is retired for new API keys; gemini-embedding-001
// defaults to 3072 dims, so request 768 to match the vector(768) column
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIMS = 768;
const CHAT_MODEL = 'gemini-2.0-flash';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Thin Gemini client (plain fetch, no SDK). Every method degrades
 * gracefully when GEMINI_API_KEY is not set or the API errors: callers
 * get null and fall back to non-AI behaviour — AI must never take the
 * core product down.
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return !!this.config.get<string>('GEMINI_API_KEY');
  }

  async embed(text: string): Promise<number[] | null> {
    if (!this.enabled) return null;
    try {
      const key = this.config.get<string>('GEMINI_API_KEY');
      const res = await fetch(
        `${API_BASE}/models/${EMBED_MODEL}:embedContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text }] },
            outputDimensionality: EMBED_DIMS,
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data = (await res.json()) as {
        embedding?: { values?: number[] };
      };
      return data.embedding?.values ?? null;
    } catch (e) {
      this.logger.warn(`embed failed: ${(e as Error).message}`);
      return null;
    }
  }

  async generateText(prompt: string): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const key = this.config.get<string>('GEMINI_API_KEY');
      const res = await fetch(
        `${API_BASE}/models/${CHAT_MODEL}:generateContent?key=${key}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    } catch (e) {
      this.logger.warn(`generateText failed: ${(e as Error).message}`);
      return null;
    }
  }
}
