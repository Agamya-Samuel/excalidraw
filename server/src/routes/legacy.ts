import { z } from "zod";

import { query, withTransaction } from "../db";
import { HttpError } from "../errors";

import type { FastifyInstance } from "fastify";

const roomParams = z.object({ roomId: z.string().regex(/^[A-Za-z0-9_-]+$/) });

const sceneBody = z.object({
  baseVersion: z.number().int().nonnegative().nullable().optional(),
  sceneVersion: z.number().int().nonnegative(),
  iv: z.string().min(1),
  ciphertext: z.string().min(1),
});

export const registerLegacyRoutes = (app: FastifyInstance) => {
  app.get("/legacy/scenes/:roomId", async (req) => {
    const { roomId } = roomParams.parse(req.params);
    const { rows } = await query<{
      scene_version: string;
      iv: string;
      ciphertext: string;
    }>(
      "select scene_version, iv, ciphertext from legacy_scenes where room_id = $1",
      [roomId],
    );
    return { scene: rows[0] ?? null };
  });

  app.put(
    "/legacy/scenes/:roomId",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req) => {
      const { roomId } = roomParams.parse(req.params);
      const body = sceneBody.parse(req.body);

      return withTransaction(async (client) => {
        const existing = await client.query<{ scene_version: string }>(
          "select scene_version from legacy_scenes where room_id = $1 for update",
          [roomId],
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
          `insert into legacy_scenes (room_id, scene_version, iv, ciphertext, updated_at)
         values ($1, $2, $3, $4, now())
         on conflict (room_id) do update
           set scene_version = excluded.scene_version,
               iv = excluded.iv,
               ciphertext = excluded.ciphertext,
               updated_at = now()`,
          [roomId, body.sceneVersion, body.iv, body.ciphertext],
        );

        return { sceneVersion: body.sceneVersion };
      });
    },
  );
};
