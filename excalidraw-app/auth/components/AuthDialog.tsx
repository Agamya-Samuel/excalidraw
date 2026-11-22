import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { TextField } from "@excalidraw/excalidraw/components/TextField";
import { KEYS } from "@excalidraw/common";
import React, { useEffect, useState } from "react";

import { useAtom } from "../../app-jotai";
import { ThemeScope } from "../../components/ThemeScope";

import {
  resendConfirmationEmail,
  sendPasswordReset,
  signInWithEmail,
  signInWithOAuth,
  signUpWithEmail,
} from "../AuthProvider";
import { authDialogOpenAtom } from "../authAtoms";

type Mode = "signin" | "signup" | "reset";

const titles: Record<Mode, string> = {
  signin: "Welcome back",
  signup: "Create your account",
  reset: "Reset your password",
};

const subtitles: Record<Mode, string> = {
  signin: "Sign in to sync your boards across devices.",
  signup: "Save your boards, share them, and collaborate live.",
  reset: "We'll email you a link to choose a new password.",
};

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

export const AuthDialog = () => {
  const [open, setOpen] = useAtom(authDialogOpenAtom);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<null | "google" | "github">(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<null | {
    kind: "confirm" | "reset";
    email: string;
  }>(null);
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);

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

  useEffect(() => {
    if (!sent || resendIn <= 0) {
      return;
    }
    const timer = setTimeout(() => {
      setResendIn((value) => Math.max(0, value - 1));
    }, 1000);
    return () => clearTimeout(timer);
  }, [sent, resendIn]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setSent(null);
    setResendIn(0);
  };

  const canSubmit =
    email.includes("@") && (mode === "reset" || password.length >= 6);

  const submit = async () => {
    if (busy || !canSubmit) {
      return;
    }
    setBusy(true);
    setError("");

    try {
      if (mode === "signin") {
        await signInWithEmail(email, password);
        setOpen(false);
      } else if (mode === "signup") {
        const data = await signUpWithEmail(email, password);
        if (data.session) {
          setOpen(false);
        } else {
          setSent({ kind: "confirm", email });
          setResendIn(60);
        }
      } else {
        await sendPasswordReset(email);
        setSent({ kind: "reset", email });
        setResendIn(60);
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!sent || resendIn > 0 || resending) {
      return;
    }
    setResending(true);
    setError("");
    try {
      if (sent.kind === "confirm") {
        await resendConfirmationEmail(sent.email);
      } else {
        await sendPasswordReset(sent.email);
      }
      setResendIn(60);
    } catch (err: any) {
      setError(err?.message || "Could not resend the email");
    } finally {
      setResending(false);
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
          if (event.target === event.currentTarget && !resending) {
            close();
          }
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(12, 12, 14, 0.45)",
          backdropFilter: "blur(2px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}
      >
        <ThemeScope
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => event.stopPropagation()}
          style={{
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
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
              {sent.kind === "confirm" ? "Check your email" : "Reset link sent"}
            </h2>
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
            We sent a{" "}
            {sent.kind === "confirm"
              ? "confirmation link"
              : "password reset link"}{" "}
            to <strong>{sent.email}</strong>. Open it to continue.
          </p>

          {error && <div style={messageStyle("error")}>{error}</div>}

          <FilledButton
            fullWidth
            label={
              resendIn > 0
                ? `Resend in ${resendIn}s`
                : sent.kind === "confirm"
                ? "Resend confirmation email"
                : "Resend reset link"
            }
            status={resending ? "loading" : null}
            disabled={resending || resendIn > 0}
            onClick={resend}
          />

          <FilledButton
            fullWidth
            variant="outlined"
            color="muted"
            label="Back to sign in"
            onClick={() => {
              setSent(null);
              setResendIn(0);
              switchMode("signin");
            }}
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
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(12, 12, 14, 0.45)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <ThemeScope
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
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
        }}
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
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{titles[mode]}</h2>
            <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>
              {subtitles[mode]}
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

        {mode !== "reset" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.4rem",
            }}
          >
            <FilledButton
              fullWidth
              label="Sign in"
              variant={mode === "signin" ? "filled" : "outlined"}
              disabled={busy || !!oauthBusy}
              onClick={() => switchMode("signin")}
            />
            <FilledButton
              fullWidth
              label="Sign up"
              variant={mode === "signup" ? "filled" : "outlined"}
              disabled={busy || !!oauthBusy}
              onClick={() => switchMode("signup")}
            />
          </div>
        )}

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

        {mode !== "reset" && (
          <TextField
            label="Password"
            type="password"
            name="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            disabled={busy || !!oauthBusy}
            value={password}
            onChange={setPassword}
            fullWidth
            onKeyDown={(event) => event.key === KEYS.ENTER && submit()}
          />
        )}

        {mode === "signin" && (
          <button
            type="button"
            style={linkStyle}
            onClick={() => switchMode("reset")}
          >
            Forgot password?
          </button>
        )}

        {mode === "reset" && (
          <button
            type="button"
            style={linkStyle}
            onClick={() => switchMode("signin")}
          >
            Back to sign in
          </button>
        )}

        {error && <div style={messageStyle("error")}>{error}</div>}

        <FilledButton
          size="large"
          fullWidth
          label={
            busy
              ? "Please wait..."
              : mode === "signin"
              ? "Sign in"
              : mode === "signup"
              ? "Create account"
              : "Send reset link"
          }
          status={busy ? "loading" : null}
          disabled={busy || !!oauthBusy || !canSubmit}
          onClick={submit}
        />

        {mode !== "reset" && (
          <>
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
                  signInWithOAuth("google")
                    .catch((err) =>
                      setError(err?.message || "OAuth sign-in failed"),
                    )
                    .finally(() => setOauthBusy(null));
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
                  signInWithOAuth("github")
                    .catch((err) =>
                      setError(err?.message || "OAuth sign-in failed"),
                    )
                    .finally(() => setOauthBusy(null));
                }}
              />
            </div>
          </>
        )}
      </ThemeScope>
    </div>
  );
};
