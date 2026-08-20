// Minimal, unstyled-enough-to-be-fast server-rendered chrome for staff
// pages. Deliberately not the marketing site's design system — this is an
// internal tool, not a public page, and is not covered by the responsive
// QA/branding rules that apply to the public site.

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function staffPage(title, bodyHtml, staffEmail) {
  return new Response(
    `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — FIS Staff</title>
<style>
  body { font-family: -apple-system, "Segoe UI", sans-serif; background: #f7f5f0; color: #1c2620; margin: 0; padding: 2rem; }
  .wrap { max-width: 60rem; margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 1.5rem; border-bottom: 1px solid #ddd; padding-bottom: 1rem; }
  nav a { margin-right: 1rem; color: #0d3d25; text-decoration: none; font-size: 0.9rem; }
  h1 { font-size: 1.4rem; margin: 0 0 1rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.5rem 0.7rem; border-bottom: 1px solid #e2e2dc; vertical-align: top; }
  th { font-size: 0.75rem; text-transform: uppercase; color: #666; }
  a.ref { font-family: monospace; color: #0d3d25; }
  .card { background: #fff; border: 1px solid #e2e2dc; border-radius: 6px; padding: 1.2rem 1.4rem; margin-bottom: 1.2rem; }
  .card h2 { font-size: 1.05rem; margin: 0 0 0.8rem; }
  label { display: block; font-size: 0.82rem; color: #444; margin: 0.6rem 0 0.2rem; }
  input, select, textarea { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9rem; box-sizing: border-box; }
  button { background: #0d3d25; color: #fff; border: none; padding: 0.55rem 1.1rem; border-radius: 4px; font-size: 0.88rem; cursor: pointer; margin-top: 0.7rem; }
  button.secondary { background: #fff; color: #0d3d25; border: 1px solid #0d3d25; }
  button.danger { background: #fff; color: #b3261e; border: 1px solid #b3261e; }
  .status { display: inline-block; font-size: 0.75rem; padding: 0.15em 0.6em; border-radius: 3px; background: #eef1ec; }
  .muted { color: #777; font-size: 0.85rem; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <nav>
      <a href="/staff/enquiries/">Enquiries</a>
      <a href="/staff/enquiries/archived/">Archived Enquiries</a>
      <a href="/staff/applications/">Applications</a>
    </nav>
    <span class="muted">${escapeHtml(staffEmail || "")}</span>
  </header>
  ${bodyHtml}
</div>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
