import { HttpError } from "./errors";

import type { AuthUser } from "./types";
import type { FastifyRequest } from "fastify";

export const requireUser = (req: FastifyRequest): AuthUser => {
  if (!req.authUser) {
    throw new HttpError(401, "Not signed in");
  }
  return req.authUser;
};

export const requireOwner = (req: FastifyRequest): AuthUser => {
  const user = requireUser(req);
  if (!user.isOwner) {
    throw new HttpError(403, "Owner access required");
  }
  return user;
};
