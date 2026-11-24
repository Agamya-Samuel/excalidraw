import { Pool, types, type PoolClient, type QueryResultRow } from "pg";

import { env } from "./env";

// bigint (e.g. scene_version) comes back as a string by default.
types.setTypeParser(20, (value) => Number(value));

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
});

export const query = <T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) => pool.query<T>(text, values);

export const withTransaction = async <T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};
