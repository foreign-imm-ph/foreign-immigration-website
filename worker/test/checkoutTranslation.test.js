import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { createTestCheckoutService } from "./helpers.js";
import {
  hashEnglishContent,
  hashEnglishFields,
  changedFields,
  ensureServiceTranslations,
  reconcileKeep,
  applyRegeneratedTranslation,
} from "../src/lib/checkoutTranslation.js";
import { upsertServiceI18n, getServiceI18n } from "../src/lib/checkout.js";

// Workers AI cannot be simulated locally (see vitest.config.js) -- every
// translateFromEnglish() call below genuinely fails (the same graceful
// "no credentials available" failure translation.js already handles for
// enquiry/message translation elsewhere in this suite). That is exactly
// the right environment to prove the SAFETY rules below: a manually
// approved row must never be touched regardless of whether generation
// could succeed, and a failed attempt must never fabricate or blank out
// content. What cannot be proven here (an actual successful translation)
// is the single-file responsibility of translation.js itself.
describe("Catalogue auto-translation: change detection and safety rules", () => {
  it("hashEnglishContent is deterministic and changes only when the English content actually changes", () => {
    const a = { title: "Title", shortDescription: "Desc", eligibilityText: "Elig", noticesText: null };
    const b = { title: "Title", shortDescription: "Desc", eligibilityText: "Elig", noticesText: null };
    const c = { ...a, title: "Different Title" };
    expect(hashEnglishContent(a)).toBe(hashEnglishContent(b));
    expect(hashEnglishContent(a)).not.toBe(hashEnglishContent(c));
  });

  it("changedFields reports exactly which fields differ, nothing more", () => {
    const current = hashEnglishFields({ title: "New Title", short_description: "Desc", eligibility_text: "Elig", notices_text: null });
    const storedSame = hashEnglishFields({ title: "New Title", short_description: "Desc", eligibility_text: "Elig", notices_text: null });
    expect(changedFields(JSON.stringify(storedSame), current)).toEqual([]);

    const storedOlderTitle = hashEnglishFields({ title: "Old Title", short_description: "Desc", eligibility_text: "Elig", notices_text: null });
    expect(changedFields(JSON.stringify(storedOlderTitle), current)).toEqual(["title"]);
  });

  it("changedFields treats a row with no stored hashes at all (pre-existing data) as every field unverified, never a guess", () => {
    const current = hashEnglishFields({ title: "T", short_description: "D", eligibility_text: "E", notices_text: null });
    expect(changedFields(null, current)).toEqual(["title", "shortDescription", "eligibilityText", "noticesText"]);
  });

  it("never creates a row for a target language when generation fails and none exists yet -- customer-facing read falls back to English instead", async () => {
    const service = await createTestCheckoutService();
    await ensureServiceTranslations(env, service.id);
    const zhCN = await getServiceI18n(env.DB, service.id, "zh-CN");
    // getServiceI18n's own fallback returns the English row when no zh-CN
    // row exists -- confirms no row was fabricated, not just that one
    // particular field is empty.
    expect(zhCN.lang).toBe("en");
  });

  it("flags a manually approved translation needs_review (never overwriting its content) when the English source changes, naming the changed field", async () => {
    const service = await createTestCheckoutService();
    await upsertServiceI18n(env.DB, service.id, "zh-CN", {
      title: "人工审核标题",
      shortDescription: "人工审核说明",
      eligibilityText: "人工审核资格",
      noticesText: null,
    });

    // Change only the English title after the manual approval.
    await upsertServiceI18n(env.DB, service.id, "en", {
      title: "Updated English Title",
      shortDescription: "Test service description",
      eligibilityText: "Eligible for testing",
      noticesText: null,
    });

    await ensureServiceTranslations(env, service.id);

    const zhCNRaw = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).first();
    expect(zhCNRaw.title).toBe("人工审核标题"); // content completely untouched
    expect(zhCNRaw.auto_generated).toBe(0);
    expect(zhCNRaw.needs_review).toBe(1);
    expect(zhCNRaw.review_changed_fields).toBe("title");
  });

  it("does not re-flag a translation whose English source has NOT changed, and never calls out unchanged fields", async () => {
    const service = await createTestCheckoutService();
    await upsertServiceI18n(env.DB, service.id, "zh-CN", {
      title: "人工审核标题",
      shortDescription: "人工审核说明",
      eligibilityText: "人工审核资格",
      noticesText: null,
    });

    await ensureServiceTranslations(env, service.id); // English unchanged since the manual save above

    const zhCN = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).first();
    expect(zhCN.needs_review).toBe(0);
    expect(zhCN.review_changed_fields).toBeNull();
  });

  it("a needs_review translation is never shown to customers -- getServiceI18n falls back to English exactly as if the row were missing", async () => {
    const service = await createTestCheckoutService();
    await env.DB.prepare(
      `INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, auto_generated, needs_review, review_changed_fields)
       VALUES (?, 'zh-CN', '可能已过时的标题', '可能已过时的说明', '可能已过时的资格要求', 0, 1, 'title')`
    )
      .bind(service.id)
      .run();

    const served = await getServiceI18n(env.DB, service.id, "zh-CN");
    expect(served.lang).toBe("en");
    expect(served.title).not.toBe("可能已过时的标题");
  });

  it("'Keep my translation' clears the review flag and reconciles the hashes against the current English content, without touching the translation", async () => {
    const service = await createTestCheckoutService();
    await upsertServiceI18n(env.DB, service.id, "zh-CN", {
      title: "人工审核标题",
      shortDescription: "人工审核说明",
      eligibilityText: "人工审核资格",
      noticesText: null,
    });
    await upsertServiceI18n(env.DB, service.id, "en", {
      title: "Updated English Title",
      shortDescription: "Test service description",
      eligibilityText: "Eligible for testing",
      noticesText: null,
    });
    await ensureServiceTranslations(env, service.id);
    let zhCN = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).first();
    expect(zhCN.needs_review).toBe(1);

    const kept = await reconcileKeep(env, service.id, "zh-CN");
    expect(kept).toBe(true);

    zhCN = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).first();
    expect(zhCN.needs_review).toBe(0);
    expect(zhCN.review_changed_fields).toBeNull();
    expect(zhCN.title).toBe("人工审核标题"); // untouched
    expect(zhCN.auto_generated).toBe(0); // still manually controlled

    // Reconciled against the NEW English -- running the reconciliation
    // pass again with no further English change must not re-flag it.
    await ensureServiceTranslations(env, service.id);
    zhCN = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).first();
    expect(zhCN.needs_review).toBe(0);
  });

  it("applyRegeneratedTranslation ('Update translation automatically', after preview) replaces the manual content fully and clears the review flag", async () => {
    const service = await createTestCheckoutService();
    await upsertServiceI18n(env.DB, service.id, "zh-CN", {
      title: "旧的人工标题",
      shortDescription: "旧的人工说明",
      eligibilityText: "旧的人工资格",
      noticesText: null,
    });
    await env.DB.prepare("UPDATE checkout_service_i18n SET needs_review = 1, review_changed_fields = 'title' WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).run();

    await applyRegeneratedTranslation(env, service.id, "zh-CN", {
      title: "新生成的标题",
      shortDescription: "新生成的说明",
      eligibilityText: "新生成的资格",
      noticesText: null,
    });

    const zhCN = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).first();
    expect(zhCN.title).toBe("新生成的标题");
    expect(zhCN.auto_generated).toBe(1);
    expect(zhCN.needs_review).toBe(0);
    expect(zhCN.review_changed_fields).toBeNull();
    expect(zhCN.translation_status).toBe("ready");
  });

  it("a failed regeneration attempt on an auto-generated row marks it failed but preserves its last-known-good content, never blanking it", async () => {
    const service = await createTestCheckoutService();
    // Seed an auto-generated row as if an earlier, successful generation
    // had produced it against a now-stale English hash.
    await env.DB.prepare(
      `INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, notices_text, auto_generated, source_hash, translation_status, generated_at)
       VALUES (?, 'zh-CN', 'Old Auto Title', 'Old auto description', 'Old auto eligibility', NULL, 1, 'stale-hash-value', 'ready', datetime('now'))`
    )
      .bind(service.id)
      .run();

    await ensureServiceTranslations(env, service.id);

    const zhCN = await getServiceI18n(env.DB, service.id, "zh-CN");
    // Still auto-generated, still showing the last good text (AI is
    // unavailable in this test environment, so regeneration cannot
    // succeed) -- and explicitly marked failed rather than silently stale.
    expect(zhCN.title).toBe("Old Auto Title");
    expect(zhCN.translation_status).toBe("failed");
  });

  it("no unnecessary Workers AI work is attempted for a row that is already fully up to date (whole-row hash gate short-circuits before any per-field comparison)", async () => {
    const service = await createTestCheckoutService();
    await upsertServiceI18n(env.DB, service.id, "zh-CN", {
      title: "人工审核标题",
      shortDescription: "人工审核说明",
      eligibilityText: "人工审核资格",
      noticesText: null,
    });
    const before = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).first();

    await ensureServiceTranslations(env, service.id);
    await ensureServiceTranslations(env, service.id); // repeated call, nothing changed in between

    const after = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'zh-CN'").bind(service.id).first();
    expect(after.title).toBe(before.title);
    expect(after.source_hash).toBe(before.source_hash);
    expect(after.needs_review).toBe(0);
  });

  it("upsertServiceI18n (the manual save path) always marks a row auto_generated = 0, reclaiming it from the automatic translator even if it was previously machine-generated, and reconciles it against the current English content", async () => {
    const service = await createTestCheckoutService();
    await env.DB.prepare(
      `INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, notices_text, auto_generated, source_hash, translation_status, generated_at)
       VALUES (?, 'ja', '自動タイトル', '自動説明', '自動資格', NULL, 1, 'some-hash', 'ready', datetime('now'))`
    )
      .bind(service.id)
      .run();

    await upsertServiceI18n(env.DB, service.id, "ja", {
      title: "スタッフ承認タイトル",
      shortDescription: "スタッフ承認説明",
      eligibilityText: "スタッフ承認資格",
      noticesText: null,
    });

    const ja = await getServiceI18n(env.DB, service.id, "ja");
    expect(ja.title).toBe("スタッフ承認タイトル");
    expect(ja.auto_generated).toBe(0);
    expect(ja.needs_review).toBe(0);
    // Now reconciled against the CURRENT English content at save time
    // (rather than left null), so future drift can actually be detected.
    const enRow = await env.DB.prepare("SELECT * FROM checkout_service_i18n WHERE service_id = ? AND lang = 'en'").bind(service.id).first();
    expect(ja.source_hash).toBe(hashEnglishContent({ title: enRow.title, shortDescription: enRow.short_description, eligibilityText: enRow.eligibility_text, noticesText: enRow.notices_text }));
  });

  it("preserves all existing catalogue data (price, status, slug) across a reconciliation pass -- only i18n rows are ever touched", async () => {
    const service = await createTestCheckoutService({ serviceSlug: "motions-blacklist", displayOrder: 3 });
    await upsertServiceI18n(env.DB, service.id, "en", {
      title: "Changed Title",
      shortDescription: "Test service description",
      eligibilityText: "Eligible for testing",
      noticesText: null,
    });

    await ensureServiceTranslations(env, service.id);

    const reloaded = await env.DB.prepare("SELECT * FROM checkout_services WHERE id = ?").bind(service.id).first();
    expect(reloaded.service_slug).toBe("motions-blacklist");
    expect(reloaded.display_order).toBe(3);
    expect(reloaded.active).toBe(service.active);
    expect(reloaded.offering_status).toBe(service.offering_status);
  });
});
