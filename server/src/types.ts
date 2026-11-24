export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOwner: boolean;
};

export type DocRole = "owner" | "editor" | "viewer";

export type PublicAccess = "private" | "view" | "edit";
