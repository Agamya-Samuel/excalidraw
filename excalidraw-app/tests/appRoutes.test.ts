import fs from "fs";
import path from "path";

import { APP_ROUTES } from "../app_routes";

describe("app routes", () => {
  it("should rewrite every app route to the app in vercel.json (cloud routes are extra)", () => {
    const vercelConfig: {
      rewrites?: { source: string; destination: string }[];
    } = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"),
    );

    const rewrittenToApp = (vercelConfig.rewrites ?? [])
      .filter((rewrite) => rewrite.destination === "/index.html")
      .map((rewrite) => rewrite.source);

    // Cloud workspace routes (/dashboard, /d/:path*) are additional rewrites
    // owned by this fork, so they are allowed but not required by APP_ROUTES.
    expect(rewrittenToApp).toEqual(
      expect.arrayContaining(Object.values(APP_ROUTES)),
    );
  });
});
