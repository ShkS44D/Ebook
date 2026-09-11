import "dotenv/config";
import pg from "pg";
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL in .env before starting the API.");
const url = new URL(process.env.DATABASE_URL);
url.searchParams.delete("sslmode");
url.searchParams.delete("channel_binding");
export const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: true },
  enableChannelBinding: true,
  max: 5,
  connectionTimeoutMillis: 15000,
});
export const query = async (sql, values = []) =>
  (await pool.query(sql, values)).rows;
export async function transaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work((sql, values = []) =>
      client.query(sql, values).then((r) => r.rows),
    );
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
