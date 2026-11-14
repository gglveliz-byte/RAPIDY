import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../lib/env";
import * as schema from "@db/schema";
import * as relations from "@db/relations";

const fullSchema = { ...schema, ...relations };

function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

let instance: ReturnType<typeof drizzle<typeof fullSchema>>;
let poolInstance: pg.Pool | null = null;

export function getDb() {
  if (!instance) {
    poolInstance = new pg.Pool({
      connectionString: env.databaseUrl,
      max: boundedInt(process.env.DB_POOL_MAX, 10, 1, 50),
      idleTimeoutMillis: boundedInt(process.env.DB_IDLE_TIMEOUT_MS, 30_000, 1_000, 300_000),
      connectionTimeoutMillis: boundedInt(
        process.env.DB_CONNECT_TIMEOUT_MS,
        10_000,
        1_000,
        60_000,
      ),
      statement_timeout: boundedInt(process.env.DB_STATEMENT_TIMEOUT_MS, 20_000, 1_000, 120_000),
      application_name: "rapidy-api",
    });

    // Un cliente idle con error no debe tumbar el proceso.
    poolInstance.on("error", (error) => {
      console.error("[db] idle client error:", error.message);
    });

    instance = drizzle(poolInstance, { schema: fullSchema });
  }
  return instance;
}

/** Cierre ordenado para SIGTERM/SIGINT y jobs de mantenimiento. */
export async function closeDb(): Promise<void> {
  if (!poolInstance) return;
  const pool = poolInstance;
  poolInstance = null;
  instance = undefined as unknown as ReturnType<typeof drizzle<typeof fullSchema>>;
  await pool.end();
}