import { randomToken, sha256 } from "../crypto";
import { query } from "../db";
import { env } from "../env";
import { sendMail } from "../mail";

export type TokenPurpose = "invite" | "login" | "reset";

const TOKEN_TTL_MS = 1000 * 60 * 30;

export const createAuthToken = async ({
  email,
  userId,
  purpose,
  ttlMs = TOKEN_TTL_MS,
}: {
  email: string;
  userId?: string | null;
  purpose: TokenPurpose;
  ttlMs?: number;
}) => {
  const token = randomToken(32);
  const { rows } = await query<{ id: string }>(
    `insert into auth_tokens (user_id, email, purpose, token_hash, expires_at)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [
      userId ?? null,
      email,
      purpose,
      sha256(token),
      new Date(Date.now() + ttlMs),
    ],
  );
  return { token, id: rows[0].id };
};

export const consumeAuthToken = async (
  token: string,
  purposes: TokenPurpose[],
) => {
  const { rows } = await query<{
    id: string;
    user_id: string | null;
    email: string;
    purpose: TokenPurpose;
    expires_at: Date;
  }>(
    `select id, user_id, email, purpose, expires_at
     from auth_tokens
     where token_hash = $1 and used_at is null and expires_at > now()`,
    [sha256(token)],
  );

  const row = rows[0];
  if (!row || !purposes.includes(row.purpose)) {
    return null;
  }

  const marked = await query<{ id: string }>(
    `update auth_tokens set used_at = now()
     where id = $1 and used_at is null
     returning id`,
    [row.id],
  );
  if (marked.rows.length === 0) {
    return null;
  }
  return row;
};

export const sendMagicLinkEmail = async (
  email: string,
  token: string,
  purpose: TokenPurpose,
) => {
  const url = `${
    env.APP_ORIGIN
  }/api/auth/magic/verify?token=${encodeURIComponent(token)}`;

  const subject =
    purpose === "invite"
      ? "You're invited to Excalidraw"
      : "Your Excalidraw sign-in link";

  const text = [
    purpose === "invite"
      ? "You've been invited to Excalidraw."
      : "Use this link to sign in to Excalidraw.",
    "",
    url,
    "",
    "This link expires in 30 minutes and can be used once.",
  ].join("\n");

  const html = `<p>${
    purpose === "invite"
      ? "You've been invited to Excalidraw."
      : "Use the link below to sign in to Excalidraw."
  }</p><p><a href="${url}">Continue</a></p><p style="color:#777">This link expires in 30 minutes and can be used once.</p>`;

  await sendMail({ to: email, subject, text, html });
};
