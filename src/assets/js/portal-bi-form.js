// Phase 2 Stage 5.4 (extended): the multilingual BI-form questionnaire
// renderer, extending the existing authenticated Client Portal
// (portal-app.js) rather than a separate application -- this file only
// renders into a section portal-app.js's own renderApplicationDetail()
// already calls into (see wireBiFormsSection below), and reuses the SAME
// window.portalFetch helper, the same vanilla-JS/escapeHtml/template-
// literal style, and the same "API is the source of truth, this is
// presentation only" posture as every other section of the portal.
//
// Does NOT translate or alter the official English BI PDF in any way --
// this only localizes the QUESTIONNAIRE chrome and field labels (the
// Client Portal's own UI around a BI form), using each form's own
// questionnaire.json label translations the Worker already returns.
// Nothing here ever receives or renders a staff-only field, a staff-only
// note, or the original BI template -- the API this talks to
// (worker/src/routes/biFormsCustomer.js) already enforces that server-side.
//
// "FINAL BI FORMS AUTOMATION & PREMIUM CUSTOMER EXPERIENCE" directive,
// sections 6-7: this is a genuine multi-step wizard (Step 1 Applicant
// Info -> Step 2 Service-Specific -> Step 3 Documents -> Step 4 Review),
// not a flat form with headings, and the assisted-completion pathway
// ("I'm not sure") now leads to a real, separately-reviewed SHORTER
// intake rather than an instant mass-mark-unsure-and-submit. Every
// question's own `required`/`showIf` rule, and the SAME __unsureFields
// convention the Worker already validates (relaxRequiredForUnsureFields),
// is reused unchanged -- no parallel validation system was invented.
(function () {
  "use strict";

  var CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];

  // The common-customer-information fields every one of the 3 currently
  // engine-mapped forms' questionnaires (and, by direct inspection, every
  // other BI form in the inventory that asks for applicant identity at
  // all) opens with -- the SAME fields the directive's own section 3
  // calls out for cross-form reuse. Matching by dataKey, not by position
  // or by a new per-question "step" property, means this works for every
  // existing form unchanged and for any future form whose questionnaire
  // reuses these same dataKeys (exactly as the shared answer schema
  // intends), with zero changes to any config JSON.
  var APPLICANT_INFO_DATA_KEYS = [
    "lastName", "firstName", "middleName", "otherName1", "otherName2",
    "dobDay", "dobMonth", "dobYear", "gender", "placeOfBirth", "citizenship",
    "address1", "barangay", "provinceZip", "passportNumber",
  ];

  // The assisted-completion shortened intake's "essential identification"
  // subset (directive section 7) -- deliberately smaller than the full
  // applicant-info step above. Contact number is collected separately
  // (see ASSIST_CONTACT_KEY below), not from this list.
  var ASSISTED_MINIMUM_DATA_KEYS = ["lastName", "firstName", "middleName", "dobDay", "dobMonth", "dobYear", "citizenship", "passportNumber"];

  // A reserved-key addition to the answers blob, the same established
  // pattern as __unsureFields (worker/src/routes/biFormsCustomer.js) --
  // avoids a schema/migration change for a field that only exists in the
  // assisted-intake UI, never on the official BI form itself. Stripped
  // back out before anything is shown as an "official form answer" and
  // simply saved as part of the draft like any other answer; staff can
  // read it directly off customer_answers_json via the existing Staff
  // Portal "Customer Answers" view.
  var ASSIST_CONTACT_KEY = "__assistContactNumber";

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
      guidedIntroPara1: "We'll take care of the complicated paperwork.",
      guidedIntroPara2: "The questions below come from the official Bureau of Immigration form used for your selected service. We're asking for this information so we can prepare your documents accurately and process your transaction.",
      guidedIntroLivePreview: "Watch your answers appear on the official form. As you answer each question, we'll automatically enter your information into the corresponding section of the Bureau of Immigration form, which you can see in the live preview.",
      guidedIntroPara3: "Don't worry if you don't know every answer. We understand that immigration paperwork can be complicated, and we don't expect you to know everything. Simply answer what you can and select “I'm not sure — let FIS help me” whenever you're uncertain.",
      guidedIntroPara4: "Please upload a clear copy of your passport's information page and any other documents requested for your service. We'll handle your personal information securely and in accordance with our Privacy Notice.",
      guidedIntroPara5: "For most eligible transactions, we can proceed with processing your request even if some questions remain unanswered, as long as we have the documents and information required for that service. If we need anything further from you, we'll contact you directly through your Client Portal.",
      guidedIntroClosing: "You provide what you know. We'll take care of the rest.",
      optionChooseHeading: "Before you begin",
      optionSelfLabel: "I'll provide the details myself",
      optionAssistLabel: "I'm not sure — let FIS help me (quick start)",
      optionAssistHelp: "We'll show you a short form with just the essentials. You'll review and confirm before anything is submitted — FIS will then contact you to complete the rest.",
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
      stepApplicantInfo: "Applicant Information", stepServiceSpecific: "Service-Specific Information",
      stepDocuments: "Supporting Documents", stepReview: "Review",
      stepIndicatorLabel: "Step {n} of {total}",
      backButton: "Back", continueButton: "Continue",
      validationIncomplete: "Please complete the required fields below, or mark them \"I'm not sure\", before continuing.",
      reviewIntro: "Please review your answers below before submitting.",
      editSectionLabel: "Edit",
      noAnswerYetLabel: "(not yet provided)",
      reviewUnsureNote: "marked for FIS assistance",
      assistIntakeHeading: "Quick Start — A Few Essentials",
      assistIntakeIntro: "Just the essentials for now. FIS will contact you to complete the rest.",
      assistContactLabel: "Best contact number",
      assistReviewHeading: "Review Before Submitting",
      assistReviewIntro: "Here's what you've provided. Anything left blank will be marked as needing FIS's help. Please review before submitting.",
      confirmAndSubmitButton: "Confirm and Submit",
      documentsOptionalNotice: "You may upload what you have now and provide the rest later.",
      officialPreviewHeading: "Official Form Preview",
      officialPreviewUpdating: "Updating preview…",
      officialPreviewUnavailable: "A live preview isn't available for this form yet.",
      officialPreviewEnlargeLabel: "Enlarge",
      officialPreviewCollapseLabel: "Hide preview",
      officialPreviewShowLabel: "Show form preview",
    },
    "zh-CN": {
      sectionTitle: "BI 表格", noForms: "尚未分配 BI 表格。",
      status: { draft: "草稿", submitted: "已提交", under_review: "审核中", revision_requested: "需要修改", approved: "已批准", published: "已就绪", cancelled: "已取消" },
      backToApplication: "← 返回", languageLabel: "语言", loading: "加载中...",
      instructions: "请填写此表格。在您提交之前，只有您本人可以查看您的答案。",
      technicalReferenceLabel: "菲律宾移民局表格编号",
      imNotSureLabel: "不确定——请FIS协助我",
      guidedIntroPara1: "我们会为您处理繁琐的文书工作。",
      guidedIntroPara2: "以下问题来自您所选服务所使用的菲律宾移民局官方表格。我们询问这些信息，是为了准确地为您准备文件并处理您的申请。",
      guidedIntroLivePreview: "实时查看您的答案显示在官方表格上。您每回答一个问题，我们都会自动将您的信息填入菲律宾移民局表格的相应部分，您可以在实时预览中看到。",
      guidedIntroPara3: "如果您不清楚某些答案，请不用担心。我们理解移民文书可能相当复杂，并不要求您了解所有内容。请尽量填写您知道的信息，如遇不确定的情况，请勾选“不确定——请FIS协助我”。",
      guidedIntroPara4: "请上传一份清晰的护照资料页副本，以及您所选服务所需的其他文件。我们将按照我们的《隐私声明》安全处理您的个人信息。",
      guidedIntroPara5: "对于大多数符合条件的申请，即使部分问题尚未回答，只要我们已获得该服务所需的文件和信息，我们仍可以继续处理您的申请。如果我们还需要您提供其他资料，我们会通过您的客户门户直接与您联系。",
      guidedIntroClosing: "您只需提供您所知道的信息，其余的交给我们。",
      optionChooseHeading: "开始之前",
      optionSelfLabel: "我自己填写详细信息",
      optionAssistLabel: "不确定——请FIS协助我（快速开始）",
      optionAssistHelp: "我们将为您显示一份仅包含基本信息的简短表格。提交前您可以核对并确认——之后FIS会与您联系以完成其余部分。",
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
      stepApplicantInfo: "申请人信息", stepServiceSpecific: "服务相关信息",
      stepDocuments: "所需文件", stepReview: "核对",
      stepIndicatorLabel: "第 {n} 步，共 {total} 步",
      backButton: "上一步", continueButton: "继续",
      validationIncomplete: "请填写以下必填项，或勾选“不确定”，然后再继续。",
      reviewIntro: "提交前请核对以下您的答案。",
      editSectionLabel: "编辑",
      noAnswerYetLabel: "（尚未提供）",
      reviewUnsureNote: "已标记为需要FIS协助",
      assistIntakeHeading: "快速开始——仅需几项基本信息",
      assistIntakeIntro: "现在只需填写基本信息，其余部分FIS将与您联系完成。",
      assistContactLabel: "最佳联系电话",
      assistReviewHeading: "提交前核对",
      assistReviewIntro: "以下是您已提供的信息。留空的内容将标记为需要FIS协助。请在提交前核对。",
      confirmAndSubmitButton: "确认并提交",
      documentsOptionalNotice: "您可以先上传现有文件，其余文件稍后再提供。",
      officialPreviewHeading: "官方表格预览",
      officialPreviewUpdating: "正在更新预览…",
      officialPreviewUnavailable: "此表格暂无实时预览。",
      officialPreviewEnlargeLabel: "放大",
      officialPreviewCollapseLabel: "隐藏预览",
      officialPreviewShowLabel: "显示表格预览",
    },
    "zh-Hant": {
      sectionTitle: "BI 表格", noForms: "尚未分配 BI 表格。",
      status: { draft: "草稿", submitted: "已提交", under_review: "審核中", revision_requested: "需要修改", approved: "已批准", published: "已就緒", cancelled: "已取消" },
      backToApplication: "← 返回", languageLabel: "語言", loading: "載入中...",
      instructions: "請填寫此表格。在您提交之前，只有您本人可以查看您的答案。",
      technicalReferenceLabel: "菲律賓移民局表格編號",
      imNotSureLabel: "不確定——請FIS協助我",
      guidedIntroPara1: "我們會為您處理繁瑣的文書工作。",
      guidedIntroPara2: "以下問題來自您所選服務所使用的菲律賓移民局官方表格。我們詢問這些資訊，是為了準確地為您準備文件並處理您的申請。",
      guidedIntroLivePreview: "即時查看您的答案顯示在官方表格上。您每回答一個問題，我們都會自動將您的資訊填入菲律賓移民局表格的相應部分，您可以在即時預覽中看到。",
      guidedIntroPara3: "如果您不清楚某些答案，請不用擔心。我們理解移民文書可能相當複雜，並不要求您了解所有內容。請盡量填寫您知道的資訊，如遇不確定的情況，請勾選「不確定——請FIS協助我」。",
      guidedIntroPara4: "請上傳一份清晰的護照資料頁副本，以及您所選服務所需的其他文件。我們將按照我們的《隱私聲明》安全處理您的個人資訊。",
      guidedIntroPara5: "對於大多數符合資格的申請，即使部分問題尚未回答，只要我們已取得該服務所需的文件和資訊，我們仍可以繼續處理您的申請。如果我們還需要您提供其他資料，我們會透過您的客戶入口網站直接與您聯繫。",
      guidedIntroClosing: "您只需提供您所知道的資訊，其餘的交給我們。",
      optionChooseHeading: "開始之前",
      optionSelfLabel: "我自己填寫詳細資料",
      optionAssistLabel: "不確定——請FIS協助我（快速開始）",
      optionAssistHelp: "我們將為您顯示一份僅包含基本資訊的簡短表格。提交前您可以核對並確認——之後FIS會與您聯繫以完成其餘部分。",
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
      stepApplicantInfo: "申請人資訊", stepServiceSpecific: "服務相關資訊",
      stepDocuments: "所需文件", stepReview: "核對",
      stepIndicatorLabel: "第 {n} 步，共 {total} 步",
      backButton: "上一步", continueButton: "繼續",
      validationIncomplete: "請填寫以下必填項，或勾選「不確定」，然後再繼續。",
      reviewIntro: "提交前請核對以下您的答案。",
      editSectionLabel: "編輯",
      noAnswerYetLabel: "（尚未提供）",
      reviewUnsureNote: "已標記為需要FIS協助",
      assistIntakeHeading: "快速開始——僅需幾項基本資訊",
      assistIntakeIntro: "現在只需填寫基本資訊，其餘部分FIS將與您聯繫完成。",
      assistContactLabel: "最佳聯絡電話",
      assistReviewHeading: "提交前核對",
      assistReviewIntro: "以下是您已提供的資訊。留空的內容將標記為需要FIS協助。請在提交前核對。",
      confirmAndSubmitButton: "確認並提交",
      documentsOptionalNotice: "您可以先上傳現有文件，其餘文件稍後再提供。",
      officialPreviewHeading: "官方表格預覽",
      officialPreviewUpdating: "正在更新預覽…",
      officialPreviewUnavailable: "此表格暫無即時預覽。",
      officialPreviewEnlargeLabel: "放大",
      officialPreviewCollapseLabel: "隱藏預覽",
      officialPreviewShowLabel: "顯示表格預覽",
    },
    ko: {
      sectionTitle: "BI 양식", noForms: "아직 배정된 BI 양식이 없습니다.",
      status: { draft: "임시 저장", submitted: "제출됨", under_review: "검토 중", revision_requested: "수정 요청됨", approved: "승인됨", published: "준비 완료", cancelled: "취소됨" },
      backToApplication: "← 뒤로", languageLabel: "언어", loading: "불러오는 중...",
      instructions: "이 양식을 작성해 주십시오. 제출하기 전까지는 본인만 답변을 볼 수 있습니다.",
      technicalReferenceLabel: "필리핀 출입국관리청 서식 번호",
      imNotSureLabel: "잘 모르겠어요 — FIS의 도움을 받고 싶어요",
      guidedIntroPara1: "복잡한 서류 작업은 저희가 처리해 드리겠습니다.",
      guidedIntroPara2: "아래 질문들은 귀하가 선택하신 서비스에 사용되는 필리핀 출입국관리청 공식 양식에서 가져온 것입니다. 저희가 이 정보를 요청드리는 이유는 서류를 정확하게 준비하고 귀하의 신청을 처리하기 위해서입니다.",
      guidedIntroLivePreview: "귀하의 답변이 공식 양식에 실시간으로 반영되는 것을 확인하세요. 질문에 답변하실 때마다, 저희는 해당 정보를 필리핀 출입국관리청 양식의 해당 항목에 자동으로 입력하며, 이는 실시간 미리보기에서 확인하실 수 있습니다.",
      guidedIntroPara3: "모든 답을 알지 못하셔도 걱정하지 마십시오. 이민 서류 절차가 복잡할 수 있다는 점을 이해하고 있으며, 모든 것을 알고 계실 것이라 기대하지 않습니다. 아시는 내용만 답변해 주시고, 확실하지 않을 때는 \"잘 모르겠어요 — FIS의 도움을 받고 싶어요\"를 선택해 주십시오.",
      guidedIntroPara4: "여권 정보 페이지의 선명한 사본과 해당 서비스에 필요한 기타 서류를 업로드해 주십시오. 저희는 귀하의 개인정보를 당사 개인정보 보호방침에 따라 안전하게 처리합니다.",
      guidedIntroPara5: "대부분의 적격 거래의 경우, 일부 질문에 답변하지 않으셨더라도 해당 서비스에 필요한 서류와 정보를 저희가 확보하고 있다면 신청 처리를 계속 진행할 수 있습니다. 추가로 필요한 사항이 있을 경우, 고객 포털을 통해 직접 연락드리겠습니다.",
      guidedIntroClosing: "아시는 내용만 제공해 주시면, 나머지는 저희가 처리하겠습니다.",
      optionChooseHeading: "시작하기 전에",
      optionSelfLabel: "제가 직접 작성하겠습니다",
      optionAssistLabel: "잘 모르겠어요 — FIS의 도움을 받고 싶어요 (빠른 시작)",
      optionAssistHelp: "필수 정보만 담긴 간단한 양식을 보여드립니다. 제출 전에 검토하고 확인하실 수 있으며, 이후 FIS가 연락드려 나머지를 완료하겠습니다.",
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
      stepApplicantInfo: "신청인 정보", stepServiceSpecific: "서비스 관련 정보",
      stepDocuments: "필요 서류", stepReview: "검토",
      stepIndicatorLabel: "{total}단계 중 {n}단계",
      backButton: "이전", continueButton: "계속",
      validationIncomplete: "계속하려면 아래 필수 항목을 작성하거나 \"잘 모르겠어요\"로 표시해 주십시오.",
      reviewIntro: "제출하기 전에 아래 답변을 검토해 주십시오.",
      editSectionLabel: "수정",
      noAnswerYetLabel: "(아직 제공되지 않음)",
      reviewUnsureNote: "FIS 지원이 필요한 것으로 표시됨",
      assistIntakeHeading: "빠른 시작 — 몇 가지 필수 정보",
      assistIntakeIntro: "지금은 필수 정보만 입력해 주세요. 나머지는 FIS가 연락드려 완료하겠습니다.",
      assistContactLabel: "연락 가능한 전화번호",
      assistReviewHeading: "제출 전 검토",
      assistReviewIntro: "입력하신 내용입니다. 비워둔 항목은 FIS의 도움이 필요한 것으로 표시됩니다. 제출 전에 검토해 주십시오.",
      confirmAndSubmitButton: "확인 및 제출",
      documentsOptionalNotice: "지금 가지고 있는 서류를 먼저 업로드하고, 나머지는 나중에 제공하실 수 있습니다.",
      officialPreviewHeading: "공식 양식 미리보기",
      officialPreviewUpdating: "미리보기 업데이트 중…",
      officialPreviewUnavailable: "이 양식에는 아직 실시간 미리보기를 사용할 수 없습니다.",
      officialPreviewEnlargeLabel: "확대",
      officialPreviewCollapseLabel: "미리보기 숨기기",
      officialPreviewShowLabel: "양식 미리보기 표시",
    },
    ja: {
      sectionTitle: "BI フォーム", noForms: "まだ割り当てられた BI フォームはありません。",
      status: { draft: "下書き", submitted: "提出済み", under_review: "確認中", revision_requested: "修正依頼あり", approved: "承認済み", published: "準備完了", cancelled: "キャンセル済み" },
      backToApplication: "← 戻る", languageLabel: "言語", loading: "読み込み中...",
      instructions: "このフォームにご記入ください。提出するまで、回答はご本人のみが閲覧できます。",
      technicalReferenceLabel: "フィリピン入国管理局 様式番号",
      imNotSureLabel: "わからない — FISに手伝ってほしい",
      guidedIntroPara1: "複雑な書類手続きは私たちにお任せください。",
      guidedIntroPara2: "以下の質問は、お客様が選択されたサービスで使用される、フィリピン入国管理局の公式様式からのものです。正確に書類を準備し、お手続きを進めるために、これらの情報をお伺いしております。",
      guidedIntroLivePreview: "ご回答が公式様式に反映される様子をご確認いただけます。各質問にご回答いただくたびに、フィリピン入国管理局様式の該当箇所に情報が自動的に入力され、ライブプレビューでご確認いただけます。",
      guidedIntroPara3: "すべての回答がわからなくてもご安心ください。入国管理の書類手続きが複雑であることは私たちも理解しており、すべてをご存知である必要はありません。わかる範囲でご回答いただき、わからない場合は「わからない — FISに手伝ってほしい」を選択してください。",
      guidedIntroPara4: "パスポートの身分事項ページの鮮明なコピーと、ご利用のサービスに必要なその他の書類をアップロードしてください。お客様の個人情報は、当社のプライバシー通知に従い安全に取り扱います。",
      guidedIntroPara5: "ほとんどの対象となるお手続きでは、一部の質問に未回答であっても、そのサービスに必要な書類と情報が揃っていれば、お手続きを進めることができます。さらに情報が必要な場合は、クライアントポータルを通じて直接ご連絡いたします。",
      guidedIntroClosing: "ご存知の情報をご提供いただければ、残りは私たちにお任せください。",
      optionChooseHeading: "ご記入の前に",
      optionSelfLabel: "自分で情報を入力します",
      optionAssistLabel: "わからない — FISに手伝ってほしい（クイックスタート）",
      optionAssistHelp: "基本項目のみの簡単なフォームを表示します。送信前にご確認・ご承認いただけます。その後FISがご連絡の上、残りを完了いたします。",
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
      stepApplicantInfo: "申請者情報", stepServiceSpecific: "サービス関連情報",
      stepDocuments: "必要書類", stepReview: "確認",
      stepIndicatorLabel: "{total}ステップ中のステップ{n}",
      backButton: "戻る", continueButton: "次へ",
      validationIncomplete: "続ける前に、以下の必須項目にご入力いただくか、「わからない」にチェックしてください。",
      reviewIntro: "送信する前に、以下の回答をご確認ください。",
      editSectionLabel: "編集",
      noAnswerYetLabel: "（未入力）",
      reviewUnsureNote: "FISのサポートが必要として記録",
      assistIntakeHeading: "クイックスタート — 基本項目のみ",
      assistIntakeIntro: "今は基本項目のみで結構です。残りはFISがご連絡の上完了いたします。",
      assistContactLabel: "連絡先電話番号",
      assistReviewHeading: "送信前のご確認",
      assistReviewIntro: "ご入力いただいた内容です。未入力の項目はFISのサポートが必要として記録されます。送信前にご確認ください。",
      confirmAndSubmitButton: "確認して送信",
      documentsOptionalNotice: "現在お持ちの資料のみ先にアップロードし、残りは後日ご提出いただけます。",
      officialPreviewHeading: "公式フォームのプレビュー",
      officialPreviewUpdating: "プレビューを更新中…",
      officialPreviewUnavailable: "このフォームのライブプレビューはまだご利用いただけません。",
      officialPreviewEnlargeLabel: "拡大",
      officialPreviewCollapseLabel: "プレビューを隠す",
      officialPreviewShowLabel: "フォームのプレビューを表示",
    },
    vi: {
      sectionTitle: "Mẫu BI", noForms: "Chưa có mẫu BI nào được chỉ định.",
      status: { draft: "Bản nháp", submitted: "Đã nộp", under_review: "Đang xem xét", revision_requested: "Yêu cầu chỉnh sửa", approved: "Đã phê duyệt", published: "Đã sẵn sàng", cancelled: "Đã hủy" },
      backToApplication: "← Quay lại", languageLabel: "Ngôn ngữ", loading: "Đang tải...",
      instructions: "Vui lòng hoàn thành mẫu này. Chỉ bạn mới có thể xem câu trả lời của mình cho đến khi bạn nộp.",
      technicalReferenceLabel: "Mẫu đơn Cục Di trú Philippines số",
      imNotSureLabel: "Tôi không chắc — hãy để FIS hỗ trợ tôi",
      guidedIntroPara1: "Chúng tôi sẽ lo liệu các thủ tục giấy tờ phức tạp.",
      guidedIntroPara2: "Các câu hỏi dưới đây được lấy từ mẫu đơn chính thức của Cục Di trú được sử dụng cho dịch vụ quý khách đã chọn. Chúng tôi yêu cầu thông tin này để có thể chuẩn bị hồ sơ của quý khách một cách chính xác và xử lý giao dịch của quý khách.",
      guidedIntroLivePreview: "Theo dõi câu trả lời của quý khách xuất hiện trên mẫu đơn chính thức. Khi quý khách trả lời từng câu hỏi, chúng tôi sẽ tự động nhập thông tin của quý khách vào phần tương ứng trên mẫu đơn của Cục Di trú, mà quý khách có thể xem trong bản xem trước trực tiếp.",
      guidedIntroPara3: "Đừng lo nếu quý khách không biết mọi câu trả lời. Chúng tôi hiểu rằng thủ tục giấy tờ di trú có thể phức tạp, và chúng tôi không mong đợi quý khách biết tất cả mọi thứ. Chỉ cần trả lời những gì quý khách biết và chọn \"Tôi không chắc — hãy để FIS hỗ trợ tôi\" bất cứ khi nào quý khách không chắc chắn.",
      guidedIntroPara4: "Vui lòng tải lên một bản sao rõ ràng trang thông tin hộ chiếu của quý khách và bất kỳ tài liệu nào khác được yêu cầu cho dịch vụ của quý khách. Chúng tôi sẽ xử lý thông tin cá nhân của quý khách một cách an toàn và theo Thông báo Quyền riêng tư của chúng tôi.",
      guidedIntroPara5: "Đối với hầu hết các giao dịch đủ điều kiện, chúng tôi có thể tiến hành xử lý yêu cầu của quý khách ngay cả khi một số câu hỏi vẫn chưa được trả lời, miễn là chúng tôi có đủ tài liệu và thông tin cần thiết cho dịch vụ đó. Nếu chúng tôi cần thêm bất kỳ thông tin nào từ quý khách, chúng tôi sẽ liên hệ trực tiếp với quý khách qua Cổng thông tin Khách hàng.",
      guidedIntroClosing: "Quý khách chỉ cần cung cấp những gì mình biết. Phần còn lại, chúng tôi sẽ lo liệu.",
      optionChooseHeading: "Trước khi bắt đầu",
      optionSelfLabel: "Tôi sẽ tự cung cấp thông tin",
      optionAssistLabel: "Tôi không chắc — hãy để FIS hỗ trợ tôi (bắt đầu nhanh)",
      optionAssistHelp: "Chúng tôi sẽ hiển thị cho quý khách một mẫu ngắn chỉ gồm các thông tin thiết yếu. Quý khách sẽ xem lại và xác nhận trước khi nộp — sau đó FIS sẽ liên hệ để hoàn tất phần còn lại.",
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
      stepApplicantInfo: "Thông Tin Người Nộp Đơn", stepServiceSpecific: "Thông Tin Liên Quan Đến Dịch Vụ",
      stepDocuments: "Hồ Sơ Cần Nộp", stepReview: "Xem Lại",
      stepIndicatorLabel: "Bước {n}/{total}",
      backButton: "Quay Lại", continueButton: "Tiếp Tục",
      validationIncomplete: "Vui lòng hoàn thành các mục bắt buộc dưới đây, hoặc đánh dấu \"Tôi không chắc\", trước khi tiếp tục.",
      reviewIntro: "Vui lòng xem lại câu trả lời của quý khách dưới đây trước khi nộp.",
      editSectionLabel: "Chỉnh Sửa",
      noAnswerYetLabel: "(chưa cung cấp)",
      reviewUnsureNote: "đã đánh dấu cần FIS hỗ trợ",
      assistIntakeHeading: "Bắt Đầu Nhanh — Một Vài Thông Tin Thiết Yếu",
      assistIntakeIntro: "Hiện tại chỉ cần những thông tin thiết yếu. FIS sẽ liên hệ với quý khách để hoàn tất phần còn lại.",
      assistContactLabel: "Số Điện Thoại Liên Hệ Tốt Nhất",
      assistReviewHeading: "Xem Lại Trước Khi Nộp",
      assistReviewIntro: "Đây là những gì quý khách đã cung cấp. Những mục để trống sẽ được đánh dấu là cần FIS hỗ trợ. Vui lòng xem lại trước khi nộp.",
      confirmAndSubmitButton: "Xác Nhận và Nộp",
      documentsOptionalNotice: "Quý khách có thể tải lên những gì hiện có và cung cấp phần còn lại sau.",
      officialPreviewHeading: "Xem trước mẫu đơn chính thức",
      officialPreviewUpdating: "Đang cập nhật bản xem trước…",
      officialPreviewUnavailable: "Bản xem trước trực tiếp chưa khả dụng cho mẫu đơn này.",
      officialPreviewEnlargeLabel: "Phóng to",
      officialPreviewCollapseLabel: "Ẩn bản xem trước",
      officialPreviewShowLabel: "Hiện bản xem trước mẫu đơn",
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
        // Directive section 3: the friendly service name is the primary
        // label; the official BI form ID is a secondary reference, never
        // the primary one shown to a customer.
        return '<li class="portal-bi-form-item" data-submission-id="' + s.id + '">' +
          '<span>' + escapeHtml(s.serviceName || s.biFormId) + '</span> ' +
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

  function questionKey(q) {
    return q.type === "repeatable-group" ? q.groupDataKey : q.dataKey;
  }

  // Splits a form's full question list into the wizard's Step 1
  // (applicant info) and Step 2 (everything else, i.e. service-specific)
  // -- directive section 6. A form with no service-specific questions at
  // all (e.g. CCS-A-CDR-2016, 2014-13-002) simply gets an empty step2,
  // which the wizard skips (see totalSteps/stepSequence below) --
  // "step count/order may vary by form" is handled by this split being
  // computed per-form, not by hardcoding a fixed step count anywhere.
  function classifyQuestions(questions) {
    var step1 = [], step2 = [];
    questions.forEach(function (q) {
      (APPLICANT_INFO_DATA_KEYS.indexOf(questionKey(q)) !== -1 ? step1 : step2).push(q);
    });
    return { step1: step1, step2: step2 };
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

  // Re-evaluates every showIf-gated question's visibility against an
  // externally supplied, already-merged `answers` object (see
  // collectAnswers below) rather than re-reading the whole questionnaire
  // from the DOM -- necessary now that only ONE step's worth of questions
  // is ever in the DOM at a time, but a showIf's target question could in
  // principle live in an earlier step. Called on every input/change
  // within the current step's form.
  function updateConditionalVisibility(formEl, questions, answers) {
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

  // Merges whatever the CURRENTLY RENDERED subset of `questions` holds in
  // the DOM into `baseAnswers`, leaving every other key (any field that
  // belongs to a step not currently in the DOM) completely untouched.
  // This is what makes per-step rendering safe: calling this with only
  // Step 1's questions while the customer is on Step 1 can never erase
  // Step 2's already-collected answers, and vice versa. The single flat
  // read-only view (a submitted/approved submission) still works
  // correctly too, since it renders every question in one `questions`
  // list and simply has nothing left over to preserve.
  function collectAnswers(formEl, questions, baseAnswers) {
    var answers = Object.assign({}, baseAnswers);
    var unsureSet = {};
    (Array.isArray(baseAnswers.__unsureFields) ? baseAnswers.__unsureFields : []).forEach(function (k) { unsureSet[k] = true; });

    questions.forEach(function (q) {
      if (q.type === "repeatable-group") {
        var firstEl = formEl.querySelector('[data-group-key="' + q.groupDataKey + '"][data-group-index="0"]');
        if (!firstEl) return; // this group isn't part of the currently rendered step
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
        if (isUnsureChecked(formEl, q.groupDataKey)) unsureSet[q.groupDataKey] = true; else delete unsureSet[q.groupDataKey];
      } else {
        if (!formEl.querySelector('[data-answer-key="' + q.dataKey + '"]')) return; // not part of the currently rendered step
        answers[q.dataKey] = getAnswerValue(formEl, q.dataKey);
        if (isUnsureChecked(formEl, q.dataKey)) unsureSet[q.dataKey] = true; else delete unsureSet[q.dataKey];
      }
    });

    answers.__unsureFields = Object.keys(unsureSet);
    return answers;
  }

  function isUnsureChecked(formEl, key) {
    var el = formEl.querySelector('[data-unsure-key="' + key + '"]');
    return !!(el && el.checked);
  }

  function hasAnswerValue(q, answers) {
    var key = questionKey(q);
    if (q.type === "repeatable-group") {
      return Array.isArray(answers[key]) && answers[key].some(function (item) { return Object.keys(item || {}).some(function (k) { return item[k]; }); });
    }
    return answers[key] !== undefined && answers[key] !== null && answers[key] !== "";
  }

  // Mirrors (does not duplicate the AUTHORITY of) the Worker's own
  // relaxRequiredForUnsureFields + validateAnswers rule, scoped to just
  // the questions passed in -- used to validate ONE step at a time before
  // letting the customer click Continue. The server re-validates the
  // WHOLE questionnaire independently at actual submit time regardless;
  // this only improves the customer-facing experience of finding out
  // what's missing before they reach the end.
  function missingRequiredFields(questions, answers) {
    var unsureSet = {};
    (Array.isArray(answers.__unsureFields) ? answers.__unsureFields : []).forEach(function (k) { unsureSet[k] = true; });
    return questions.filter(function (q) {
      if (q.required === false) return false;
      if (q.showIf && !isGateSatisfied(q.showIf, answers)) return false;
      if (unsureSet[questionKey(q)]) return false;
      return !hasAnswerValue(q, answers);
    });
  }

  function stepIndicatorHtml(lang, stepLabels, currentIndex) {
    var items = stepLabels
      .map(function (label, i) {
        var cls = "portal-wizard-step" + (i === currentIndex ? " portal-wizard-step--current" : i < currentIndex ? " portal-wizard-step--done" : "");
        return '<li class="' + cls + '"><span class="portal-wizard-step__num">' + (i + 1) + '</span><span class="portal-wizard-step__label">' + escapeHtml(label) + '</span></li>';
      })
      .join("");
    return '<ol class="portal-wizard-steps" role="list" aria-label="' + escapeAttr(t(lang, "stepIndicatorLabel").replace("{n}", String(currentIndex + 1)).replace("{total}", String(stepLabels.length))) + '">' + items + '</ol>';
  }

  function reviewRowHtml(lang, q, answers, onEditStep) {
    var label = escapeHtml(labelFor(q.labels, lang));
    var unsure = isUnsure(answers, questionKey(q));
    var valueHtml;
    if (q.type === "repeatable-group") {
      var items = (answers[q.groupDataKey] || []).filter(function (item) { return Object.keys(item || {}).some(function (k) { return item[k]; }); });
      valueHtml = items.length
        ? '<ul class="portal-review-group">' + items.map(function (item) {
            return '<li>' + (q.subQuestions || [])
              .filter(function (sub) { return item[sub.dataKey]; })
              .map(function (sub) { return escapeHtml(labelFor(sub.labels, lang)) + ': ' + escapeHtml(item[sub.dataKey]); })
              .join(", ") + '</li>';
          }).join("") + '</ul>'
        : '<span class="muted">' + escapeHtml(t(lang, "noAnswerYetLabel")) + '</span>';
    } else if (q.type === "yesno") {
      var v = answers[q.dataKey];
      valueHtml = v === true ? escapeHtml(t(lang, "yes")) : v === false ? escapeHtml(t(lang, "no")) : '<span class="muted">' + escapeHtml(t(lang, "noAnswerYetLabel")) + '</span>';
    } else {
      valueHtml = answers[q.dataKey] ? escapeHtml(answers[q.dataKey]) : '<span class="muted">' + escapeHtml(t(lang, "noAnswerYetLabel")) + '</span>';
    }
    var unsureNote = unsure ? ' <span class="portal-review-unsure-note">(' + escapeHtml(t(lang, "reviewUnsureNote")) + ')</span>' : "";
    return '<div class="portal-review-row"><dt>' + label + '</dt><dd>' + valueHtml + unsureNote + '</dd></div>';
  }

  function renderBiFormDetailHtml(lang, data, docsData, ui) {
    var submission = data.submission;
    var questionnaire = data.questionnaire;
    var editable = CUSTOMER_EDITABLE_STATUSES[submission.status];
    var availableLangs = questionnaire.languages || CANONICAL_LANGUAGES;
    var answers = submission.answers || {};

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

    var uploadsHtml = (docsData.uploads || [])
      .map(function (u) { return '<li>' + escapeHtml(u.original_filename) + '</li>'; })
      .join("") || '<li class="muted">' + escapeHtml(t(lang, "noDocumentsUploaded")) + '</li>';
    var uploadsBlockHtml = '<h3>' + escapeHtml(t(lang, "documentsLabel")) + '</h3>' +
      '<ul class="portal-bi-form-uploads">' + uploadsHtml + '</ul>' +
      (editable ? '<p class="muted">' + escapeHtml(t(lang, "documentsOptionalNotice")) + '</p><label class="portal-upload-label">' + escapeHtml(t(lang, "uploadLabel")) + '<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="portal-bi-form-upload"></label>' : "");

    var previewHtml = "";
    if (submission.publishedAt && docsData.documents && docsData.documents.length) {
      previewHtml = '<div class="portal-bi-form-ready"><p>' + escapeHtml(t(lang, "readyLabel")) + '</p>' +
        docsData.documents
          .map(function (d) {
            return '<a class="btn btn-secondary" href="' + window.PORTAL_API_BASE + '/api/bi-forms/' + submission.id + '/documents/' + d.id + '" target="_blank" rel="noopener">' + escapeHtml(t(lang, "downloadLabel")) + '</a>';
          })
          .join(" ") + '</div>';
    }

    var bodyHtml;

    if (!editable) {
      // Read-only: a flat list of every question is still the clearest
      // way to show a submitted/under-review/approved/published form's
      // answers back -- there is no step navigation DECISION to make once
      // nothing can be changed, so the wizard chrome would add nothing.
      var questionsHtml = questionnaire.questions.map(function (q) { return renderQuestionHtml(q, lang, answers); }).join("");
      var unsureFieldsCount = Array.isArray(answers.__unsureFields) ? answers.__unsureFields.length : 0;
      var actionsHtml = unsureFieldsCount
        ? '<p class="muted">' + escapeHtml(t(lang, "assistanceRequestedNotice")) + '</p>'
        : '<p class="muted">' + escapeHtml(t(lang, "readOnlyNotice")) + '</p>';
      bodyHtml = revisionNote + '<form class="portal-bi-form-form">' + questionsHtml + '</form>' + actionsHtml + uploadsBlockHtml + previewHtml;
    } else if (ui.mode === "choice") {
      // Directive section 5: the verbatim guided-application introduction,
      // shown once on this same one-time "before you begin" screen a
      // fresh draft sees (never shown again once any answer exists --
      // same gate openBiFormDetail already uses for the choice panel
      // itself). The live-preview sentence starts hidden and is only
      // revealed if a real probe confirms this specific form's preview is
      // actually available (directive: "Only display the live-preview
      // claim where the live preview is actually available and
      // functioning") -- see wireLivePreviewIntroProbe below.
      var guidedIntroHtml =
        '<div class="portal-guided-intro">' +
        '<p>' + escapeHtml(t(lang, "guidedIntroPara1")) + '</p>' +
        '<p>' + escapeHtml(t(lang, "guidedIntroPara2")) + '</p>' +
        '<p class="portal-guided-intro-live-preview" hidden>' + escapeHtml(t(lang, "guidedIntroLivePreview")) + '</p>' +
        '<p>' + escapeHtml(t(lang, "guidedIntroPara3")) + '</p>' +
        '<p>' + escapeHtml(t(lang, "guidedIntroPara4")) + '</p>' +
        '<p>' + escapeHtml(t(lang, "guidedIntroPara5")) + '</p>' +
        '<p><strong>' + escapeHtml(t(lang, "guidedIntroClosing")) + '</strong></p>' +
        '</div>';
      bodyHtml = revisionNote + guidedIntroHtml +
        '<div class="portal-bi-form-choice-panel"><h3>' + escapeHtml(t(lang, "optionChooseHeading")) + '</h3>' +
        '<p class="enquiry-form-actions">' +
        '<button type="button" class="btn btn-secondary portal-bi-form-choice-self">' + escapeHtml(t(lang, "optionSelfLabel")) + '</button>' +
        '<button type="button" class="btn btn-primary portal-bi-form-choice-assist">' + escapeHtml(t(lang, "optionAssistLabel")) + '</button>' +
        '</p><p class="muted">' + escapeHtml(t(lang, "optionAssistHelp")) + '</p></div>';
    } else if (ui.mode === "assist-intake" || ui.mode === "assist-review") {
      var minimumQuestions = questionnaire.questions.filter(function (q) { return ASSISTED_MINIMUM_DATA_KEYS.indexOf(questionKey(q)) !== -1; });
      if (ui.mode === "assist-intake") {
        var contactValue = escapeAttr(answers[ASSIST_CONTACT_KEY] || "");
        var minFieldsHtml = minimumQuestions.map(function (q) { return renderQuestionHtml(q, lang, answers); }).join("");
        bodyHtml = revisionNote +
          '<h3>' + escapeHtml(t(lang, "assistIntakeHeading")) + '</h3><p class="muted">' + escapeHtml(t(lang, "assistIntakeIntro")) + '</p>' +
          '<form class="portal-bi-form-form portal-assist-intake-form">' + minFieldsHtml +
          '<div class="form-field"><label>' + escapeHtml(t(lang, "assistContactLabel")) + '</label><input type="text" data-answer-key="' + ASSIST_CONTACT_KEY + '" value="' + contactValue + '"></div>' +
          '</form>' + uploadsBlockHtml +
          '<div class="enquiry-form-actions"><button type="button" class="btn btn-primary portal-wizard-continue">' + escapeHtml(t(lang, "continueButton")) + '</button><p class="portal-bi-form-status form-status" aria-live="polite"></p></div>';
      } else {
        var reviewRows = minimumQuestions.map(function (q) { return reviewRowHtml(lang, q, answers); }).join("");
        var contactRow = '<div class="portal-review-row"><dt>' + escapeHtml(t(lang, "assistContactLabel")) + '</dt><dd>' + (answers[ASSIST_CONTACT_KEY] ? escapeHtml(answers[ASSIST_CONTACT_KEY]) : '<span class="muted">' + escapeHtml(t(lang, "noAnswerYetLabel")) + '</span>') + '</dd></div>';
        bodyHtml = revisionNote +
          '<h3>' + escapeHtml(t(lang, "assistReviewHeading")) + '</h3><p class="muted">' + escapeHtml(t(lang, "assistReviewIntro")) + '</p>' +
          '<dl class="portal-review-list">' + reviewRows + contactRow + '</dl>' +
          uploadsBlockHtml +
          '<div class="enquiry-form-actions">' +
          '<button type="button" class="btn btn-secondary portal-wizard-back">' + escapeHtml(t(lang, "backButton")) + '</button>' +
          '<button type="button" class="btn btn-primary portal-assist-confirm-submit">' + escapeHtml(t(lang, "confirmAndSubmitButton")) + '</button>' +
          '<p class="portal-bi-form-status form-status" aria-live="polite"></p></div>';
      }
    } else {
      // Genuine multi-step wizard (directive section 6): Step 1 applicant
      // info -> Step 2 service-specific (only if the form actually has
      // any) -> Step 3 documents -> Step 4 review -> existing
      // Save Draft/Submit actions.
      var split = classifyQuestions(questionnaire.questions);
      var stepSequence = ["info"];
      if (split.step2.length) stepSequence.push("service");
      stepSequence.push("documents", "review");
      var stepLabelKeys = { info: "stepApplicantInfo", service: "stepServiceSpecific", documents: "stepDocuments", review: "stepReview" };
      var currentKey = stepSequence[ui.step] || stepSequence[0];
      var currentIndex = ui.step;
      var indicatorHtml = stepIndicatorHtml(lang, stepSequence.map(function (k) { return t(lang, stepLabelKeys[k]); }), currentIndex);

      var stepContentHtml;
      var navHtml;
      var livePreviewHtml = "";
      if (currentKey === "info" || currentKey === "service") {
        var stepQuestions = currentKey === "info" ? split.step1 : split.step2;
        var fieldsHtml = stepQuestions.map(function (q) { return renderQuestionHtml(q, lang, answers); }).join("");
        stepContentHtml = '<form class="portal-bi-form-form portal-wizard-step-form">' + fieldsHtml + '</form>';
        var backBtn = currentIndex > 0 ? '<button type="button" class="btn btn-secondary portal-wizard-back">' + escapeHtml(t(lang, "backButton")) + '</button>' : "";
        navHtml = '<div class="enquiry-form-actions">' + backBtn +
          '<button type="button" class="btn btn-secondary portal-bi-form-save">' + escapeHtml(t(lang, "saveDraft")) + '</button>' +
          '<button type="button" class="btn btn-primary portal-wizard-continue">' + escapeHtml(t(lang, "continueButton")) + '</button>' +
          '<p class="portal-bi-form-status form-status" aria-live="polite"></p></div>';
        // Directive section 6: the real-time official BI PDF preview, only
        // meaningful on the two steps that actually have live fields to
        // preview (info/service) -- the documents and review steps show
        // no input controls, so there is nothing for it to reflect.
        livePreviewHtml =
          '<div class="portal-bi-form-live-preview">' +
          '<button type="button" class="portal-bi-form-preview-toggle">' + escapeHtml(t(lang, "officialPreviewShowLabel")) + '</button>' +
          '<div class="portal-bi-form-preview-panel">' +
          '<div class="portal-bi-form-preview-header"><h3>' + escapeHtml(t(lang, "officialPreviewHeading")) + '</h3>' +
          '<button type="button" class="portal-bi-form-preview-enlarge" aria-label="' + escapeAttr(t(lang, "officialPreviewEnlargeLabel")) + '" title="' + escapeAttr(t(lang, "officialPreviewEnlargeLabel")) + '">⤢</button></div>' +
          '<div class="portal-bi-form-preview-imgwrap">' +
          '<img class="portal-bi-form-preview-img" alt="' + escapeAttr(t(lang, "officialPreviewHeading")) + '" hidden>' +
          '<div class="portal-bi-form-preview-highlight" hidden></div>' +
          '</div>' +
          '<p class="portal-bi-form-preview-status muted"></p>' +
          '</div></div>';
      } else if (currentKey === "documents") {
        // Step 3: the ONLY step that shows the upload control -- info,
        // service and review deliberately do not repeat it.
        stepContentHtml = uploadsBlockHtml;
        navHtml = '<div class="enquiry-form-actions">' +
          '<button type="button" class="btn btn-secondary portal-wizard-back">' + escapeHtml(t(lang, "backButton")) + '</button>' +
          '<button type="button" class="btn btn-primary portal-wizard-continue">' + escapeHtml(t(lang, "continueButton")) + '</button>' +
          '<p class="portal-bi-form-status form-status" aria-live="polite"></p></div>';
      } else {
        // review: a full, read-only summary of every step's answers
        // (directive: "do not claim the review experience is complete
        // solely because customers can scroll through and edit the
        // questionnaire" -- this is a genuinely separate, later step, not
        // more of the same flat form) plus the uploaded-documents list
        // (read-only here -- the upload control itself stays on Step 3).
        var allQuestions = split.step1.concat(split.step2);
        var reviewRowsHtml = allQuestions.map(function (q) { return reviewRowHtml(lang, q, answers); }).join("");
        var uploadsReadOnlyHtml = '<h3>' + escapeHtml(t(lang, "documentsLabel")) + '</h3><ul class="portal-bi-form-uploads">' + uploadsHtml + '</ul>';
        stepContentHtml = '<p class="muted">' + escapeHtml(t(lang, "reviewIntro")) + '</p>' +
          '<dl class="portal-review-list">' + reviewRowsHtml + '</dl>' +
          '<button type="button" class="btn btn-secondary portal-review-edit" data-goto-step="0">' + escapeHtml(t(lang, "editSectionLabel")) + ' — ' + escapeHtml(t(lang, stepLabelKeys.info)) + '</button> ' +
          (split.step2.length ? '<button type="button" class="btn btn-secondary portal-review-edit" data-goto-step="1">' + escapeHtml(t(lang, "editSectionLabel")) + ' — ' + escapeHtml(t(lang, stepLabelKeys.service)) + '</button>' : "") +
          uploadsReadOnlyHtml;
        navHtml = '<div class="enquiry-form-actions">' +
          '<button type="button" class="btn btn-secondary portal-wizard-back">' + escapeHtml(t(lang, "backButton")) + '</button>' +
          '<button type="button" class="btn btn-secondary portal-bi-form-save">' + escapeHtml(t(lang, "saveDraft")) + '</button>' +
          '<button type="button" class="btn btn-primary portal-bi-form-submit">' + escapeHtml(t(lang, "submit")) + '</button>' +
          '<p class="portal-bi-form-status form-status" aria-live="polite"></p></div>' +
          '<p class="muted">' + escapeHtml(t(lang, "submitNotice")) + '</p>';
      }

      bodyHtml = revisionNote + indicatorHtml + (livePreviewHtml
        ? '<div class="portal-bi-form-wizard-layout"><div class="portal-bi-form-wizard-main">' + stepContentHtml + navHtml + '</div>' + livePreviewHtml + '</div>'
        : stepContentHtml + navHtml);
    }

    return '<div class="card portal-detail-card portal-bi-form-detail" data-submission-id="' + submission.id + '" data-lang="' + lang + '">' +
      '<button type="button" class="btn btn-secondary portal-bi-form-back">' + escapeHtml(t(lang, "backToApplication")) + '</button>' +
      '<h2>' + escapeHtml(submission.serviceName || questionnaire.formId) + '</h2>' +
      '<p class="muted">' + escapeHtml(t(lang, "technicalReferenceLabel")) + ' ' + escapeHtml(submission.technicalReference || questionnaire.formId) + '</p>' +
      '<p><strong>' + escapeHtml(t(lang, "languageLabel")) + ':</strong> <select class="portal-bi-form-lang">' + langOptions + '</select></p>' +
      '<p class="muted">' + escapeHtml(t(lang, "instructions")) + '</p>' +
      bodyHtml +
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

      // Entry-point decision (directive section 7): a fresh, never-
      // touched draft shows the Option 1/Option 2 choice first. Anything
      // else (already has answers, mid-revision, read-only) goes straight
      // into the wizard/flat view -- declining the choice costs nothing,
      // it's never shown again once any answer exists.
      var hasAnyAnswers = Object.keys(data.submission.answers || {}).some(function (k) {
        return k !== "__unsureFields" && data.submission.answers[k];
      });
      var ui = CUSTOMER_EDITABLE_STATUSES[data.submission.status] && data.submission.status === "draft" && !hasAnyAnswers
        ? { mode: "choice" }
        : { mode: "wizard", step: 0 };

      renderInto(data, docsData, lang, ui);
    });

    function renderInto(data, docsData, lang, ui) {
      containerEl.innerHTML = renderBiFormDetailHtml(lang, data, docsData, ui);
      var root = containerEl.querySelector(".portal-bi-form-detail");
      var statusEl = root.querySelector(".portal-bi-form-status");

      root.querySelector(".portal-bi-form-back").addEventListener("click", onBack);

      root.querySelector(".portal-bi-form-lang").addEventListener("change", function (event) {
        renderInto(data, docsData, event.target.value, ui);
      });

      // The step's own <form>, if this screen has one (choice panel and
      // the assist-review summary don't).
      var formEl = root.querySelector(".portal-bi-form-form");
      var split = classifyQuestions(data.questionnaire.questions);
      var currentStepQuestions = [];
      if (ui.mode === "wizard") {
        var stepSequence = ["info"];
        if (split.step2.length) stepSequence.push("service");
        stepSequence.push("documents", "review");
        var currentKey = stepSequence[ui.step] || stepSequence[0];
        currentStepQuestions = currentKey === "info" ? split.step1 : currentKey === "service" ? split.step2 : [];
      } else if (ui.mode === "assist-intake") {
        currentStepQuestions = data.questionnaire.questions.filter(function (q) { return ASSISTED_MINIMUM_DATA_KEYS.indexOf(questionKey(q)) !== -1; });
      }

      function mergeCollect() {
        if (!formEl) return data.submission.answers || {};
        var merged = collectAnswers(formEl, currentStepQuestions, data.submission.answers || {});
        // The assist-intake contact field is outside the shared
        // questionnaire schema -- merged separately, same reserved-key
        // convention as __unsureFields.
        var contactEl = formEl.querySelector('[data-answer-key="' + ASSIST_CONTACT_KEY + '"]');
        if (contactEl) merged[ASSIST_CONTACT_KEY] = contactEl.value;
        data.submission.answers = merged;
        return merged;
      }

      // Directive section 6: live, debounced preview of the real official
      // BI PDF as the customer types, with the currently-focused field
      // highlighted. Does nothing when this step has no live-preview
      // panel (documents/review steps, or a read-only view) -- `panelEl`
      // is simply null there. Never fires on every keystroke: a single
      // shared debounce timer coalesces rapid typing into one request
      // ~750ms after the customer stops, exactly the kind of "efficient,
      // not full-regen-per-keystroke" rendering the directive requires.
      function wireLivePreview(rootEl, stepFormEl) {
        var panelEl = rootEl.querySelector(".portal-bi-form-live-preview");
        if (!panelEl || !stepFormEl) return;

        var toggleBtn = panelEl.querySelector(".portal-bi-form-preview-toggle");
        var enlargeBtn = panelEl.querySelector(".portal-bi-form-preview-enlarge");
        var imgWrap = panelEl.querySelector(".portal-bi-form-preview-imgwrap");
        var imgEl = panelEl.querySelector(".portal-bi-form-preview-img");
        var highlightEl = panelEl.querySelector(".portal-bi-form-preview-highlight");
        var statusEl2 = panelEl.querySelector(".portal-bi-form-preview-status");
        var debounceTimer = null;
        var currentHighlight = null;
        var requestSeq = 0;

        toggleBtn.addEventListener("click", function () {
          var expanded = panelEl.classList.toggle("is-expanded");
          toggleBtn.textContent = expanded ? t(lang, "officialPreviewCollapseLabel") : t(lang, "officialPreviewShowLabel");
          if (expanded) schedulePreview(null);
        });
        enlargeBtn.addEventListener("click", function () {
          imgWrap.classList.toggle("is-enlarged");
        });

        function positionHighlight() {
          if (!currentHighlight || !imgEl.naturalWidth) {
            highlightEl.hidden = true;
            return;
          }
          highlightEl.hidden = false;
          highlightEl.style.left = (currentHighlight.xPx / imgEl.naturalWidth * 100) + "%";
          highlightEl.style.top = (currentHighlight.yPx / imgEl.naturalHeight * 100) + "%";
          highlightEl.style.width = (currentHighlight.widthPx / imgEl.naturalWidth * 100) + "%";
          highlightEl.style.height = (currentHighlight.heightPx / imgEl.naturalHeight * 100) + "%";
        }
        imgEl.addEventListener("load", positionHighlight);

        function schedulePreview(activeFieldKey) {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(function () { fetchPreview(activeFieldKey); }, 750);
        }

        function fetchPreview(activeFieldKey) {
          var mySeq = ++requestSeq;
          statusEl2.textContent = t(lang, "officialPreviewUpdating");
          window
            .portalFetch("/api/bi-forms/" + submissionId + "/preview-image", {
              method: "POST",
              body: JSON.stringify({ answers: mergeCollect(), activeFieldKey: activeFieldKey || null }),
            })
            .then(function (r) { return r.json(); })
            .then(function (result) {
              // A slower-than-expected response for an earlier keystroke
              // must never overwrite what a later one already showed.
              if (mySeq !== requestSeq) return;
              if (!result.available) {
                imgEl.hidden = true;
                highlightEl.hidden = true;
                statusEl2.textContent = t(lang, "officialPreviewUnavailable");
                return;
              }
              statusEl2.textContent = "";
              currentHighlight = result.highlight;
              imgEl.src = "data:image/png;base64," + result.imageBase64;
              imgEl.hidden = false;
              positionHighlight();
            })
            .catch(function () {
              if (mySeq !== requestSeq) return;
              statusEl2.textContent = t(lang, "officialPreviewUnavailable");
            });
        }

        stepFormEl.addEventListener("input", function (event) {
          if (!panelEl.classList.contains("is-expanded") && !isPreviewAlwaysVisible()) return;
          schedulePreview(event.target && event.target.dataset ? event.target.dataset.answerKey : null);
        });
        stepFormEl.addEventListener("focusin", function (event) {
          if (!panelEl.classList.contains("is-expanded") && !isPreviewAlwaysVisible()) return;
          schedulePreview(event.target && event.target.dataset ? event.target.dataset.answerKey : null);
        });

        // Desktop (side-by-side layout, CSS media query) shows the panel
        // open by default; mobile starts collapsed behind the toggle
        // button (directive: "accessible expandable mobile preview...
        // with enlarge option"). Detected once at wiring time via the
        // same breakpoint the CSS uses, not re-checked on resize -- a
        // live mid-session viewport change re-rendering this panel's
        // open/closed state is not a real scenario for a form being
        // filled in on one device.
        function isPreviewAlwaysVisible() {
          return window.matchMedia && window.matchMedia("(min-width: 900px)").matches;
        }
        if (isPreviewAlwaysVisible()) {
          panelEl.classList.add("is-expanded");
          toggleBtn.hidden = true;
          schedulePreview(null);
        }
      }

      if (formEl && currentStepQuestions.length) {
        formEl.addEventListener("input", function () { updateConditionalVisibility(formEl, currentStepQuestions, mergeCollect()); });
        formEl.addEventListener("change", function () { updateConditionalVisibility(formEl, currentStepQuestions, mergeCollect()); });
        updateConditionalVisibility(formEl, currentStepQuestions, data.submission.answers || {});
      }

      wireLivePreview(root, formEl);

      function goTo(nextUi) {
        if (formEl) mergeCollect();
        ui = nextUi;
        renderInto(data, docsData, lang, ui);
      }

      function saveDraft(answers, onDone) {
        statusEl.textContent = t(lang, "saving");
        return window
          .portalFetch("/api/bi-forms/" + submissionId + "/draft", { method: "PATCH", body: JSON.stringify({ answers: answers, preferredLanguage: lang }) })
          .then(function (resp) {
            statusEl.textContent = resp.ok ? t(lang, "saved") : t(lang, "saveError");
            if (onDone) onDone(resp.ok);
          })
          .catch(function () { statusEl.textContent = t(lang, "saveError"); });
      }

      // Shared by the final Submit button (full wizard review step) and
      // the assisted-intake's own "Confirm and Submit" -- both save the
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

      // ---- Choice panel ----
      var choiceSelfBtn = root.querySelector(".portal-bi-form-choice-self");
      if (choiceSelfBtn) choiceSelfBtn.addEventListener("click", function () { goTo({ mode: "wizard", step: 0 }); });
      var choiceAssistBtn = root.querySelector(".portal-bi-form-choice-assist");
      if (choiceAssistBtn) choiceAssistBtn.addEventListener("click", function () { goTo({ mode: "assist-intake" }); });

      // Directive section 5: a one-time, real probe (empty answers, no
      // activeFieldKey) against this exact submission's own form -- never
      // assumed true from whether the form is merely registered in the
      // engine, since the live preview additionally needs a pre-rendered
      // background actually present in R2 (see biFormRaster.js). Reveals
      // the live-preview sentence only when the probe itself reports
      // available: true.
      if (ui.mode === "choice") {
        var livePreviewSentenceEl = root.querySelector(".portal-guided-intro-live-preview");
        if (livePreviewSentenceEl) {
          window
            .portalFetch("/api/bi-forms/" + submissionId + "/preview-image", { method: "POST", body: JSON.stringify({ answers: {} }) })
            .then(function (r) { return r.json(); })
            .then(function (result) { if (result.available) livePreviewSentenceEl.hidden = false; })
            .catch(function () {});
        }
      }

      // ---- Assisted shortened intake ----
      if (ui.mode === "assist-intake") {
        root.querySelector(".portal-wizard-continue").addEventListener("click", function () { goTo({ mode: "assist-review" }); });
      }
      if (ui.mode === "assist-review") {
        root.querySelector(".portal-wizard-back").addEventListener("click", function () { goTo({ mode: "assist-intake" }); });
        root.querySelector(".portal-assist-confirm-submit").addEventListener("click", function () {
          // Directive section 7's full assisted-completion pathway:
          // deliberate, explicit confirm here -- never auto-submitted
          // merely by picking "let FIS help me" earlier. Every question
          // the customer did not answer in the shortened intake (plus
          // every question outside it entirely, since the full form was
          // never shown) is marked unsure; nothing is ever invented.
          var answers = Object.assign({}, data.submission.answers || {});
          var unsure = {};
          (answers.__unsureFields || []).forEach(function (k) { unsure[k] = true; });
          data.questionnaire.questions.forEach(function (q) {
            if (q.required === false) return;
            if (q.showIf && !isGateSatisfied(q.showIf, answers)) return;
            if (!hasAnswerValue(q, answers)) unsure[questionKey(q)] = true;
          });
          answers.__unsureFields = Object.keys(unsure);
          submitWithAnswers(answers);
        });
      }

      // ---- Wizard navigation ----
      if (ui.mode === "wizard") {
        var continueBtn = root.querySelector(".portal-wizard-continue");
        if (continueBtn) {
          continueBtn.addEventListener("click", function () {
            var answers = mergeCollect();
            if (currentStepQuestions.length) {
              var missing = missingRequiredFields(currentStepQuestions, answers);
              if (missing.length) {
                statusEl.textContent = t(lang, "validationIncomplete");
                return;
              }
            }
            goTo({ mode: "wizard", step: ui.step + 1 });
          });
        }
        var backBtn = root.querySelector(".portal-wizard-back");
        if (backBtn) backBtn.addEventListener("click", function () { goTo({ mode: "wizard", step: Math.max(0, ui.step - 1) }); });
        root.querySelectorAll(".portal-review-edit").forEach(function (btn) {
          btn.addEventListener("click", function () { goTo({ mode: "wizard", step: Number(btn.dataset.gotoStep) }); });
        });

        var saveBtn = root.querySelector(".portal-bi-form-save");
        if (saveBtn) saveBtn.addEventListener("click", function () { saveDraft(mergeCollect()); });

        var submitBtn = root.querySelector(".portal-bi-form-submit");
        if (submitBtn) submitBtn.addEventListener("click", function () { submitWithAnswers(data.submission.answers || {}); });
      }

      // ---- Uploads (available on the Documents step, the review step,
      // and the assisted-intake screen alike) ----
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
              // screen (re-rendering would otherwise discard any answer
              // the customer has typed but not yet saved as a draft).
              return window
                .portalFetch("/api/bi-forms/" + submissionId + "/documents")
                .then(function (r) { return r.json(); })
                .then(function (freshDocsData) {
                  docsData.uploads = freshDocsData.uploads;
                  var uploadsEl = root.querySelector(".portal-bi-form-uploads");
                  if (uploadsEl) {
                    uploadsEl.innerHTML =
                      (freshDocsData.uploads || []).map(function (u) { return "<li>" + escapeHtml(u.original_filename) + "</li>"; }).join("") ||
                      '<li class="muted">' + escapeHtml(t(lang, "noDocumentsUploaded")) + "</li>";
                  }
                });
            })
            .catch(function () { statusEl.textContent = t(lang, "uploadError"); });
        });
      }
    }
  }

  window.PortalBiForms = { wireBiFormsSection: wireBiFormsSection, openBiFormDetail: openBiFormDetail };
})();
