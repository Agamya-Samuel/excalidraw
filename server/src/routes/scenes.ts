import { z } from "zod";

import { canReadDoc, canWriteDoc } from "../authz";
import { query, withTransaction } from "../db";
import { env } from "../env";
import { HttpError } from "../errors";

import type { FastifyInstance } from "fastify";

const uuidParams = z.object({ id: z.string().uuid() });

const sceneBody = z.object({
  baseVersion: z.number().int().nonnegative().nullable().optional(),
  sceneVersion: z.number().int().nonnegative(),
  blob: z.string(),
});

export const registerSceneRoutes = (app: FastifyInstance) => {
  app.get("/documents/:id/scene", async (req) => {
    const { id } = uuidParams.parse(req.params);
    const access = await canReadDoc(req.authUser, id);
    if (!access) {
      throw new HttpError(404, "Board not found");
    }

    const { rows } = await query<{ scene_version: string; blob: string }>(
      "select scene_version, blob from doc_scenes where doc_id = $1",
      [id],
    );
    const row = rows[0];
    if (!row) {
      return { blob: null, sceneVersion: 0 };
    }
    return { blob: row.blob, sceneVersion: Number(row.scene_version) };
  });

  app.put("/documents/:id/scene", async (req) => {
    const { id } = uuidParams.parse(req.params);
    const access = await canWriteDoc(req.authUser, id);
    if (!access) {
      throw new HttpError(403, "You do not have write access to this board");
    }

    const body = sceneBody.parse(req.body);
    if (Buffer.byteLength(body.blob, "utf8") > env.MAX_SCENE_BYTES) {
      throw new HttpError(413, "Scene is too large");
    }

    return withTransaction(async (client) => {
      const existing = await client.query<{ scene_version: string }>(
        "select scene_version from doc_scenes where doc_id = $1 for update",
        [id],
      );
      const current = existing.rows[0];

      if (current) {
        const base = body.baseVersion ?? -1;
        if (Number(current.scene_version) !== base) {
          throw new HttpError(
            409,
            "Scene version conflict",
            "scene_version_conflict",
          );
        }
      }

      await client.query(
        `insert into doc_scenes (doc_id, scene_version, blob, updated_at)
         values ($1, $2, $3, now())
         on conflict (doc_id) do update
           set scene_version = excluded.scene_version,
               blob = excluded.blob,
               updated_at = now()`,
        [id, body.sceneVersion, body.blob],
      );
      await client.query(
        "update documents set scene_version = $2, updated_at = now() where id = $1",
        [id, body.sceneVersion],
      );

      return { sceneVersion: body.sceneVersion };
    });
  });
};
