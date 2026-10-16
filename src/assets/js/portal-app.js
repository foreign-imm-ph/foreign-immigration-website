(function () {
  "use strict";

  // If the browser restores this page from its back-forward cache (e.g. a
  // client signs out on a shared computer, then someone hits Back), the
  // already-rendered DOM from the previous session could flash briefly
  // before anything re-checks auth, since bfcache restoration doesn't
  // re-fire the events this file's initial load relies on. Forcing a
  // real reload on restore guarantees the auth check below always reruns.
  window.addEventListener("pageshow", function (event) {
    if (event.persisted) window.location.reload();
  });

  var CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];
  var LOCALE_STORAGE_KEY = "fisPreferredLocale";

  // Bilingual correspondence requirement: each message card labels its
  // two blocks by the language THAT MESSAGE is actually in (source_language
  // for a client message, target_language for a translated staff reply) --
  // not by the portal UI's own active language, which is a separate,
  // only loosely related setting. Native self-names, not translated.
  var LANGUAGE_SELF_LABELS = {
    en: "English",
    "zh-CN": "中文",
    "zh-Hant": "繁體中文",
    ko: "한국어",
    ja: "日本語",
    vi: "Tiếng Việt",
  };
  function languageSelfLabel(code) {
    return LANGUAGE_SELF_LABELS[code] || "";
  }

  // Phase 4, Stage D: the Client Portal shell is localized the same way
  // the Order & Book Online apply flow already is (instant-services-
  // apply.js) -- one shared dynamic page, a STRINGS dictionary, a t(lang,
  // key) lookup with fallback-to-English, never a second per-locale copy
  // of this whole app. Shares terminology (Reference/View Receipt/Payment
  // Verified/the exact 120-hour rescheduling wording) with that file's own
  // translations rather than re-translating the same concepts differently.
  var STRINGS = {
    en: {
      portalTag: "Client Portal",
      welcomeDefault: "Welcome",
      welcomePrefix: "Welcome, ",
      signOut: "Sign Out",
      loadingAccount: "Loading your account...",
      languageSwitcherLabel: "Language",
      tabApplications: "Applications & Services",
      tabProfile: "Profile",
      noApplicationsYet: "No applications yet. Once our team reviews your enquiry, it will appear here.",
      loading: "Loading...",
      viewApplicationHidden: "View application ",
      statusHistoryHeading: "Status History",
      showEnglishOriginal: "Show English original",
      englishLabel: "English",
      translationUnavailable: "Translation temporarily unavailable. Our team can still read your original message.",
      documentsHeading: "Documents",
      noDocumentsYet: "No documents requested yet.",
      uploadLabel: "Upload",
      messagesHeading: "Messages",
      noMessagesYet: "No messages yet.",
      messagePlaceholder: "Write a message...",
      sendButton: "Send",
      paymentsHeading: "Payments",
      noPaymentsYet: "No payments requested yet.",
      qrPhInstructions: "Please make your online payment using QR Ph.",
      onlinePaymentPending: "Online payment instructions will be provided by our team.",
      posNotice: "Debit and credit card payments are currently accepted in person through our POS terminal.",
      uploadProofOfPayment: "Upload proof of payment",
      proofReceivedAwaiting: "Proof received. Awaiting verification by our team.",
      englishDescriptionLabel: "English Description",
      serviceLabel: "Service:",
      statusLabelText: "Status:",
      paymentLabelText: "Payment:",
      viewReceiptText: "View Receipt",
      airportVipBookingLabelText: "Airport VIP Booking:",
      uploadFailedDoc: "Upload failed. Please check the file type (PDF, JPEG, PNG or WebP) and size (under 15MB), then try again.",
      uploadFailedPayment: "Upload failed. Please check the file type and size, then try again.",
      loadingBookingDetails: "Loading booking details...",
      bookingCouldNotLoad: "Booking details could not be loaded right now.",
      airportVipBookingHeading: "Airport VIP Booking",
      flightLabel: "Flight:",
      scheduledLabel: "Scheduled:",
      passengersLabel: "Passengers:",
      requestFlightChangeHeading: "Request a Flight Change",
      airlineFieldLabel: "Airline",
      flightNumberFieldLabel: "Flight Number",
      flightRouteFieldLabel: "Flight Origin / Destination (optional)",
      newScheduledDateLabel: "New Scheduled Flight Date",
      newScheduledTimeLabel: "New Scheduled Flight Time",
      noteOptionalLabel: "Note (optional)",
      submitFlightChangeButton: "Submit Flight Change Request",
      submittingStatus: "Submitting...",
      reschedulingAvailableNotice: "Rescheduling can be requested once this booking has been confirmed.",
      requestSubmittedEligible: "Request submitted. Eligible for rescheduling, subject to availability.",
      requestSubmittedIneligible: "Request submitted. This change was notified less than 120 hours before the originally scheduled departure, so it does not qualify for rescheduling under the standard policy.",
      genericErrorMsg: "Something went wrong. Please try again.",
      flightChangeRequestsHeading: "Flight Change Requests",
      decisionPending: "Awaiting staff review",
      decisionApproved: "Approved",
      decisionApprovedException: "Approved (exception)",
      decisionRejected: "Not approved",
      fullNameLabel: "Full Name",
      emailLabel: "Email Address",
      emailChangeHint: "Contact us to change your sign-in email.",
      phoneLabel: "Phone",
      nationalityLabel: "Nationality",
      preferredLanguageLabel: "Preferred Communication Language",
      notSpecifiedOption: "Not specified",
      languageEnglish: "English",
      languageSimplifiedChinese: "Simplified Chinese",
      languageTraditionalChinese: "Traditional Chinese",
      languageKorean: "Korean",
      languageJapanese: "Japanese",
      languageVietnamese: "Vietnamese",
      otherOption: "Other",
      preferredChannelLabel: "Preferred Contact Channel",
      channelEmail: "Email",
      channelPortal: "Client Portal",
      channelHint: "Only channels FIS can use today are listed here. See Future Messaging Permissions below for other channels.",
      mobileNumberLabel: "Mobile Number",
      mobileNumberHint: "Used only for SMS/WhatsApp/Telegram/WeChat if you enable them below. Separate from the Phone field above.",
      mobileCountryLabel: "Mobile Number Country",
      mobileCountryNotNeeded: "Not needed if you typed a \"+\" country code",
      saveChangesButton: "Save Changes",
      savingStatus: "Saving...",
      savedStatus: "Saved.",
      inactiveChannelSuffix: " (not currently active)",
      futureMessagingHeading: "Future Messaging Permissions",
      futureMessagingDescription: "These channels are not yet active for messaging. Recording your permission here allows Foreign Immigration Services to contact you this way as soon as each channel becomes available, regarding your enquiry, application, documents, appointments, and service updates. Each channel is independent, optional, and can be changed at any time.",
      channelSms: "SMS",
      channelWhatsapp: "WhatsApp",
      channelTelegram: "Telegram",
      channelWechat: "WeChat",
    },
    "zh-CN": {
      portalTag: "客户门户",
      welcomeDefault: "欢迎",
      welcomePrefix: "欢迎，",
      signOut: "退出登录",
      loadingAccount: "正在加载您的账户...",
      languageSwitcherLabel: "语言",
      tabApplications: "申请与服务",
      tabProfile: "个人资料",
      noApplicationsYet: "暂无申请记录。我们的团队审核您的咨询后，相关记录将显示在此处。",
      loading: "加载中...",
      viewApplicationHidden: "查看申请 ",
      statusHistoryHeading: "状态历史",
      showEnglishOriginal: "查看英文原文",
      englishLabel: "English",
      translationUnavailable: "翻译暂时不可用。我们的团队仍可阅读您的原始留言。",
      documentsHeading: "文件",
      noDocumentsYet: "尚无需要提交的文件。",
      uploadLabel: "上传",
      messagesHeading: "消息",
      noMessagesYet: "暂无消息。",
      messagePlaceholder: "请输入消息...",
      sendButton: "发送",
      paymentsHeading: "付款",
      noPaymentsYet: "暂无需要付款的项目。",
      qrPhInstructions: "请使用 QR Ph 完成在线付款。",
      onlinePaymentPending: "在线付款说明将由我们的团队提供。",
      posNotice: "目前仅可通过我们的 POS 终端现场接受借记卡/信用卡付款。",
      uploadProofOfPayment: "上传付款凭证",
      proofReceivedAwaiting: "已收到付款凭证，等待我们团队核实。",
      englishDescriptionLabel: "英文说明",
      serviceLabel: "服务：",
      statusLabelText: "状态：",
      paymentLabelText: "付款：",
      viewReceiptText: "查看收据",
      airportVipBookingLabelText: "机场贵宾预约：",
      uploadFailedDoc: "上传失败。请检查文件类型（PDF、JPEG、PNG 或 WebP）及大小（小于 15MB）后重试。",
      uploadFailedPayment: "上传失败。请检查文件类型及大小后重试。",
      loadingBookingDetails: "正在加载预约详情...",
      bookingCouldNotLoad: "目前无法加载预约详情。",
      airportVipBookingHeading: "机场贵宾预约",
      flightLabel: "航班：",
      scheduledLabel: "预定时间：",
      passengersLabel: "乘客：",
      requestFlightChangeHeading: "申请航班变更",
      airlineFieldLabel: "航空公司",
      flightNumberFieldLabel: "航班号",
      flightRouteFieldLabel: "航班出发地/目的地（选填）",
      newScheduledDateLabel: "新的预定航班日期",
      newScheduledTimeLabel: "新的预定航班时间",
      noteOptionalLabel: "备注（选填）",
      submitFlightChangeButton: "提交航班变更申请",
      submittingStatus: "正在提交...",
      reschedulingAvailableNotice: "此预约确认后方可申请改期。",
      requestSubmittedEligible: "申请已提交。客户如在原定起飞时间至少120小时前通知 FIS 航班变更，可根据实际可用情况申请改期。",
      requestSubmittedIneligible: "申请已提交。此次变更的通知时间距原定起飞时间不足120小时，依标准政策不符合改期资格。",
      genericErrorMsg: "出现问题，请重试。",
      flightChangeRequestsHeading: "航班变更申请记录",
      decisionPending: "等待工作人员审核",
      decisionApproved: "已批准",
      decisionApprovedException: "已批准（特殊情况）",
      decisionRejected: "未获批准",
      fullNameLabel: "姓名",
      emailLabel: "电子邮箱",
      emailChangeHint: "如需更改登录邮箱，请联系我们。",
      phoneLabel: "电话",
      nationalityLabel: "国籍",
      preferredLanguageLabel: "首选沟通语言",
      notSpecifiedOption: "未指定",
      languageEnglish: "英语",
      languageSimplifiedChinese: "简体中文",
      languageTraditionalChinese: "繁体中文",
      languageKorean: "韩语",
      languageJapanese: "日语",
      languageVietnamese: "越南语",
      otherOption: "其他",
      preferredChannelLabel: "首选联系方式",
      channelEmail: "电子邮箱",
      channelPortal: "客户门户",
      channelHint: "此处仅列出 FIS 目前可用的联系渠道。其他渠道请参见下方的“未来消息授权”。",
      mobileNumberLabel: "手机号码",
      mobileNumberHint: "仅在您于下方启用 SMS/WhatsApp/Telegram/WeChat 时使用，与上方的电话字段不同。",
      mobileCountryLabel: "手机号码所属国家/地区",
      mobileCountryNotNeeded: "如果您已输入“+”国家代码，则无需选择",
      saveChangesButton: "保存更改",
      savingStatus: "保存中...",
      savedStatus: "已保存。",
      inactiveChannelSuffix: "（当前未启用）",
      futureMessagingHeading: "未来消息授权",
      futureMessagingDescription: "这些渠道目前尚未启用消息功能。在此处记录您的授权后，一旦相关渠道可用，Foreign Immigration Services 即可通过该渠道就您的咨询、申请、文件、预约及服务进度与您联系。每个渠道均为独立选项，可随时更改。",
      channelSms: "短信 (SMS)",
      channelWhatsapp: "WhatsApp",
      channelTelegram: "Telegram",
      channelWechat: "微信 (WeChat)",
    },
    "zh-Hant": {
      portalTag: "客戶專區",
      welcomeDefault: "歡迎",
      welcomePrefix: "歡迎，",
      signOut: "登出",
      loadingAccount: "正在載入您的帳戶...",
      languageSwitcherLabel: "語言",
      tabApplications: "申請與服務",
      tabProfile: "個人資料",
      noApplicationsYet: "尚無申請記錄。我們的團隊審核您的詢問後，相關記錄將顯示於此。",
      loading: "載入中...",
      viewApplicationHidden: "查看申請 ",
      statusHistoryHeading: "狀態歷程",
      showEnglishOriginal: "查看英文原文",
      englishLabel: "English",
      translationUnavailable: "翻譯暫時無法使用。我們的團隊仍可閱讀您的原始留言。",
      documentsHeading: "文件",
      noDocumentsYet: "目前尚無需要提交的文件。",
      uploadLabel: "上傳",
      messagesHeading: "訊息",
      noMessagesYet: "尚無訊息。",
      messagePlaceholder: "請輸入訊息...",
      sendButton: "傳送",
      paymentsHeading: "付款",
      noPaymentsYet: "目前尚無需要付款的項目。",
      qrPhInstructions: "請使用 QR Ph 完成線上付款。",
      onlinePaymentPending: "線上付款說明將由我們的團隊提供。",
      posNotice: "目前僅可透過我們的 POS 機台現場接受金融卡/信用卡付款。",
      uploadProofOfPayment: "上傳付款憑證",
      proofReceivedAwaiting: "已收到付款憑證，正等待我們團隊核實。",
      englishDescriptionLabel: "英文說明",
      serviceLabel: "服務：",
      statusLabelText: "狀態：",
      paymentLabelText: "付款：",
      viewReceiptText: "查看收據",
      airportVipBookingLabelText: "機場貴賓預約：",
      uploadFailedDoc: "上傳失敗。請檢查檔案類型（PDF、JPEG、PNG 或 WebP）及大小（小於 15MB）後再試一次。",
      uploadFailedPayment: "上傳失敗。請檢查檔案類型及大小後再試一次。",
      loadingBookingDetails: "正在載入預約詳情...",
      bookingCouldNotLoad: "目前無法載入預約詳情。",
      airportVipBookingHeading: "機場貴賓預約",
      flightLabel: "航班：",
      scheduledLabel: "預定時間：",
      passengersLabel: "乘客：",
      requestFlightChangeHeading: "申請航班異動",
      airlineFieldLabel: "航空公司",
      flightNumberFieldLabel: "航班編號",
      flightRouteFieldLabel: "航班出發地/目的地（選填）",
      newScheduledDateLabel: "新的預定航班日期",
      newScheduledTimeLabel: "新的預定航班時間",
      noteOptionalLabel: "備註（選填）",
      submitFlightChangeButton: "提交航班異動申請",
      submittingStatus: "提交中...",
      reschedulingAvailableNotice: "此預約經確認後方可申請改期。",
      requestSubmittedEligible: "申請已提交。客戶如在原定起飛時間至少120小時前通知 FIS 航班異動，可依實際可用情況申請改期。",
      requestSubmittedIneligible: "申請已提交。此次異動的通知時間距原定起飛時間不足120小時，依標準政策不符合改期資格。",
      genericErrorMsg: "發生問題，請再試一次。",
      flightChangeRequestsHeading: "航班異動申請記錄",
      decisionPending: "等待工作人員審核",
      decisionApproved: "已核准",
      decisionApprovedException: "已核准（特殊情況）",
      decisionRejected: "未獲核准",
      fullNameLabel: "姓名",
      emailLabel: "電子郵件地址",
      emailChangeHint: "如需變更登入信箱，請與我們聯絡。",
      phoneLabel: "電話",
      nationalityLabel: "國籍",
      preferredLanguageLabel: "慣用溝通語言",
      notSpecifiedOption: "未指定",
      languageEnglish: "英文",
      languageSimplifiedChinese: "簡體中文",
      languageTraditionalChinese: "繁體中文",
      languageKorean: "韓文",
      languageJapanese: "日文",
      languageVietnamese: "越南文",
      otherOption: "其他",
      preferredChannelLabel: "慣用聯絡方式",
      channelEmail: "電子郵件",
      channelPortal: "客戶專區",
      channelHint: "此處僅列出 FIS 目前可用的聯絡管道。其他管道請參見下方「未來訊息授權」。",
      mobileNumberLabel: "行動電話號碼",
      mobileNumberHint: "僅於您在下方啟用 SMS/WhatsApp/Telegram/WeChat 時使用，與上方的電話欄位不同。",
      mobileCountryLabel: "行動電話所屬國家/地區",
      mobileCountryNotNeeded: "若您已輸入「+」國碼，則無需選擇",
      saveChangesButton: "儲存變更",
      savingStatus: "儲存中...",
      savedStatus: "已儲存。",
      inactiveChannelSuffix: "（目前未啟用）",
      futureMessagingHeading: "未來訊息授權",
      futureMessagingDescription: "這些管道目前尚未啟用訊息功能。於此處記錄您的授權後，一旦相關管道可用，Foreign Immigration Services 即可透過該管道就您的詢問、申請、文件、預約及服務進度與您聯繫。每個管道皆為獨立選項，可隨時變更。",
      channelSms: "簡訊 (SMS)",
      channelWhatsapp: "WhatsApp",
      channelTelegram: "Telegram",
      channelWechat: "微信 (WeChat)",
    },
    ko: {
      portalTag: "고객 포털",
      welcomeDefault: "환영합니다",
      welcomePrefix: "환영합니다, ",
      signOut: "로그아웃",
      loadingAccount: "계정 정보를 불러오는 중입니다...",
      languageSwitcherLabel: "언어",
      tabApplications: "신청 및 서비스",
      tabProfile: "프로필",
      noApplicationsYet: "아직 신청 내역이 없습니다. 저희 팀이 문의 내용을 검토하면 이곳에 표시됩니다.",
      loading: "로딩 중...",
      viewApplicationHidden: "신청 내역 보기 ",
      statusHistoryHeading: "상태 이력",
      showEnglishOriginal: "영어 원문 보기",
      englishLabel: "English",
      translationUnavailable: "번역을 일시적으로 이용할 수 없습니다. 저희 팀은 원문을 계속 확인할 수 있습니다.",
      documentsHeading: "서류",
      noDocumentsYet: "아직 요청된 서류가 없습니다.",
      uploadLabel: "업로드",
      messagesHeading: "메시지",
      noMessagesYet: "아직 메시지가 없습니다.",
      messagePlaceholder: "메시지를 입력하세요...",
      sendButton: "보내기",
      paymentsHeading: "결제",
      noPaymentsYet: "아직 요청된 결제가 없습니다.",
      qrPhInstructions: "QR Ph를 이용하여 온라인 결제를 진행해 주십시오.",
      onlinePaymentPending: "온라인 결제 안내는 저희 팀에서 제공해 드립니다.",
      posNotice: "현재 체크/신용카드 결제는 저희 POS 단말기를 통해 현장에서만 가능합니다.",
      uploadProofOfPayment: "결제 증빙 업로드",
      proofReceivedAwaiting: "결제 증빙이 접수되었습니다. 저희 팀의 확인을 기다리고 있습니다.",
      englishDescriptionLabel: "영문 설명",
      serviceLabel: "서비스:",
      statusLabelText: "상태:",
      paymentLabelText: "결제:",
      viewReceiptText: "영수증 보기",
      airportVipBookingLabelText: "공항 VIP 예약:",
      uploadFailedDoc: "업로드에 실패했습니다. 파일 형식(PDF, JPEG, PNG 또는 WebP)과 크기(15MB 미만)를 확인한 후 다시 시도해 주십시오.",
      uploadFailedPayment: "업로드에 실패했습니다. 파일 형식과 크기를 확인한 후 다시 시도해 주십시오.",
      loadingBookingDetails: "예약 정보를 불러오는 중입니다...",
      bookingCouldNotLoad: "현재 예약 정보를 불러올 수 없습니다.",
      airportVipBookingHeading: "공항 VIP 예약",
      flightLabel: "항공편:",
      scheduledLabel: "예정 일시:",
      passengersLabel: "탑승객:",
      requestFlightChangeHeading: "항공편 변경 요청",
      airlineFieldLabel: "항공사",
      flightNumberFieldLabel: "항공편명",
      flightRouteFieldLabel: "출발지 / 도착지 (선택)",
      newScheduledDateLabel: "새 예정 항공편 날짜",
      newScheduledTimeLabel: "새 예정 항공편 시간",
      noteOptionalLabel: "메모 (선택)",
      submitFlightChangeButton: "항공편 변경 요청 제출",
      submittingStatus: "제출 중...",
      reschedulingAvailableNotice: "이 예약이 확정된 이후에 일정 변경을 요청하실 수 있습니다.",
      requestSubmittedEligible: "요청이 제출되었습니다. 원래 예정된 출발 시각으로부터 최소 120시간 전에 항공편 변경을 FIS에 통지한 고객은, 가능 여부에 따라 일정 변경 자격이 주어집니다.",
      requestSubmittedIneligible: "요청이 제출되었습니다. 이번 변경은 원래 예정된 출발 시각으로부터 120시간 미만으로 통지되어, 표준 정책상 일정 변경 자격이 없습니다.",
      genericErrorMsg: "문제가 발생했습니다. 다시 시도해 주십시오.",
      flightChangeRequestsHeading: "항공편 변경 요청 내역",
      decisionPending: "직원 검토 대기 중",
      decisionApproved: "승인됨",
      decisionApprovedException: "승인됨 (예외 승인)",
      decisionRejected: "승인되지 않음",
      fullNameLabel: "성명",
      emailLabel: "이메일 주소",
      emailChangeHint: "로그인 이메일을 변경하시려면 저희에게 문의해 주십시오.",
      phoneLabel: "전화번호",
      nationalityLabel: "국적",
      preferredLanguageLabel: "선호 소통 언어",
      notSpecifiedOption: "지정하지 않음",
      languageEnglish: "영어",
      languageSimplifiedChinese: "중국어(간체)",
      languageTraditionalChinese: "중국어(번체)",
      languageKorean: "한국어",
      languageJapanese: "일본어",
      languageVietnamese: "베트남어",
      otherOption: "기타",
      preferredChannelLabel: "선호 연락 채널",
      channelEmail: "이메일",
      channelPortal: "고객 포털",
      channelHint: "여기에는 FIS가 현재 이용 가능한 채널만 표시됩니다. 다른 채널은 아래 '향후 메시지 수신 동의'를 참고해 주십시오.",
      mobileNumberLabel: "휴대폰 번호",
      mobileNumberHint: "아래에서 SMS/WhatsApp/Telegram/WeChat을 활성화하신 경우에만 사용되며, 위의 전화번호 항목과는 별개입니다.",
      mobileCountryLabel: "휴대폰 번호 국가",
      mobileCountryNotNeeded: "\"+\" 국가 코드를 입력하신 경우 선택하지 않으셔도 됩니다",
      saveChangesButton: "변경 사항 저장",
      savingStatus: "저장 중...",
      savedStatus: "저장되었습니다.",
      inactiveChannelSuffix: " (현재 비활성)",
      futureMessagingHeading: "향후 메시지 수신 동의",
      futureMessagingDescription: "이 채널들은 아직 메시지 전송에 사용되지 않습니다. 여기에서 동의하시면 각 채널이 활성화되는 즉시 Foreign Immigration Services가 문의, 신청, 서류, 예약 및 서비스 진행 상황과 관련하여 해당 채널로 연락드릴 수 있습니다. 각 채널은 독립적으로 선택 가능하며 언제든지 변경하실 수 있습니다.",
      channelSms: "SMS",
      channelWhatsapp: "WhatsApp",
      channelTelegram: "Telegram",
      channelWechat: "WeChat",
    },
    ja: {
      portalTag: "クライアントポータル",
      welcomeDefault: "ようこそ",
      welcomePrefix: "ようこそ、",
      signOut: "サインアウト",
      loadingAccount: "アカウント情報を読み込んでいます...",
      languageSwitcherLabel: "言語",
      tabApplications: "申請・サービス",
      tabProfile: "プロフィール",
      noApplicationsYet: "まだ申請はありません。担当チームがお問い合わせを確認すると、ここに表示されます。",
      loading: "読み込み中...",
      viewApplicationHidden: "申請を表示 ",
      statusHistoryHeading: "ステータス履歴",
      showEnglishOriginal: "英語原文を表示",
      englishLabel: "English",
      translationUnavailable: "翻訳は現在ご利用いただけません。担当チームは元のメッセージを引き続き確認できます。",
      documentsHeading: "書類",
      noDocumentsYet: "まだご依頼している書類はありません。",
      uploadLabel: "アップロード",
      messagesHeading: "メッセージ",
      noMessagesYet: "まだメッセージはありません。",
      messagePlaceholder: "メッセージを入力してください...",
      sendButton: "送信",
      paymentsHeading: "お支払い",
      noPaymentsYet: "まだお支払いのご依頼はありません。",
      qrPhInstructions: "QR Phにてオンラインでお支払いください。",
      onlinePaymentPending: "オンラインお支払いのご案内は担当チームより別途ご連絡いたします。",
      posNotice: "デビットカード・クレジットカードでのお支払いは、現在店頭のPOS端末でのみ承っております。",
      uploadProofOfPayment: "お支払い証明をアップロード",
      proofReceivedAwaiting: "お支払い証明を受領しました。担当チームによる確認をお待ちください。",
      englishDescriptionLabel: "英語での説明",
      serviceLabel: "サービス：",
      statusLabelText: "ステータス：",
      paymentLabelText: "お支払い：",
      viewReceiptText: "領収書を見る",
      airportVipBookingLabelText: "空港VIP予約：",
      uploadFailedDoc: "アップロードに失敗しました。ファイル形式（PDF、JPEG、PNG、WebP）とサイズ（15MB未満）をご確認のうえ、再度お試しください。",
      uploadFailedPayment: "アップロードに失敗しました。ファイル形式とサイズをご確認のうえ、再度お試しください。",
      loadingBookingDetails: "予約詳細を読み込んでいます...",
      bookingCouldNotLoad: "現在、予約詳細を読み込めません。",
      airportVipBookingHeading: "空港VIP予約",
      flightLabel: "フライト：",
      scheduledLabel: "予定日時：",
      passengersLabel: "搭乗者：",
      requestFlightChangeHeading: "フライト変更のご依頼",
      airlineFieldLabel: "航空会社",
      flightNumberFieldLabel: "便名",
      flightRouteFieldLabel: "出発地／目的地（任意）",
      newScheduledDateLabel: "新しい予定フライト日",
      newScheduledTimeLabel: "新しい予定フライト時刻",
      noteOptionalLabel: "備考（任意）",
      submitFlightChangeButton: "フライト変更依頼を送信",
      submittingStatus: "送信中...",
      reschedulingAvailableNotice: "この予約が確定された後に、予約変更をご依頼いただけます。",
      requestSubmittedEligible: "ご依頼を受け付けました。元々予定されていた出発時刻の120時間以上前にFISへフライト変更をご連絡いただいたお客様は、空き状況に応じて予約変更の対象となります。",
      requestSubmittedIneligible: "ご依頼を受け付けました。今回のご連絡は元々予定されていた出発時刻の120時間未満であったため、標準ポリシー上、予約変更の対象とはなりません。",
      genericErrorMsg: "問題が発生しました。もう一度お試しください。",
      flightChangeRequestsHeading: "フライト変更依頼の履歴",
      decisionPending: "担当者確認待ち",
      decisionApproved: "承認済み",
      decisionApprovedException: "承認済み（特例）",
      decisionRejected: "承認されませんでした",
      fullNameLabel: "氏名",
      emailLabel: "メールアドレス",
      emailChangeHint: "サインイン用メールアドレスの変更はお問い合わせください。",
      phoneLabel: "電話番号",
      nationalityLabel: "国籍",
      preferredLanguageLabel: "ご希望の連絡言語",
      notSpecifiedOption: "指定なし",
      languageEnglish: "英語",
      languageSimplifiedChinese: "簡体字中国語",
      languageTraditionalChinese: "繁体字中国語",
      languageKorean: "韓国語",
      languageJapanese: "日本語",
      languageVietnamese: "ベトナム語",
      otherOption: "その他",
      preferredChannelLabel: "ご希望の連絡方法",
      channelEmail: "メール",
      channelPortal: "クライアントポータル",
      channelHint: "ここには現在FISがご利用いただける連絡方法のみ表示されます。その他の方法については下記「今後のメッセージ送信に関する同意」をご覧ください。",
      mobileNumberLabel: "携帯電話番号",
      mobileNumberHint: "下記でSMS/WhatsApp/Telegram/WeChatを有効にされた場合のみ使用されます。上記の電話番号とは別の項目です。",
      mobileCountryLabel: "携帯電話番号の国",
      mobileCountryNotNeeded: "「+」から始まる国番号を入力された場合は選択不要です",
      saveChangesButton: "変更を保存",
      savingStatus: "保存中...",
      savedStatus: "保存しました。",
      inactiveChannelSuffix: "（現在無効）",
      futureMessagingHeading: "今後のメッセージ送信に関する同意",
      futureMessagingDescription: "これらのチャンネルは現在メッセージ送信に対応しておりません。こちらで同意を記録いただくことで、各チャンネルが利用可能になり次第、お問い合わせ・申請・書類・ご予約・サービスの進捗に関するご連絡をFISからお送りできるようになります。各チャンネルは個別に選択可能で、いつでも変更いただけます。",
      channelSms: "SMS",
      channelWhatsapp: "WhatsApp",
      channelTelegram: "Telegram",
      channelWechat: "WeChat",
    },
    vi: {
      portalTag: "Cổng Thông Tin Khách Hàng",
      welcomeDefault: "Xin Chào",
      welcomePrefix: "Xin chào, ",
      signOut: "Đăng Xuất",
      loadingAccount: "Đang tải thông tin tài khoản của quý khách...",
      languageSwitcherLabel: "Ngôn ngữ",
      tabApplications: "Hồ Sơ & Dịch Vụ",
      tabProfile: "Hồ Sơ Cá Nhân",
      noApplicationsYet: "Chưa có hồ sơ nào. Khi đội ngũ của chúng tôi xem xét yêu cầu của quý khách, hồ sơ sẽ xuất hiện tại đây.",
      loading: "Đang tải...",
      viewApplicationHidden: "Xem hồ sơ ",
      statusHistoryHeading: "Lịch Sử Trạng Thái",
      showEnglishOriginal: "Xem bản gốc tiếng Anh",
      englishLabel: "English",
      translationUnavailable: "Bản dịch tạm thời không khả dụng. Đội ngũ của chúng tôi vẫn có thể đọc được tin nhắn gốc của quý khách.",
      documentsHeading: "Hồ Sơ Giấy Tờ",
      noDocumentsYet: "Chưa có yêu cầu hồ sơ nào.",
      uploadLabel: "Tải lên",
      messagesHeading: "Tin Nhắn",
      noMessagesYet: "Chưa có tin nhắn nào.",
      messagePlaceholder: "Nhập tin nhắn...",
      sendButton: "Gửi",
      paymentsHeading: "Thanh Toán",
      noPaymentsYet: "Chưa có yêu cầu thanh toán nào.",
      qrPhInstructions: "Vui lòng thanh toán trực tuyến bằng QR Ph.",
      onlinePaymentPending: "Hướng dẫn thanh toán trực tuyến sẽ được đội ngũ của chúng tôi cung cấp.",
      posNotice: "Hiện tại, thanh toán bằng thẻ ghi nợ/thẻ tín dụng chỉ được chấp nhận trực tiếp qua máy POS của chúng tôi.",
      uploadProofOfPayment: "Tải lên chứng từ thanh toán",
      proofReceivedAwaiting: "Đã nhận chứng từ thanh toán. Đang chờ đội ngũ của chúng tôi xác minh.",
      englishDescriptionLabel: "Mô Tả Tiếng Anh",
      serviceLabel: "Dịch vụ:",
      statusLabelText: "Trạng thái:",
      paymentLabelText: "Thanh toán:",
      viewReceiptText: "Xem Biên Lai",
      airportVipBookingLabelText: "Đặt Lịch Airport VIP:",
      uploadFailedDoc: "Tải lên không thành công. Vui lòng kiểm tra loại tệp (PDF, JPEG, PNG hoặc WebP) và kích thước (dưới 15MB), sau đó thử lại.",
      uploadFailedPayment: "Tải lên không thành công. Vui lòng kiểm tra loại tệp và kích thước, sau đó thử lại.",
      loadingBookingDetails: "Đang tải thông tin đặt lịch...",
      bookingCouldNotLoad: "Hiện không thể tải thông tin đặt lịch.",
      airportVipBookingHeading: "Đặt Lịch Airport VIP",
      flightLabel: "Chuyến bay:",
      scheduledLabel: "Lịch trình:",
      passengersLabel: "Hành khách:",
      requestFlightChangeHeading: "Yêu Cầu Thay Đổi Chuyến Bay",
      airlineFieldLabel: "Hãng Hàng Không",
      flightNumberFieldLabel: "Số Hiệu Chuyến Bay",
      flightRouteFieldLabel: "Điểm Đi / Điểm Đến (không bắt buộc)",
      newScheduledDateLabel: "Ngày Chuyến Bay Mới",
      newScheduledTimeLabel: "Giờ Chuyến Bay Mới",
      noteOptionalLabel: "Ghi Chú (không bắt buộc)",
      submitFlightChangeButton: "Gửi Yêu Cầu Thay Đổi Chuyến Bay",
      submittingStatus: "Đang gửi...",
      reschedulingAvailableNotice: "Quý khách có thể yêu cầu đổi lịch sau khi đặt lịch này được xác nhận.",
      requestSubmittedEligible: "Yêu cầu đã được gửi. Khách hàng thông báo cho FIS về việc thay đổi chuyến bay ít nhất 120 giờ trước giờ khởi hành dự kiến ban đầu sẽ đủ điều kiện để đổi lịch, tùy theo tình trạng còn chỗ.",
      requestSubmittedIneligible: "Yêu cầu đã được gửi. Thay đổi này được thông báo dưới 120 giờ trước giờ khởi hành dự kiến ban đầu, do đó không đủ điều kiện đổi lịch theo chính sách tiêu chuẩn.",
      genericErrorMsg: "Đã xảy ra sự cố. Vui lòng thử lại.",
      flightChangeRequestsHeading: "Lịch Sử Yêu Cầu Thay Đổi Chuyến Bay",
      decisionPending: "Đang chờ nhân viên xem xét",
      decisionApproved: "Đã Chấp Thuận",
      decisionApprovedException: "Đã Chấp Thuận (trường hợp ngoại lệ)",
      decisionRejected: "Không Được Chấp Thuận",
      fullNameLabel: "Họ và Tên",
      emailLabel: "Địa Chỉ Email",
      emailChangeHint: "Vui lòng liên hệ với chúng tôi để thay đổi email đăng nhập.",
      phoneLabel: "Điện Thoại",
      nationalityLabel: "Quốc Tịch",
      preferredLanguageLabel: "Ngôn Ngữ Liên Lạc Ưa Thích",
      notSpecifiedOption: "Chưa xác định",
      languageEnglish: "Tiếng Anh",
      languageSimplifiedChinese: "Tiếng Trung Giản Thể",
      languageTraditionalChinese: "Tiếng Trung Phồn Thể",
      languageKorean: "Tiếng Hàn",
      languageJapanese: "Tiếng Nhật",
      languageVietnamese: "Tiếng Việt",
      otherOption: "Khác",
      preferredChannelLabel: "Kênh Liên Lạc Ưa Thích",
      channelEmail: "Email",
      channelPortal: "Cổng Thông Tin Khách Hàng",
      channelHint: "Chỉ các kênh FIS hiện có thể sử dụng được liệt kê ở đây. Xem Quyền Nhắn Tin Trong Tương Lai bên dưới để biết các kênh khác.",
      mobileNumberLabel: "Số Điện Thoại Di Động",
      mobileNumberHint: "Chỉ được sử dụng cho SMS/WhatsApp/Telegram/WeChat nếu quý khách kích hoạt bên dưới. Khác với trường Điện Thoại ở trên.",
      mobileCountryLabel: "Quốc Gia Của Số Điện Thoại Di Động",
      mobileCountryNotNeeded: "Không cần chọn nếu quý khách đã nhập mã quốc gia \"+\"",
      saveChangesButton: "Lưu Thay Đổi",
      savingStatus: "Đang lưu...",
      savedStatus: "Đã lưu.",
      inactiveChannelSuffix: " (hiện chưa kích hoạt)",
      futureMessagingHeading: "Quyền Nhắn Tin Trong Tương Lai",
      futureMessagingDescription: "Các kênh này hiện chưa được kích hoạt để nhắn tin. Việc ghi nhận sự đồng ý của quý khách tại đây cho phép Foreign Immigration Services liên hệ với quý khách qua kênh này ngay khi kênh đó khả dụng, liên quan đến yêu cầu, hồ sơ, giấy tờ, lịch hẹn và cập nhật dịch vụ của quý khách. Mỗi kênh độc lập, không bắt buộc, và có thể thay đổi bất kỳ lúc nào.",
      channelSms: "SMS",
      channelWhatsapp: "WhatsApp",
      channelTelegram: "Telegram",
      channelWechat: "WeChat",
    },
  };

  // Fallback-only generic status labels, mirroring worker/src/lib/
  // clientLocaleStrings.js's own STATUS_LABELS table exactly (kept in
  // sync by hand, same as that file's own fallback-to-English
  // convention) -- normally never hit, since the backend already attaches
  // a pre-localized statusLabel to every application/history row once
  // the client's preferred_communication_language is kept in sync with
  // this shell's displayed language (see syncPreferredLanguage below).
  var STATUS_LABELS = {
    en: {
      enquiry_received: "Enquiry received", under_review: "Under review", documents_required: "Documents required",
      documents_received: "Documents received", preparing_application: "Preparing application", submitted: "Submitted",
      awaiting_authority_action: "Awaiting authority action", additional_information_required: "Additional information required", completed: "Completed",
    },
    "zh-CN": {
      enquiry_received: "已收到咨询", under_review: "审核中", documents_required: "需要提交材料",
      documents_received: "材料已收到", preparing_application: "申请准备中", submitted: "已提交",
      awaiting_authority_action: "等待相关机构处理", additional_information_required: "需要补充信息", completed: "已完成",
    },
    "zh-Hant": {
      enquiry_received: "已收到諮詢", under_review: "審核中", documents_required: "需要提交文件",
      documents_received: "文件已收到", preparing_application: "申請準備中", submitted: "已提交",
      awaiting_authority_action: "等待相關機關處理", additional_information_required: "需要補充資訊", completed: "已完成",
    },
    ko: {
      enquiry_received: "문의 접수됨", under_review: "검토 중", documents_required: "서류 제출 필요",
      documents_received: "서류 접수됨", preparing_application: "신청서 준비 중", submitted: "제출됨",
      awaiting_authority_action: "관계 기관 처리 대기 중", additional_information_required: "추가 정보 필요", completed: "완료됨",
    },
    ja: {
      enquiry_received: "お問い合わせを受け付けました", under_review: "確認中", documents_required: "書類が必要です",
      documents_received: "書類を受領しました", preparing_application: "申請書類準備中", submitted: "提出済み",
      awaiting_authority_action: "関係機関の処理待ち", additional_information_required: "追加情報が必要です", completed: "完了",
    },
    vi: {
      enquiry_received: "Đã nhận yêu cầu", under_review: "Đang xem xét", documents_required: "Cần bổ sung hồ sơ",
      documents_received: "Đã nhận hồ sơ", preparing_application: "Đang chuẩn bị hồ sơ", submitted: "Đã nộp hồ sơ",
      awaiting_authority_action: "Đang chờ cơ quan chức năng xử lý", additional_information_required: "Cần bổ sung thông tin", completed: "Hoàn tất",
    },
  };

  function t(key) {
    return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
  }

  function statusLabel(status) {
    return (STATUS_LABELS[lang] && STATUS_LABELS[lang][status]) || STATUS_LABELS.en[status] || status.replace(/_/g, " ");
  }

  function detectLang() {
    try {
      var stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (CANONICAL_LANGUAGES.indexOf(stored) !== -1) return stored;
    } catch (e) {
      /* localStorage unavailable -- fall through to English */
    }
    return "en";
  }

  var lang = detectLang();

  function applyStaticTranslations() {
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n-key]").forEach(function (el) {
      var key = el.getAttribute("data-i18n-key");
      var value = t(key);
      // <option>/<label>/<span>/button/heading text content -- none of
      // these static elements carry nested markup that textContent would
      // clobber.
      el.textContent = value;
    });
    var switcher = document.getElementById("portal-lang-switcher");
    if (switcher) switcher.value = lang;
  }

  // Applied immediately -- before the auth check resolves -- so the
  // shell (including "Loading your account...") already renders in the
  // customer's chosen language, not just the content that loads after.
  applyStaticTranslations();

  // Keeps the backend's own status-label localization (which keys off
  // client.preferred_communication_language, set via the Profile form --
  // see worker/src/routes/applications.js) in sync with whatever language
  // this shell is actually displaying, so "dynamic status labels are
  // translated, not merely static page content" holds for both halves of
  // the app rather than silently drifting apart. Never overwrites a
  // customer's own, already-matching preference; only called when it
  // would otherwise be stale.
  function syncPreferredLanguage(newLang) {
    window.portalFetch("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ preferredCommunicationLanguage: newLang }),
    }).catch(function () {
      /* best-effort -- the shell's own displayed language is unaffected either way */
    });
  }

  function setLang(newLang) {
    if (CANONICAL_LANGUAGES.indexOf(newLang) === -1) return;
    lang = newLang;
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, newLang);
    } catch (e) {
      /* non-fatal -- the choice just won't persist across visits */
    }
    applyStaticTranslations();
    syncPreferredLanguage(newLang);
    loadApplications();
    document.getElementById("portal-application-detail").hidden = true;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso.replace(" ", "T") + (iso.endsWith("Z") ? "" : "Z"));
    return isNaN(d) ? iso : d.toLocaleDateString(lang, { year: "numeric", month: "short", day: "numeric" });
  }

  var appEl = document.getElementById("portal-app");
  var loadingEl = document.getElementById("portal-loading");
  var welcomeEl = document.getElementById("portal-welcome");
  var currentClient = null;

  window
    .portalFetch("/api/auth/me")
    .then(function (resp) {
      if (!resp.ok) {
        window.location.href = "/portal/login/";
        return Promise.reject();
      }
      return resp.json();
    })
    .then(function (data) {
      currentClient = data.client;
      welcomeEl.textContent = t("welcomePrefix") + currentClient.fullName;
      loadingEl.hidden = true;
      appEl.hidden = false;
      // If the public site's chosen language differs from this client's
      // stored preference (e.g. they picked a language on the public
      // site for the first time, or on a different device), sync it once
      // on load so the backend's own status-label localization matches
      // what this shell is about to render.
      if (currentClient.preferredCommunicationLanguage !== lang) {
        syncPreferredLanguage(lang);
      }
      loadApplications();
      setupTabs();
      setupProfileForm();
      setupConsentToggles();
      setupLogout();
      setupLangSwitcher();
    })
    .catch(function () {
      /* already redirected */
    });

  function setupLangSwitcher() {
    var switcher = document.getElementById("portal-lang-switcher");
    if (!switcher) return;
    switcher.value = lang;
    switcher.addEventListener("change", function () {
      setLang(switcher.value);
    });
  }

  function setupTabs() {
    var tabs = document.querySelectorAll(".portal-tab");
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        tabs.forEach(function (t) {
          t.setAttribute("aria-selected", t === tab ? "true" : "false");
        });
        document.querySelectorAll(".portal-panel").forEach(function (panel) {
          panel.hidden = panel.id !== "portal-panel-" + tab.dataset.tab;
        });
        if (tab.dataset.tab === "profile") loadProfile();
      });
    });
  }

  function setupLogout() {
    document.getElementById("portal-logout").addEventListener("click", function () {
      window.portalFetch("/api/auth/logout", { method: "POST" }).then(function () {
        window.location.href = "/portal/login/";
      });
    });
  }

  // ---- Applications & Services ----

  function loadApplications() {
    window
      .portalFetch("/api/applications")
      .then(function (resp) { return resp.json(); })
      .then(function (data) { renderApplicationsList(data.applications); });
  }

  function renderApplicationsList(applications) {
    var listEl = document.getElementById("portal-applications-list");
    var template = document.getElementById("portal-application-item-template");
    listEl.innerHTML = "";

    if (!applications.length) {
      listEl.innerHTML = '<p class="muted">' + escapeHtml(t("noApplicationsYet")) + "</p>";
      return;
    }

    applications.forEach(function (application) {
      var node = template.content.cloneNode(true);
      var btn = node.querySelector(".portal-application-item");
      btn.querySelector(".visually-hidden").textContent = t("viewApplicationHidden");
      btn.querySelector(".portal-application-item__ref").textContent = application.reference;
      btn.querySelector(".portal-application-item__service").textContent = application.service_slug.replace(/-/g, " ");
      // The compact list row has room for one badge -- prefer whichever
      // status is most consequential to the customer right now (a
      // booking's own status, then payment, then the generic enquiry/
      // document status), rather than always defaulting to the latter.
      // The full detail view (renderApplicationDetail) always shows all
      // three separately -- this is a space-constrained summary, not a
      // second place the dimensions get merged into one.
      var badgeLabel = (application.bookingStatus && application.bookingStatus.statusLabel) ||
        (application.checkoutOrder && application.checkoutOrder.statusLabel) ||
        application.statusLabel || statusLabel(application.status);
      btn.querySelector(".portal-application-item__status").textContent = badgeLabel;
      btn.addEventListener("click", function () { loadApplicationDetail(application.id); });
      listEl.appendChild(node);
    });
  }

  function loadApplicationDetail(applicationId) {
    var detailEl = document.getElementById("portal-application-detail");
    detailEl.hidden = false;
    detailEl.innerHTML = '<p class="muted">' + escapeHtml(t("loading")) + "</p>";
    detailEl.scrollIntoView({ behavior: "smooth", block: "start" });

    Promise.all([
      window.portalFetch("/api/applications/" + applicationId).then((r) => r.json()),
      window.portalFetch("/api/applications/" + applicationId + "/documents").then((r) => r.json()),
      window.portalFetch("/api/applications/" + applicationId + "/messages").then((r) => r.json()),
      window.portalFetch("/api/applications/" + applicationId + "/payments").then((r) => r.json()),
      window.portalFetch("/api/bi-forms").then((r) => r.json()),
    ]).then(function (results) {
      renderApplicationDetail(applicationId, results[0], results[1], results[2], results[3], results[4]);
    });
  }

  function renderApplicationDetail(applicationId, appData, docsData, msgData, payData, biFormsData) {
    var detailEl = document.getElementById("portal-application-detail");
    var application = appData.application;

    var historyHtml = appData.history
      .map(function (h) {
        var label = h.statusLabel || statusLabel(h.status);
        var noteHtml = "";
        if (h.noteTranslationStatus === "ready" && h.noteTranslated) {
          // Bilingual-capable, but a status note is not a payment — the
          // client sees the translated note primarily, with the English
          // original available as a discreet disclosure (same pattern as
          // the "Show English original" control on portal messages).
          noteHtml =
            '<br><span class="muted">' + escapeHtml(h.noteTranslated) + '</span>' +
            '<details class="portal-message-original"><summary>' + escapeHtml(t("showEnglishOriginal")) + '</summary><p>' + escapeHtml(h.note) + '</p></details>';
        } else if (h.note) {
          noteHtml = '<br><span class="muted">' + escapeHtml(h.note) + '</span>';
        }
        return '<li><strong>' + escapeHtml(label) + '</strong>, ' + formatDate(h.changedAt) + noteHtml + '</li>';
      })
      .join("");

    var docRequestsHtml = docsData.documentRequests
      .map(function (dr) {
        var uploaded = docsData.documents.find((d) => d.document_request_id === dr.id);
        var labelHtml = '<span>' + escapeHtml(dr.label) + '</span>';
        if (dr.labelTranslationStatus === "ready" && dr.labelTranslated) {
          // Translated primary, English original as a discreet disclosure
          // (Phase 3.1 Section 13) — not hidden entirely, but not the
          // always-visible bilingual treatment payments get either.
          labelHtml =
            '<span>' + escapeHtml(dr.labelTranslated) + '</span>' +
            '<details class="portal-message-original"><summary>' + escapeHtml(t("showEnglishOriginal")) + '</summary><p>' + escapeHtml(dr.label) + '</p></details>';
        }
        return '<li class="portal-doc-request" data-request-id="' + dr.id + '">' +
          labelHtml + ' ' +
          '<span class="status-badge">' + escapeHtml(dr.status) + '</span>' +
          (uploaded
            ? '<span class="muted">: ' + escapeHtml(uploaded.original_filename) + '</span>'
            : '<label class="portal-upload-label">' + escapeHtml(t("uploadLabel")) + '<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="portal-doc-upload" data-request-id="' + dr.id + '"></label>') +
          '</li>';
      })
      .join("") || '<li class="muted">' + escapeHtml(t("noDocumentsYet")) + '</li>';

    var messagesHtml = msgData.messages
      .map(function (m) {
        // Bilingual correspondence: the customer's own language appears
        // first (m.body is already in that language for both sender
        // types — the client's own original text, or a staff reply
        // translated for them), with the English version directly
        // underneath in the same card by default — no longer a collapsed
        // "show original" disclosure. Labels name the language the
        // message/translation is actually IN, not the portal UI's own
        // active language. English is shown once, never duplicated, when
        // the message is itself in English.
        var englishText = m.english_original || m.english_translation || null;
        var bodyHtml;
        if (englishText) {
          var selfLabel = languageSelfLabel(m.body_language);
          bodyHtml =
            (selfLabel ? '<p class="portal-message-lang-label">' + escapeHtml(selfLabel) + '</p>' : '') +
            '<p>' + escapeHtml(m.body) + '</p>' +
            '<p class="portal-message-lang-label">' + escapeHtml(t("englishLabel")) + '</p>' +
            '<p>' + escapeHtml(englishText) + '</p>';
        } else {
          bodyHtml = '<p>' + escapeHtml(m.body) + '</p>';
          if (m.translation_unavailable) {
            bodyHtml += '<p class="muted">' + escapeHtml(t("translationUnavailable")) + '</p>';
          }
        }
        return '<div class="portal-message portal-message--' + m.sender_type + '"><strong>' + escapeHtml(m.sender_label) + '</strong> <span class="muted">' + formatDate(m.created_at) + '</span>' + bodyHtml + '</div>';
      })
      .join("") || '<p class="muted">' + escapeHtml(t("noMessagesYet")) + '</p>';

    var paymentsHtml = payData.payments
      .map(function (p) {
        var actionHtml = "";
        if (p.status === "pending") {
          var onlineInstructions = payData.qrPhConfigured
            ? '<img src="' + window.PORTAL_API_BASE + '/api/qr-ph-image" alt="QR Ph payment QR code" class="portal-qr-image">' +
              "<p>" + escapeHtml(t("qrPhInstructions")) + "</p>"
            : "<p>" + escapeHtml(t("onlinePaymentPending")) + "</p>";
          actionHtml =
            '<div class="portal-payment-instructions">' +
            onlineInstructions +
            '<p class="muted">' + escapeHtml(t("posNotice")) + '</p>' +
            '<label class="portal-upload-label">' + escapeHtml(t("uploadProofOfPayment")) + '<input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" class="portal-payment-proof-upload" data-payment-id="' + p.id + '"></label>' +
            "</div>";
        } else if (p.status === "submitted") {
          actionHtml = '<p class="muted">' + escapeHtml(t("proofReceivedAwaiting")) + '</p>';
        }
        // Bilingual by design (Phase 3.1 Section 17): once a translation
        // is ready, BOTH the English original and the translated
        // description are always shown, never one hidden behind a
        // disclosure — this is money, not a status update or a document
        // request title.
        var descriptionHtml;
        if (p.descriptionTranslationStatus === "ready" && p.descriptionTranslated) {
          descriptionHtml =
            '<p><strong>' + escapeHtml(t("englishDescriptionLabel")) + '</strong><br>' + escapeHtml(p.description) + '</p>' +
            '<p><strong>' + escapeHtml(p.descriptionHeading || "Translated Description") + '</strong><br>' + escapeHtml(p.descriptionTranslated) + '</p>' +
            (p.discrepancyWarning ? '<p class="muted portal-payment-warning">' + escapeHtml(p.discrepancyWarning) + '</p>' : '');
        } else {
          descriptionHtml = '<p>' + escapeHtml(p.description) + '</p>';
        }
        return '<li class="portal-payment"><div><strong>PHP ' + Number(p.amountPhp).toFixed(2) + '</strong> <span class="status-badge">' + escapeHtml(p.status) + '</span></div>' + descriptionHtml + actionHtml + '</li>';
      })
      .join("") || '<li class="muted">' + escapeHtml(t("noPaymentsYet")) + '</li>';

    // Finding F1 (October review): application.status is the document/
    // enquiry-processing pipeline ONLY -- a linked Order & Book Online
    // order's payment status, and an Airport VIP booking's own status,
    // are each a DIFFERENT dimension and are shown as their own line,
    // never merged into or replacing the line above. A customer whose
    // payment is verified but whose booking availability is still under
    // review must see BOTH facts, not one overwriting the other.
    var checkoutOrder = appData.checkoutOrder;
    var bookingStatus = appData.bookingStatus;
    var statusLinesHtml =
      '<p><strong>' + escapeHtml(t("serviceLabel")) + '</strong> ' + escapeHtml(application.service_slug.replace(/-/g, " ")) + ' &nbsp; <strong>' + escapeHtml(t("statusLabelText")) + '</strong> <span class="status-badge">' + escapeHtml(application.statusLabel || statusLabel(application.status)) + "</span></p>" +
      (checkoutOrder
        ? '<p><strong>' + escapeHtml(t("paymentLabelText")) + '</strong> <span class="status-badge">' + escapeHtml(checkoutOrder.statusLabel) + '</span> &nbsp; <a href="/instant-services/receipt/?order=' + encodeURIComponent(checkoutOrder.id) + '&lang=' + encodeURIComponent(lang) + '">' + escapeHtml(t("viewReceiptText")) + '</a></p>'
        : "") +
      (bookingStatus ? '<p><strong>' + escapeHtml(t("airportVipBookingLabelText")) + '</strong> <span class="status-badge">' + escapeHtml(bookingStatus.statusLabel) + "</span></p>" : "");

    detailEl.innerHTML =
      '<div class="card portal-detail-card">' +
      '<h2>' + escapeHtml(application.reference) + '</h2>' +
      statusLinesHtml +
      (historyHtml ? '<h3>' + escapeHtml(t("statusHistoryHeading")) + '</h3><ul class="portal-history">' + historyHtml + "</ul>" : "") +
      '<div id="portal-bi-forms-section"></div>' +
      (bookingStatus ? '<div id="portal-airport-vip-section"></div>' : "") +
      '<h3>' + escapeHtml(t("documentsHeading")) + '</h3><ul class="portal-doc-requests">' + docRequestsHtml + "</ul>" +
      '<h3>' + escapeHtml(t("messagesHeading")) + '</h3><div class="portal-messages">' + messagesHtml + '</div>' +
      '<form class="portal-message-form"><textarea placeholder="' + escapeHtml(t("messagePlaceholder")) + '" required></textarea><button type="submit" class="btn btn-secondary">' + escapeHtml(t("sendButton")) + '</button></form>' +
      '<h3>' + escapeHtml(t("paymentsHeading")) + '</h3><ul class="portal-payments">' + paymentsHtml + "</ul>" +
      "</div>";

    wireDetailInteractions(detailEl, applicationId);

    // BI Forms assigned to THIS application, rendered via the dedicated
    // questionnaire module (Phase 2 Stage 5.4) -- kept as a separate file
    // (portal-bi-form.js) rather than folded in here given its own scope
    // (generic multi-language question rendering, draft/submit,
    // documents), but still just another section of this same detail view.
    if (window.PortalBiForms) {
      var ownForms = (biFormsData.submissions || []).filter(function (s) { return s.applicationId === applicationId; });
      wireBiFormsSection(applicationId, ownForms);
    }

    if (bookingStatus && checkoutOrder) {
      wireAirportVipSection(checkoutOrder.id);
    }
  }

  // ---------------------------------------------------------------------
  // Airport VIP booking details + rescheduling (Stage 4C/§12 of the Order
  // & Book Online directive). Flight/passenger details and the reschedule-
  // request history come from the SAME customer-facing booking routes the
  // guest application flow uses (worker/src/routes/airportVipCustomer.js)
  // -- nothing about a booking's data is duplicated here. The 120-hour
  // eligibility wording is always whatever the backend just computed;
  // this file never calculates or guesses it.
  // ---------------------------------------------------------------------
  function wireAirportVipSection(orderId) {
    var sectionEl = document.getElementById("portal-airport-vip-section");
    if (!sectionEl) return;
    sectionEl.innerHTML = '<p class="muted">' + escapeHtml(t("loadingBookingDetails")) + '</p>';

    window
      .portalFetch("/api/instant-services/orders/" + orderId + "/booking")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var booking = data.booking;
        if (!booking) {
          sectionEl.innerHTML = "";
          return;
        }
        renderAirportVipSection(sectionEl, booking);
      })
      .catch(function () {
        sectionEl.innerHTML = '<p class="muted">' + escapeHtml(t("bookingCouldNotLoad")) + '</p>';
      });
  }

  var RESCHEDULABLE_BOOKING_STATUSES = ["confirmed", "rescheduled"];

  function renderAirportVipSection(sectionEl, booking) {
    var flightHtml =
      '<p><strong>' + escapeHtml(t("flightLabel")) + '</strong> ' + escapeHtml(booking.airline) + " " + escapeHtml(booking.flightNumber) +
      (booking.flightRoute ? " (" + escapeHtml(booking.flightRoute) + ")" : "") + "<br>" +
      '<strong>' + escapeHtml(t("scheduledLabel")) + '</strong> ' + escapeHtml(booking.scheduledLocalDate) + " " + escapeHtml(booking.scheduledLocalTime) + " (" + escapeHtml(booking.scheduledTimezone) + ")<br>" +
      '<strong>' + escapeHtml(t("passengersLabel")) + '</strong> ' + escapeHtml(booking.passengerNames.join(", ")) + "</p>";

    var canReschedule = RESCHEDULABLE_BOOKING_STATUSES.indexOf(booking.status) !== -1;
    var rescheduleFormHtml = canReschedule
      ? '<form class="portal-reschedule-form enquiry-form">' +
        '<h4>' + escapeHtml(t("requestFlightChangeHeading")) + '</h4>' +
        '<div class="form-field"><label for="reschedAirline">' + escapeHtml(t("airlineFieldLabel")) + '</label><input type="text" id="reschedAirline" required></div>' +
        '<div class="form-field"><label for="reschedFlightNumber">' + escapeHtml(t("flightNumberFieldLabel")) + '</label><input type="text" id="reschedFlightNumber" required></div>' +
        '<div class="form-field"><label for="reschedRoute">' + escapeHtml(t("flightRouteFieldLabel")) + '</label><input type="text" id="reschedRoute"></div>' +
        '<div class="form-field"><label for="reschedDate">' + escapeHtml(t("newScheduledDateLabel")) + '</label><input type="date" id="reschedDate" required></div>' +
        '<div class="form-field"><label for="reschedTime">' + escapeHtml(t("newScheduledTimeLabel")) + '</label><input type="time" id="reschedTime" required></div>' +
        '<div class="form-field form-field--full"><label for="reschedNote">' + escapeHtml(t("noteOptionalLabel")) + '</label><textarea id="reschedNote"></textarea></div>' +
        '<div class="enquiry-form-actions"><button type="submit" class="btn btn-secondary">' + escapeHtml(t("submitFlightChangeButton")) + '</button><p class="form-status" aria-live="polite"></p></div>' +
        "</form>"
      : '<p class="muted">' + escapeHtml(t("reschedulingAvailableNotice")) + '</p>';

    sectionEl.innerHTML =
      '<h3>' + escapeHtml(t("airportVipBookingHeading")) + '</h3>' +
      '<div class="card">' + flightHtml + rescheduleFormHtml +
      '<div class="portal-reschedule-requests"></div>' +
      "</div>";

    loadRescheduleRequests(sectionEl, booking.id);

    var form = sectionEl.querySelector(".portal-reschedule-form");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var status = form.querySelector(".form-status");
        var button = form.querySelector("button[type=submit]");
        button.disabled = true;
        status.textContent = t("submittingStatus");

        window
          .portalFetch("/api/instant-services/bookings/" + booking.id + "/reschedule-requests", {
            method: "POST",
            body: JSON.stringify({
              airline: document.getElementById("reschedAirline").value.trim(),
              flightNumber: document.getElementById("reschedFlightNumber").value.trim(),
              flightRoute: document.getElementById("reschedRoute").value.trim(),
              scheduledLocalDate: document.getElementById("reschedDate").value,
              scheduledLocalTime: document.getElementById("reschedTime").value,
              scheduledTimezone: booking.scheduledTimezone,
              customerNote: document.getElementById("reschedNote").value.trim(),
            }),
          })
          .then(function (resp) {
            if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
            return resp.json();
          })
          .then(function (result) {
            // Never a guarantee -- surfaces exactly what the backend
            // decided from the 120-hour rule, in the directive's own
            // required wording (translated faithfully, never implying a
            // guarantee), and nothing stronger.
            status.textContent = result.eligible ? t("requestSubmittedEligible") : t("requestSubmittedIneligible");
            form.reset();
            button.disabled = false;
            loadRescheduleRequests(sectionEl, booking.id);
          })
          .catch(function (data) {
            status.textContent = (data && data.error) || t("genericErrorMsg");
            button.disabled = false;
          });
      });
    }
  }

  function loadRescheduleRequests(sectionEl, bookingId) {
    var listEl = sectionEl.querySelector(".portal-reschedule-requests");
    if (!listEl) return;
    window
      .portalFetch("/api/instant-services/bookings/" + bookingId + "/reschedule-requests")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var requests = data.requests || [];
        if (!requests.length) {
          listEl.innerHTML = "";
          return;
        }
        var decisionLabel = {
          pending: t("decisionPending"),
          approved: t("decisionApproved"),
          exception_approved: t("decisionApprovedException"),
          rejected: t("decisionRejected"),
        };
        listEl.innerHTML =
          "<h4>" + escapeHtml(t("flightChangeRequestsHeading")) + "</h4><ul class=\"portal-history\">" +
          requests
            .map(function (r) {
              var pf = r.proposedFlight;
              return "<li><strong>" + escapeHtml(pf.airline) + " " + escapeHtml(pf.flightNumber) + "</strong> &rarr; " +
                escapeHtml(pf.scheduledLocalDate) + " " + escapeHtml(pf.scheduledLocalTime) +
                "<br><span class=\"status-badge\">" + escapeHtml(decisionLabel[r.staffDecision] || r.staffDecision) + "</span></li>";
            })
            .join("") +
          "</ul>";
      })
      .catch(function () {
        listEl.innerHTML = "";
      });
  }

  function wireBiFormsSection(applicationId, submissions) {
    var sectionEl = document.getElementById("portal-bi-forms-section");
    var detailEl = document.getElementById("portal-application-detail");
    var biFormViewEl = document.getElementById("portal-bi-form-view");
    // Per-submission preferredLanguage (saved on first draft/submit) is
    // the authoritative source once a form has been touched; this shell's
    // own detected `lang` is what a never-touched submission defaults to
    // -- both openBiFormDetail and wireBiFormsSection already accept a
    // language argument (Phase 2 Stage 5.4) that this file simply wasn't
    // passing, leaving this one section's chrome ("BI Forms"/"No BI forms
    // assigned yet.") stuck in English regardless of the rest of the
    // shell. Caught via live browser testing in Japanese.
    window.PortalBiForms.wireBiFormsSection(sectionEl, submissions, function (submissionId) {
      detailEl.hidden = true;
      biFormViewEl.hidden = false;
      biFormViewEl.scrollIntoView({ behavior: "smooth", block: "start" });
      window.PortalBiForms.openBiFormDetail(biFormViewEl, submissionId, function () {
        biFormViewEl.hidden = true;
        detailEl.hidden = false;
      }, lang);
    }, lang);
  }

  function wireDetailInteractions(detailEl, applicationId) {
    detailEl.querySelectorAll(".portal-doc-upload").forEach(function (input) {
      input.addEventListener("change", function () {
        var file = input.files[0];
        if (!file) return;
        var requestId = input.dataset.requestId;
        uploadFile("/api/applications/" + applicationId + "/documents?documentRequestId=" + requestId, file).then(function (ok) {
          if (ok) loadApplicationDetail(applicationId);
          else alert(t("uploadFailedDoc"));
        });
      });
    });

    detailEl.querySelectorAll(".portal-payment-proof-upload").forEach(function (input) {
      input.addEventListener("change", function () {
        var file = input.files[0];
        if (!file) return;
        var paymentId = input.dataset.paymentId;
        uploadFile("/api/applications/" + applicationId + "/payments/" + paymentId + "/proof", file).then(function (ok) {
          if (ok) loadApplicationDetail(applicationId);
          else alert(t("uploadFailedPayment"));
        });
      });
    });

    var msgForm = detailEl.querySelector(".portal-message-form");
    if (msgForm) {
      msgForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var textarea = msgForm.querySelector("textarea");
        var body = textarea.value.trim();
        if (!body) return;
        window
          .portalFetch("/api/applications/" + applicationId + "/messages", {
            method: "POST",
            body: JSON.stringify({ body: body }),
          })
          .then(function () { loadApplicationDetail(applicationId); });
      });
    }
  }

  function uploadFile(path, file) {
    return file.arrayBuffer().then(function (buffer) {
      return window
        .portalFetch(path, {
          method: "POST",
          headers: { "X-Filename": file.name },
          body: buffer,
        })
        .then(function (resp) {
          // The explicit headers object above replaces portalFetch's default
          // JSON Content-Type entirely, so the binary body isn't mislabelled.
          return resp.ok;
        });
    });
  }

  // ---- Profile ----

  var CONSENT_CHANNELS = ["sms", "whatsapp", "telegram", "wechat"];

  function loadProfile() {
    window
      .portalFetch("/api/profile")
      .then((r) => r.json())
      .then(function (data) {
        document.getElementById("profile-fullName").value = data.fullName || "";
        document.getElementById("profile-email").value = data.email || "";
        document.getElementById("profile-phone").value = data.phone || "";
        document.getElementById("profile-nationality").value = data.nationality || "";
        document.getElementById("profile-preferredLanguage").value = data.preferredCommunicationLanguage || "";

        // Phase 3.1 correction: the active-channel selector only offers
        // Email/Client Portal, but an account may already have an inactive
        // value on file (from before this correction). Represent it
        // honestly with an extra option rather than silently showing no
        // selection, without making it newly selectable once changed away
        // from — resubmitting the form unchanged still preserves it
        // (server allows only the unchanged value through), but choosing
        // Email/Client Portal/Not specified switches away for good.
        var channelSelect = document.getElementById("profile-preferredChannel");
        var currentChannel = data.preferredCommunicationChannel || "";
        if (currentChannel && !channelSelect.querySelector('option[value="' + currentChannel + '"]')) {
          var inactiveOption = document.createElement("option");
          inactiveOption.value = currentChannel;
          inactiveOption.textContent = currentChannel + t("inactiveChannelSuffix");
          channelSelect.appendChild(inactiveOption);
        }
        channelSelect.value = currentChannel;
        document.getElementById("profile-mobileNumber").value = data.mobileE164 || "";
        document.getElementById("profile-mobileCountry").value = "";

        var consents = data.consents || {};
        CONSENT_CHANNELS.forEach(function (channel) {
          var box = document.getElementById("consent-" + channel);
          if (box) box.checked = consents[channel] === "granted";
        });
      });
  }

  function setupProfileForm() {
    var form = document.getElementById("portal-profile-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = document.getElementById("portal-profile-status");
      status.textContent = t("savingStatus");
      var newPreferredLanguage = document.getElementById("profile-preferredLanguage").value;
      window
        .portalFetch("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({
            fullName: document.getElementById("profile-fullName").value,
            phone: document.getElementById("profile-phone").value,
            nationality: document.getElementById("profile-nationality").value,
            preferredCommunicationLanguage: newPreferredLanguage,
            preferredCommunicationChannel: document.getElementById("profile-preferredChannel").value,
            mobileNumber: document.getElementById("profile-mobileNumber").value,
            mobileCountry: document.getElementById("profile-mobileCountry").value,
          }),
        })
        .then(function (resp) {
          if (resp.ok) {
            status.textContent = t("savedStatus");
            // Explicitly choosing a preferred language on the Profile tab
            // is as deliberate a signal as using the header switcher --
            // keep the portal shell's own displayed language and the
            // public site's stored preference consistent with it too.
            if (CANONICAL_LANGUAGES.indexOf(newPreferredLanguage) !== -1 && newPreferredLanguage !== lang) {
              lang = newPreferredLanguage;
              try {
                window.localStorage.setItem(LOCALE_STORAGE_KEY, newPreferredLanguage);
              } catch (e) {
                /* non-fatal */
              }
              applyStaticTranslations();
              loadApplications();
            }
            return;
          }
          resp
            .json()
            .then(function (data) {
              status.textContent = (data && data.error) || t("genericErrorMsg");
            })
            .catch(function () {
              status.textContent = t("genericErrorMsg");
            });
        });
    });
  }

  function setupConsentToggles() {
    var status = document.getElementById("portal-consent-status");
    CONSENT_CHANNELS.forEach(function (channel) {
      var box = document.getElementById("consent-" + channel);
      if (!box) return;
      box.addEventListener("change", function () {
        var desiredStatus = box.checked ? "granted" : "revoked";
        status.textContent = t("savingStatus");
        window
          .portalFetch("/api/consents", {
            method: "POST",
            body: JSON.stringify({ channel: channel, status: desiredStatus }),
          })
          .then(function (resp) {
            if (resp.ok) {
              status.textContent = t("savedStatus");
            } else {
              box.checked = !box.checked;
              status.textContent = t("genericErrorMsg");
            }
          });
      });
    });
  }
})();
