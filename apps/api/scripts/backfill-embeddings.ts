import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';

// Backfills pgvector embeddings for kudos created before GEMINI_API_KEY was
// configured (embeddings are normally written at kudo creation time).
// Usage: npm run ai:backfill -w @goodjob/api
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config: loadEnv } = require('dotenv');
  loadEnv({ path: path.resolve(__dirname, '../../../.env') });
} catch {
  // dotenv absent (production) — rely on real env vars
}

const prisma = new PrismaClient();
const API_KEY = process.env.GEMINI_API_KEY;

async function embed(text: string): Promise<number[] | null> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        outputDimensionality: 768, // matches the vector(768) column
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { embedding?: { values?: number[] } };
  return data.embedding?.values ?? null;
}

async function main() {
  if (!API_KEY) {
    console.error('GEMINI_API_KEY is not set — nothing to do.');
    process.exit(1);
  }

  const kudos = await prisma.$queryRaw<Array<{ id: string; description: string }>>`
    SELECT "id", "description" FROM "Kudo" WHERE "embedding" IS NULL
  `;
  console.log(`${kudos.length} kudos without embedding`);

  let done = 0;
  for (const kudo of kudos) {
    const vector = await embed(kudo.description);
    if (!vector) continue;
    await prisma.$executeRaw`
      UPDATE "Kudo" SET "embedding" = ${`[${vector.join(',')}]`}::vector
      WHERE "id" = ${kudo.id}
    `;
    done++;
    console.log(`  ${done}/${kudos.length} ${kudo.id}`);
  }
  console.log(`Backfill completed: ${done} embeddings written`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
