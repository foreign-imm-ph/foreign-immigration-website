// Single place to point the portal at the backend. Update PORTAL_API_BASE
// once the Worker is deployed and its custom domain is live.
window.PORTAL_API_BASE = "https://api.foreignimmigration.ph";

window.portalFetch = function portalFetch(path, options) {
  return fetch(window.PORTAL_API_BASE + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
};
