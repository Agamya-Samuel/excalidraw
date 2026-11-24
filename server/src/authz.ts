import { query } from "./db";
import { HttpError } from "./errors";

import type { AuthUser, DocRole } from "./types";

export type DocumentAccessRow = {
  id: string;
  owner_id: string;
  is_public: boolean;
  public_edit: boolean;
  room_id: string;
  room_key: string;
};

export const getDocumentAccess = async (
  docId: string,
): Promise<DocumentAccessRow | null> => {
  const { rows } = await query<DocumentAccessRow>(
    `select id, owner_id, is_public, public_edit, room_id, room_key
     from documents where id = $1`,
    [docId],
  );
  return rows[0] ?? null;
};

export const getDocRole = async (
  userId: string | null,
  docId: string,
): Promise<DocRole | null> => {
  const doc = await getDocumentAccess(docId);
  if (!doc) {
    return null;
  }
  if (userId && doc.owner_id === userId) {
    return "owner";
  }
  if (!userId) {
    return null;
  }
  const { rows } = await query<{ role: DocRole }>(
    "select role from doc_members where doc_id = $1 and user_id = $2",
    [docId, userId],
  );
  return rows[0]?.role ?? null;
};

export const requireDocRole = async (
  user: AuthUser | null,
  docId: string,
  roles: DocRole[],
): Promise<DocRole> => {
  const role = await getDocRole(user?.id ?? null, docId);
  if (!role) {
    throw new HttpError(404, "Board not found");
  }
  if (!roles.includes(role)) {
    throw new HttpError(403, "You do not have access to this board");
  }
  return role;
};

export const canReadDoc = async (user: AuthUser | null, docId: string) => {
  const doc = await getDocumentAccess(docId);
  if (!doc) {
    return null;
  }
  const role = await getDocRole(user?.id ?? null, docId);
  if (role || doc.is_public) {
    return { doc, role };
  }
  return null;
};

export const canWriteDoc = async (user: AuthUser | null, docId: string) => {
  const access = await canReadDoc(user, docId);
  if (!access) {
    return null;
  }
  const { doc, role } = access;
  if (role === "owner" || role === "editor" || doc.public_edit) {
    return access;
  }
  return null;
};
