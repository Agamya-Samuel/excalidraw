import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { useEffect } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useAtomValue } from "../../app-jotai";
import { activeDocAtom } from "../cloudAtoms";
import { subscribeDocScene } from "../docScene";

export const useCloudDocLiveSync = (
  excalidrawAPI: ExcalidrawImperativeAPI | null,
) => {
  const activeDoc = useAtomValue(activeDocAtom);

  useEffect(() => {
    if (!excalidrawAPI || !activeDoc) {
      return;
    }

    // owner/editor sessions persist and broadcast through the collab socket
    if (activeDoc.role === "owner" || activeDoc.role === "editor") {
      return;
    }

    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    subscribeDocScene(activeDoc.docId, activeDoc.roomKey, (elements) => {
      excalidrawAPI.updateScene({
        elements,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }).then((cleanup) => {
      if (cancelled) {
        cleanup();
      } else {
        unsubscribe = cleanup;
      }
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [activeDoc, excalidrawAPI]);
};
