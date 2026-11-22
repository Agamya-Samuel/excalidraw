import { beforeEach, describe, expect, it } from "vitest";

import {
  getDocIdFromPath,
  getPublicViewData,
  getPublicViewLink,
  isDashboardPath,
} from "../cloud/routes";

const setUrl = (url: string) => {
  window.history.replaceState({}, "", url);
};

describe("cloud routes", () => {
  beforeEach(() => {
    setUrl("/");
  });

  it("parses a document path", () => {
    setUrl("/d/8f14e45f-ceea-467a-9c4a-1b2c3d4e5f60");
    expect(getDocIdFromPath()).toBe("8f14e45f-ceea-467a-9c4a-1b2c3d4e5f60");
  });

  it("ignores non-document paths", () => {
    setUrl("/");
    expect(getDocIdFromPath()).toBeNull();

    setUrl("/dashboard");
    expect(getDocIdFromPath()).toBeNull();

    setUrl("/d/not/a/doc");
    expect(getDocIdFromPath()).toBeNull();
  });

  it("detects the dashboard path", () => {
    setUrl("/dashboard");
    expect(isDashboardPath()).toBe(true);

    setUrl("/");
    expect(isDashboardPath()).toBe(false);
  });

  it("parses the public view hash", () => {
    setUrl("/#view=8f14e45f-ceea-467a-9c4a-1b2c3d4e5f60,abcDEF123");
    expect(getPublicViewData()).toEqual({
      docId: "8f14e45f-ceea-467a-9c4a-1b2c3d4e5f60",
      key: "abcDEF123",
    });
  });

  it("ignores malformed public view hashes", () => {
    setUrl("/#view=missing-key");
    expect(getPublicViewData()).toBeNull();

    setUrl("/#room=abc,def");
    expect(getPublicViewData()).toBeNull();
  });

  it("keeps the key in the fragment of the public link", () => {
    setUrl("/");
    const link = getPublicViewLink("doc-1", "key-1");
    expect(link).toContain("/#view=doc-1,key-1");
    expect(link.includes("?")).toBe(false);
  });
});
