import Spinner from "@excalidraw/excalidraw/components/Spinner";
import { Footer } from "@excalidraw/excalidraw/index";
import React from "react";

import { isExcalidrawPlusSignedUser } from "../app_constants";
import { useAtomValue } from "../app-jotai";
import { authStatusAtom } from "../auth/authAtoms";
import { activeDocAtom, cloudSaveStatusAtom } from "../cloud/cloudAtoms";
import { isCloudEnabled } from "../lib/supabase";

import { DebugFooter, isVisualDebuggerEnabled } from "./DebugCanvas";
import { EncryptedIcon } from "./EncryptedIcon";

export const AppFooter = React.memo(
  ({ onChange }: { onChange: () => void }) => {
    const authStatus = useAtomValue(authStatusAtom);
    const activeDoc = useAtomValue(activeDocAtom);
    const saveStatus = useAtomValue(cloudSaveStatusAtom);

    const isSignedIn = isCloudEnabled()
      ? authStatus === "authenticated"
      : isExcalidrawPlusSignedUser;

    return (
      <Footer>
        <div
          style={{
            display: "flex",
            gap: ".5rem",
            alignItems: "center",
          }}
        >
          {activeDoc && saveStatus !== "idle" && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.75rem",
                opacity: 0.85,
                color:
                  saveStatus === "error"
                    ? "var(--color-danger, #e03131)"
                    : undefined,
              }}
            >
              {saveStatus === "saving" && <Spinner size="0.9em" />}
              {saveStatus === "saving"
                ? "Saving..."
                : saveStatus === "saved"
                ? "Saved to cloud"
                : "Save failed"}
            </span>
          )}
          {isVisualDebuggerEnabled() && <DebugFooter onChange={onChange} />}
          {!isSignedIn && <EncryptedIcon />}
        </div>
      </Footer>
    );
  },
);
