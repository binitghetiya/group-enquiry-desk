/**
 * Loads the repo-root .env for LOCAL runs only (dev server, seed script). Real environment
 * variables take precedence. The Vercel entry never imports this module, so the file tracer
 * never copies a local .env (with its secrets) into a deployed function.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
