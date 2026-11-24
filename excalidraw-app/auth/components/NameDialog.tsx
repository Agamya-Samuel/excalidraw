import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { KEYS } from "@excalidraw/common";
import React, { useEffect, useState } from "react";

import { useAtom, useAtomValue } from "../../app-jotai";
import { collabAPIAtom } from "../../collab/Collab";
import { ThemeScope } from "../../components/ThemeScope";
import {
  importUsernameFromLocalStorage,
  saveUsernameToLocalStorage,
} from "../../data/localStorage";

import { updateDisplayName } from "../AuthProvider";
import { authUserAtom, nameDialogOpenAtom } from "../authAtoms";

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(12, 12, 14, 0.45)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
};

const dialogStyle: React.CSSProperties = {
  width: "min(92vw, 400px)",
  background: "var(--color-surface-lowest, #fff)",
  color: "var(--color-on-surface, #1b1b1f)",
  border: "1px solid var(--color-border-outline-variant, #c5c5d0)",
  borderRadius: "0.75rem",
  padding: "1.25rem",
  display: "grid",
  gap: "0.9rem",
  boxShadow: "0 18px 50px rgba(0, 0, 0, 0.28)",
  fontFamily: "var(--ui-font, system-ui)",
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

const errorStyle: React.CSSProperties = {
  background: "var(--color-danger-background, #fff0f0)",
  color: "var(--color-danger-color, #a10000)",
  border: "1px solid var(--color-danger, #e03131)",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.65rem",
  fontSize: "0.85rem",
};

export const NameDialog = () => {
  const [open, setOpen] = useAtom(nameDialogOpenAtom);
  const user = useAtomValue(authUserAtom);
  const collabAPI = useAtomValue(collabAPIAtom);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setName(
      user?.displayName ||
        collabAPI?.getUsername() ||
        importUsernameFromLocalStorage() ||
        "",
    );
    setError("");
  }, [open, user, collabAPI]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYS.ESCAPE) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  const close = () => {
    if (!busy) {
      setOpen(false);
    }
  };

  const save = async () => {
    if (busy) {
      return;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a name");
      return;
    }
    if (trimmed.length > 80) {
      setError("Name must be 80 characters or fewer");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (user) {
        await updateDisplayName(trimmed);
      } else {
        saveUsernameToLocalStorage(trimmed);
      }
      collabAPI?.setUsername(trimmed);
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || "Could not update your name");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close();
        }
      }}
      style={overlayStyle}
    >
      <ThemeScope
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        style={dialogStyle}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div style={{ display: "grid", gap: "0.2rem" }}>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
              {user ? "Profile name" : "Your name"}
            </h2>
            <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
              {user
                ? "This name is used on your boards and in live collaboration."
                : "This name is shown to other people in live collaboration."}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            disabled={busy}
            style={closeStyle}
          >
            ×
          </button>
        </div>

        <TextField
          label="Your name"
          value={name}
          onChange={setName}
          autoFocus
          fullWidth
          disabled={busy}
          onKeyDown={(event) => event.key === KEYS.ENTER && save()}
        />

        {error && <div style={errorStyle}>{error}</div>}

        <div
          style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}
        >
          <FilledButton
            variant="outlined"
            color="muted"
            label="Cancel"
            disabled={busy}
            onClick={close}
          />
          <FilledButton
            label="Save"
            status={busy ? "loading" : null}
            disabled={busy || !name.trim()}
            onClick={save}
          />
        </div>
      </ThemeScope>
    </div>
  );
};
