import { mkdir } from "node:fs/promises";

import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";

import { bootstrapOwner } from "./auth/owner";
import { SESSION_COOKIE, resolveSession } from "./auth/session";
import { pool } from "./db";
import { env } from "./env";
import { HttpError } from "./errors";
import { runMigrations } from "./migrate";
import { registerAuthRoutes } from "./routes/auth";
import { registerDocumentRoutes } from "./routes/documents";
import { registerFileRoutes } from "./routes/files";
import { registerInviteRoutes } from "./routes/invites";
import { registerLegacyRoutes } from "./routes/legacy";
import { registerPublicRoutes } from "./routes/public";
import { registerSceneRoutes } from "./routes/scenes";

export const buildApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({
    bodyLimit: env.MAX_SCENE_BYTES,
    trustProxy: true,
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "info",
    },
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.addContentTypeParser(
    ["application/octet-stream", "image/png"],
    { parseAs: "buffer", bodyLimit: env.MAX_FILE_BYTES },
    (_req, body, done) => done(null, body),
  );

  const appOrigin = new URL(env.APP_ORIGIN).origin;

  app.addHook("onRequest", async (req) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== appOrigin) {
        throw new HttpError(403, "Invalid request origin");
      }
    }

    req.authUser = await resolveSession(req.cookies[SESSION_COOKIE]);
  });

  app.get("/health", async () => ({ ok: true }));

  app.register(
    async (api) => {
      registerAuthRoutes(api);
      registerInviteRoutes(api);
      registerPublicRoutes(api);
      registerLegacyRoutes(api);
      registerSceneRoutes(api);
      registerFileRoutes(api);
      registerDocumentRoutes(api);
    },
    { prefix: "/api" },
  );

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "Invalid request",
        details: error.flatten().fieldErrors,
      });
    }
    if (error instanceof HttpError) {
      return reply
        .code(error.statusCode)
        .send({ error: error.message, code: error.code });
    }
    if ((error as { statusCode?: number }).statusCode === 413) {
      return reply.code(413).send({ error: "Request body too large" });
    }

    req.log.error(error);
    return reply.code(500).send({ error: "Internal server error" });
  });

  return app;
};

const start = async () => {
  await mkdir(env.UPLOAD_DIR, { recursive: true });
  await runMigrations();
  await bootstrapOwner();

  const app = await buildApp();
  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  const shutdown = async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

if (require.main === module) {
  start().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
}
