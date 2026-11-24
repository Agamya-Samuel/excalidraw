import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { KEYS } from "@excalidraw/common";
import React, { useEffect, useState } from "react";

import { useAtom } from "../../app-jotai";
import { ThemeScope } from "../../components/ThemeScope";

import {
  sendMagicLink,
  signInWithEmail,
  signInWithOAuth,
} from "../AuthProvider";
import { authDialogOpenAtom } from "../authAtoms";

const linkStyle: React.CSSProperties = {
  justifySelf: "start",
  background: "none",
  border: "none",
  padding: 0,
  color: "var(--link-color, #6965db)",
  cursor: "pointer",
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

const messageStyle = (kind: "error" | "notice"): React.CSSProperties =>
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

const dialogStyle: React.CSSProperties = {
  width: "min(92vw, 400px)",
  maxHeight: "calc(100vh - 2rem)",
  overflowY: "auto",
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

export const AuthDialog = () => {
  const [open, setOpen] = useAtom(authDialogOpenAtom);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<null | "google" | "github">(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const close = () => setOpen(false);

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

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const canSubmit = email.includes("@") && password.length >= 1;

  const submit = async () => {
    if (busy || !canSubmit) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await signInWithEmail(email, password);
      setOpen(false);
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const requestMagicLink = async () => {
    if (busy || !email.includes("@")) {
      setError("Enter your email first");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendMagicLink(email);
      setSent(true);
    } catch (err: any) {
      setError(err?.message || "Could not send the sign-in link");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return null;
  }

  if (sent) {
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
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Check your email</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              style={closeStyle}
            >
              ×
            </button>
          </div>
          <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
            If <strong>{email}</strong> has access, we sent it a one-time
            sign-in link. It expires in 30 minutes.
          </p>
          <FilledButton
            fullWidth
            variant="outlined"
            color="muted"
            label="Back to sign in"
            onClick={() => setSent(false)}
          />
        </ThemeScope>
      </div>
    );
  }

  return (
    <div
      role="presentation"
      onMouseDown={() => {
        if (!busy && !oauthBusy) {
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
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>Welcome back</h2>
            <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
              Sign in to sync your boards across devices.
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            disabled={busy || !!oauthBusy}
            style={closeStyle}
          >
            ×
          </button>
        </div>

        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          autoFocus
          disabled={busy || !!oauthBusy}
          value={email}
          onChange={setEmail}
          fullWidth
          onKeyDown={(event) => event.key === KEYS.ENTER && submit()}
        />

        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          disabled={busy || !!oauthBusy}
          value={password}
          onChange={setPassword}
          fullWidth
          onKeyDown={(event) => event.key === KEYS.ENTER && submit()}
        />

        <button type="button" style={linkStyle} onClick={requestMagicLink}>
          Email me a sign-in link instead
        </button>

        {error && <div style={messageStyle("error")}>{error}</div>}

        <FilledButton
          size="large"
          fullWidth
          label={busy ? "Please wait..." : "Sign in"}
          status={busy ? "loading" : null}
          disabled={busy || !!oauthBusy || !canSubmit}
          onClick={submit}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            opacity: 0.65,
            fontSize: "0.8rem",
          }}
        >
          <div
            style={{
              flex: 1,
              height: 1,
              background: "var(--color-border-outline-variant, #c5c5d0)",
            }}
          />
          <span>or continue with</span>
          <div
            style={{
              flex: 1,
              height: 1,
              background: "var(--color-border-outline-variant, #c5c5d0)",
            }}
          />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.5rem",
          }}
        >
          <FilledButton
            size="large"
            fullWidth
            variant="outlined"
            label={oauthBusy === "google" ? "Redirecting..." : "Google"}
            status={oauthBusy === "google" ? "loading" : null}
            disabled={busy || !!oauthBusy}
            onClick={() => {
              setError("");
              setOauthBusy("google");
              signInWithOAuth("google").catch((err) => {
                setError(err?.message || "OAuth sign-in failed");
                setOauthBusy(null);
              });
            }}
          />
          <FilledButton
            size="large"
            fullWidth
            variant="outlined"
            label={oauthBusy === "github" ? "Redirecting..." : "GitHub"}
            status={oauthBusy === "github" ? "loading" : null}
            disabled={busy || !!oauthBusy}
            onClick={() => {
              setError("");
              setOauthBusy("github");
              signInWithOAuth("github").catch((err) => {
                setError(err?.message || "OAuth sign-in failed");
                setOauthBusy(null);
              });
            }}
          />
        </div>

        <div
          style={{
            ...messageStyle("notice"),
            background: "none",
            border: "none",
            padding: 0,
            color: "inherit",
            opacity: 0.7,
          }}
        >
          Accounts are invite-only. Ask the owner for an invite.
        </div>
      </ThemeScope>
    </div>
  );
};
