import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export function database() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) throw new Error("DATABASE_URL 未配置");
    pool = new Pool({ connectionString, max: 8, connectionTimeoutMillis: 5_000 });
  }
  return pool;
}

export async function query<T extends QueryResultRow>(text: string, values?: unknown[]) {
  return database().query<T>(text, values);
}

export async function transaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const client = await database().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

export async function databaseHealthy() {
  await query("SELECT 1");
  return true;
}
