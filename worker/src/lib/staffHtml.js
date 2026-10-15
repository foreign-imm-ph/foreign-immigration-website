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
  :root { --fis-green: #0d3d25; --fis-gold: #c9972e; --fis-cream: #f7f3ea; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", sans-serif; background: var(--fis-cream); color: #1c2620; margin: 0; padding: 0 0 3rem; }
  .wrap { max-width: 68rem; margin: 0 auto; padding: 0 1.25rem; }
  .site-bar { background: var(--fis-green); color: #fff; padding: 0.6rem 0; margin-bottom: 1.5rem; }
  .site-bar .wrap { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.4rem; }
  .site-bar__brand { font-weight: 600; letter-spacing: 0.02em; white-space: nowrap; }
  .site-bar__brand .accent { color: var(--fis-gold); }
  nav { display: flex; flex-wrap: wrap; gap: 0.2rem 1.1rem; }
  nav a { color: rgba(255,255,255,0.88); text-decoration: none; font-size: 0.85rem; padding: 0.2rem 0; border-bottom: 2px solid transparent; }
  nav a:hover, nav a:focus-visible { color: #fff; border-bottom-color: var(--fis-gold); }
  .staff-email { font-size: 0.78rem; color: rgba(255,255,255,0.75); white-space: nowrap; }
  h1 { font-size: 1.4rem; margin: 0 0 1rem; color: var(--fis-green); }
  h2 { color: var(--fis-green); }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; font-size: 0.9rem; background: #fff; border: 1px solid #e2e2dc; border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 0.65rem 0.8rem; border-bottom: 1px solid #ece9e1; vertical-align: top; }
  th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.03em; color: #666; background: #faf8f3; }
  tr:last-child td { border-bottom: none; }
  tbody tr:hover { background: #fbfaf6; }
  .table-scroll { overflow-x: auto; }
  a.ref { font-family: "SF Mono", Menlo, monospace; color: var(--fis-green); font-weight: 600; }
  .card { background: #fff; border: 1px solid #e2e2dc; border-radius: 8px; padding: 1.2rem 1.4rem; margin-bottom: 1.2rem; }
  .card h2 { font-size: 1.05rem; margin: 0 0 0.8rem; }
  label { display: block; font-size: 0.82rem; color: #444; margin: 0.6rem 0 0.2rem; font-weight: 600; }
  input, select, textarea { width: 100%; padding: 0.55rem 0.65rem; border: 1px solid #cfcac0; border-radius: 5px; font-size: 0.9rem; box-sizing: border-box; font-family: inherit; }
  button, .btn-link { background: var(--fis-green); color: #fff; border: none; padding: 0.55rem 1.1rem; border-radius: 5px; font-size: 0.88rem; cursor: pointer; margin-top: 0.7rem; transition: background 0.12s ease; }
  button:hover, .btn-link:hover { background: #0a2e1b; }
  button.secondary { background: #fff; color: var(--fis-green); border: 1px solid var(--fis-green); }
  button.secondary:hover { background: #f1f5f2; }
  button.danger { background: #fff; color: #b3261e; border: 1px solid #b3261e; }
  button.danger:hover { background: #fbeeec; }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
  a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, summary:focus-visible {
    outline: 2px solid var(--fis-green); outline-offset: 2px;
  }
  .status { display: inline-block; font-size: 0.75rem; padding: 0.15em 0.6em; border-radius: 3px; background: #eef1ec; color: #2c4a3a; }
  .priority-badge { display: inline-block; font-size: 0.72rem; font-weight: 600; padding: 0.15em 0.6em; border-radius: 3px; border: 1px solid transparent; }
  .priority-badge--standard { background: #eef1ec; color: #3a4a41; border-color: #d7ded8; }
  .priority-badge--priority { background: #fbf1dc; color: #7a5a12; border-color: #e8c876; }
  .priority-badge--urgent { background: #f7e6e4; color: #7a1f18; border-color: #d98c85; }
  .filter-bar { font-size: 0.85rem; margin-bottom: 1rem; color: #555; }
  .filter-bar a { color: var(--fis-green); text-decoration: none; margin: 0 0.15rem; padding: 0.1rem 0.3rem; border-radius: 3px; }
  .filter-bar a:hover { background: #eef1ec; }
  .filter-bar a.filter-active { font-weight: 700; background: #eef1ec; }
  .muted { color: #777; font-size: 0.85rem; }
  @media (max-width: 640px) {
    .site-bar .wrap { flex-direction: column; align-items: flex-start; }
    table, thead, tbody, th, td, tr { font-size: 0.85rem; }
  }
</style>
</head>
<body>
<div class="site-bar">
  <div class="wrap">
    <div class="site-bar__brand">FOREIGN <span class="accent">IMMIGRATION</span> SERVICES <span class="muted" style="color:rgba(255,255,255,0.65);font-weight:400;">— Staff Portal</span></div>
    <span class="staff-email">${escapeHtml(staffEmail || "")}</span>
  </div>
  <div class="wrap">
    <nav>
      <a href="/staff/enquiries/">Enquiries</a>
      <a href="/staff/enquiries/archived/">Archived Enquiries</a>
      <a href="/staff/applications/">Applications</a>
      <a href="/staff/bi-forms/">BI Forms</a>
      <a href="/staff/instant-services/orders/">Instant Services Orders</a>
      <a href="/staff/instant-services/catalogue/">Instant Services Catalogue</a>
      <a href="/staff/instant-services/payment-settings/">Instant Services Payment Settings</a>
      <a href="/staff/airport-vip/bookings/">Airport VIP Bookings</a>
    </nav>
  </div>
</div>
<div class="wrap">
  ${bodyHtml}
</div>
</body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
