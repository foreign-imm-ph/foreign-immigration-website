import { env } from "cloudflare:workers";
import { describe, it, expect } from "vitest";
import { createTestCheckoutService } from "./helpers.js";
import { hashEnglishContent, ensureServiceTranslations } from "../src/lib/checkoutTranslation.js";
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

  it("never creates a row for a target language when generation fails and none exists yet -- customer-facing read falls back to English instead", async () => {
    const service = await createTestCheckoutService();
    await ensureServiceTranslations(env, service.id);
    const zhCN = await getServiceI18n(env.DB, service.id, "zh-CN");
    // getServiceI18n's own fallback returns the English row when no zh-CN
    // row exists -- confirms no row was fabricated, not just that one
    // particular field is empty.
    expect(zhCN.lang).toBe("en");
  });

  it("never overwrites a manually approved (auto_generated = 0) translation, even when the English source has since changed", async () => {
    const service = await createTestCheckoutService();
    await upsertServiceI18n(env.DB, service.id, "zh-CN", {
      title: "人工审核标题",
      shortDescription: "人工审核说明",
      eligibilityText: "人工审核资格",
      noticesText: null,
    });

    // Change the English source after the manual approval.
    await upsertServiceI18n(env.DB, service.id, "en", {
      title: "Updated English Title",
      shortDescription: "Updated description",
      eligibilityText: "Updated eligibility",
      noticesText: null,
    });

    await ensureServiceTranslations(env, service.id);

    const zhCN = await getServiceI18n(env.DB, service.id, "zh-CN");
    expect(zhCN.title).toBe("人工审核标题");
    expect(zhCN.auto_generated).toBe(0);
  });

  it("a failed regeneration attempt marks the row failed but preserves its last-known-good content, never blanking it", async () => {
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

  it("upsertServiceI18n (the manual save path) always marks a row auto_generated = 0, reclaiming it from the automatic translator even if it was previously machine-generated", async () => {
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
    expect(ja.source_hash).toBeNull();
  });
});
