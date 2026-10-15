import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "./config.js";
import * as schema from "./schema.js";
export const sql = postgres(config.DATABASE_URL, {
  max: 8,
  connect_timeout: 5,
  idle_timeout: 20,
});
export const authSql = postgres(config.DATABASE_URL, { max: 4, connect_timeout: 5, idle_timeout: 20 });
// Drizzle changes JSON serializers on its client. Keep raw spatial queries isolated.
export const db = drizzle(authSql, { schema });
