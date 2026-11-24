import { z } from "zod";

import { query } from "../db";
import { HttpError } from "../errors";

import type { FastifyInstance } from "fastify";

const docIdParams = z.object({ id: z.string().uuid() });

export const registerPublicRoutes = (app: FastifyInstance) => {
  app.get("/public/documents/:id", async (req) => {
    const { id } = docIdParams.parse(req.params);
    const { rows } = await query(
      `select id, title, scene_version, updated_at, room_id, public_edit
       from documents where id = $1 and is_public`,
      [id],
    );
    const row = rows[0];
    if (!row) {
      throw new HttpError(404, "This board is not public");
    }
    return row;
  });
};
