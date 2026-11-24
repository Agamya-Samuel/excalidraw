import { z } from "zod";

import { verifyPassword } from "../crypto";
import { query } from "../db";
import { env, isSecureOrigin } from "../env";
import { HttpError } from "../errors";

import {
  createAuthToken,
  consumeAuthToken,
  sendMagicLinkEmail,
} from "../auth/magicLinks";
import {
  createOAuthState,
  exchangeOAuthCode,
  getOAuthAuthorizeUrl,
  oauthProviders,
  verifyOAuthState,
} from "../auth/oauth";
import { SESSION_COOKIE, createSession, deleteSession } from "../auth/session";

import type { FastifyInstance } from "fastify";

import type { AuthUser } from "../types";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const magicLinkSchema = z.object({
  email: z.string().email(),
});

const userResponse = (user: AuthUser) => ({
  id: user.id,
  email: user.email,
  displayName: user.displayName,
  avatarUrl: user.avatarUrl,
  isOwner: user.isOwner,
});

const findUserByEmail = async (email: string) => {
  const { rows } = await query<{
    id: string;
    email: string;
    password_hash: string | null;
    display_name: string | null;
    avatar_url: string | null;
    is_owner: boolean;
  }>(
    "select id, email, password_hash, display_name, avatar_url, is_owner from users where email = $1",
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
};

const setSessionCookie = (
  reply: {
    setCookie: (
      name: string,
      value: string,
      options: Record<string, unknown>,
    ) => unknown;
  },
  token: string,
  expiresAt: Date,
) => {
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureOrigin,
    expires: expiresAt,
  });
};

export const registerAuthRoutes = (app: FastifyInstance) => {
  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const body = credentialsSchema.parse(req.body);
      const user = await findUserByEmail(body.email);
      if (!user || !verifyPassword(body.password, user.password_hash)) {
        throw new HttpError(401, "Invalid email or password");
      }
      const session = await createSession(user.id, {
        userAgent: req.headers["user-agent"],
        ip: req.ip,
      });
      setSessionCookie(reply, session.token, session.expiresAt);
      return {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        isOwner: user.is_owner,
      };
    },
  );

  app.post("/auth/logout", async (req, reply) => {
    await deleteSession(req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return reply.code(204).send();
  });

  app.get("/auth/me", async (req, reply) => {
    if (!req.authUser) {
      return reply.code(401).send({ error: "Not signed in" });
    }
    return userResponse(req.authUser);
  });

  app.post(
    "/auth/magic-link",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const body = magicLinkSchema.parse(req.body);
      const email = body.email.toLowerCase();

      const user = await findUserByEmail(email);

      if (user) {
        const { token } = await createAuthToken({
          email,
          userId: user.id,
          purpose: "login",
        });
        await sendMagicLinkEmail(email, token, "login");
      } else {
        const pending = await query<{ id: string }>(
          `select id from auth_tokens
           where lower(email) = $1 and purpose = 'invite'
             and used_at is null and expires_at > now()
           order by created_at desc limit 1`,
          [email],
        );
        if (pending.rows.length > 0) {
          const { token } = await createAuthToken({
            email,
            purpose: "invite",
          });
          await sendMagicLinkEmail(email, token, "invite");
        }
      }

      return reply.code(202).send({ ok: true });
    },
  );

  app.get("/auth/magic/verify", async (req, reply) => {
    const schema = z.object({ token: z.string().min(10) });
    const { token } = schema.parse(req.query);

    const row = await consumeAuthToken(token, ["invite", "login", "reset"]);
    if (!row) {
      return reply.redirect(`${env.APP_ORIGIN}/?auth=expired`);
    }

    let userId = row.user_id;
    if (!userId) {
      const existing = await findUserByEmail(row.email);
      if (existing) {
        userId = existing.id;
      } else {
        const created = await query<{ id: string }>(
          `insert into users (email) values ($1)
           on conflict (email) do update set email = excluded.email
           returning id`,
          [row.email.toLowerCase()],
        );
        userId = created.rows[0].id;
      }
    }

    const session = await createSession(userId, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    setSessionCookie(reply, session.token, session.expiresAt);
    return reply.redirect(`${env.APP_ORIGIN}/dashboard`);
  });

  app.get("/auth/oauth/:provider", async (req, reply) => {
    const { provider } = z
      .object({ provider: z.enum(["google", "github"]) })
      .parse(req.params);

    if (!oauthProviders.includes(provider)) {
      throw new HttpError(400, "Unsupported provider");
    }

    const state = createOAuthState(provider);
    return reply.redirect(getOAuthAuthorizeUrl(provider, state));
  });

  app.get("/auth/oauth/:provider/callback", async (req, reply) => {
    const { provider } = z
      .object({ provider: z.enum(["google", "github"]) })
      .parse(req.params);
    const querySchema = z.object({
      code: z.string().optional(),
      state: z.string().optional(),
      error: z.string().optional(),
    });
    const { code, state, error } = querySchema.parse(req.query);

    if (error || !code || !verifyOAuthState(provider, state)) {
      return reply.redirect(`${env.APP_ORIGIN}/?auth=error`);
    }

    let profile;
    try {
      profile = await exchangeOAuthCode(provider, code);
    } catch (exchangeError) {
      req.log.error(exchangeError);
      return reply.redirect(`${env.APP_ORIGIN}/?auth=error`);
    }

    const identity = await query<{ user_id: string }>(
      "select user_id from identities where provider = $1 and provider_user_id = $2",
      [provider, profile.providerUserId],
    );

    let userId = identity.rows[0]?.user_id ?? null;

    if (!userId) {
      const existing = await findUserByEmail(profile.email);
      if (existing) {
        userId = existing.id;
      } else {
        const pendingInvite = await query<{ id: string }>(
          `select id from auth_tokens
           where lower(email) = $1 and purpose = 'invite'
             and used_at is null and expires_at > now()
           order by created_at desc limit 1`,
          [profile.email],
        );
        if (pendingInvite.rows.length === 0) {
          return reply.redirect(`${env.APP_ORIGIN}/?auth=not_invited`);
        }
        const created = await query<{ id: string }>(
          `insert into users (email, display_name, avatar_url)
           values ($1, $2, $3) returning id`,
          [profile.email, profile.displayName, profile.avatarUrl],
        );
        userId = created.rows[0].id;
        await query("update auth_tokens set used_at = now() where id = $1", [
          pendingInvite.rows[0].id,
        ]);
      }

      await query(
        `insert into identities (user_id, provider, provider_user_id)
         values ($1, $2, $3) on conflict (provider, provider_user_id) do nothing`,
        [userId, provider, profile.providerUserId],
      );
    }

    const session = await createSession(userId, {
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });
    setSessionCookie(reply, session.token, session.expiresAt);
    return reply.redirect(`${env.APP_ORIGIN}/dashboard`);
  });
};
