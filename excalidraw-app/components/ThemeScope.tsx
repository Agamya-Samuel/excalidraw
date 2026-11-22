import clsx from "clsx";
import React from "react";

import { useResolvedTheme } from "../hooks/useResolvedTheme";

// .excalidraw scopes the theme variables *and* the component styles
// (TextField, FilledButton). We reuse it for theming, then neutralize the
// layout/user-select rules so it can wrap a modal or a page.
const baseStyle: React.CSSProperties = {
  position: "relative",
  display: "block",
  width: "auto",
  height: "auto",
  overflow: "visible",
  userSelect: "text",
};

export const ThemeScope = ({
  children,
  className,
  style,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
}) => {
  const theme = useResolvedTheme();

  return (
    <div
      {...rest}
      className={clsx(
        "excalidraw",
        theme === "dark" && "theme--dark",
        className,
      )}
      style={{ ...baseStyle, ...style }}
    >
      {children}
    </div>
  );
};
