-- added by hand: the vector type needs the extension enabled first
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Kudo" ADD COLUMN     "embedding" vector(768);

-- added by hand: index for cosine similarity search
CREATE INDEX "Kudo_embedding_idx" ON "Kudo" USING ivfflat (embedding vector_cosine_ops);
