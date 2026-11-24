import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { pool } from "./db";

const migrationsDir = join(__dirname, "..", "migrations");

export const runMigrations = async () => {
  await pool.query(
    "create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())",
  );

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      "select 1 from schema_migrations where version = $1",
      [file],
    );
    if (rows.length > 0) {
      continue;
    }

    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (version) values ($1)",
        [file],
      );
      await client.query("commit");
      // eslint-disable-next-line no-console
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
};

if (require.main === module) {
  runMigrations()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    });
}
