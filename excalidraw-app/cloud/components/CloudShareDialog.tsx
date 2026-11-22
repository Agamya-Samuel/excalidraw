import { copyTextToSystemClipboard } from "@excalidraw/excalidraw/clipboard";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import React, { useEffect, useState } from "react";

import { getDocLink, getPublicViewLink } from "../routes";

import {
  getDocument,
  inviteMember,
  listMembers,
  removeMember,
  setMemberRole,
  setPublicRead,
} from "../documents";

import "./cloud.scss";

import type { ActiveDoc } from "../cloudAtoms";
import type { CloudDocWithRole } from "../documents";

type Member = { user_id: string; email: string; role: string };

const selectStyle: React.CSSProperties = {
  background: "var(--input-bg-color, #fff)",
  color: "var(--color-on-surface, #1b1b1f)",
  border: "1px solid var(--input-border-color, #c5c5d0)",
  borderRadius: "0.375rem",
  padding: "0 0.5rem",
  minHeight: "2.25rem",
  fontSize: "0.85rem",
};

const closeStyle: React.CSSProperties = {
  width: "2rem",
  height: "2rem",
  flex: "0 0 auto",
  borderRadius: "0.5rem",
  border: "1px solid var(--color-border-outline-variant, #c5c5d0)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  fontSize: "1.1rem",
  lineHeight: 1,
};

const alertStyle = (kind: "error" | "notice"): React.CSSProperties =>
  kind === "error"
    ? {
        background: "var(--color-danger-background, #fff0f0)",
        color: "var(--color-danger-color, #a10000)",
        border: "1px solid var(--color-danger, #e03131)",
        borderRadius: "0.5rem",
        padding: "0.5rem 0.65rem",
        fontSize: "0.85rem",
      }
    : {
        background: "var(--color-success-background, #ecfdf3)",
        color: "var(--color-success-color, #067647)",
        border: "1px solid var(--color-success, #12b76a)",
        borderRadius: "0.5rem",
        padding: "0.5rem 0.65rem",
        fontSize: "0.85rem",
      };

export const CloudShareDialog = ({
  doc,
  handleClose,
}: {
  doc: ActiveDoc;
  handleClose: () => void;
}) => {
  const [meta, setMeta] = useState<CloudDocWithRole | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const isOwner = doc.role === "owner";

  const refresh = async () => {
    const [nextMeta, nextMembers] = await Promise.all([
      getDocument(doc.docId),
      listMembers(doc.docId),
    ]);
    setMeta(nextMeta);
    setMembers(nextMembers as Member[]);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    refresh()
      .catch((err: any) => {
        if (active) {
          setError(err?.message || "Failed to load sharing info");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.docId]);

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy || loading) {
      return;
    }
    setBusy(key);
    setError("");
    try {
      await action();
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await copyTextToSystemClipboard(value);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setError("Could not copy to clipboard");
    }
  };

  const publicLink = getPublicViewLink(doc.docId, doc.roomKey);
  const isBusy = !!busy || loading;

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <h3 style={{ margin: 0 }}>{meta?.title ?? "Board"}</h3>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          style={closeStyle}
        >
          ×
        </button>
      </div>

      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div>
          <strong>Link to this board</strong>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <TextField
              label="Signed-in members only"
              readonly
              fullWidth
              value={getDocLink(doc.docId)}
            />
            <FilledButton
              label="Copy"
              onClick={() => copy(getDocLink(doc.docId), "board")}
            />
          </div>
        </div>

        {isOwner && (
          <div>
            <strong>Invite by email</strong>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <TextField
                  label="Email"
                  type="email"
                  fullWidth
                  value={email}
                  onChange={setEmail}
                  disabled={isBusy}
                  placeholder="person@example.com"
                />
              </div>
              <select
                value={role}
                disabled={isBusy}
                style={selectStyle}
                onChange={(event) =>
                  setRole(event.target.value as "editor" | "viewer")
                }
              >
                <option value="editor">Can edit</option>
                <option value="viewer">Can view</option>
              </select>
              <FilledButton
                label="Invite"
                status={busy === "invite" ? "loading" : null}
                disabled={isBusy || !email.trim()}
                onClick={() =>
                  run("invite", async () => {
                    await inviteMember(
                      doc.docId,
                      email,
                      role,
                      meta?.title ?? "Untitled",
                    );
                    setEmail("");
                    await refresh();
                  })
                }
              />
            </div>
            <small style={{ opacity: 0.7 }}>
              Invitees see a pending invite on their dashboard after signing in
              with this email.
            </small>
          </div>
        )}

        <div>
          <strong>People with access</strong>
          <div
            style={{
              display: "grid",
              gap: "0.35rem",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {meta?.owner_email ?? "Owner"}
              </span>
              <span style={{ opacity: 0.7, fontSize: "0.85rem" }}>owner</span>
            </div>

            {loading ? (
              <>
                <div
                  className="cloud-skeleton"
                  style={{ height: 30, width: "100%" }}
                />
                <div
                  className="cloud-skeleton"
                  style={{ height: 30, width: "100%" }}
                />
              </>
            ) : members.length === 0 ? (
              <small style={{ opacity: 0.7 }}>
                Only you have access to this board.
              </small>
            ) : (
              members.map((member) => (
                <div
                  key={member.user_id}
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={member.email}
                  >
                    {member.email}
                  </span>
                  {isOwner ? (
                    <>
                      <select
                        value={member.role}
                        disabled={isBusy}
                        style={selectStyle}
                        onChange={(event) =>
                          run(`member-${member.user_id}`, async () => {
                            await setMemberRole(
                              doc.docId,
                              member.user_id,
                              event.target.value as "editor" | "viewer",
                            );
                            await refresh();
                          })
                        }
                      >
                        <option value="editor">Can edit</option>
                        <option value="viewer">Can view</option>
                      </select>
                      <FilledButton
                        variant="outlined"
                        color="danger"
                        label="Remove"
                        status={
                          busy === `member-${member.user_id}` ? "loading" : null
                        }
                        disabled={isBusy}
                        onClick={() =>
                          run(`member-${member.user_id}`, async () => {
                            await removeMember(doc.docId, member.user_id);
                            await refresh();
                          })
                        }
                      />
                    </>
                  ) : (
                    <span style={{ opacity: 0.7 }}>{member.role}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {isOwner && (
          <div>
            <strong>Public read-only link</strong>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <FilledButton
                label={
                  meta?.is_public ? "Disable public link" : "Enable public link"
                }
                status={busy === "public" ? "loading" : null}
                disabled={isBusy}
                onClick={() =>
                  run("public", async () => {
                    await setPublicRead(doc.docId, !meta?.is_public);
                    await refresh();
                  })
                }
              />
            </div>
            {meta?.is_public && (
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "flex-end",
                  marginTop: "0.4rem",
                }}
              >
                <TextField
                  label="Anyone with this link can view"
                  readonly
                  fullWidth
                  value={publicLink}
                />
                <FilledButton
                  label="Copy"
                  disabled={isBusy}
                  onClick={() => copy(publicLink, "public")}
                />
              </div>
            )}
            <small style={{ opacity: 0.7 }}>
              The decryption key stays in the URL fragment and never reaches the
              server.
            </small>
          </div>
        )}

        {copied && <div style={alertStyle("notice")}>Copied {copied} link</div>}
        {error && <div style={alertStyle("error")}>{error}</div>}
      </div>
    </>
  );
};
