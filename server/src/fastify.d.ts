import type { AuthUser } from "./types";

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
}
