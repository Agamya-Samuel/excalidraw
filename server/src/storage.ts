import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";

import { env } from "./env";
import { HttpError } from "./errors";

const DOC_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEGACY_ID_RE = /^[A-Za-z0-9_-]+$/;
const FILE_NAME_RE = /^[A-Za-z0-9_.-]+$/;

export type ParsedUploadPath = {
  kind: "docs" | "rooms" | "shareLinks";
  docId: string | null;
  relativePath: string;
};

export const parseUploadPath = (rawPath: string): ParsedUploadPath => {
  const path = rawPath.replace(/^\/+/, "");
  const parts = path.split("/");

  if (parts.length !== 3) {
    throw new HttpError(400, "Invalid file path");
  }
  const [kind, folder, fileName] = parts;
  if (
    !fileName ||
    !FILE_NAME_RE.test(fileName) ||
    fileName === "." ||
    fileName === ".."
  ) {
    throw new HttpError(400, "Invalid file name");
  }

  if (kind === "docs") {
    if (!DOC_ID_RE.test(folder)) {
      throw new HttpError(400, "Invalid document id");
    }
    return { kind, docId: folder, relativePath: path };
  }

  if (kind === "rooms" || kind === "shareLinks") {
    if (!LEGACY_ID_RE.test(folder)) {
      throw new HttpError(400, "Invalid room id");
    }
    return { kind, docId: null, relativePath: path };
  }

  throw new HttpError(400, "Invalid file path");
};

const resolveSafePath = (relativePath: string) => {
  const base = normalize(env.UPLOAD_DIR);
  const target = normalize(join(base, relativePath));
  if (!target.startsWith(`${base}/`)) {
    throw new HttpError(400, "Invalid file path");
  }
  return target;
};

export const writeUpload = async (relativePath: string, data: Buffer) => {
  const target = resolveSafePath(relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, data);
};

export const readUpload = async (relativePath: string) => {
  const target = resolveSafePath(relativePath);
  try {
    return await readFile(target);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

export const deleteUploadDir = async (kind: "docs", id: string) => {
  const target = resolveSafePath(`${kind}/${id}`);
  await rm(target, { recursive: true, force: true });
};

export const docThumbnailPath = (docId: string) => `docs/${docId}/thumb.png`;
