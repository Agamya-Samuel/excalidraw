import { env } from "../env";

import { signValue, verifySignedValue } from "./session";

export type OAuthProvider = "google" | "github";

export const oauthProviders: OAuthProvider[] = ["google", "github"];

const stateTtlMs = 10 * 60 * 1000;

export const createOAuthState = (provider: OAuthProvider) => {
  const payload = Buffer.from(
    JSON.stringify({ provider, ts: Date.now() }),
  ).toString("base64url");
  return `${payload}.${signValue(payload)}`;
};

export const verifyOAuthState = (
  provider: OAuthProvider,
  state: string | undefined,
) => {
  if (!state) {
    return false;
  }
  const [payload, signature] = state.split(".");
  if (!payload || !signature || !verifySignedValue(payload, signature)) {
    return false;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return (
      data.provider === provider &&
      typeof data.ts === "number" &&
      Date.now() - data.ts < stateTtlMs
    );
  } catch {
    return false;
  }
};

const redirectUri = (provider: OAuthProvider) =>
  `${env.APP_ORIGIN}/api/auth/oauth/${provider}/callback`;

export const getOAuthAuthorizeUrl = (
  provider: OAuthProvider,
  state: string,
) => {
  const uri = encodeURIComponent(redirectUri(provider));

  if (provider === "google") {
    const clientId = env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new Error("Google OAuth is not configured");
    }
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: uri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  const clientId = env.GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new Error("GitHub OAuth is not configured");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: uri,
    scope: "user:email",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params}`;
};

type OAuthProfile = {
  providerUserId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};

const exchangeGoogle = async (code: string): Promise<OAuthProfile> => {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? "",
    client_secret: env.GOOGLE_CLIENT_SECRET ?? "",
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri("google"),
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed: ${tokenResponse.status}`);
  }
  const token = (await tokenResponse.json()) as { access_token?: string };
  if (!token.access_token) {
    throw new Error("Google token exchange returned no access token");
  }

  const profileResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    { headers: { authorization: `Bearer ${token.access_token}` } },
  );
  if (!profileResponse.ok) {
    throw new Error(`Google profile fetch failed: ${profileResponse.status}`);
  }
  const profile = (await profileResponse.json()) as {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!profile.email || profile.email_verified === false) {
    throw new Error("Google account has no verified email");
  }

  return {
    providerUserId: profile.sub,
    email: profile.email.toLowerCase(),
    displayName: profile.name ?? null,
    avatarUrl: profile.picture ?? null,
  };
};

const exchangeGithub = async (code: string): Promise<OAuthProfile> => {
  const tokenResponse = await fetch(
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri("github"),
      }),
    },
  );
  if (!tokenResponse.ok) {
    throw new Error(`GitHub token exchange failed: ${tokenResponse.status}`);
  }
  const token = (await tokenResponse.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!token.access_token) {
    throw new Error(token.error ?? "GitHub token exchange returned no token");
  }

  const headers = {
    authorization: `Bearer ${token.access_token}`,
    accept: "application/vnd.github+json",
    "user-agent": "excalidraw-selfhost",
  };

  const profileResponse = await fetch("https://api.github.com/user", {
    headers,
  });
  if (!profileResponse.ok) {
    throw new Error(`GitHub profile fetch failed: ${profileResponse.status}`);
  }
  const profile = (await profileResponse.json()) as {
    id: number;
    login: string;
    name?: string | null;
    avatar_url?: string;
  };

  let email = "";
  const emailsResponse = await fetch("https://api.github.com/user/emails", {
    headers,
  });
  if (emailsResponse.ok) {
    const emails = (await emailsResponse.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;
    email =
      emails.find((entry) => entry.primary && entry.verified)?.email ??
      emails.find((entry) => entry.verified)?.email ??
      "";
  }

  if (!email) {
    throw new Error("GitHub account has no verified email");
  }

  return {
    providerUserId: String(profile.id),
    email: email.toLowerCase(),
    displayName: profile.name ?? profile.login,
    avatarUrl: profile.avatar_url ?? null,
  };
};

export const exchangeOAuthCode = async (
  provider: OAuthProvider,
  code: string,
): Promise<OAuthProfile> => {
  if (provider === "google") {
    return exchangeGoogle(code);
  }
  return exchangeGithub(code);
};
