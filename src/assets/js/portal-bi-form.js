// Phase 2 Stage 5.4: the multilingual BI-form questionnaire renderer,
// extending the existing authenticated Client Portal (portal-app.js)
// rather than a separate application -- this file only renders into a
// section portal-app.js's own renderApplicationDetail() already calls
// into (see wireBiFormsSection below), and reuses the SAME window.portalFetch
// helper, the same vanilla-JS/escapeHtml/template-literal style, and the
// same "API is the source of truth, this is presentation only" posture as
// every other section of the portal.
//
// Does NOT translate or alter the official English BI PDF in any way --
// this only localizes the QUESTIONNAIRE chrome and field labels (the
// Client Portal's own UI around a BI form), using each form's own
// questionnaire.json label translations the Worker already returns.
// Nothing here ever receives or renders a staff-only field, a staff-only
// note, or the original BI template -- the API this talks to
// (worker/src/routes/biFormsCustomer.js) already enforces that server-side.
(function () {
  "use strict";

  var CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];

  // Deterministic, hand-reviewed strings -- never AI-generated at render
  // time, same posture as worker/src/lib/clientLocaleStrings.js. Reuses
  // that file's own BI-form-adjacent status vocabulary where the concept
  // overlaps (e.g. "submitted"/"under review") for consistency across
  // the portal, even though these are a different status machine
  // (bi_form_submissions, not applications).
  var STRINGS = {
    en: {
      sectionTitle: "BI Forms", noForms: "No BI forms assigned yet.",
      status: { draft: "Draft", submitted: "Submitted", under_review: "Under review", revision_requested: "Revision requested", approved: "Approved", published: "Ready", cancelled: "Cancelled" },
      backToApplication: "← Back", languageLabel: "Language", loading: "Loading...",
      instructions: "Please complete this form. Only you can see your answers until you submit them.",
      technicalReferenceLabel: "Bureau of Immigration Form No.",
      imNotSureLabel: "I'm not sure — let FIS help me",
      optionChooseHeading: "Before you begin",
      optionSelfLabel: "I'll provide the details myself",
      optionAssistLabel: "I'm not sure — let FIS help me (quick start)",
      optionAssistHelp: "We'll mark anything you haven't filled in as needing our assistance and submit your request now with just what you've already provided. FIS will contact you to complete the rest.",
      assistanceRequestedNotice: "We've marked the unanswered questions as needing FIS assistance and submitted your request. FIS will contact you to complete the remaining details.",
      revisionNotice: "Our staff has requested changes to this form. Please review the note below, update your answers, and submit again.",
      historyLabel: "History", requiredMark: "*", yes: "Yes", no: "No",
      saveDraft: "Save Draft", submit: "Submit", saving: "Saving...", saved: "Saved.",
      saveError: "There was a problem saving your form. Please try again.",
      submitError: "Please complete all required fields before submitting.",
      submitNotice: "Once submitted, you will not be able to change your answers unless our staff requests a revision.",
      submitted: "Your form has been submitted. Our staff will review it.",
      documentsLabel: "Supporting Documents", uploadLabel: "Upload a file",
      noDocumentsUploaded: "No documents uploaded yet.", uploadError: "Upload failed. Please check the file type (PDF, JPEG, PNG or WebP) and size (under 15MB), then try again.",
      readyLabel: "Your form has been approved and is ready.", downloadLabel: "Download",
      entryLabel: "Entry {n}", readOnlyNotice: "This form is not currently editable.",
    },
    "zh-CN": {
      sectionTitle: "BI 表格", noForms: "尚未分配 BI 表格。",
      status: { draft: "草稿", submitted: "已提交", under_review: "审核中", revision_requested: "需要修改", approved: "已批准", published: "已就绪", cancelled: "已取消" },
      backToApplication: "← 返回", languageLabel: "语言", loading: "加载中...",
      instructions: "请填写此表格。在您提交之前，只有您本人可以查看您的答案。",
      technicalReferenceLabel: "菲律宾移民局表格编号",
      imNotSureLabel: "不确定——请FIS协助我",
      optionChooseHeading: "开始之前",
      optionSelfLabel: "我自己填写详细信息",
      optionAssistLabel: "不确定——请FIS协助我（快速开始）",
      optionAssistHelp: "我们会将您尚未填写的内容标记为需要我们协助，并立即以您已提供的信息提交您的申请。FIS将与您联系以完成其余部分。",
      assistanceRequestedNotice: "我们已将未回答的问题标记为需要FIS协助，并已提交您的申请。FIS将与您联系以完成剩余细节。",
      revisionNotice: "我们的工作人员已要求对此表格进行修改。请查看下方备注，更新您的答案后重新提交。",
      historyLabel: "历史记录", requiredMark: "*", yes: "是", no: "否",
      saveDraft: "保存草稿", submit: "提交", saving: "保存中...", saved: "已保存。",
      saveError: "保存表格时出现问题，请重试。",
      submitError: "请在提交前完成所有必填项。",
      submitNotice: "提交后，除非工作人员要求修改，否则您将无法更改答案。",
      submitted: "您的表格已提交，我们的工作人员将进行审核。",
      documentsLabel: "所需文件", uploadLabel: "上传文件",
      noDocumentsUploaded: "尚未上传任何文件。", uploadError: "上传失败。请检查文件类型（PDF、JPEG、PNG 或 WebP）和大小（小于 15MB）后重试。",
      readyLabel: "您的表格已获批准，现已就绪。", downloadLabel: "下载",
      entryLabel: "第 {n} 项", readOnlyNotice: "此表格当前无法编辑。",
    },
    "zh-Hant": {
      sectionTitle: "BI 表格", noForms: "尚未分配 BI 表格。",
      status: { draft: "草稿", submitted: "已提交", under_review: "審核中", revision_requested: "需要修改", approved: "已批准", published: "已就緒", cancelled: "已取消" },
      backToApplication: "← 返回", languageLabel: "語言", loading: "載入中...",
      instructions: "請填寫此表格。在您提交之前，只有您本人可以查看您的答案。",
      technicalReferenceLabel: "菲律賓移民局表格編號",
      imNotSureLabel: "不確定——請FIS協助我",
      optionChooseHeading: "開始之前",
      optionSelfLabel: "我自己填寫詳細資料",
      optionAssistLabel: "不確定——請FIS協助我（快速開始）",
      optionAssistHelp: "我們會將您尚未填寫的內容標記為需要我們協助，並立即以您已提供的資訊提交您的申請。FIS將與您聯繫以完成其餘部分。",
      assistanceRequestedNotice: "我們已將未回答的問題標記為需要FIS協助，並已提交您的申請。FIS將與您聯繫以完成剩餘細節。",
      revisionNotice: "我們的工作人員已要求對此表格進行修改。請查看下方備註，更新您的答案後重新提交。",
      historyLabel: "歷史記錄", requiredMark: "*", yes: "是", no: "否",
      saveDraft: "儲存草稿", submit: "提交", saving: "儲存中...", saved: "已儲存。",
      saveError: "儲存表格時發生問題，請再試一次。",
      submitError: "請在提交前完成所有必填項目。",
      submitNotice: "提交後，除非工作人員要求修改，否則您將無法更改答案。",
      submitted: "您的表格已提交，我們的工作人員將進行審核。",
      documentsLabel: "所需文件", uploadLabel: "上傳文件",
      noDocumentsUploaded: "尚未上傳任何文件。", uploadError: "上傳失敗。請檢查檔案類型（PDF、JPEG、PNG 或 WebP）及大小（小於 15MB）後再試一次。",
      readyLabel: "您的表格已獲批准，現已就緒。", downloadLabel: "下載",
      entryLabel: "第 {n} 項", readOnlyNotice: "此表格目前無法編輯。",
    },
    ko: {
      sectionTitle: "BI 양식", noForms: "아직 배정된 BI 양식이 없습니다.",
      status: { draft: "임시 저장", submitted: "제출됨", under_review: "검토 중", revision_requested: "수정 요청됨", approved: "승인됨", published: "준비 완료", cancelled: "취소됨" },
      backToApplication: "← 뒤로", languageLabel: "언어", loading: "불러오는 중...",
      instructions: "이 양식을 작성해 주십시오. 제출하기 전까지는 본인만 답변을 볼 수 있습니다.",
      technicalReferenceLabel: "필리핀 출입국관리청 서식 번호",
      imNotSureLabel: "잘 모르겠어요 — FIS의 도움을 받고 싶어요",
      optionChooseHeading: "시작하기 전에",
      optionSelfLabel: "제가 직접 작성하겠습니다",
      optionAssistLabel: "잘 모르겠어요 — FIS의 도움을 받고 싶어요 (빠른 시작)",
      optionAssistHelp: "아직 작성하지 않은 항목은 FIS의 도움이 필요한 것으로 표시하고, 지금까지 입력하신 정보만으로 신청서를 바로 제출합니다. FIS가 연락드려 나머지 내용을 완성하겠습니다.",
      assistanceRequestedNotice: "답변하지 않은 질문을 FIS 도움이 필요한 것으로 표시하고 신청서를 제출했습니다. FIS가 연락드려 나머지 세부 정보를 완성하겠습니다.",
      revisionNotice: "담당 직원이 이 양식의 수정을 요청했습니다. 아래 메모를 확인하고 답변을 수정한 후 다시 제출해 주십시오.",
      historyLabel: "이력", requiredMark: "*", yes: "예", no: "아니요",
      saveDraft: "임시 저장", submit: "제출", saving: "저장 중...", saved: "저장되었습니다.",
      saveError: "양식을 저장하는 중 문제가 발생했습니다. 다시 시도해 주십시오.",
      submitError: "제출하기 전에 모든 필수 항목을 완료해 주십시오.",
      submitNotice: "제출 후에는 담당 직원이 수정을 요청하지 않는 한 답변을 변경할 수 없습니다.",
      submitted: "양식이 제출되었습니다. 담당 직원이 검토할 예정입니다.",
      documentsLabel: "필요 서류", uploadLabel: "파일 업로드",
      noDocumentsUploaded: "아직 업로드된 파일이 없습니다.", uploadError: "업로드에 실패했습니다. 파일 형식(PDF, JPEG, PNG 또는 WebP)과 크기(15MB 미만)를 확인한 후 다시 시도해 주십시오.",
      readyLabel: "양식이 승인되어 준비되었습니다.", downloadLabel: "다운로드",
      entryLabel: "항목 {n}", readOnlyNotice: "이 양식은 현재 편집할 수 없습니다.",
    },
    ja: {
      sectionTitle: "BI フォーム", noForms: "まだ割り当てられた BI フォームはありません。",
      status: { draft: "下書き", submitted: "提出済み", under_review: "確認中", revision_requested: "修正依頼あり", approved: "承認済み", published: "準備完了", cancelled: "キャンセル済み" },
      backToApplication: "← 戻る", languageLabel: "言語", loading: "読み込み中...",
      instructions: "このフォームにご記入ください。提出するまで、回答はご本人のみが閲覧できます。",
      technicalReferenceLabel: "フィリピン入国管理局 様式番号",
      imNotSureLabel: "わからない — FISに手伝ってほしい",
      optionChooseHeading: "ご記入の前に",
      optionSelfLabel: "自分で情報を入力します",
      optionAssistLabel: "わからない — FISに手伝ってほしい（クイックスタート）",
      optionAssistHelp: "未記入の項目はFISのサポートが必要として記録し、現在入力済みの情報のみで今すぐ申請を送信します。残りの項目についてはFISがご連絡いたします。",
      assistanceRequestedNotice: "未回答の質問をFISのサポートが必要として記録し、申請を送信しました。残りの詳細についてはFISがご連絡いたします。",
      revisionNotice: "担当者よりこのフォームの修正を依頼されました。下記のメモをご確認のうえ回答を修正し、再度提出してください。",
      historyLabel: "履歴", requiredMark: "*", yes: "はい", no: "いいえ",
      saveDraft: "下書きを保存", submit: "提出", saving: "保存中...", saved: "保存しました。",
      saveError: "フォームの保存中に問題が発生しました。もう一度お試しください。",
      submitError: "提出する前にすべての必須項目を入力してください。",
      submitNotice: "提出後は、担当者から修正の依頼がない限り回答を変更できません。",
      submitted: "フォームを提出しました。担当者が確認いたします。",
      documentsLabel: "必要書類", uploadLabel: "ファイルをアップロード",
      noDocumentsUploaded: "まだアップロードされたファイルはありません。", uploadError: "アップロードに失敗しました。ファイル形式（PDF、JPEG、PNG、WebP）とサイズ（15MB未満）をご確認のうえ、再度お試しください。",
      readyLabel: "フォームが承認され、準備が完了しました。", downloadLabel: "ダウンロード",
      entryLabel: "項目 {n}", readOnlyNotice: "このフォームは現在編集できません。",
    },
    vi: {
      sectionTitle: "Mẫu BI", noForms: "Chưa có mẫu BI nào được chỉ định.",
      status: { draft: "Bản nháp", submitted: "Đã nộp", under_review: "Đang xem xét", revision_requested: "Yêu cầu chỉnh sửa", approved: "Đã phê duyệt", published: "Đã sẵn sàng", cancelled: "Đã hủy" },
      backToApplication: "← Quay lại", languageLabel: "Ngôn ngữ", loading: "Đang tải...",
      instructions: "Vui lòng hoàn thành mẫu này. Chỉ bạn mới có thể xem câu trả lời của mình cho đến khi bạn nộp.",
      technicalReferenceLabel: "Mẫu đơn Cục Di trú Philippines số",
      imNotSureLabel: "Tôi không chắc — hãy để FIS hỗ trợ tôi",
      optionChooseHeading: "Trước khi bắt đầu",
      optionSelfLabel: "Tôi sẽ tự cung cấp thông tin",
      optionAssistLabel: "Tôi không chắc — hãy để FIS hỗ trợ tôi (bắt đầu nhanh)",
      optionAssistHelp: "Chúng tôi sẽ đánh dấu những mục bạn chưa điền là cần FIS hỗ trợ và nộp yêu cầu của bạn ngay với những thông tin bạn đã cung cấp. FIS sẽ liên hệ với bạn để hoàn tất phần còn lại.",
      assistanceRequestedNotice: "Chúng tôi đã đánh dấu các câu hỏi chưa trả lời là cần FIS hỗ trợ và đã nộp yêu cầu của bạn. FIS sẽ liên hệ với bạn để hoàn tất các chi tiết còn lại.",
      revisionNotice: "Nhân viên của chúng tôi đã yêu cầu chỉnh sửa mẫu này. Vui lòng xem ghi chú dưới đây, cập nhật câu trả lời và nộp lại.",
      historyLabel: "Lịch sử", requiredMark: "*", yes: "Có", no: "Không",
      saveDraft: "Lưu bản nháp", submit: "Nộp", saving: "Đang lưu...", saved: "Đã lưu.",
      saveError: "Đã xảy ra lỗi khi lưu mẫu của bạn. Vui lòng thử lại.",
      submitError: "Vui lòng hoàn thành tất cả các mục bắt buộc trước khi nộp.",
      submitNotice: "Sau khi nộp, bạn sẽ không thể thay đổi câu trả lời trừ khi nhân viên của chúng tôi yêu cầu chỉnh sửa.",
      submitted: "Mẫu của bạn đã được nộp. Nhân viên của chúng tôi sẽ xem xét.",
      documentsLabel: "Hồ Sơ Cần Nộp", uploadLabel: "Tải lên một tệp",
      noDocumentsUploaded: "Chưa có tệp nào được tải lên.", uploadError: "Tải lên không thành công. Vui lòng kiểm tra loại tệp (PDF, JPEG, PNG hoặc WebP) và kích thước (dưới 15MB), sau đó thử lại.",
      readyLabel: "Mẫu của bạn đã được phê duyệt và sẵn sàng.", downloadLabel: "Tải xuống",
      entryLabel: "Mục {n}", readOnlyNotice: "Mẫu này hiện không thể chỉnh sửa.",
    },
  };

  function t(lang, key) {
    var table = STRINGS[lang] || STRINGS.en;
    var v = key.split(".").reduce(function (o, k) { return o && o[k]; }, table);
    if (v === undefined) v = key.split(".").reduce(function (o, k) { return o && o[k]; }, STRINGS.en);
    return v === undefined ? key : v;
  }

  function statusLabel(lang, status) {
    var table = (STRINGS[lang] || STRINGS.en).status;
    return (table && table[status]) || (STRINGS.en.status[status]) || status.replace(/_/g, " ");
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, "&quot;");
  }

  var CUSTOMER_EDITABLE_STATUSES = { draft: true, revision_requested: true };

  // ---- Section within an application's detail view ----

  function renderBiFormsSectionHtml(lang, submissions) {
    var items = submissions
      .map(function (s) {
        return '<li class="portal-bi-form-item" data-submission-id="' + s.id + '">' +
          '<span>' + escapeHtml(s.biFormId) + '</span> ' +
          '<span class="status-badge">' + escapeHtml(statusLabel(lang, s.status)) + '</span>' +
          '<button type="button" class="btn btn-secondary portal-bi-form-open" data-submission-id="' + s.id + '">→</button>' +
          '</li>';
      })
      .join("") || '<li class="muted">' + escapeHtml(t(lang, "noForms")) + '</li>';
    return '<h3>' + escapeHtml(t(lang, "sectionTitle")) + '</h3><ul class="portal-bi-forms-list">' + items + '</ul>';
  }

  // Called by portal-app.js's renderApplicationDetail() with the forms
  // already filtered to this application. Returns the section HTML and
  // wires click-to-open on the returned container once inserted. `lang`
  // is the client's general preferred_communication_language (a list can
  // contain forms in several different per-submission languages, so this
  // is only used for the section's own fixed chrome, not any one form's
  // content).
  function wireBiFormsSection(containerEl, submissions, onOpen, lang) {
    var sectionLang = CANONICAL_LANGUAGES.indexOf(lang) !== -1 ? lang : "en";
    containerEl.innerHTML = renderBiFormsSectionHtml(sectionLang, submissions);
    containerEl.querySelectorAll(".portal-bi-form-open").forEach(function (btn) {
      btn.addEventListener("click", function () { onOpen(btn.dataset.submissionId); });
    });
  }

  // ---- Full questionnaire view ----

  function pickLanguage(submission, client) {
    var preferred = submission.preferredLanguage || (client && client.preferredCommunicationLanguage);
    return CANONICAL_LANGUAGES.indexOf(preferred) !== -1 ? preferred : "en";
  }

  function labelFor(labels, lang) {
    return (labels && (labels[lang] || labels.en)) || "";
  }

  function isGateSatisfied(showIf, answers) {
    if (!showIf) return true;
    return answers[showIf.questionId] === showIf.equals;
  }

  function getAnswerValue(formEl, dataKey) {
    var radios = formEl.querySelectorAll('[data-answer-key="' + dataKey + '"][type="radio"]');
    if (radios.length) {
      var checked = formEl.querySelector('[data-answer-key="' + dataKey + '"][type="radio"]:checked');
      if (!checked) return undefined;
      return checked.value === "true" ? true : checked.value === "false" ? false : checked.value;
    }
    var el = formEl.querySelector('[data-answer-key="' + dataKey + '"]');
    return el ? el.value : undefined;
  }

  // Re-evaluates every showIf-gated question's visibility from the form's
  // OWN current DOM state, without re-rendering (preserves focus/cursor
  // position while typing). Called on every input/change within the form.
  function updateConditionalVisibility(formEl, questions) {
    var answers = {};
    questions.forEach(function (q) {
      if (q.type !== "repeatable-group") answers[q.dataKey] = getAnswerValue(formEl, q.dataKey);
    });
    questions.forEach(function (q) {
      if (!q.showIf) return;
      var wrapper = formEl.querySelector('[data-question-wrapper="' + q.id + '"]');
      if (wrapper) wrapper.hidden = !isGateSatisfied(q.showIf, answers);
    });
  }

  // Directive section 7: "I'm not sure -- let FIS help me", available on
  // every question. Checked state is read back by collectAnswers below
  // into a single reserved __unsureFields array (see
  // worker/src/routes/biFormsCustomer.js's relaxRequiredForUnsureFields
  // and staffBiForms.js's customer-fields completion route) -- never
  // interpreted as "No"/"None"/any other substantive answer, and never
  // disables the field itself, so a partial answer the customer already
  // typed is always preserved exactly as directive section 7 requires.
  function isUnsure(answers, key) {
    return Array.isArray(answers.__unsureFields) && answers.__unsureFields.indexOf(key) !== -1;
  }

  function unsureCheckboxHtml(lang, key, checked) {
    return '<label class="portal-unsure-toggle"><input type="checkbox" data-unsure-key="' + escapeAttr(key) + '"' + (checked ? " checked" : "") + '> ' + escapeHtml(t(lang, "imNotSureLabel")) + "</label>";
  }

  function renderQuestionHtml(q, lang, answers) {
    var label = escapeHtml(labelFor(q.labels, lang));
    var required = q.required !== false;
    var mark = required ? ' <span class="portal-required-mark">' + t(lang, "requiredMark") + '</span>' : "";
    var visible = isGateSatisfied(q.showIf, answers);
    var wrapperAttrs = 'data-question-wrapper="' + escapeAttr(q.id) + '"' + (visible ? "" : " hidden");

    if (q.type === "repeatable-group") {
      var unsureToggle = unsureCheckboxHtml(lang, q.groupDataKey, isUnsure(answers, q.groupDataKey));
      var items = answers[q.groupDataKey] || [];
      var entries = [];
      for (var i = 0; i < q.maxCount; i++) {
        var item = items[i] || {};
        var subFields = (q.subQuestions || [])
          .map(function (sub) {
            var subLabel = escapeHtml(labelFor(sub.labels, lang));
            var val = escapeAttr(item[sub.dataKey] || "");
            return '<div class="form-field"><label>' + subLabel + '</label>' +
              '<input type="text" data-group-key="' + escapeAttr(q.groupDataKey) + '" data-group-index="' + i + '" data-sub-key="' + escapeAttr(sub.dataKey) + '" value="' + val + '"></div>';
          })
          .join("");
        entries.push('<fieldset class="portal-repeatable-entry"><legend>' + escapeHtml(t(lang, "entryLabel").replace("{n}", String(i + 1))) + '</legend>' + subFields + '</fieldset>');
      }
      return '<div class="form-field form-field--full" ' + wrapperAttrs + '><label>' + label + mark + '</label>' + entries.join("") + unsureToggle + '</div>';
    }

    var currentValue = answers[q.dataKey];
    var fieldHtml;
    if (q.type === "yesno") {
      fieldHtml =
        '<label class="portal-radio"><input type="radio" name="q_' + escapeAttr(q.id) + '" data-answer-key="' + escapeAttr(q.dataKey) + '" value="true"' + (currentValue === true ? " checked" : "") + '> ' + escapeHtml(t(lang, "yes")) + '</label>' +
        '<label class="portal-radio"><input type="radio" name="q_' + escapeAttr(q.id) + '" data-answer-key="' + escapeAttr(q.dataKey) + '" value="false"' + (currentValue === false ? " checked" : "") + '> ' + escapeHtml(t(lang, "no")) + '</label>';
    } else if (q.type === "select") {
      var options = (q.options || [])
        .map(function (opt) {
          return '<option value="' + escapeAttr(opt) + '"' + (currentValue === opt ? " selected" : "") + '>' + escapeHtml(opt) + '</option>';
        })
        .join("");
      fieldHtml = '<select data-answer-key="' + escapeAttr(q.dataKey) + '"><option value="">—</option>' + options + '</select>';
    } else {
      fieldHtml = '<input type="text" data-answer-key="' + escapeAttr(q.dataKey) + '" value="' + escapeAttr(currentValue || "") + '">';
    }
    return '<div class="form-field" ' + wrapperAttrs + '><label>' + label + mark + '</label>' + fieldHtml + unsureCheckboxHtml(lang, q.dataKey, isUnsure(answers, q.dataKey)) + '</div>';
  }

  function collectAnswers(formEl, questions) {
    var answers = {};
    var unsureFields = [];
    questions.forEach(function (q) {
      if (q.type === "repeatable-group") {
        var items = [];
        for (var i = 0; i < q.maxCount; i++) {
          var item = {};
          (q.subQuestions || []).forEach(function (sub) {
            var el = formEl.querySelector('[data-group-key="' + q.groupDataKey + '"][data-group-index="' + i + '"][data-sub-key="' + sub.dataKey + '"]');
            item[sub.dataKey] = el ? el.value : "";
          });
          items.push(item);
        }
        answers[q.groupDataKey] = items;
        if (isUnsureChecked(formEl, q.groupDataKey)) unsureFields.push(q.groupDataKey);
      } else {
        answers[q.dataKey] = getAnswerValue(formEl, q.dataKey);
        if (isUnsureChecked(formEl, q.dataKey)) unsureFields.push(q.dataKey);
      }
    });
    answers.__unsureFields = unsureFields;
    return answers;
  }

  function isUnsureChecked(formEl, key) {
    var el = formEl.querySelector('[data-unsure-key="' + key + '"]');
    return !!(el && el.checked);
  }

  function renderBiFormDetailHtml(lang, data, docsData) {
    var submission = data.submission;
    var questionnaire = data.questionnaire;
    var editable = CUSTOMER_EDITABLE_STATUSES[submission.status];
    var availableLangs = questionnaire.languages || CANONICAL_LANGUAGES;

    var langOptions = availableLangs
      .map(function (code) {
        return '<option value="' + code + '"' + (code === lang ? " selected" : "") + '>' + code + '</option>';
      })
      .join("");

    var revisionNote = "";
    if (submission.status === "revision_requested") {
      var lastNote = (data.history || []).slice().reverse().find(function (h) { return h.status === "revision_requested" && h.note; });
      revisionNote = '<div class="portal-bi-form-revision-notice"><p>' + escapeHtml(t(lang, "revisionNotice")) + '</p>' +
        (lastNote ? '<p class="muted">' + escapeHtml(lastNote.note) + '</p>' : "") + '</div>';
    }

    var questionsHtml = questionnaire.questions.map(function (q) { return renderQuestionHtml(q, lang, submission.answers || {}); }).join("");

    var uploadsHtml = (docsData.uploads || [])
      .map(function (u) { return '<li>' + escapeHtml(u.original_filename) + '</li>'; })
      .join("") || '<li class="muted">' + escapeHtml(t(lang, "noDocumentsUploaded")) + '</li>';

    var previewHtml = "";
    if (submission.publishedAt && docsData.documents && docsData.documents.length) {
      previewHtml = '<div class="portal-bi-form-ready"><p>' + escapeHtml(t(lang, "readyLabel")) + '</p>' +
        docsData.documents
          .map(function (d) {
            return '<a class="btn btn-secondary" href="' + window.PORTAL_API_BASE + '/api/bi-forms/' + submission.id + '/documents/' + d.id + '" target="_blank" rel="noopener">' + escapeHtml(t(lang, "downloadLabel")) + '</a>';
          })
          .join(" ") + '</div>';
    }

    // Directive section 7: the Option 1/Option 2 choice shown at the
    // beginning of a fresh (never-yet-answered) application. "I'll
    // provide the details myself" simply dismisses this panel -- the
    // questionnaire below is always there regardless, so declining the
    // offer costs nothing. "I'm not sure -- let FIS help me" is wired in
    // renderInto() below: it marks every still-unanswered question
    // unsure and submits immediately with only what's already provided.
    var hasAnyAnswers = Object.keys(submission.answers || {}).some(function (k) {
      return k !== "__unsureFields" && submission.answers[k];
    });
    var showChoicePanel = editable && submission.status === "draft" && !hasAnyAnswers;
    var choicePanelHtml = showChoicePanel
      ? '<div class="portal-bi-form-choice-panel"><h3>' + escapeHtml(t(lang, "optionChooseHeading")) + '</h3>' +
        '<p class="enquiry-form-actions">' +
        '<button type="button" class="btn btn-secondary portal-bi-form-choice-self">' + escapeHtml(t(lang, "optionSelfLabel")) + '</button>' +
        '<button type="button" class="btn btn-primary portal-bi-form-choice-assist">' + escapeHtml(t(lang, "optionAssistLabel")) + '</button>' +
        '</p><p class="muted">' + escapeHtml(t(lang, "optionAssistHelp")) + '</p></div>'
      : "";

    var unsureFieldsCount = Array.isArray(submission.answers && submission.answers.__unsureFields) ? submission.answers.__unsureFields.length : 0;
    var actionsHtml = editable
      ? '<div class="enquiry-form-actions">' +
        '<button type="button" class="btn btn-secondary portal-bi-form-save">' + escapeHtml(t(lang, "saveDraft")) + '</button>' +
        '<button type="button" class="btn btn-primary portal-bi-form-submit">' + escapeHtml(t(lang, "submit")) + '</button>' +
        '<p class="portal-bi-form-status form-status" aria-live="polite"></p>' +
        '</div>' +
        '<p class="muted">' + escapeHtml(t(lang, "submitNotice")) + '</p>'
      : unsureFieldsCount
        ? '<p class="muted">' + escapeHtml(t(lang, "assistanceRequestedNotice")) + '</p>'
        : '<p class="muted">' + escapeHtml(t(lang, "readOnlyNotice")) + '</p>';

    return '<div class="card portal-detail-card portal-bi-form-detail" data-submission-id="' + submission.id + '" data-lang="' + lang + '">' +
      '<button type="button" class="btn btn-secondary portal-bi-form-back">' + escapeHtml(t(lang, "backToApplication")) + '</button>' +
      '<h2>' + escapeHtml(submission.serviceName || questionnaire.formId) + '</h2>' +
      '<p class="muted">' + escapeHtml(t(lang, "technicalReferenceLabel")) + ' ' + escapeHtml(submission.technicalReference || questionnaire.formId) + '</p>' +
      '<p><strong>' + escapeHtml(t(lang, "languageLabel")) + ':</strong> <select class="portal-bi-form-lang">' + langOptions + '</select></p>' +
      '<p class="muted">' + escapeHtml(t(lang, "instructions")) + '</p>' +
      choicePanelHtml +
      revisionNote +
      '<form class="portal-bi-form-form">' + questionsHtml + '</form>' +
      actionsHtml +
      '<h3>' + escapeHtml(t(lang, "documentsLabel")) + '</h3>' +
      '<ul class="portal-bi-form-uploads">' + uploadsHtml + '</ul>' +
      (editable ? '<label class="portal-upload-label">' + escapeHtml(t(lang, "uploadLabel")) + '<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="portal-bi-form-upload"></label>' : "") +
      previewHtml +
      '</div>';
  }

  function uploadFile(path, file) {
    return file.arrayBuffer().then(function (buffer) {
      return window.portalFetch(path, { method: "POST", headers: { "X-Filename": file.name }, body: buffer }).then(function (resp) { return resp.ok; });
    });
  }

  // Fetches a submission + its questionnaire + its documents, renders the
  // full editor into containerEl, and wires every interaction. `onBack`
  // returns to the application detail view the section was opened from.
  // `clientPreferredLanguage` is only a fallback for a submission that has
  // never had its own preferredLanguage set yet.
  function openBiFormDetail(containerEl, submissionId, onBack, clientPreferredLanguage) {
    containerEl.innerHTML = '<p class="muted">' + escapeHtml(t("en", "loading")) + '</p>';
    Promise.all([
      window.portalFetch("/api/bi-forms/" + submissionId).then(function (r) { return r.json(); }),
      window.portalFetch("/api/bi-forms/" + submissionId + "/documents").then(function (r) { return r.json(); }),
    ]).then(function (results) {
      var data = results[0];
      var docsData = results[1];
      var lang = pickLanguage(data.submission, { preferredCommunicationLanguage: clientPreferredLanguage });
      renderInto(data, docsData, lang);
    });

    function renderInto(data, docsData, lang) {
      containerEl.innerHTML = renderBiFormDetailHtml(lang, data, docsData);
      var root = containerEl.querySelector(".portal-bi-form-detail");
      var formEl = root.querySelector(".portal-bi-form-form");
      var statusEl = root.querySelector(".portal-bi-form-status");

      root.querySelector(".portal-bi-form-back").addEventListener("click", onBack);

      root.querySelector(".portal-bi-form-lang").addEventListener("change", function (event) {
        var newLang = event.target.value;
        // Current in-progress (unsaved) answers are preserved across a
        // language switch by collecting them from the DOM before
        // re-rendering with the new language's labels.
        data.submission.answers = Object.assign({}, data.submission.answers, collectAnswers(formEl, data.questionnaire.questions));
        renderInto(data, docsData, newLang);
      });

      formEl.addEventListener("input", function () { updateConditionalVisibility(formEl, data.questionnaire.questions); });
      formEl.addEventListener("change", function () { updateConditionalVisibility(formEl, data.questionnaire.questions); });
      updateConditionalVisibility(formEl, data.questionnaire.questions);

      var saveBtn = root.querySelector(".portal-bi-form-save");
      if (saveBtn) {
        saveBtn.addEventListener("click", function () {
          var answers = collectAnswers(formEl, data.questionnaire.questions);
          statusEl.textContent = t(lang, "saving");
          window
            .portalFetch("/api/bi-forms/" + submissionId + "/draft", {
              method: "PATCH",
              body: JSON.stringify({ answers: answers, preferredLanguage: lang }),
            })
            .then(function (resp) {
              statusEl.textContent = resp.ok ? t(lang, "saved") : t(lang, "saveError");
              if (resp.ok) data.submission.answers = answers;
            })
            .catch(function () { statusEl.textContent = t(lang, "saveError"); });
        });
      }

      // Shared by the normal Submit button and the "I'm not sure -- let FIS
      // help me (quick start)" choice-panel button below -- both save the
      // given answers as the draft, then submit, then re-open the
      // submission so its new (read-only) state is reflected everywhere,
      // including the Staff Portal's own view of the same data.
      function submitWithAnswers(answers) {
        statusEl.textContent = t(lang, "saving");
        return window
          .portalFetch("/api/bi-forms/" + submissionId + "/draft", { method: "PATCH", body: JSON.stringify({ answers: answers, preferredLanguage: lang }) })
          .then(function () {
            return window.portalFetch("/api/bi-forms/" + submissionId + "/submit", { method: "POST" });
          })
          .then(function (resp) {
            if (resp.ok) {
              statusEl.textContent = t(lang, "submitted");
              openBiFormDetail(containerEl, submissionId, onBack);
            } else {
              statusEl.textContent = t(lang, "submitError");
            }
          })
          .catch(function () { statusEl.textContent = t(lang, "submitError"); });
      }

      var submitBtn = root.querySelector(".portal-bi-form-submit");
      if (submitBtn) {
        submitBtn.addEventListener("click", function () {
          submitWithAnswers(collectAnswers(formEl, data.questionnaire.questions));
        });
      }

      var choiceSelfBtn = root.querySelector(".portal-bi-form-choice-self");
      if (choiceSelfBtn) {
        choiceSelfBtn.addEventListener("click", function () {
          var panel = root.querySelector(".portal-bi-form-choice-panel");
          if (panel) panel.remove();
        });
      }

      var choiceAssistBtn = root.querySelector(".portal-bi-form-choice-assist");
      if (choiceAssistBtn) {
        choiceAssistBtn.addEventListener("click", function () {
          // Directive section 7's full assisted-completion pathway: every
          // CURRENTLY required-and-unanswered question (same `required`/
          // `showIf` rules the questionnaire already enforces -- nothing
          // re-implemented here) is marked unsure, preserving anything the
          // customer already typed, and the request is submitted now with
          // just that. Never invents an answer for any of them.
          var answers = collectAnswers(formEl, data.questionnaire.questions);
          var unsure = {};
          (answers.__unsureFields || []).forEach(function (k) { unsure[k] = true; });
          data.questionnaire.questions.forEach(function (q) {
            var key = q.type === "repeatable-group" ? q.groupDataKey : q.dataKey;
            if (q.required === false) return;
            if (q.showIf && !isGateSatisfied(q.showIf, answers)) return;
            var hasValue = q.type === "repeatable-group" ? Array.isArray(answers[key]) && answers[key].some(function (item) { return Object.keys(item || {}).some(function (k) { return item[k]; }); }) : !!answers[key];
            if (!hasValue) unsure[key] = true;
          });
          answers.__unsureFields = Object.keys(unsure);
          submitWithAnswers(answers);
        });
      }

      var uploadInput = root.querySelector(".portal-bi-form-upload");
      if (uploadInput) {
        uploadInput.addEventListener("change", function () {
          var file = uploadInput.files[0];
          if (!file) return;
          uploadFile("/api/bi-forms/" + submissionId + "/documents", file)
            .then(function (ok) {
              if (!ok) {
                statusEl.textContent = t(lang, "uploadError");
                return;
              }
              // Refreshes ONLY the uploads list in place, not the whole
              // form (openBiFormDetail re-fetches from the server and
              // would otherwise silently discard any answer the customer
              // has typed but not yet saved as a draft).
              return window
                .portalFetch("/api/bi-forms/" + submissionId + "/documents")
                .then(function (r) { return r.json(); })
                .then(function (freshDocsData) {
                  docsData.uploads = freshDocsData.uploads;
                  var uploadsEl = root.querySelector(".portal-bi-form-uploads");
                  uploadsEl.innerHTML =
                    (freshDocsData.uploads || []).map(function (u) { return "<li>" + escapeHtml(u.original_filename) + "</li>"; }).join("") ||
                    '<li class="muted">' + escapeHtml(t(lang, "noDocumentsUploaded")) + "</li>";
                });
            })
            .catch(function () { statusEl.textContent = t(lang, "uploadError"); });
        });
      }
    }
  }

  window.PortalBiForms = { wireBiFormsSection: wireBiFormsSection, openBiFormDetail: openBiFormDetail };
})();
