import { z } from "zod";

import { createAuthToken, sendMagicLinkEmail } from "../auth/magicLinks";
import { query } from "../db";
import { HttpError } from "../errors";
import { requireOwner } from "../guards";

import type { FastifyInstance } from "fastify";

const inviteSchema = z.object({ email: z.string().email() });

export const registerInviteRoutes = (app: FastifyInstance) => {
  app.post("/invites", async (req) => {
    requireOwner(req);
    const body = inviteSchema.parse(req.body);
    const email = body.email.toLowerCase();

    const { token, id } = await createAuthToken({
      email,
      purpose: "invite",
    });
    await sendMagicLinkEmail(email, token, "invite");

    return { id, email };
  });

  app.get("/invites", async (req) => {
    requireOwner(req);
    const { rows } = await query<{
      id: string;
      email: string;
      expires_at: Date;
      created_at: Date;
    }>(
      `select id, email, expires_at, created_at
       from auth_tokens
       where purpose = 'invite' and used_at is null and expires_at > now()
       order by created_at desc`,
    );
    return rows;
  });

  app.delete("/invites/:id", async (req) => {
    requireOwner(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await query(
      "delete from auth_tokens where id = $1 and purpose = 'invite'",
      [id],
    );
    if (result.rowCount === 0) {
      throw new HttpError(404, "Invite not found");
    }
    return { ok: true };
  });
};
