// e2e tests hit the real Postgres/Redis from docker-compose — load root .env
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
