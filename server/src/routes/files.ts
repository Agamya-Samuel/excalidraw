import { canReadDoc, canWriteDoc } from "../authz";
import { env } from "../env";
import { HttpError } from "../errors";
import { parseUploadPath, readUpload, writeUpload } from "../storage";

import type { FastifyInstance } from "fastify";

export const registerFileRoutes = (app: FastifyInstance) => {
  app.put(
    "/files/*",
    {
      bodyLimit: env.MAX_FILE_BYTES,
      config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const rawPath = (req.params as { "*": string })["*"];
      const parsed = parseUploadPath(rawPath);

      if (parsed.kind === "docs" && parsed.docId) {
        const access = await canWriteDoc(req.authUser, parsed.docId);
        if (!access) {
          throw new HttpError(403, "You cannot write files to this board");
        }
      }

      const body = req.body;
      if (!Buffer.isBuffer(body)) {
        throw new HttpError(400, "Expected a binary body");
      }
      if (body.length > env.MAX_FILE_BYTES) {
        throw new HttpError(413, "File is too large");
      }

      await writeUpload(parsed.relativePath, body);
      return reply.code(204).send();
    },
  );

  app.get("/files/*", async (req, reply) => {
    const rawPath = (req.params as { "*": string })["*"];
    const parsed = parseUploadPath(rawPath);

    if (parsed.kind === "docs" && parsed.docId) {
      const access = await canReadDoc(req.authUser, parsed.docId);
      if (!access) {
        throw new HttpError(404, "File not found");
      }
    }

    const data = await readUpload(parsed.relativePath);
    if (!data) {
      throw new HttpError(404, "File not found");
    }

    const contentType = parsed.relativePath.endsWith(".png")
      ? "image/png"
      : "application/octet-stream";

    return reply
      .header("content-type", contentType)
      .header("cache-control", "private, max-age=31536000")
      .send(data);
  });
};
