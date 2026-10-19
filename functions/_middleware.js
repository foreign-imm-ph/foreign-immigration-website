// Cloudflare Pages Functions middleware, STAGING-ONLY in effect (this file
// only ever executes on the fis-staging Pages project -- GitHub Pages,
// production's actual host, has no concept of a `functions/` directory and
// ignores this entirely; .github/workflows/deploy.yml only ever uploads
// `_site` to GitHub Pages, never this directory).
//
// Why this exists: Cloudflare Access can only gate a custom domain inside a
// zone you control (confirmed this session -- an Access self-hosted app
// covering the project's own *.pages.dev domain did NOT intercept traffic;
// pages.dev is a Cloudflare-shared multi-tenant domain, not a zone Access
// can bind to the same way). staging.foreignimmigration.ph IS a zone this
// account controls, so its own Access application genuinely gates it. This
// middleware is the backstop for the other, un-gateable surface: it refuses
// everything that doesn't arrive on the approved custom domain, so the raw
// fis-staging.pages.dev URL (and every per-deployment *.pages.dev alias)
// serves nothing even if someone finds it.
const ALLOWED_HOST = "staging.foreignimmigration.ph";

export async function onRequest(context) {
  const host = new URL(context.request.url).hostname;
  if (host !== ALLOWED_HOST) {
    return new Response("Not found", { status: 404 });
  }
  return context.next();
}
