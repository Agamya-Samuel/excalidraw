import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { KEYS } from "@excalidraw/common";
import React, { useEffect } from "react";

import { ThemeScope } from "../../components/ThemeScope";

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

export const AppModal = ({
  title,
  onClose,
  children,
  footer,
  busy,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
}) => {
  useEffect(() => {
    if (busy) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === KEYS.ESCAPE) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  return (
    <div
      role="presentation"
      onMouseDown={() => {
        if (!busy) {
          onClose();
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
          width: "min(92vw, 420px)",
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
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
            style={closeStyle}
          >
            ×
          </button>
        </div>
        {children}
        {footer && (
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            {footer}
          </div>
        )}
      </ThemeScope>
    </div>
  );
};

export const AppModalActions = {
  Cancel: ({
    onClick,
    disabled,
  }: {
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <FilledButton
      variant="outlined"
      color="muted"
      label="Cancel"
      disabled={disabled}
      onClick={onClick}
    />
  ),
};
