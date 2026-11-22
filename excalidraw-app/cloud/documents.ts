import { generateEncryptionKey } from "@excalidraw/excalidraw/data/encryption";

import type { AppState } from "@excalidraw/excalidraw/types";

import { generateRoomId } from "../data";
import { getSupabase, STORAGE_BUCKET } from "../lib/supabase";

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

const requireUser = async () => {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) {
    throw new Error("Not signed in");
  }
  return data.user;
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
  const user = await requireUser();
  const roomId = await generateRoomId();
  const roomKey = await generateEncryptionKey();

  if (!roomKey) {
    throw new Error("Could not generate document key");
  }

  const { data, error } = await getSupabase()
    .from("documents")
    .insert({
      owner_id: user.id,
      owner_email: (user.email ?? "").toLowerCase(),
      title: title.trim() || "Untitled",
      room_id: roomId,
      room_key: roomKey,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  try {
    await saveDocScene({
      docId: data.id,
      roomKey,
      elements,
      appState,
    });
  } catch (error) {
    // don't leave a half-created board behind
    await getSupabase().from("documents").delete().eq("id", data.id);
    throw error;
  }

  return data as CloudDoc;
};

export const listDocuments = async (): Promise<CloudDocWithRole[]> => {
  const user = await requireUser();
  const supabase = getSupabase();

  const [owned, shared] = await Promise.all([
    supabase.from("documents").select("*").eq("owner_id", user.id),
    supabase
      .from("doc_members")
      .select("role, documents(*)")
      .eq("user_id", user.id),
  ]);

  if (owned.error) {
    throw owned.error;
  }
  if (shared.error) {
    throw shared.error;
  }

  const docs = new Map<string, CloudDocWithRole>();

  for (const doc of (owned.data ?? []) as CloudDoc[]) {
    docs.set(doc.id, { ...doc, role: "owner" });
  }

  for (const row of (shared.data ?? []) as any[]) {
    const doc = row.documents as CloudDoc | null;
    if (doc && !docs.has(doc.id)) {
      docs.set(doc.id, { ...doc, role: row.role });
    }
  }

  return [...docs.values()].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
};

export const getDocument = async (
  docId: string,
): Promise<CloudDocWithRole | null> => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", docId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const user = (await supabase.auth.getUser()).data.user;
  let role: DocRole | null = user && data.owner_id === user.id ? "owner" : null;

  if (!role && user) {
    const { data: member } = await supabase
      .from("doc_members")
      .select("role")
      .eq("doc_id", docId)
      .eq("user_id", user.id)
      .maybeSingle();
    role = (member?.role as DocRole) ?? null;
  }

  return role ? { ...(data as CloudDoc), role } : null;
};

export const getPublicDoc = async (docId: string) => {
  const { data, error } = await getSupabase().rpc("get_public_doc", {
    p_doc: docId,
  });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
};

export const renameDocument = async (docId: string, title: string) => {
  const { error } = await getSupabase()
    .from("documents")
    .update({
      title: title.trim() || "Untitled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", docId);

  if (error) {
    throw error;
  }
};

export const deleteDocument = async (docId: string) => {
  const supabase = getSupabase();

  const { data: objects } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(`docs/${docId}`);

  if (objects?.length) {
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove(objects.map((object) => `docs/${docId}/${object.name}`));
  }

  const { error } = await supabase.from("documents").delete().eq("id", docId);

  if (error) {
    throw error;
  }
};

export const setPublicRead = async (docId: string, enabled: boolean) => {
  const { error } = await getSupabase()
    .from("documents")
    .update({ is_public: enabled, updated_at: new Date().toISOString() })
    .eq("id", docId);

  if (error) {
    throw error;
  }
};

export const listInvites = async (): Promise<
  (DocInvite & { title: string })[]
> => {
  const user = await requireUser();
  const email = user.email?.toLowerCase();

  if (!email) {
    return [];
  }

  const { data, error } = await getSupabase()
    .from("doc_invites")
    .select("*")
    .eq("email", email);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    ...row,
    title: row.doc_title ?? "Untitled",
  }));
};

export const inviteMember = async (
  docId: string,
  email: string,
  role: Exclude<DocRole, "owner">,
  docTitle: string,
) => {
  const user = await requireUser();

  const { error } = await getSupabase().from("doc_invites").upsert(
    {
      doc_id: docId,
      doc_title: docTitle,
      email: email.trim().toLowerCase(),
      role,
      invited_by: user.id,
    },
    { onConflict: "doc_id,email" },
  );

  if (error) {
    throw error;
  }
};

export const acceptInvite = async (invite: DocInvite) => {
  const user = await requireUser();
  const email = user.email?.toLowerCase() ?? "";

  const { error } = await getSupabase().from("doc_members").insert({
    doc_id: invite.doc_id,
    user_id: user.id,
    email,
    role: invite.role,
  });

  if (error && error.code !== "23505") {
    throw error;
  }

  await getSupabase().from("doc_invites").delete().eq("id", invite.id);
};

export const acceptInviteById = async (inviteId: string) => {
  const { data, error } = await getSupabase()
    .from("doc_invites")
    .select("*")
    .eq("id", inviteId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    await acceptInvite(data as DocInvite);
  }
};

export const declineInvite = async (inviteId: string) => {
  const { error } = await getSupabase()
    .from("doc_invites")
    .delete()
    .eq("id", inviteId);

  if (error) {
    throw error;
  }
};

export const listMembers = async (docId: string) => {
  const { data, error } = await getSupabase()
    .from("doc_members")
    .select("user_id, email, role")
    .eq("doc_id", docId);

  if (error) {
    throw error;
  }

  return data ?? [];
};

export const removeMember = async (docId: string, userId: string) => {
  const { error } = await getSupabase()
    .from("doc_members")
    .delete()
    .eq("doc_id", docId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
};

export const setMemberRole = async (
  docId: string,
  userId: string,
  role: Exclude<DocRole, "owner">,
) => {
  const { error } = await getSupabase()
    .from("doc_members")
    .update({ role })
    .eq("doc_id", docId)
    .eq("user_id", userId);

  if (error) {
    throw error;
  }
};

export const uploadThumbnail = async (docId: string, png: Blob) => {
  const path = `docs/${docId}/thumb.png`;
  const supabase = getSupabase();

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, png, {
      contentType: "image/png",
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { error: rpcError } = await supabase.rpc("set_doc_thumbnail", {
    p_doc: docId,
    p_path: path,
  });

  if (rpcError) {
    throw rpcError;
  }
};

export const getThumbnailUrl = async (path: string) => {
  const { data } = await getSupabase()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(path, 3600);

  return data?.signedUrl ?? null;
};
