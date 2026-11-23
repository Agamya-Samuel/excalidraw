import { describe, expect, it } from "vitest";

import type { OrderedExcalidrawElement } from "@excalidraw/element/types";

import { isCloudDraftRedundant } from "../cloud/draftStore";

import type { CloudDraft } from "../cloud/draftStore";

const element = (index: number, version: number) =>
  ({
    id: `element-${index}`,
    version,
    versionNonce: version,
  } as OrderedExcalidrawElement);

const makeDraft = (versions: number[]): CloudDraft =>
  ({
    userId: "user-1",
    docId: "doc-1",
    elements: versions.map(element),
    appState: {},
    baseVersion: null,
    updatedAt: 0,
  } as unknown as CloudDraft);

const serverElements = (versions: number[]) => versions.map(element);

describe("isCloudDraftRedundant", () => {
  it("treats a draft that matches the cloud scene as redundant", () => {
    expect(
      isCloudDraftRedundant(makeDraft([1, 2, 3]), serverElements([1, 2, 3])),
    ).toBe(true);
  });

  it("keeps a draft with newer element versions", () => {
    expect(
      isCloudDraftRedundant(makeDraft([1, 2, 4]), serverElements([1, 2, 3])),
    ).toBe(false);
  });

  it("keeps a draft when elements were added or removed", () => {
    expect(
      isCloudDraftRedundant(makeDraft([1, 2, 3, 4]), serverElements([1, 2, 3])),
    ).toBe(false);
    expect(
      isCloudDraftRedundant(makeDraft([1, 2]), serverElements([1, 2, 3])),
    ).toBe(false);
  });
});
