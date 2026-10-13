import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";

// Applies every migration in worker/migrations/ (0001 through the latest,
// in order) to the isolated, in-memory local D1 instance before each test
// file runs -- so every test starts from the exact same schema the real
// production database has, including 0009_bi_form_lifecycle.sql, without
// ever touching the real database.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
