import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import Spinner from "@excalidraw/excalidraw/components/Spinner";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { restoreElements } from "@excalidraw/excalidraw/data/restore";
import { isInitializedImageElement } from "@excalidraw/element";
import { KEYS } from "@excalidraw/common";
import React, { useCallback, useEffect, useState } from "react";

import type { AppState } from "@excalidraw/excalidraw/types";

import { FILE_UPLOAD_MAX_BYTES } from "../../app_constants";
import { useAtomValue, useSetAtom } from "../../app-jotai";
import { signOut, updateDisplayName } from "../../auth/AuthProvider";
import {
  authDialogOpenAtom,
  authStatusAtom,
  authUserAtom,
} from "../../auth/authAtoms";
import { ThemeScope } from "../../components/ThemeScope";
import { getSyncableElements } from "../../data";
import { encodeFilesForUpload } from "../../data/FileManager";
import { LocalData } from "../../data/LocalData";
import {
  importFromLocalStorage,
  saveUsernameToLocalStorage,
} from "../../data/localStorage";
import { saveFiles } from "../../data/remote";
import { deleteCloudDraft } from "../draftStore";
import { useDashboardRealtime } from "../hooks/useDashboardRealtime";
import { navigate } from "../routes";

import {
  acceptInviteById,
  createDocument,
  declineInvite,
  deleteDocument,
  listDocuments,
  listInvites,
  renameDocument,
} from "../documents";

import { DocumentCard } from "./DocumentCard";
import { AppModal } from "./AppModal";

import "./cloud.scss";

import type { CloudDocWithRole, DocInvite } from "../documents";

const errorStyle: React.CSSProperties = {
  background: "var(--color-danger-background, #fff0f0)",
  color: "var(--color-danger-color, #a10000)",
  border: "1px solid var(--color-danger, #e03131)",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.65rem",
  fontSize: "0.85rem",
  margin: 0,
};

const IMPORT_DISMISSED_KEY = "excalidraw-cloud-import-dismissed";

const nameLinkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  marginLeft: "0.35rem",
  color: "var(--link-color, #6965db)",
  cursor: "pointer",
  fontSize: "inherit",
};

