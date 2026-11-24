import type { AppState } from "@excalidraw/excalidraw/types";

import { ApiError, apiFetch } from "../lib/api";

import { saveDocScene } from "./docScene";

import type { SyncableExcalidrawElement } from "../data";

export type DocRole = "owner" | "editor" | "viewer";

export type CloudDoc = {
  id: string;
  owner_id: string;
  owner_email: string;
  title: string;
  room_id: string;
  room_key: string;
  is_public: boolean;
  public_edit: boolean;
  thumbnail_path: string | null;
  scene_version: number;
  created_at: string;
  updated_at: string;
};

export type CloudDocWithRole = CloudDoc & { role: DocRole };

export type DocInvite = {
  id: string;
  doc_id: string;
  doc_title: string;
  email: string;
  role: Exclude<DocRole, "owner">;
  invited_by: string;
  created_at: string;
};

export const createDocument = async ({
  title,
  elements,
  appState,
}: {
  title: string;
  elements: readonly SyncableExcalidrawElement[];
  appState: AppState;
}): Promise<CloudDoc> => {
  const doc = await apiFetch<CloudDoc>("/documents", {
    method: "POST",
    json: { title: title.trim() || "Untitled" },
  });

  try {
    await saveDocScene({
      docId: doc.id,
      roomKey: doc.room_key,
      elements,
      appState,
      baseVersion: null,
    });
  } catch (error) {
    await apiFetch(`/documents/${doc.id}`, { method: "DELETE" }).catch(() => {
      // best effort cleanup
    });
    throw error;
  }

  return doc;
};

export const listDocuments = async (): Promise<CloudDocWithRole[]> => {
  return apiFetch<CloudDocWithRole[]>("/documents");
};

export const getDocument = async (
  docId: string,
): Promise<CloudDocWithRole | null> => {
  try {
    return await apiFetch<CloudDocWithRole>(`/documents/${docId}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

export const getPublicDoc = async (docId: string) => {
  try {
    return await apiFetch<{
      id: string;
      title: string;
      scene_version: number;
      updated_at: string;
      room_id: string;
      public_edit: boolean;
    }>(`/public/documents/${docId}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

export const renameDocument = async (docId: string, title: string) => {
  await apiFetch(`/documents/${docId}`, {
    method: "PATCH",
    json: { title: title.trim() || "Untitled" },
  });
};

export const deleteDocument = async (docId: string) => {
  await apiFetch(`/documents/${docId}`, { method: "DELETE" });
};

export type PublicAccess = "private" | "view" | "edit";

export const setPublicAccess = async (docId: string, access: PublicAccess) => {
  await apiFetch(`/documents/${docId}/access`, {
    method: "PATCH",
    json: { access },
  });
};

export const listInvites = async (): Promise<
  (DocInvite & { title: string })[]
> => {
  const invites = await apiFetch<DocInvite[]>("/doc-invites");
  return invites.map((invite) => ({
    ...invite,
    title: invite.doc_title ?? "Untitled",
  }));
};

export const inviteMember = async (
  docId: string,
  email: string,
  role: Exclude<DocRole, "owner">,
  docTitle: string,
) => {
  await apiFetch(`/documents/${docId}/invites`, {
    method: "POST",
    json: { email: email.trim().toLowerCase(), role, docTitle },
  });
};

export const acceptInvite = async (invite: DocInvite) => {
  await apiFetch(`/doc-invites/${invite.id}/accept`, { method: "POST" });
};

export const acceptInviteById = async (inviteId: string) => {
  await apiFetch(`/doc-invites/${inviteId}/accept`, { method: "POST" });
};

export const declineInvite = async (inviteId: string) => {
  await apiFetch(`/doc-invites/${inviteId}`, { method: "DELETE" });
};

export const listMembers = async (docId: string) => {
  return apiFetch<{ user_id: string; email: string; role: string }[]>(
    `/documents/${docId}/members`,
  );
};

export const listDocInvites = async (docId: string): Promise<DocInvite[]> => {
  return apiFetch<DocInvite[]>(`/documents/${docId}/invites`);
};

export const revokeInvite = async (docId: string, inviteId: string) => {
  await apiFetch(`/documents/${docId}/invites/${inviteId}`, {
    method: "DELETE",
  });
};

export const removeMember = async (docId: string, userId: string) => {
  await apiFetch(`/documents/${docId}/members/${userId}`, {
    method: "DELETE",
  });
};

export const setMemberRole = async (
  docId: string,
  userId: string,
  role: Exclude<DocRole, "owner">,
) => {
  await apiFetch(`/documents/${docId}/members/${userId}`, {
    method: "PATCH",
    json: { role },
  });
};

export const uploadThumbnail = async (docId: string, png: Blob) => {
  await apiFetch(`/documents/${docId}/thumbnail`, {
    method: "PUT",
    body: png,
    headers: { "content-type": "image/png" },
  });
};

export const getThumbnailUrl = async (path: string) => `/api/files/${path}`;
