// Generates worker/.wrangler-e2e.toml: an exact copy of wrangler.toml with
// the `routes` block commented out, used ONLY to start `wrangler dev` for
// the Playwright suite (see ../../playwright.config.js and
// ../../e2e/README.md).
//
// Why this exists: in some sandboxed/CI environments, `wrangler dev`
// detects it's running inside an automated agent and -- only when a
// `routes` entry is configured -- rewrites the Origin header of a request
// that targets the dev server's own address to the configured route's
// production domain (observed directly: a real request with
// "Origin: http://127.0.0.1:8787" arrived at the Worker as
// "Origin: http://api.foreignimmigration.ph"). The Staff Portal is served
// from that same local port, so every staff form POST is same-origin with
// it, which makes every one of those POSTs fail this app's own same-site
// Origin/CSRF check (worker/src/lib/session.js isSameSiteOrigin) -- not
// because the check is wrong, but because something downstream of this
// app silently altered the header before it arrived. `routes` has no
// effect on local D1/R2 bindings or any other local behavior, so
// commenting it out for a test run (never for a real deploy) is a safe,
// local-only workaround; the real committed wrangler.toml is never
// touched.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(__dirname, "..", "wrangler.toml");
const TARGET = path.join(__dirname, "..", ".wrangler-e2e.toml");

const original = fs.readFileSync(SOURCE, "utf8");
const withoutRoutes = original.replace(
  /^routes = \[\n(?:.*\n)*?\]\n/m,
  (block) =>
    block
      .split("\n")
      .map((line) => (line ? `#${line}` : line))
      .join("\n")
);

if (withoutRoutes === original) {
  throw new Error("make-e2e-wrangler-toml: did not find a `routes = [...]` block to comment out -- check wrangler.toml's format hasn't changed.");
}

fs.writeFileSync(TARGET, withoutRoutes);
console.log(`Wrote ${TARGET} (routes block disabled for local e2e testing only)`);
