-- ============================================================================
-- DEMO-ONLY data for local preview of Instant Services. NEVER apply this
-- against a real/remote D1 database (never run with wrangler's --remote
-- flag). Every value here is clearly fake/illustrative:
--   - Service titles are prefixed "[DEMO]" in all six languages.
--   - Prices are round, obviously-placeholder amounts, not real FIS pricing.
--   - The staff account is a fake email under a non-routable .local domain.
-- Safe to re-run (uses INSERT OR REPLACE / fixed ids) and safe to delete
-- afterwards with dev-only/unseed-demo-instant-services.sql.
--
-- Apply with:
--   npx wrangler d1 execute fis-backend --local --file=dev-only/seed-demo-instant-services.sql
-- ============================================================================

-- Demo admin staff account, for exercising the Staff Portal locally via the
-- DEV_STAFF_BYPASS_EMAIL mechanism (lib/staffAuth.js) -- see the setup guide.
-- Never a real FIS staff member; the .local domain cannot resolve/deliver mail.
INSERT OR REPLACE INTO staff (id, email, full_name, role, active)
VALUES ('demo-admin-staff', 'demo-admin@fis-instant-services.local', '[DEMO] Preview Administrator', 'admin', 1);

-- ----------------------------------------------------------------------------
-- Demo service 1: Certificate of Derogatory Record (CDR) -- the fully-tested
-- Tier-0 form (CCS-A-CDR-2016), reused exactly as built, with a demo price.
-- supports_delivery=1 so the delivery-address step is also inspectable.
-- ----------------------------------------------------------------------------
INSERT OR REPLACE INTO checkout_services (id, service_slug, bi_form_id, requires_staff_review, supports_delivery, display_order, active)
VALUES ('demo-cdr-service', 'motions-blacklist', 'CCS-A-CDR-2016', 1, 1, 1, 1);

DELETE FROM checkout_price_components WHERE service_id = 'demo-cdr-service';
INSERT INTO checkout_price_components (id, service_id, component_type, label, amount_php_centavos, display_order) VALUES
  ('demo-cdr-fee', 'demo-cdr-service', 'service_fee', '[DEMO] FIS Service Fee', 350000, 0),
  ('demo-cdr-gov', 'demo-cdr-service', 'government_fee', '[DEMO] Government Filing Fee', 50000, 1);

DELETE FROM checkout_service_i18n WHERE service_id = 'demo-cdr-service';
INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, notices_text) VALUES
  ('demo-cdr-service', 'en', '[DEMO] Certificate of Derogatory Record (CDR)',
   'Illustrative demo entry -- an official BI clearance confirming whether any derogatory record exists against you.',
   'Demo only: for foreign nationals who need to confirm or clear a blacklist, watchlist, or derogatory record with the Bureau of Immigration.',
   'This is a demonstration catalogue entry for local preview only. Prices and form mapping shown here are illustrative, not genuine FIS pricing.'),
  ('demo-cdr-service', 'zh-CN', '[DEMO] 无不良记录证明 (CDR)',
   '演示用目录条目——确认您名下是否存在不良记录的移民局官方证明。',
   '仅供演示：适用于需要向移民局确认或清除黑名单、监视名单或不良记录的外国人。',
   '本条目仅为本地预览的演示用途。所示价格及表格对应关系均为示例，并非 FIS 的真实价格。'),
  ('demo-cdr-service', 'zh-Hant', '[DEMO] 無不良紀錄證明 (CDR)',
   '演示用目錄項目——確認您名下是否存在不良紀錄的移民局官方證明。',
   '僅供演示：適用於需要向移民局確認或清除黑名單、監視名單或不良紀錄的外國人。',
   '本項目僅為本地預覽的演示用途。所示價格及表格對應關係均為範例，並非 FIS 的真實價格。'),
  ('demo-cdr-service', 'ko', '[DEMO] 무범죄(불리한 기록 없음) 증명서 (CDR)',
   '예시용 데모 항목 — 귀하에게 불리한 기록이 있는지 확인하는 이민국 공식 서류입니다.',
   '데모 전용: 이민국에 블랙리스트, 감시 목록 또는 불리한 기록 확인/해제가 필요한 외국인을 위한 예시입니다.',
   '이 항목은 로컬 미리보기를 위한 데모 전용 카탈로그 항목입니다. 표시된 가격 및 서식 매핑은 예시이며 실제 FIS 가격이 아닙니다.'),
  ('demo-cdr-service', 'ja', '[DEMO] 無犯罪（不利益記録なし）証明書 (CDR)',
   'デモ用の例示エントリです。不利益記録の有無を確認する移民局の公式証明です。',
   'デモ専用：移民局におけるブラックリスト、監視リスト、または不利益記録の確認・解除が必要な外国人向けの例です。',
   'この項目はローカルプレビューのためのデモ専用カタログ項目です。表示されている価格およびフォームの対応関係は例示であり、実際のFIS料金ではありません。'),
  ('demo-cdr-service', 'vi', '[DEMO] Giấy Chứng Nhận Không Có Hồ Sơ Bất Lợi (CDR)',
   'Mục danh mục minh họa cho mục đích demo -- giấy chứng nhận chính thức của BI xác nhận quý khách có hồ sơ bất lợi hay không.',
   'Chỉ dành cho demo: dành cho người nước ngoài cần xác nhận hoặc gỡ bỏ danh sách đen, danh sách theo dõi, hoặc hồ sơ bất lợi với Cục Di trú.',
   'Đây là mục danh mục demo chỉ dùng để xem trước cục bộ. Giá và ánh xạ biểu mẫu hiển thị ở đây chỉ mang tính minh họa, không phải giá thực tế của FIS.');

-- ----------------------------------------------------------------------------
-- Demo service 2: BI Clearance Certificate -- the other Tier-0 approved form
-- (2014-13-002). Second entry so the catalogue/homepage widget show more
-- than one card. English content only (deliberately -- demonstrates the
-- existing English-fallback behavior for an as-yet-untranslated entry,
-- which is itself real production behavior worth being able to see).
-- supports_delivery=0 so the delivery-address step is skipped for this one,
-- demonstrating that branch of the flow too.
-- ----------------------------------------------------------------------------
INSERT OR REPLACE INTO checkout_services (id, service_slug, bi_form_id, requires_staff_review, supports_delivery, display_order, active)
VALUES ('demo-biclearance-service', 'exit-clearance', '2014-13-002', 1, 0, 2, 1);

DELETE FROM checkout_price_components WHERE service_id = 'demo-biclearance-service';
INSERT INTO checkout_price_components (id, service_id, component_type, label, amount_php_centavos, display_order) VALUES
  ('demo-bic-fee', 'demo-biclearance-service', 'service_fee', '[DEMO] FIS Service Fee', 250000, 0);

DELETE FROM checkout_service_i18n WHERE service_id = 'demo-biclearance-service';
INSERT INTO checkout_service_i18n (service_id, lang, title, short_description, eligibility_text, notices_text) VALUES
  ('demo-biclearance-service', 'en', '[DEMO] BI Clearance Certificate',
   'Illustrative demo entry -- no delivery step (digital-only), to demonstrate that branch of the flow. English content only, to demonstrate the real fallback-to-English behavior for an untranslated entry.',
   'Demo only: for foreign nationals who need a general Bureau of Immigration clearance certificate.',
   'This is a demonstration catalogue entry for local preview only. Service-slug categorization for this form is still provisional in the real catalogue and was not resolved by this preview.');
