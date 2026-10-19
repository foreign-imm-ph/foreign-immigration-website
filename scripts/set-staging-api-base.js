// Postbuild step for a STAGING build only -- never run as part of the
// production build (`npm run build`, unchanged, used by
// .github/workflows/deploy.yml). Overrides the one hardcoded line
// portal-config.js uses to find the backend, so a staging frontend build
// talks to the staging Worker instead of api.foreignimmigration.ph.
//
// src/assets/js/portal-config.js is served via Eleventy's passthrough copy
// (addPassthroughCopy in .eleventy.js), not templated -- this script edits
// the already-built _site copy directly, after eleventy has run, rather
// than templating the source file and risking any difference in the
// production build path.
const fs = require("fs");
const path = require("path");

const STAGING_API_BASE = process.env.STAGING_API_BASE;
if (!STAGING_API_BASE) {
  console.log("STAGING_API_BASE not set -- leaving _site/assets/js/portal-config.js as built (production default).");
  process.exit(0);
}

const filePath = path.join(__dirname, "..", "_site", "assets", "js", "portal-config.js");
const original = fs.readFileSync(filePath, "utf8");
const marker = 'window.PORTAL_API_BASE = "https://api.foreignimmigration.ph";';
if (!original.includes(marker)) {
  console.error(`Expected exact line not found in ${filePath}:\n  ${marker}\nRefusing to guess a replacement -- update this script if portal-config.js changed.`);
  process.exit(1);
}
const updated = original.replace(marker, `window.PORTAL_API_BASE = ${JSON.stringify(STAGING_API_BASE)};`);
fs.writeFileSync(filePath, updated);
console.log(`Set PORTAL_API_BASE to ${STAGING_API_BASE} in ${filePath}`);
