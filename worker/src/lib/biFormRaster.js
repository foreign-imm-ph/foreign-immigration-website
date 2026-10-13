// Seam for the Workers-compatible raster/compose/finalize backend that
// Phase 2 Stage 4 is still evaluating (Cloudflare Browser Rendering vs.
// WASM compositing vs. an external rendering service -- see
// bi-forms-library/PHASE2_INTEGRATION_PLAN.md). Nothing is wired in yet.
//
// The local Poppler backend this function would eventually delegate to
// (bi-forms-library/engine/lib/raster-pipeline.js) depends on a native
// binary and a filesystem, neither of which exist inside a Workers
// isolate -- it cannot simply be called from here, in production or in
// this test harness (Miniflare's workerd sandbox has no child_process/fs
// either, independent of any test-tooling limitation). This file is the
// single place that gap is isolated to, so routes/staffBiForms.js never
// needs to know which backend (if any) is actually configured.
export async function composeAndFinalizeCustomerPreview() {
  throw new Error(
    "Customer preview generation requires a production rendering backend, which is not yet configured (Phase 2 Stage 4 is still evaluating options). The full staff PDF has already been generated and stored."
  );
}