export const Dashboard = () => {
  const user = useAtomValue(authUserAtom);
  const authStatus = useAtomValue(authStatusAtom);
  const setAuthDialogOpen = useSetAtom(authDialogOpenAtom);
  const [docs, setDocs] = useState<CloudDocWithRole[]>([]);
  const [invites, setInvites] = useState<(DocInvite & { title: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [localScene, setLocalScene] = useState<ReturnType<
    typeof importFromLocalStorage
  > | null>(null);
  const [renameTarget, setRenameTarget] = useState<CloudDocWithRole | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<CloudDocWithRole | null>(
    null,
  );
  const [dialogBusy, setDialogBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!user) {
      setDocs([]);
      setInvites([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [nextDocs, nextInvites] = await Promise.all([
        listDocuments(),
        listInvites(),
      ]);
      setDocs(nextDocs);
      setInvites(nextInvites);
    } catch (err: any) {
      setError(err?.message || "Failed to load boards");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useDashboardRealtime(user, refresh);

  useEffect(() => {
    if (!user) {
      setLocalScene(null);
      return;
    }

    try {
      if (localStorage.getItem(IMPORT_DISMISSED_KEY) === "1") {
        setLocalScene(null);
        return;
      }
    } catch {
      // ignore localStorage access errors
    }

    const local = importFromLocalStorage();
    const hasElements = local.elements.some((element) => !element.isDeleted);
    setLocalScene(hasElements ? local : null);
  }, [user]);

  const createBoard = async () => {
    if (creating) {
      return;
    }
    setCreating(true);
    setError("");
    try {
      const doc = await createDocument({
        title: "Untitled",
        elements: [],
        appState: {} as AppState,
      });
      navigate(`/d/${doc.id}`);
    } catch (err: any) {
      setError(err?.message || "Failed to create board");
    } finally {
      setCreating(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    try {
      await signOut();
      navigate("/");
    } finally {
      setSigningOut(false);
    }
  };

  const saveName = async () => {
    if (nameBusy) {
      return;
    }
    setNameBusy(true);
    setProfileError("");
    try {
      const updated = await updateDisplayName(nameValue.trim() || null);
      if (updated.displayName) {
        saveUsernameToLocalStorage(updated.displayName);
      }
      setEditingName(false);
    } catch (err: any) {
      setProfileError(err?.message || "Could not update your name");
    } finally {
      setNameBusy(false);
    }
  };

  const importLocalScene = async () => {
    if (!localScene || importing) {
      return;
    }
    setImporting(true);
    setError("");
    try {
      const elements = getSyncableElements(
        restoreElements(localScene.elements, null, {
          repairBindings: true,
          deleteInvisibleElements: true,
        }),
      );
      const appState = (localScene.appState ?? {}) as unknown as AppState;
      const doc = await createDocument({
        title: "Imported drawing",
        elements,
        appState,
      });

      // best-effort copy of locally cached images into the new board
      try {
        const fileIds = elements
          .filter((element) => isInitializedImageElement(element))
          .map((element) => element.fileId);
        if (fileIds.length) {
          const { loadedFiles } = await LocalData.fileStorage.getFiles(fileIds);
          const filesMap = new Map(
            loadedFiles.map((file) => [file.id, file] as const),
          );
          if (filesMap.size) {
            const filesToUpload = await encodeFilesForUpload({
              files: filesMap,
              encryptionKey: doc.room_key,
              maxBytes: FILE_UPLOAD_MAX_BYTES,
            });
            await saveFiles({
              prefix: `docs/${doc.id}`,
              files: filesToUpload,
            });
          }
        }
      } catch (fileError) {
        console.error("Failed to copy local images to the board", fileError);
      }

      try {
        localStorage.setItem(IMPORT_DISMISSED_KEY, "1");
      } catch {
        // ignore
      }
      navigate(`/d/${doc.id}`);
    } catch (err: any) {
      setError(err?.message || "Failed to import your local drawing");
    } finally {
      setImporting(false);
    }
  };

  const dismissLocalScene = () => {
    setLocalScene(null);
    try {
      localStorage.setItem(IMPORT_DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
  };

  const confirmRename = async () => {
    if (!renameTarget || dialogBusy) {
      return;
    }
    setDialogBusy(true);
    setError("");
    try {
      await renameDocument(renameTarget.id, renameValue);
      setRenameTarget(null);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to rename board");
    } finally {
      setDialogBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || dialogBusy) {
      return;
    }
    setDialogBusy(true);
    setError("");
    try {
      await deleteDocument(deleteTarget.id);
      if (user) {
        await deleteCloudDraft(user.id, deleteTarget.id);
      }
      setDeleteTarget(null);
      await refresh();
    } catch (err: any) {
      setError(err?.message || "Failed to delete board");
    } finally {
      setDialogBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <ThemeScope
      className="cloud-dashboard"
      style={{
        minHeight: "100vh",
        padding: "2rem",
        background: "var(--color-surface-low, #ececf4)",
        color: "var(--color-on-surface, #1b1b1f)",
        fontFamily: "var(--ui-font, system-ui)",
      }}
    >
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>{children}</div>
    </ThemeScope>
  );

  if (authStatus === "loading") {
    return shell(
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: "70vh",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.75rem",
        }}
      >
        <Spinner size="2rem" />
        <span style={{ opacity: 0.7 }}>Checking your session...</span>
      </div>,
    );
  }

  if (!user) {
    return shell(
      <div
        style={{
          display: "flex",
          minHeight: "70vh",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "0.75rem",
            width: "100%",
            maxWidth: 420,
            padding: "1.5rem",
            background: "var(--color-surface-lowest, #fff)",
            border: "1px solid var(--color-border-outline-variant, #c5c5d0)",
            borderRadius: "0.75rem",
          }}
        >
          <h1 style={{ margin: 0 }}>Cloud boards</h1>
          <p style={{ margin: 0, opacity: 0.75 }}>
            Sign in to create, sync, and share live boards across devices.
          </p>
          <FilledButton
            size="large"
            fullWidth
            label="Sign in"
            onClick={() => setAuthDialogOpen(true)}
          />
          <FilledButton
            size="large"
            fullWidth
            variant="outlined"
            label="Back to editor"
            onClick={() => navigate("/")}
          />
        </div>
      </div>,
    );
  }

  return shell(
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Cloud boards</h1>
          {editingName ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                gap: "0.5rem",
                flexWrap: "wrap",
                marginTop: "0.4rem",
              }}
            >
              <div style={{ minWidth: 220 }}>
                <TextField
                  label="Your name"
                  value={nameValue}
                  onChange={setNameValue}
                  disabled={nameBusy}
                  autoFocus
                  fullWidth
                  onKeyDown={(event) => event.key === KEYS.ENTER && saveName()}
                />
              </div>
              <FilledButton
                label="Save"
                status={nameBusy ? "loading" : null}
                disabled={nameBusy}
                onClick={saveName}
              />
              <FilledButton
                variant="outlined"
                color="muted"
                label="Cancel"
                disabled={nameBusy}
                onClick={() => {
                  setEditingName(false);
                  setProfileError("");
                }}
              />
            </div>
          ) : (
            <small style={{ opacity: 0.7 }}>
              {user.email}
              <button
                type="button"
                style={nameLinkStyle}
                onClick={() => {
                  setNameValue(user.displayName ?? "");
                  setEditingName(true);
                  setProfileError("");
                }}
              >
                {user.displayName
                  ? `· ${user.displayName} (edit)`
                  : "· Set your name"}
              </button>
            </small>
          )}
          {profileError && (
            <p style={{ ...errorStyle, marginTop: "0.5rem" }}>{profileError}</p>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <FilledButton
            label={creating ? "Creating..." : "New board"}
            status={creating ? "loading" : null}
            disabled={creating || signingOut}
            onClick={createBoard}
          />
          <FilledButton
            variant="outlined"
            color="muted"
            label={signingOut ? "Signing out..." : "Sign out"}
            status={signingOut ? "loading" : null}
            disabled={creating || signingOut}
            onClick={handleSignOut}
          />
        </div>
      </div>

      {localScene && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            background: "var(--color-surface-primary-container, #e0dfff)",
            border: "1px solid var(--color-border-outline-variant, #c5c5d0)",
            borderRadius: "0.5rem",
          }}
        >
          <div>
            <strong>Local drawing found</strong>
            <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
              You have a drawing saved in this browser. Save it to your account?
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <FilledButton
              label="Save to cloud"
              status={importing ? "loading" : null}
              disabled={importing}
              onClick={importLocalScene}
            />
            <FilledButton
              variant="outlined"
              color="muted"
              label="Dismiss"
              disabled={importing}
              onClick={dismissLocalScene}
            />
          </div>
        </div>
      )}

      {error && <p style={errorStyle}>{error}</p>}

      {invites.length > 0 && (
        <section style={{ marginBottom: "2rem" }}>
          <h2>Pending invites</h2>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {invites.map((invite) => (
              <div
                key={invite.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid var(--color-border-outline-variant)",
                  borderRadius: "0.5rem",
                  background: "var(--color-surface-lowest, #fff)",
                }}
              >
                <span style={{ flex: 1, minWidth: 160 }}>
                  <strong>{invite.title}</strong> · {invite.role}
                </span>
                <FilledButton
                  label="Accept"
                  status={inviteBusy === invite.id ? "loading" : null}
                  disabled={!!inviteBusy}
                  onClick={async () => {
                    setInviteBusy(invite.id);
                    setError("");
                    try {
                      await acceptInviteById(invite.id);
                      await refresh();
                    } catch (err: any) {
                      setError(err?.message || "Failed to accept invite");
                    } finally {
                      setInviteBusy(null);
                    }
                  }}
                />
                <FilledButton
                  variant="outlined"
                  color="muted"
                  label="Decline"
                  disabled={!!inviteBusy}
                  onClick={async () => {
                    setInviteBusy(invite.id);
                    setError("");
                    try {
                      await declineInvite(invite.id);
                      await refresh();
                    } catch (err: any) {
                      setError(err?.message || "Failed to decline invite");
                    } finally {
                      setInviteBusy(null);
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.75rem",
          }}
        >
          <h2 style={{ margin: 0 }}>Your boards</h2>
          {loading && docs.length > 0 && (
            <>
              <Spinner size="1em" />
              <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>
                Refreshing...
              </span>
            </>
          )}
        </div>
        {loading && docs.length === 0 ? (
          <div
            className="cloud-card-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "1rem",
            }}
          >
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="cloud-skeleton"
                style={{ height: 220 }}
              />
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div
            style={{
              display: "grid",
              justifyItems: "center",
              gap: "0.6rem",
              padding: "3rem 1rem",
              textAlign: "center",
              background: "var(--color-surface-lowest, #fff)",
              border: "1px dashed var(--color-border-outline-variant, #c5c5d0)",
              borderRadius: "0.75rem",
            }}
          >
            <h3 style={{ margin: 0 }}>No boards yet</h3>
            <p style={{ margin: 0, opacity: 0.7, maxWidth: 360 }}>
              Create your first board to start drawing in the cloud.
            </p>
            <FilledButton
              label={creating ? "Creating..." : "Create a board"}
              status={creating ? "loading" : null}
              disabled={creating}
              onClick={createBoard}
            />
          </div>
        ) : (
          <div
            className="cloud-card-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "1rem",
            }}
          >
            {docs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onOpen={() => navigate(`/d/${doc.id}`)}
                onRename={() => {
                  setRenameTarget(doc);
                  setRenameValue(doc.title);
                }}
                onDelete={() => setDeleteTarget(doc)}
              />
            ))}
          </div>
        )}
      </section>

      {renameTarget && (
        <AppModal
          title="Rename board"
          busy={dialogBusy}
          onClose={() => setRenameTarget(null)}
          footer={
            <>
              <FilledButton
                variant="outlined"
                color="muted"
                label="Cancel"
                disabled={dialogBusy}
                onClick={() => setRenameTarget(null)}
              />
              <FilledButton
                label="Save"
                status={dialogBusy ? "loading" : null}
                disabled={dialogBusy || !renameValue.trim()}
                onClick={confirmRename}
              />
            </>
          }
        >
          <TextField
            label="Title"
            value={renameValue}
            onChange={setRenameValue}
            fullWidth
            autoFocus
            disabled={dialogBusy}
            onKeyDown={(event) => event.key === KEYS.ENTER && confirmRename()}
          />
        </AppModal>
      )}

      {deleteTarget && (
        <AppModal
          title="Delete board"
          busy={dialogBusy}
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <FilledButton
                variant="outlined"
                color="muted"
                label="Cancel"
                disabled={dialogBusy}
                onClick={() => setDeleteTarget(null)}
              />
              <FilledButton
                color="danger"
                label="Delete"
                status={dialogBusy ? "loading" : null}
                disabled={dialogBusy}
                onClick={confirmDelete}
              />
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Delete <strong>{deleteTarget.title}</strong>? This can't be undone.
          </p>
        </AppModal>
      )}
    </>,
  );
};
