import { hashPassword } from "../crypto";
import { query } from "../db";
import { env } from "../env";

export const bootstrapOwner = async () => {
  const email = env.OWNER_EMAIL.toLowerCase();
  const { rows } = await query<{ id: string }>(
    "select id from users where email = $1",
    [email],
  );

  if (rows.length > 0) {
    await query("update users set is_owner = true where email = $1", [email]);
    return;
  }

  await query(
    `insert into users (email, password_hash, is_owner)
     values ($1, $2, true)`,
    [email, hashPassword(env.OWNER_PASSWORD)],
  );
};
