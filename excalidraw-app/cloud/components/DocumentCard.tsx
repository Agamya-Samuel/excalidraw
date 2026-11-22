import { FilledButton } from "@excalidraw/excalidraw/components/FilledButton";
import React, { useEffect, useState } from "react";

import { getThumbnailUrl } from "../documents";

import type { CloudDocWithRole } from "../documents";

const formatDate = (value: string) => {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export const DocumentCard = ({
  doc,
  onOpen,
  onDelete,
  onRename,
}: {
  doc: CloudDocWithRole;
  onOpen: () => void;
  onDelete: () => void;
  onRename: () => void;
}) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [thumbnailLoading, setThumbnailLoading] = useState(
    !!doc.thumbnail_path,
  );

  useEffect(() => {
    let active = true;
    setThumbnailUrl(null);
    setThumbnailLoading(!!doc.thumbnail_path);

    if (!doc.thumbnail_path) {
      setThumbnailLoading(false);
      return;
    }

    getThumbnailUrl(doc.thumbnail_path)
      .then((url) => {
        if (active) {
          setThumbnailUrl(url);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) {
          setThumbnailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [doc.thumbnail_path]);

  return (
    <div
      data-doc-id={doc.id}
      style={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--color-border-outline-variant, #c5c5d0)",
        borderRadius: "0.5rem",
        overflow: "hidden",
        background: "var(--color-surface-lowest, #fff)",
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        style={{
          height: 140,
          border: "none",
          padding: 0,
          cursor: "pointer",
          background: "var(--color-surface-mid)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
        title={doc.title}
      >
        {thumbnailLoading ? (
          <div
            className="cloud-skeleton"
            style={{ width: "100%", height: "100%" }}
          />
        ) : thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            aria-hidden="true"
            style={{
              fontSize: "2.5rem",
              fontWeight: 700,
              opacity: 0.18,
              userSelect: "none",
            }}
          >
            {doc.title.slice(0, 1).toUpperCase()}
          </span>
        )}
      </button>

      <div
        style={{
          padding: "0.6rem",
          display: "grid",
          gap: "0.25rem",
          minWidth: 0,
        }}
      >
        <strong
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={doc.title}
        >
          {doc.title}
        </strong>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <small
            style={{
              opacity: 0.7,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {formatDate(doc.updated_at)}
          </small>
          <span
            style={{
              flex: "0 0 auto",
              fontSize: "0.68rem",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              padding: "0.1rem 0.4rem",
              borderRadius: "999px",
              background: "var(--color-surface-high, #f1f0ff)",
            }}
          >
            {doc.role}
          </span>
        </div>
        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            marginTop: "0.25rem",
            flexWrap: "wrap",
          }}
        >
          <FilledButton label="Open" onClick={onOpen} />
          {doc.role === "owner" && (
            <>
              <FilledButton
                variant="outlined"
                color="muted"
                label="Rename"
                onClick={onRename}
              />
              <FilledButton
                variant="outlined"
                color="danger"
                label="Delete"
                onClick={onDelete}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
