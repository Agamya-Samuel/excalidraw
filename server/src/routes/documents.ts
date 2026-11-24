import { z } from "zod";

import { createAuthToken, sendMagicLinkEmail } from "../auth/magicLinks";
import { generateRoomId, generateRoomKey } from "../crypto";
import { query } from "../db";
import { env } from "../env";
import { HttpError } from "../errors";
import { canWriteDoc, getDocRole, requireDocRole } from "../authz";
import { requireUser } from "../guards";
import { sendMail } from "../mail";
import {
  deleteUploadDir,
  docThumbnailPath,
  readUpload,
  writeUpload,
} from "../storage";

import type { FastifyInstance } from "fastify";

import type { DocRole } from "../types";

const roleSchema = z.enum(["editor", "viewer"]);
const accessSchema = z.enum(["private", "view", "edit"]);

const docIdParams = z.object({ id: z.string().uuid() });

export const registerDocumentRoutes = (app: FastifyInstance) => {
  app.get("/documents", async (req) => {
    const user = requireUser(req);
    const { rows } = await query(
      `select d.*,
              case when d.owner_id = $1 then 'owner' else m.role end as role
       from documents d
       left join doc_members m on m.doc_id = d.id and m.user_id = $1
       where d.owner_id = $1 or m.user_id is not null
       order by d.updated_at desc`,
      [user.id],
    );
    return rows;
  });

  app.post("/documents", async (req) => {
    const user = requireUser(req);
    const body = z
      .object({ title: z.string().optional() })
      .parse(req.body ?? {});

    const title = (body.title ?? "Untitled").trim() || "Untitled";
    const { rows } = await query(
      `insert into documents (owner_id, owner_email, title, room_id, room_key)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [user.id, user.email, title, generateRoomId(), generateRoomKey()],
    );
    return rows[0];
  });

  app.get("/documents/:id", async (req) => {
    const user = requireUser(req);
    const { id } = docIdParams.parse(req.params);
    const role = await getDocRole(user.id, id);
    if (!role) {
      throw new HttpError(404, "Board not found");
    }
    const { rows } = await query("select * from documents where id = $1", [id]);
    if (!rows[0]) {
      throw new HttpError(404, "Board not found");
    }
    return { ...rows[0], role };
  });

  app.patch("/documents/:id", async (req) => {
    const user = requireUser(req);
    const { id } = docIdParams.parse(req.params);
    await requireDocRole(user, id, ["owner"]);
    const body = z.object({ title: z.string().min(1) }).parse(req.body);
    const { rows } = await query(
      `update documents set title = $2, updated_at = now()
       where id = $1 returning *`,
      [id, body.title.trim() || "Untitled"],
    );
    return rows[0];
  });

  app.delete("/documents/:id", async (req) => {
    const user = requireUser(req);
    const { id } = docIdParams.parse(req.params);
    await requireDocRole(user, id, ["owner"]);
    await query("delete from documents where id = $1", [id]);
    await deleteUploadDir("docs", id);
    return { ok: true };
  });

  app.patch("/documents/:id/access", async (req) => {
    const user = requireUser(req);
    const { id } = docIdParams.parse(req.params);
    await requireDocRole(user, id, ["owner"]);
    const body = z.object({ access: accessSchema }).parse(req.body);

    const isPublic = body.access !== "private";
    const publicEdit = body.access === "edit";

    const { rows } = await query(
      `update documents
       set is_public = $2, public_edit = $3, updated_at = now()
       where id = $1 returning *`,
      [id, isPublic, publicEdit],
    );
    return rows[0];
  });

  app.get("/documents/:id/members", async (req) => {
    const user = requireUser(req);
    const { id } = docIdParams.parse(req.params);
    await requireDocRole(user, id, ["owner", "editor", "viewer"]);
    const { rows } = await query(
      "select user_id, email, role from doc_members where doc_id = $1 order by created_at",
      [id],
    );
    return rows;
  });

  app.post("/documents/:id/members", async (req) => {
    const user = requireUser(req);
    const { id } = docIdParams.parse(req.params);
    await requireDocRole(user, id, ["owner"]);
    const body = z
      .object({ email: z.string().email(), role: roleSchema })
      .parse(req.body);

    const target = await query<{ id: string; email: string }>(
      "select id, email from users where email = $1",
      [body.email.toLowerCase()],
    );
    if (!target.rows[0]) {
      throw new HttpError(404, "That person needs an account first");
    }

    const { rows } = await query(
      `insert into doc_members (doc_id, user_id, email, role)
       values ($1, $2, $3, $4)
       on conflict (doc_id, user_id) do update set role = excluded.role
       returning user_id, email, role`,
      [id, target.rows[0].id, target.rows[0].email, body.role],
    );
    return rows[0];
  });

  app.patch("/documents/:id/members/:userId", async (req) => {
    const user = requireUser(req);
    const { id, userId } = z
      .object({ id: z.string().uuid(), userId: z.string().uuid() })
      .parse(req.params);
    await requireDocRole(user, id, ["owner"]);
    const body = z.object({ role: roleSchema }).parse(req.body);
    const { rows } = await query(
      `update doc_members set role = $3
       where doc_id = $1 and user_id = $2
       returning user_id, email, role`,
      [id, userId, body.role],
    );
    if (!rows[0]) {
      throw new HttpError(404, "Member not found");
    }
    return rows[0];
  });

  app.delete("/documents/:id/members/:userId", async (req) => {
    const user = requireUser(req);
    const { id, userId } = z
      .object({ id: z.string().uuid(), userId: z.string().uuid() })
      .parse(req.params);

    if (user.id !== userId) {
      await requireDocRole(user, id, ["owner"]);
    }
    await query("delete from doc_members where doc_id = $1 and user_id = $2", [
      id,
      userId,
    ]);
    return { ok: true };
  });

  app.get("/documents/:id/invites", async (req) => {
    const user = requireUser(req);
    const { id } = docIdParams.parse(req.params);
    await requireDocRole(user, id, ["owner"]);
    const { rows } = await query(
      `select id, doc_id, doc_title, email, role, invited_by, created_at
       from doc_invites where doc_id = $1 order by created_at desc`,
      [id],
    );
    return rows;
  });

  app.post("/documents/:id/invites", async (req) => {
    const user = requireUser(req);
    const { id } = docIdParams.parse(req.params);
    await requireDocRole(user, id, ["owner"]);
    const body = z
      .object({
        email: z.string().email(),
        role: roleSchema,
        docTitle: z.string().optional(),
      })
      .parse(req.body);

    const email = body.email.toLowerCase();
    const title = body.docTitle?.trim() || "Untitled";

    const { rows } = await query(
      `insert into doc_invites (doc_id, doc_title, email, role, invited_by)
       values ($1, $2, $3, $4, $5)
       on conflict (doc_id, email) do update
         set role = excluded.role, doc_title = excluded.doc_title
       returning id, doc_id, doc_title, email, role, invited_by, created_at`,
      [id, title, email, body.role, user.id],
    );

    try {
      const existingUser = await query<{ id: string }>(
        "select id from users where email = $1",
        [email],
      );

      if (existingUser.rows.length === 0) {
        // New email: send a magic link that also creates the account, so the
        // invitee can actually sign in and accept the board invite.
        const { token } = await createAuthToken({
          email,
          purpose: "invite",
        });
        await sendMagicLinkEmail(email, token, "invite");
      } else {
        await sendMail({
          to: email,
          subject: `You've been invited to "${title}"`,
          text: `You have been invited to the board "${title}". Sign in at ${env.APP_ORIGIN}/dashboard to accept.`,
        });
      }
    } catch (error) {
      req.log.warn(error, "Failed to send doc invite email");
    }

    return rows[0];
  });

  app.delete("/documents/:id/invites/:inviteId", async (req) => {
    const user = requireUser(req);
    const { id, inviteId } = z
      .object({ id: z.string().uuid(), inviteId: z.string().uuid() })
      .parse(req.params);
    await requireDocRole(user, id, ["owner"]);
    await query("delete from doc_invites where id = $1 and doc_id = $2", [
      inviteId,
      id,
    ]);
    return { ok: true };
  });

  app.get("/doc-invites", async (req) => {
    const user = requireUser(req);
    const { rows } = await query(
      `select id, doc_id, doc_title, email, role, invited_by, created_at
       from doc_invites where email = $1 order by created_at desc`,
      [user.email],
    );
    return rows;
  });

  app.post("/doc-invites/:id/accept", async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);

    const { rows } = await query<{
      id: string;
      doc_id: string;
      email: string;
      role: DocRole;
    }>(
      `select id, doc_id, email, role from doc_invites
       where id = $1 and email = $2`,
      [id, user.email],
    );
    const invite = rows[0];
    if (!invite) {
      throw new HttpError(404, "Invite not found");
    }

    await query(
      `insert into doc_members (doc_id, user_id, email, role)
       values ($1, $2, $3, $4)
       on conflict (doc_id, user_id) do update set role = excluded.role`,
      [invite.doc_id, user.id, user.email, invite.role],
    );
    await query("delete from doc_invites where id = $1", [id]);
    return { ok: true };
  });

  app.delete("/doc-invites/:id", async (req) => {
    const user = requireUser(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    await query("delete from doc_invites where id = $1 and email = $2", [
      id,
      user.email,
    ]);
    return { ok: true };
  });

  app.put(
    "/documents/:id/thumbnail",
    { bodyLimit: 8 * 1024 * 1024 },
    async (req, reply) => {
      const { id } = docIdParams.parse(req.params);
      const access = await canWriteDoc(req.authUser, id);
      if (!access) {
        throw new HttpError(403, "You cannot edit this board");
      }

      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        throw new HttpError(400, "Expected a PNG body");
      }

      const path = docThumbnailPath(id);
      await writeUpload(path, body);
      await query(
        "update documents set thumbnail_path = $2, updated_at = now() where id = $1",
        [id, path],
      );
      return reply.code(204).send();
    },
  );

  app.get("/documents/:id/thumbnail", async (req, reply) => {
    const user = req.authUser;
    const { id } = docIdParams.parse(req.params);

    const { rows } = await query<{
      thumbnail_path: string | null;
      is_public: boolean;
    }>("select thumbnail_path, is_public from documents where id = $1", [id]);
    const doc = rows[0];
    if (!doc) {
      throw new HttpError(404, "Board not found");
    }

    const role = await getDocRole(user?.id ?? null, id);
    if (!role && !doc.is_public) {
      throw new HttpError(404, "Board not found");
    }
    if (!doc.thumbnail_path) {
      throw new HttpError(404, "No thumbnail");
    }

    const data = await readUpload(doc.thumbnail_path);
    if (!data) {
      throw new HttpError(404, "No thumbnail");
    }
    return reply
      .header("content-type", "image/png")
      .header("cache-control", "private, max-age=300")
      .send(data);
  });
};
