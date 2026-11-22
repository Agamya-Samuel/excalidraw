import Spinner from "@excalidraw/excalidraw/components/Spinner";
import React from "react";

export const LoadingOverlay = ({
  label,
  zIndex = 500,
}: {
  label?: string;
  zIndex?: number;
}) => (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.75rem",
      background: "var(--color-surface-low, #ececf4)",
      color: "var(--color-on-surface, #1b1b1f)",
      fontFamily: "var(--ui-font, system-ui)",
    }}
  >
    <Spinner size="2rem" />
    {label && <span style={{ fontSize: "0.9rem", opacity: 0.7 }}>{label}</span>}
  </div>
);
