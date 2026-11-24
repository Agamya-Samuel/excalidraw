import { createHmac, timingSafeEqual } from "node:crypto";

import { query } from "../db";
import { env } from "../env";
import { randomToken, sha256 } from "../crypto";

import type { AuthUser } from "../types";

export const SESSION_COOKIE = "excalidraw_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export const createSession = async (
  userId: string,
  meta: { userAgent?: string; ip?: string } = {},
) => {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await query(
    `insert into sessions (user_id, token_hash, expires_at, user_agent, ip)
     values ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, expiresAt, meta.userAgent ?? null, meta.ip ?? null],
  );

  return { token, expiresAt };
};

export const resolveSession = async (
  token: string | undefined,
): Promise<AuthUser | null> => {
  if (!token) {
    return null;
  }
  const { rows } = await query<{
    id: string;
    email: string;
    display_name: string | null;
    avatar_url: string | null;
    is_owner: boolean;
  }>(
    `select u.id, u.email, u.display_name, u.avatar_url, u.is_owner
     from sessions s
     join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now()`,
    [sha256(token)],
  );

  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    isOwner: row.is_owner,
  };
};

export const deleteSession = async (token: string | undefined) => {
  if (!token) {
    return;
  }
  await query("delete from sessions where token_hash = $1", [sha256(token)]);
};

export const signValue = (value: string) =>
  createHmac("sha256", env.SESSION_SECRET).update(value).digest("base64url");

export const verifySignedValue = (value: string, signature: string) => {
  const expected = signValue(value);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
};
