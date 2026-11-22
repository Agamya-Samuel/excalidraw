import { CaptureUpdateAction, reconcileElements } from "@excalidraw/excalidraw";
import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import { restoreAppState } from "@excalidraw/excalidraw/data/restore";
import React, { useState } from "react";

import type { RemoteExcalidrawElement } from "@excalidraw/excalidraw/data/reconcile";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { useSetAtom } from "../../app-jotai";
import { getSyncableElements } from "../../data";
import { pendingDraftAtom } from "../cloudAtoms";
import { deleteCloudDraft, putCloudDraft } from "../draftStore";

import { AppModal } from "./AppModal";

import type { PendingDraft } from "../cloudAtoms";

export const DraftRestoreDialog = ({
  pending,
  excalidrawAPI,
  onMerge,
}: {
  pending: PendingDraft;
  excalidrawAPI: ExcalidrawImperativeAPI;
  onMerge: (elements: ReturnType<typeof getSyncableElements>) => void;
}) => {
  const setPendingDraft = useSetAtom(pendingDraftAtom);
  const [busy, setBusy] = useState<null | "merge" | "discard">(null);
  const { draft, serverElements } = pending;

  const close = () => setPendingDraft(null);

  const merge = async () => {
    if (busy) {
      return;
    }
    setBusy("merge");
    try {
      // merge against the persisted server scene, not the live canvas (which
      // may still be initializing or have transient socket state)
      const reconciled = reconcileElements(
        draft.elements as unknown as RemoteExcalidrawElement[],
        serverElements as unknown as RemoteExcalidrawElement[],
        excalidrawAPI.getAppState(),
      );
      const syncable = getSyncableElements(reconciled);

      excalidrawAPI.updateScene({
        elements: reconciled,
        appState: restoreAppState(draft.appState, excalidrawAPI.getAppState()),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });

      // keep the draft until a save succeeds; Collab clears it on success
      await putCloudDraft({
        ...draft,
        elements: syncable,
        updatedAt: Date.now(),
      });
      onMerge(syncable);
      close();
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (busy) {
      return;
    }
    setBusy("discard");
    try {
      await deleteCloudDraft(draft.userId, draft.docId);
      close();
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppModal
      title="Unsaved changes found"
      busy={!!busy}
      onClose={close}
      footer={
        <>
          <FilledButton
            variant="outlined"
            color="muted"
            label="Discard"
            status={busy === "discard" ? "loading" : null}
            disabled={!!busy}
            onClick={discard}
          />
          <FilledButton
            label="Merge changes"
            status={busy === "merge" ? "loading" : null}
            disabled={!!busy}
            onClick={merge}
          />
        </>
      }
    >
      <p style={{ margin: 0, fontSize: "0.9rem", lineHeight: 1.5 }}>
        This board has changes saved in this browser that haven't reached the
        cloud yet. Merge them into the current board, or discard them and keep
        the cloud version.
      </p>
    </AppModal>
  );
};
