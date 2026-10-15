(function () {
  "use strict";

  // The Instant Services guest application flow -- a single dynamic page
  // (not one per locale, like the portal), driven entirely by server
  // state: on every step, the actual source of truth is
  // GET /api/instant-services/orders/:id, and this file only ever
  // decides which screen to show FROM that response, never from its own
  // local assumption about where the customer "should" be. The
  // questionnaire step reuses window.PortalBiForms.openBiFormDetail
  // (portal-bi-form.js) completely unchanged -- no second questionnaire
  // renderer exists.
  var CANONICAL_LANGUAGES = ["en", "zh-CN", "zh-Hant", "ko", "ja", "vi"];

  var STRINGS = {
    en: {
      loading: "Loading...",
      errorGeneric: "Something went wrong. Please try again, or contact us directly.",
      serviceNotFound: "This service could not be found or is no longer available.",
      fullNameLabel: "Full Name", emailLabel: "Email Address",
      startButton: "Continue", sending: "Sending...",
      checkEmailHeading: "Check Your Email",
      checkEmailBody: "We've sent a confirmation link to your email address. Please follow the link to continue your request.",
      questionnaireIntro: "Please complete the following questionnaire to continue your request.",
      deliveryHeading: "Delivery Address",
      recipientNameLabel: "Recipient Name", phoneLabel: "Phone Number", countryLabel: "Country",
      internationalLabel: "This is an international address",
      regionLabel: "State / Province / Region", cityLabel: "City", postalCodeLabel: "Postal Code",
      addressLine1Label: "Address Line 1", addressLine2Label: "Address Line 2 (optional)",
      deliveryNotice: "Delivery charges are not included in the service fee. Once your documents are ready for dispatch, we will provide a separate delivery quotation and payment request.",
      continueButton: "Continue", saving: "Saving...",
      reviewHeading: "Request Submitted",
      reviewIntro: "Your questionnaire has been submitted. Review the price breakdown below to proceed to payment.",
      reviewHeadingBooking: "Booking Details Submitted", reviewIntroBooking: "Your booking details have been submitted and the policy accepted. Review the price below to proceed to payment.",
      totalLabel: "Total", confirmAndPayButton: "Confirm and Continue to Payment",
      allInclusiveNotice: "Listed prices include applicable government fees. Delivery charges, where applicable, are quoted separately.",
      paymentHeading: "Payment", amountLabel: "Amount Due",
      paymentUnavailable: "Online payment is not currently available online right now. Please contact FIS directly to complete this request.",
      uploadProofLabel: "Upload Proof of Payment", submitProofButton: "Submit Payment Proof",
      uploadError: "Upload failed. Please check the file type (PDF, JPEG, PNG or WebP) and size (under 15MB), then try again.",
      paymentSubmittedHeading: "Your Payment Has Been Submitted for Verification",
      paymentSubmittedBody: "Thank you! We've received your payment details and will review them shortly. You'll receive a confirmation by email once your payment has been verified. You can also track the status of your request through the FIS Client Portal.",
      referenceLabel: "Reference", portalLinkText: "Go to the FIS Client Portal", viewReceiptText: "View Receipt",
      paidHeading: "Payment Verified",
      paidBody: "Your payment has been verified. You can track the progress of your request through the FIS Client Portal.",
      bookingHeading: "Airport VIP Meet & Assist — Booking Details",
      directionLabel: "Arrival or Departure Assistance",
      directionArrival: "Arrival", directionDeparture: "Departure", directionBoth: "Both (Arrival and Departure)",
      airportFixedNotice: "Airport",
      terminalLabel: "Terminal (optional)", airlineLabel: "Airline", flightNumberLabel: "Flight Number",
      flightRouteLabel: "Flight Origin / Destination (optional)",
      scheduledDateLabel: "Scheduled Flight Date", scheduledTimeLabel: "Scheduled Flight Time",
      timezoneNotice: "All times are local Manila time (NAIA).",
      passengerCountLabel: "Number of Passengers", passengerNamesLabel: "Passenger Names (one per line)",
      specialRequirementsLabel: "Special Assistance Requirements (optional)", notesLabel: "Additional Notes (optional)",
      policyHeading: "Booking Flexibility and Refund Policy",
      policyIntro: "We understand that travel arrangements may change. Customers who notify FIS of a flight change at least 120 hours before their originally scheduled departure are eligible for rescheduling, subject to availability.",
      policyCancellation: "All customer-initiated cancellations are non-refundable under the standard policy, regardless of notice period.",
      policyLateChange: "Flight changes notified less than 120 hours before the originally scheduled departure do not qualify for rescheduling under the standard policy, and the original booking remains non-refundable under the standard policy.",
      policyUnableToAccommodate: "If FIS is unable to accommodate your booking, you will receive a full refund.",
      policyNonAttendance: "Customer non-attendance is non-refundable under the standard policy.",
      policyLegal: "All conditions remain subject to applicable consumer protection laws and any non-excludable statutory rights. Nothing in this policy overrides those rights, and it has not been reviewed for legal enforceability in every jurisdiction.",
      policyAcceptLabel: "I have read and agree to the Airport VIP Meet & Assist Booking Flexibility and Refund Policy.",
      policyAcceptButton: "Continue", policyAcceptRequired: "Please confirm you have read and agree to the policy before continuing.",
      bookingStatusLabel: "Booking",
      bookingStatusSubmitted: "Booking submitted — awaiting payment verification",
      bookingStatusUnderReview: "Payment verified — availability under review",
      bookingStatusConfirmed: "Booking confirmed", bookingStatusCompleted: "Service completed",
      bookingStatusCancelled: "Booking cancelled", bookingStatusRefundPending: "Refund pending", bookingStatusRefunded: "Refunded",
    },
    "zh-CN": {
      loading: "加载中...",
      errorGeneric: "出现问题，请重试，或直接与我们联系。",
      serviceNotFound: "未能找到该服务，或该服务目前已不可用。",
      fullNameLabel: "姓名", emailLabel: "电子邮箱",
      startButton: "继续", sending: "正在发送...",
      checkEmailHeading: "请查收您的邮箱",
      checkEmailBody: "我们已向您的邮箱发送了一封确认邮件，请点击邮件中的链接以继续办理。",
      questionnaireIntro: "请填写以下问卷以继续办理。",
      deliveryHeading: "收件地址",
      recipientNameLabel: "收件人姓名", phoneLabel: "电话号码", countryLabel: "国家/地区",
      internationalLabel: "这是一个国际地址",
      regionLabel: "省/州/地区", cityLabel: "城市", postalCodeLabel: "邮政编码",
      addressLine1Label: "地址第一行", addressLine2Label: "地址第二行（选填）",
      deliveryNotice: "邮寄费用不包含在服务费中。文件备妥可寄送后，我们将另行提供邮寄报价及付款请求。",
      continueButton: "继续", saving: "保存中...",
      reviewHeading: "申请已提交",
      reviewIntro: "您的问卷已提交。请查看以下费用明细以继续付款。",
      reviewHeadingBooking: "预约详情已提交", reviewIntroBooking: "您的预约详情已提交，政策已确认同意。请查看以下价格以继续付款。",
      totalLabel: "总计", confirmAndPayButton: "确认并继续付款",
      allInclusiveNotice: "所列价格已包含适用的政府费用。如需邮寄，邮寄费用将另行报价。",
      paymentHeading: "付款", amountLabel: "应付金额",
      paymentUnavailable: "目前暂不支持在线付款，请直接与 FIS 联系以完成办理。",
      uploadProofLabel: "上传付款凭证", submitProofButton: "提交付款凭证",
      uploadError: "上传失败。请检查文件类型（PDF、JPEG、PNG 或 WebP）及大小（小于 15MB）后重试。",
      paymentSubmittedHeading: "您的付款已提交待核实",
      paymentSubmittedBody: "感谢您！我们已收到您的付款信息，将尽快进行核实。付款核实后，您将收到邮件确认。您也可以通过 FIS 客户门户查询办理进度。",
      referenceLabel: "参考编号", portalLinkText: "前往 FIS 客户门户", viewReceiptText: "查看收据",
      paidHeading: "付款已核实",
      paidBody: "您的付款已核实。您可以通过 FIS 客户门户查询办理进度。",
      bookingHeading: "机场贵宾接送服务 — 预约详情",
      directionLabel: "接机或送机协助",
      directionArrival: "接机", directionDeparture: "送机", directionBoth: "接机与送机（往返）",
      airportFixedNotice: "机场",
      terminalLabel: "航站楼（选填）", airlineLabel: "航空公司", flightNumberLabel: "航班号",
      flightRouteLabel: "航班出发地/目的地（选填）",
      scheduledDateLabel: "预定航班日期", scheduledTimeLabel: "预定航班时间",
      timezoneNotice: "所有时间均为马尼拉当地时间（NAIA）。",
      passengerCountLabel: "乘客人数", passengerNamesLabel: "乘客姓名（每行一位）",
      specialRequirementsLabel: "特殊协助需求（选填）", notesLabel: "其他备注（选填）",
      policyHeading: "预约弹性与退款政策",
      policyIntro: "我们理解旅行安排可能会发生变化。客户如在原定起飞时间至少120小时前通知 FIS 航班变更，可根据实际可用情况申请改期。",
      policyCancellation: "根据标准政策，所有由客户发起的取消一律不予退款，无论提前多久通知。",
      policyLateChange: "在原定起飞时间不足120小时前通知的航班变更，依标准政策不符合改期资格，原预约依标准政策仍不予退款。",
      policyUnableToAccommodate: "如 FIS 无法安排您的预约，将为您提供全额退款。",
      policyNonAttendance: "根据标准政策，客户未到场不予退款。",
      policyLegal: "以上所有条款均受适用的消费者保护法及任何不可排除的法定权利约束。本政策不会凌驾于该等权利之上，且尚未针对各司法辖区的法律可执行性进行审查。",
      policyAcceptLabel: "我已阅读并同意《机场贵宾接送服务预约弹性与退款政策》。",
      policyAcceptButton: "继续", policyAcceptRequired: "请在继续之前确认您已阅读并同意该政策。",
      bookingStatusLabel: "预约状态",
      bookingStatusSubmitted: "预约已提交 — 等待付款核实",
      bookingStatusUnderReview: "付款已核实 — 可用性审核中",
      bookingStatusConfirmed: "预约已确认", bookingStatusCompleted: "服务已完成",
      bookingStatusCancelled: "预约已取消", bookingStatusRefundPending: "退款处理中", bookingStatusRefunded: "已退款",
    },
    "zh-Hant": {
      loading: "載入中...",
      errorGeneric: "發生問題，請再試一次，或直接與我們聯絡。",
      serviceNotFound: "找不到此服務，或此服務目前已不可用。",
      fullNameLabel: "姓名", emailLabel: "電子郵件",
      startButton: "繼續", sending: "傳送中...",
      checkEmailHeading: "請查收您的電子郵件",
      checkEmailBody: "我們已傳送確認連結至您的電子郵件，請點選郵件中的連結以繼續辦理。",
      questionnaireIntro: "請填寫以下問卷以繼續辦理。",
      deliveryHeading: "收件地址",
      recipientNameLabel: "收件人姓名", phoneLabel: "電話號碼", countryLabel: "國家/地區",
      internationalLabel: "這是國際地址",
      regionLabel: "省/州/地區", cityLabel: "城市", postalCodeLabel: "郵遞區號",
      addressLine1Label: "地址第一行", addressLine2Label: "地址第二行（選填）",
      deliveryNotice: "郵寄費用不包含在服務費中。文件備妥可寄送後，我們將另行提供郵寄報價及付款請求。",
      continueButton: "繼續", saving: "儲存中...",
      reviewHeading: "申請已提交",
      reviewIntro: "您的問卷已提交。請查看以下費用明細以繼續付款。",
      reviewHeadingBooking: "預約詳情已提交", reviewIntroBooking: "您的預約詳情已提交，政策已確認同意。請查看以下價格以繼續付款。",
      totalLabel: "總計", confirmAndPayButton: "確認並繼續付款",
      allInclusiveNotice: "所列價格已包含適用的政府費用。如需郵寄，郵寄費用將另行報價。",
      paymentHeading: "付款", amountLabel: "應付金額",
      paymentUnavailable: "目前暫不支援線上付款，請直接與 FIS 聯絡以完成辦理。",
      uploadProofLabel: "上傳付款憑證", submitProofButton: "提交付款憑證",
      uploadError: "上傳失敗。請檢查檔案類型（PDF、JPEG、PNG 或 WebP）及大小（小於 15MB）後再試一次。",
      paymentSubmittedHeading: "您的付款已提交待核實",
      paymentSubmittedBody: "感謝您！我們已收到您的付款資訊，將儘速進行核實。付款核實後，您將收到電子郵件確認。您也可以透過 FIS 客戶專區查詢辦理進度。",
      referenceLabel: "參考編號", portalLinkText: "前往 FIS 客戶專區", viewReceiptText: "查看收據",
      paidHeading: "付款已核實",
      paidBody: "您的付款已核實。您可以透過 FIS 客戶專區查詢辦理進度。",
      bookingHeading: "機場貴賓接送服務 — 預約詳情",
      directionLabel: "接機或送機協助",
      directionArrival: "接機", directionDeparture: "送機", directionBoth: "接機與送機（往返）",
      airportFixedNotice: "機場",
      terminalLabel: "航廈（選填）", airlineLabel: "航空公司", flightNumberLabel: "航班編號",
      flightRouteLabel: "航班出發地/目的地（選填）",
      scheduledDateLabel: "預定航班日期", scheduledTimeLabel: "預定航班時間",
      timezoneNotice: "所有時間均為馬尼拉當地時間（NAIA）。",
      passengerCountLabel: "乘客人數", passengerNamesLabel: "乘客姓名（每行一位）",
      specialRequirementsLabel: "特殊協助需求（選填）", notesLabel: "其他備註（選填）",
      policyHeading: "預約彈性與退款政策",
      policyIntro: "我們理解旅行安排可能會變動。客戶如在原定起飛時間至少120小時前通知 FIS 航班異動，可依實際可用情況申請改期。",
      policyCancellation: "依標準政策，所有由客戶發起的取消一律不予退款，無論提前多久通知。",
      policyLateChange: "於原定起飛時間不足120小時前通知的航班異動，依標準政策不符合改期資格，原預約依標準政策仍不予退款。",
      policyUnableToAccommodate: "若 FIS 無法安排您的預約，將為您提供全額退款。",
      policyNonAttendance: "依標準政策，客戶未到場不予退款。",
      policyLegal: "以上所有條款均受適用之消費者保護法及任何不可排除之法定權利約束。本政策不會凌駕於該等權利之上，且尚未針對各司法管轄區之法律可執行性進行審查。",
      policyAcceptLabel: "我已閱讀並同意《機場貴賓接送服務預約彈性與退款政策》。",
      policyAcceptButton: "繼續", policyAcceptRequired: "請在繼續之前確認您已閱讀並同意該政策。",
      bookingStatusLabel: "預約狀態",
      bookingStatusSubmitted: "預約已提交 — 等待付款核實",
      bookingStatusUnderReview: "付款已核實 — 可用性審核中",
      bookingStatusConfirmed: "預約已確認", bookingStatusCompleted: "服務已完成",
      bookingStatusCancelled: "預約已取消", bookingStatusRefundPending: "退款處理中", bookingStatusRefunded: "已退款",
    },
    ko: {
      loading: "불러오는 중...",
      errorGeneric: "문제가 발생했습니다. 다시 시도하시거나 저희에게 직접 문의해 주십시오.",
      serviceNotFound: "이 서비스를 찾을 수 없거나 현재 이용할 수 없습니다.",
      fullNameLabel: "성명", emailLabel: "이메일 주소",
      startButton: "계속", sending: "전송 중...",
      checkEmailHeading: "이메일을 확인해 주세요",
      checkEmailBody: "확인 링크가 포함된 이메일을 보내드렸습니다. 이메일의 링크를 클릭하여 신청을 계속해 주십시오.",
      questionnaireIntro: "신청을 계속하려면 아래 설문을 작성해 주십시오.",
      deliveryHeading: "배송 주소",
      recipientNameLabel: "수령인 성명", phoneLabel: "전화번호", countryLabel: "국가",
      internationalLabel: "국제 배송 주소입니다",
      regionLabel: "주/도/지역", cityLabel: "도시", postalCodeLabel: "우편번호",
      addressLine1Label: "주소 1", addressLine2Label: "주소 2 (선택)",
      deliveryNotice: "배송비는 서비스 수수료에 포함되어 있지 않습니다. 서류 발송 준비가 완료되면 별도의 배송 견적 및 결제 요청을 보내드립니다.",
      continueButton: "계속", saving: "저장 중...",
      reviewHeading: "신청이 제출되었습니다",
      reviewIntro: "설문이 제출되었습니다. 아래 금액 내역을 확인하신 후 결제를 진행해 주십시오.",
      reviewHeadingBooking: "예약 정보 제출됨", reviewIntroBooking: "예약 정보가 제출되었으며 정책에 동의하셨습니다. 아래 금액을 확인하신 후 결제를 진행해 주십시오.",
      totalLabel: "합계", confirmAndPayButton: "확인 후 결제 진행",
      allInclusiveNotice: "표시된 가격에는 해당 정부 수수료가 포함되어 있습니다. 배송이 필요한 경우 배송비는 별도로 안내됩니다.",
      paymentHeading: "결제", amountLabel: "결제 금액",
      paymentUnavailable: "현재 온라인 결제를 이용할 수 없습니다. 신청을 완료하시려면 FIS로 직접 문의해 주십시오.",
      uploadProofLabel: "결제 증빙 업로드", submitProofButton: "결제 증빙 제출",
      uploadError: "업로드에 실패했습니다. 파일 형식(PDF, JPEG, PNG 또는 WebP)과 크기(15MB 미만)를 확인한 후 다시 시도해 주십시오.",
      paymentSubmittedHeading: "결제 내역이 확인 대기 중입니다",
      paymentSubmittedBody: "감사합니다! 결제 정보를 수신했으며 곧 확인해 드리겠습니다. 결제가 확인되면 이메일로 안내해 드립니다. FIS 고객 포털에서도 신청 상태를 확인하실 수 있습니다.",
      referenceLabel: "참조번호", portalLinkText: "FIS 고객 포털로 이동", viewReceiptText: "영수증 보기",
      paidHeading: "결제가 확인되었습니다",
      paidBody: "결제가 확인되었습니다. FIS 고객 포털에서 신청 진행 상황을 확인하실 수 있습니다.",
      bookingHeading: "공항 VIP 영접 서비스 — 예약 상세정보",
      directionLabel: "입국 또는 출국 지원",
      directionArrival: "입국(도착)", directionDeparture: "출국(출발)", directionBoth: "입국 및 출국(왕복)",
      airportFixedNotice: "공항",
      terminalLabel: "터미널(선택)", airlineLabel: "항공사", flightNumberLabel: "항공편명",
      flightRouteLabel: "출발지/도착지(선택)",
      scheduledDateLabel: "예정 항공편 날짜", scheduledTimeLabel: "예정 항공편 시간",
      timezoneNotice: "모든 시간은 마닐라 현지 시간(NAIA 기준)입니다.",
      passengerCountLabel: "탑승객 수", passengerNamesLabel: "탑승객 성명(한 줄에 한 명씩)",
      specialRequirementsLabel: "특별 지원 요청사항(선택)", notesLabel: "추가 메모(선택)",
      policyHeading: "예약 변경 및 환불 정책",
      policyIntro: "여행 일정은 변경될 수 있다는 점을 이해하고 있습니다. 원래 예정된 출발 시각으로부터 최소 120시간 전에 항공편 변경을 FIS에 통지한 고객은, 가능 여부에 따라 일정 변경 자격이 주어집니다.",
      policyCancellation: "표준 정책상, 고객이 요청한 모든 취소는 통지 시점과 관계없이 환불되지 않습니다.",
      policyLateChange: "원래 예정된 출발 시각으로부터 120시간 미만으로 통지된 항공편 변경은 표준 정책상 일정 변경 자격이 없으며, 원 예약은 표준 정책상 환불되지 않습니다.",
      policyUnableToAccommodate: "FIS가 예약을 수용할 수 없는 경우, 전액 환불됩니다.",
      policyNonAttendance: "표준 정책상, 고객의 불참은 환불되지 않습니다.",
      policyLegal: "모든 조건은 관련 소비자 보호법 및 배제할 수 없는 법적 권리의 적용을 받습니다. 본 정책은 그러한 권리보다 우선하지 않으며, 모든 관할 지역에서의 법적 집행 가능성에 대해 검토되지 않았습니다.",
      policyAcceptLabel: "공항 VIP 영접 서비스의 예약 변경 및 환불 정책을 읽었으며 이에 동의합니다.",
      policyAcceptButton: "계속", policyAcceptRequired: "계속 진행하기 전에 정책을 읽고 동의했는지 확인해 주십시오.",
      bookingStatusLabel: "예약 상태",
      bookingStatusSubmitted: "예약 제출됨 — 결제 확인 대기 중",
      bookingStatusUnderReview: "결제 확인됨 — 가능 여부 검토 중",
      bookingStatusConfirmed: "예약 확정됨", bookingStatusCompleted: "서비스 완료됨",
      bookingStatusCancelled: "예약 취소됨", bookingStatusRefundPending: "환불 처리 중", bookingStatusRefunded: "환불 완료됨",
    },
    ja: {
      loading: "読み込み中...",
      errorGeneric: "問題が発生しました。もう一度お試しいただくか、直接お問い合わせください。",
      serviceNotFound: "このサービスが見つからないか、現在ご利用いただけません。",
      fullNameLabel: "氏名", emailLabel: "メールアドレス",
      startButton: "次へ", sending: "送信中...",
      checkEmailHeading: "メールをご確認ください",
      checkEmailBody: "確認用のリンクをメールでお送りしました。メール内のリンクからお手続きをお進めください。",
      questionnaireIntro: "お手続きを続けるには、以下の質問にご回答ください。",
      deliveryHeading: "お届け先住所",
      recipientNameLabel: "受取人氏名", phoneLabel: "電話番号", countryLabel: "国",
      internationalLabel: "海外のご住所です",
      regionLabel: "都道府県・州・地域", cityLabel: "市区町村", postalCodeLabel: "郵便番号",
      addressLine1Label: "住所1", addressLine2Label: "住所2（任意）",
      deliveryNotice: "配送料はサービス料金に含まれておりません。書類の発送準備が整い次第、別途配送見積もりとお支払いのご案内をお送りいたします。",
      continueButton: "次へ", saving: "保存中...",
      reviewHeading: "お申し込みを受け付けました",
      reviewIntro: "アンケートが送信されました。以下の金額内訳をご確認のうえ、お支払いにお進みください。",
      reviewHeadingBooking: "予約内容を送信しました", reviewIntroBooking: "予約内容が送信され、ポリシーにご同意いただきました。以下の金額をご確認のうえ、お支払いにお進みください。",
      totalLabel: "合計", confirmAndPayButton: "確認してお支払いに進む",
      allInclusiveNotice: "表示されている価格には適用される政府手数料が含まれています。配送が必要な場合、配送料は別途ご案内いたします。",
      paymentHeading: "お支払い", amountLabel: "お支払い金額",
      paymentUnavailable: "現在オンラインでのお支払いはご利用いただけません。お手続きを完了するには、FISまで直接お問い合わせください。",
      uploadProofLabel: "お支払い証明のアップロード", submitProofButton: "お支払い証明を送信",
      uploadError: "アップロードに失敗しました。ファイル形式（PDF、JPEG、PNG、WebP）とサイズ（15MB未満）をご確認のうえ、再度お試しください。",
      paymentSubmittedHeading: "お支払い内容を確認待ちで送信しました",
      paymentSubmittedBody: "ありがとうございます。お支払い情報を受け取りましたので、確認のうえ対応いたします。確認が完了次第、メールにてご連絡いたします。FISクライアントポータルからも進捗状況をご確認いただけます。",
      referenceLabel: "参照番号", portalLinkText: "FISクライアントポータルへ", viewReceiptText: "領収書を見る",
      paidHeading: "お支払いが確認されました",
      paidBody: "お支払いが確認されました。進捗状況はFISクライアントポータルよりご確認いただけます。",
      bookingHeading: "空港VIP送迎サービス — 予約詳細",
      directionLabel: "到着または出発のサポート",
      directionArrival: "到着", directionDeparture: "出発", directionBoth: "到着・出発の両方（往復）",
      airportFixedNotice: "空港",
      terminalLabel: "ターミナル（任意）", airlineLabel: "航空会社", flightNumberLabel: "便名",
      flightRouteLabel: "出発地・到着地（任意）",
      scheduledDateLabel: "フライト予定日", scheduledTimeLabel: "フライト予定時刻",
      timezoneNotice: "すべての時刻はマニラ現地時間（NAIA基準）です。",
      passengerCountLabel: "搭乗者人数", passengerNamesLabel: "搭乗者氏名（1行につき1名）",
      specialRequirementsLabel: "特別な介助のご要望（任意）", notesLabel: "備考（任意）",
      policyHeading: "予約変更・返金ポリシー",
      policyIntro: "ご旅行のご予定が変更になる場合があることを理解しております。元々予定されていた出発時刻の120時間以上前にFISへフライト変更をご連絡いただいたお客様は、空き状況に応じて予約変更の対象となります。",
      policyCancellation: "標準ポリシーのもと、お客様都合によるキャンセルは、通知時期にかかわらずすべて返金対象外となります。",
      policyLateChange: "元々予定されていた出発時刻の120時間未満でご連絡いただいたフライト変更は、標準ポリシーのもと予約変更の対象とならず、元のご予約も標準ポリシーのもと返金対象外のままとなります。",
      policyUnableToAccommodate: "FISがご予約に対応できない場合は、全額返金いたします。",
      policyNonAttendance: "標準ポリシーのもと、お客様の不参加は返金対象外となります。",
      policyLegal: "すべての条件は、適用される消費者保護法および排除できない法的権利に従うものとします。本ポリシーはそれらの権利に優先するものではなく、すべての法域における法的強制力について審査されたものではありません。",
      policyAcceptLabel: "空港VIP送迎サービスの予約変更・返金ポリシーを読み、同意します。",
      policyAcceptButton: "次へ", policyAcceptRequired: "続行する前に、ポリシーを読み同意したことをご確認ください。",
      bookingStatusLabel: "予約状況",
      bookingStatusSubmitted: "予約送信済み — お支払い確認待ち",
      bookingStatusUnderReview: "お支払い確認済み — 空き状況確認中",
      bookingStatusConfirmed: "予約確定済み", bookingStatusCompleted: "サービス完了",
      bookingStatusCancelled: "予約キャンセル済み", bookingStatusRefundPending: "返金手続き中", bookingStatusRefunded: "返金済み",
    },
    vi: {
      loading: "Đang tải...",
      errorGeneric: "Đã xảy ra sự cố. Vui lòng thử lại, hoặc liên hệ trực tiếp với chúng tôi.",
      serviceNotFound: "Không tìm thấy dịch vụ này hoặc dịch vụ hiện không khả dụng.",
      fullNameLabel: "Họ và Tên", emailLabel: "Địa Chỉ Email",
      startButton: "Tiếp Tục", sending: "Đang gửi...",
      checkEmailHeading: "Vui Lòng Kiểm Tra Email",
      checkEmailBody: "Chúng tôi đã gửi liên kết xác nhận đến email của quý khách. Vui lòng nhấp vào liên kết trong email để tiếp tục yêu cầu.",
      questionnaireIntro: "Vui lòng hoàn thành bảng câu hỏi sau để tiếp tục yêu cầu.",
      deliveryHeading: "Địa Chỉ Giao Hàng",
      recipientNameLabel: "Tên Người Nhận", phoneLabel: "Số Điện Thoại", countryLabel: "Quốc Gia",
      internationalLabel: "Đây là địa chỉ quốc tế",
      regionLabel: "Tỉnh / Thành Phố / Khu Vực", cityLabel: "Thành Phố", postalCodeLabel: "Mã Bưu Điện",
      addressLine1Label: "Địa Chỉ Dòng 1", addressLine2Label: "Địa Chỉ Dòng 2 (tùy chọn)",
      deliveryNotice: "Phí giao hàng không bao gồm trong phí dịch vụ. Khi hồ sơ của quý khách sẵn sàng để gửi đi, chúng tôi sẽ cung cấp báo giá giao hàng và yêu cầu thanh toán riêng.",
      continueButton: "Tiếp Tục", saving: "Đang lưu...",
      reviewHeading: "Yêu Cầu Đã Được Gửi",
      reviewIntro: "Bảng câu hỏi của quý khách đã được gửi. Vui lòng xem chi tiết giá bên dưới để tiếp tục thanh toán.",
      reviewHeadingBooking: "Đã Gửi Chi Tiết Đặt Lịch", reviewIntroBooking: "Chi tiết đặt lịch của quý khách đã được gửi và chính sách đã được chấp nhận. Vui lòng xem giá bên dưới để tiếp tục thanh toán.",
      totalLabel: "Tổng Cộng", confirmAndPayButton: "Xác Nhận và Tiếp Tục Thanh Toán",
      allInclusiveNotice: "Giá niêm yết đã bao gồm các phí chính phủ áp dụng. Phí giao hàng, nếu có, sẽ được báo giá riêng.",
      paymentHeading: "Thanh Toán", amountLabel: "Số Tiền Cần Thanh Toán",
      paymentUnavailable: "Hiện chưa thể thanh toán trực tuyến. Vui lòng liên hệ trực tiếp với FIS để hoàn tất yêu cầu này.",
      uploadProofLabel: "Tải Lên Chứng Từ Thanh Toán", submitProofButton: "Gửi Chứng Từ Thanh Toán",
      uploadError: "Tải lên không thành công. Vui lòng kiểm tra loại tệp (PDF, JPEG, PNG hoặc WebP) và kích thước (dưới 15MB), sau đó thử lại.",
      paymentSubmittedHeading: "Thanh Toán Của Quý Khách Đã Được Gửi Để Xác Minh",
      paymentSubmittedBody: "Cảm ơn quý khách! Chúng tôi đã nhận được thông tin thanh toán và sẽ sớm xem xét. Quý khách sẽ nhận được email xác nhận ngay khi thanh toán được xác minh. Quý khách cũng có thể theo dõi trạng thái yêu cầu qua Cổng Thông Tin Khách Hàng FIS.",
      referenceLabel: "Mã Tham Chiếu", portalLinkText: "Đến Cổng Thông Tin Khách Hàng FIS", viewReceiptText: "Xem Biên Lai",
      paidHeading: "Thanh Toán Đã Được Xác Minh",
      paidBody: "Thanh toán của quý khách đã được xác minh. Quý khách có thể theo dõi tiến trình yêu cầu qua Cổng Thông Tin Khách Hàng FIS.",
      bookingHeading: "Dịch Vụ Đón Tiếp VIP Tại Sân Bay — Chi Tiết Đặt Lịch",
      directionLabel: "Hỗ Trợ Khi Đến Hoặc Khi Đi",
      directionArrival: "Khi Đến (Nhập Cảnh)", directionDeparture: "Khi Đi (Xuất Cảnh)", directionBoth: "Cả Hai (Khứ Hồi)",
      airportFixedNotice: "Sân Bay",
      terminalLabel: "Nhà Ga (không bắt buộc)", airlineLabel: "Hãng Hàng Không", flightNumberLabel: "Số Hiệu Chuyến Bay",
      flightRouteLabel: "Điểm Đi / Điểm Đến (không bắt buộc)",
      scheduledDateLabel: "Ngày Bay Dự Kiến", scheduledTimeLabel: "Giờ Bay Dự Kiến",
      timezoneNotice: "Tất cả thời gian đều theo giờ địa phương Manila (NAIA).",
      passengerCountLabel: "Số Lượng Hành Khách", passengerNamesLabel: "Tên Hành Khách (mỗi dòng một người)",
      specialRequirementsLabel: "Yêu Cầu Hỗ Trợ Đặc Biệt (không bắt buộc)", notesLabel: "Ghi Chú Thêm (không bắt buộc)",
      policyHeading: "Chính Sách Linh Hoạt Đặt Lịch và Hoàn Tiền",
      policyIntro: "Chúng tôi hiểu rằng lịch trình di chuyển có thể thay đổi. Khách hàng thông báo cho FIS về việc thay đổi chuyến bay ít nhất 120 giờ trước giờ khởi hành dự kiến ban đầu sẽ đủ điều kiện để đổi lịch, tùy theo tình trạng còn chỗ.",
      policyCancellation: "Theo chính sách tiêu chuẩn, mọi trường hợp hủy do khách hàng yêu cầu đều không được hoàn tiền, bất kể thời gian thông báo trước là bao lâu.",
      policyLateChange: "Thay đổi chuyến bay được thông báo dưới 120 giờ trước giờ khởi hành dự kiến ban đầu sẽ không đủ điều kiện đổi lịch theo chính sách tiêu chuẩn, và đặt lịch ban đầu vẫn không được hoàn tiền theo chính sách tiêu chuẩn.",
      policyUnableToAccommodate: "Nếu FIS không thể thu xếp đặt lịch của quý khách, quý khách sẽ được hoàn tiền toàn bộ.",
      policyNonAttendance: "Theo chính sách tiêu chuẩn, việc khách hàng không có mặt sẽ không được hoàn tiền.",
      policyLegal: "Mọi điều kiện vẫn tuân theo luật bảo vệ người tiêu dùng hiện hành và các quyền theo luật định không thể loại trừ. Không có nội dung nào trong chính sách này vượt quyền hạn nêu trên, và chính sách chưa được rà soát về hiệu lực pháp lý tại mọi khu vực pháp lý.",
      policyAcceptLabel: "Tôi đã đọc và đồng ý với Chính Sách Linh Hoạt Đặt Lịch và Hoàn Tiền của Dịch Vụ Đón Tiếp VIP Tại Sân Bay.",
      policyAcceptButton: "Tiếp Tục", policyAcceptRequired: "Vui lòng xác nhận quý khách đã đọc và đồng ý với chính sách trước khi tiếp tục.",
      bookingStatusLabel: "Trạng Thái Đặt Lịch",
      bookingStatusSubmitted: "Đã gửi đặt lịch — Đang chờ xác minh thanh toán",
      bookingStatusUnderReview: "Đã xác minh thanh toán — Đang xem xét tình trạng chỗ trống",
      bookingStatusConfirmed: "Đặt lịch đã được xác nhận", bookingStatusCompleted: "Dịch vụ đã hoàn tất",
      bookingStatusCancelled: "Đặt lịch đã bị hủy", bookingStatusRefundPending: "Đang chờ hoàn tiền", bookingStatusRefunded: "Đã hoàn tiền",
    },
  };

  function t(lang, key) {
    return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function formatPhp(centavos) {
    var pesos = Math.round(Number(centavos) || 0) / 100;
    return "₱" + pesos.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  var root = document.getElementById("instant-services-apply-content");
  if (!root) return;

  var params = new URLSearchParams(window.location.search);
  var serviceId = params.get("service");
  var orderId = params.get("order");
  var lang = CANONICAL_LANGUAGES.indexOf(params.get("lang")) !== -1 ? params.get("lang") : "en";
  document.documentElement.lang = lang;

  function renderError(message) {
    root.innerHTML = '<p class="form-status" role="alert">' + escapeHtml(message) + "</p>";
  }

  function renderLoading() {
    root.innerHTML = '<p class="muted">' + escapeHtml(t(lang, "loading")) + "</p>";
  }

  // ---- Screen: guest details (email capture) ----
  function renderGuestDetails(service) {
    root.innerHTML =
      '<div class="card">' +
      "<h2>" + escapeHtml(service.title) + "</h2>" +
      "<p>" + escapeHtml(service.shortDescription) + "</p>" +
      '<p class="instant-service-card__eligibility">' + escapeHtml(service.eligibilityText) + "</p>" +
      '<p class="instant-service-card__price">' + formatPhp(service.totalPhpCentavos) + "</p>" +
      '<form id="instant-services-guest-form" class="enquiry-form">' +
      '<div class="form-field hp-field" aria-hidden="true"><label for="website">Leave this field empty</label><input type="text" id="website" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<div class="form-field form-field--full"><label for="fullName">' + escapeHtml(t(lang, "fullNameLabel")) + '</label><input type="text" id="fullName" name="fullName" autocomplete="name" required></div>' +
      '<div class="form-field form-field--full"><label for="email">' + escapeHtml(t(lang, "emailLabel")) + '</label><input type="email" id="email" name="email" autocomplete="email" required></div>' +
      '<div class="enquiry-form-actions"><button type="submit" class="btn btn-primary">' + escapeHtml(t(lang, "startButton")) + '</button><p class="form-status" aria-live="polite"></p></div>' +
      "</form>" +
      "</div>";

    var renderedAt = Date.now();
    var form = document.getElementById("instant-services-guest-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = form.querySelector(".form-status");
      var button = form.querySelector("button[type=submit]");
      button.disabled = true;
      status.textContent = t(lang, "sending");

      window
        .portalFetch("/api/instant-services/begin", {
          method: "POST",
          body: JSON.stringify({
            fullName: document.getElementById("fullName").value.trim(),
            email: document.getElementById("email").value.trim(),
            serviceId: serviceId,
            website: document.getElementById("website").value,
            formRenderedAt: renderedAt,
          }),
        })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
          root.innerHTML =
            '<div class="card"><h2>' + escapeHtml(t(lang, "checkEmailHeading")) + "</h2><p>" + escapeHtml(t(lang, "checkEmailBody")) + "</p></div>";
        })
        .catch(function (data) {
          status.textContent = (data && data.error) || t(lang, "errorGeneric");
          button.disabled = false;
        });
    });
  }

  // ---- Screen: questionnaire (reuses portal-bi-form.js verbatim) ----
  function renderQuestionnaire(order) {
    root.innerHTML = '<div class="card"><p>' + escapeHtml(t(lang, "questionnaireIntro")) + '</p><div id="instant-services-questionnaire"></div></div>';
    var container = document.getElementById("instant-services-questionnaire");
    window.PortalBiForms.openBiFormDetail(
      container,
      order.submissionId,
      function () {}, // no "back" target -- this IS the whole page for this step
      lang
    );
    // openBiFormDetail re-renders into `container` on save/submit but never
    // tells this caller when a submit succeeded -- poll the order's own
    // submission status instead of hooking into its internals, so this
    // stays a thin wrapper rather than forking that file's logic.
    var poll = setInterval(function () {
      window
        .portalFetch("/api/instant-services/orders/" + order.id)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.submissionStatus && data.submissionStatus !== "draft" && data.submissionStatus !== "revision_requested") {
            clearInterval(poll);
            loadOrder();
          }
        });
    }, 2500);
  }

  // ---- Screen: delivery address ----
  function renderDeliveryAddress(order) {
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "deliveryHeading")) + "</h2>" +
      '<form id="instant-services-delivery-form" class="enquiry-form">' +
      '<div class="form-field form-field--full"><label for="recipientName">' + escapeHtml(t(lang, "recipientNameLabel")) + '</label><input type="text" id="recipientName" required></div>' +
      '<div class="form-field"><label for="phone">' + escapeHtml(t(lang, "phoneLabel")) + '</label><input type="text" id="phone" required></div>' +
      '<div class="form-field"><label for="country">' + escapeHtml(t(lang, "countryLabel")) + '</label><input type="text" id="country" required></div>' +
      '<div class="form-field"><label for="city">' + escapeHtml(t(lang, "cityLabel")) + '</label><input type="text" id="city" required></div>' +
      '<div class="form-field"><label for="regionStateProvince">' + escapeHtml(t(lang, "regionLabel")) + '</label><input type="text" id="regionStateProvince"></div>' +
      '<div class="form-field"><label for="postalCode">' + escapeHtml(t(lang, "postalCodeLabel")) + '</label><input type="text" id="postalCode"></div>' +
      '<div class="form-field form-field--full"><label for="addressLine1">' + escapeHtml(t(lang, "addressLine1Label")) + '</label><input type="text" id="addressLine1" required></div>' +
      '<div class="form-field form-field--full"><label for="addressLine2">' + escapeHtml(t(lang, "addressLine2Label")) + '</label><input type="text" id="addressLine2"></div>' +
      '<div class="form-field form-field--full"><label class="portal-radio"><input type="checkbox" id="isInternational"> ' + escapeHtml(t(lang, "internationalLabel")) + "</label></div>" +
      '<div class="context-note"><p>' + escapeHtml(t(lang, "deliveryNotice")) + "</p></div>" +
      '<div class="enquiry-form-actions"><button type="submit" class="btn btn-primary">' + escapeHtml(t(lang, "continueButton")) + '</button><p class="form-status" aria-live="polite"></p></div>' +
      "</form></div>";

    var form = document.getElementById("instant-services-delivery-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = form.querySelector(".form-status");
      var button = form.querySelector("button[type=submit]");
      button.disabled = true;
      status.textContent = t(lang, "saving");

      window
        .portalFetch("/api/instant-services/orders/" + order.id + "/delivery-address", {
          method: "POST",
          body: JSON.stringify({
            recipientName: document.getElementById("recipientName").value.trim(),
            phone: document.getElementById("phone").value.trim(),
            country: document.getElementById("country").value.trim(),
            city: document.getElementById("city").value.trim(),
            regionStateProvince: document.getElementById("regionStateProvince").value.trim(),
            postalCode: document.getElementById("postalCode").value.trim(),
            addressLine1: document.getElementById("addressLine1").value.trim(),
            addressLine2: document.getElementById("addressLine2").value.trim(),
            isInternational: document.getElementById("isInternational").checked,
          }),
        })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
          loadOrder();
        })
        .catch(function (data) {
          status.textContent = (data && data.error) || t(lang, "errorGeneric");
          button.disabled = false;
        });
    });
  }

  // ---- Screen: Airport VIP booking details ----
  // The bookable-service sibling of renderQuestionnaire/renderDeliveryAddress
  // above -- a booking has no BI Forms questionnaire of its own (see
  // worker/src/lib/airportVip.js); this is its entire intake. Airport and
  // time zone are fixed, not customer-editable fields: FIS's Airport VIP
  // service covers NAIA only today (see docs/OFFERING_INVENTORY.md), and
  // every scheduled date/time entered here is NAIA LOCAL time -- stating
  // that plainly avoids ever inventing multi-airport coverage or asking a
  // customer to correctly pick a time zone for a flight at a Philippine
  // airport.
  var FIXED_AIRPORT = "Ninoy Aquino International Airport (NAIA), Manila";
  var FIXED_TIMEZONE = "Asia/Manila";

  function renderBookingForm(order, service, existingBooking) {
    var b = existingBooking || {};
    var passengerNamesText = (b.passengerNames || []).join("\n");
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "bookingHeading")) + "</h2>" +
      '<form id="instant-services-booking-form" class="enquiry-form">' +
      '<div class="form-field form-field--full"><label for="direction">' + escapeHtml(t(lang, "directionLabel")) + '</label>' +
      '<select id="direction" required>' +
      '<option value="arrival"' + (b.direction === "arrival" ? " selected" : "") + '>' + escapeHtml(t(lang, "directionArrival")) + '</option>' +
      '<option value="departure"' + (b.direction === "departure" ? " selected" : "") + '>' + escapeHtml(t(lang, "directionDeparture")) + '</option>' +
      '<option value="both"' + (b.direction === "both" ? " selected" : "") + '>' + escapeHtml(t(lang, "directionBoth")) + '</option>' +
      '</select></div>' +
      '<div class="form-field form-field--full"><p class="muted">' + escapeHtml(t(lang, "airportFixedNotice")) + ': <strong>' + escapeHtml(FIXED_AIRPORT) + '</strong></p></div>' +
      '<div class="form-field"><label for="terminal">' + escapeHtml(t(lang, "terminalLabel")) + '</label><input type="text" id="terminal" value="' + escapeHtml(b.terminal || "") + '"></div>' +
      '<div class="form-field"><label for="airline">' + escapeHtml(t(lang, "airlineLabel")) + '</label><input type="text" id="airline" value="' + escapeHtml(b.airline || "") + '" required></div>' +
      '<div class="form-field"><label for="flightNumber">' + escapeHtml(t(lang, "flightNumberLabel")) + '</label><input type="text" id="flightNumber" value="' + escapeHtml(b.flightNumber || "") + '" required></div>' +
      '<div class="form-field"><label for="flightRoute">' + escapeHtml(t(lang, "flightRouteLabel")) + '</label><input type="text" id="flightRoute" value="' + escapeHtml(b.flightRoute || "") + '" placeholder="e.g. Tokyo (NRT) ↔ Manila (MNL)"></div>' +
      '<div class="form-field"><label for="scheduledLocalDate">' + escapeHtml(t(lang, "scheduledDateLabel")) + '</label><input type="date" id="scheduledLocalDate" value="' + escapeHtml(b.scheduledLocalDate || "") + '" required></div>' +
      '<div class="form-field"><label for="scheduledLocalTime">' + escapeHtml(t(lang, "scheduledTimeLabel")) + '</label><input type="time" id="scheduledLocalTime" value="' + escapeHtml(b.scheduledLocalTime || "") + '" required></div>' +
      '<div class="form-field form-field--full"><p class="muted">' + escapeHtml(t(lang, "timezoneNotice")) + "</p></div>" +
      '<div class="form-field"><label for="passengerCount">' + escapeHtml(t(lang, "passengerCountLabel")) + '</label><input type="number" id="passengerCount" min="1" step="1" value="' + escapeHtml(b.passengerCount || 1) + '" required></div>' +
      '<div class="form-field form-field--full"><label for="passengerNames">' + escapeHtml(t(lang, "passengerNamesLabel")) + '</label><textarea id="passengerNames" required>' + escapeHtml(passengerNamesText) + "</textarea></div>" +
      '<div class="form-field form-field--full"><label for="specialRequirements">' + escapeHtml(t(lang, "specialRequirementsLabel")) + '</label><textarea id="specialRequirements">' + escapeHtml(b.specialRequirements || "") + "</textarea></div>" +
      '<div class="form-field form-field--full"><label for="notes">' + escapeHtml(t(lang, "notesLabel")) + '</label><textarea id="notes">' + escapeHtml(b.notes || "") + "</textarea></div>" +
      '<div class="enquiry-form-actions"><button type="submit" class="btn btn-primary">' + escapeHtml(t(lang, "continueButton")) + '</button><p class="form-status" aria-live="polite"></p></div>' +
      "</form></div>";

    var form = document.getElementById("instant-services-booking-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = form.querySelector(".form-status");
      var button = form.querySelector("button[type=submit]");

      var passengerNames = document
        .getElementById("passengerNames")
        .value.split("\n")
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
      if (!passengerNames.length) {
        status.textContent = t(lang, "errorGeneric");
        return;
      }

      button.disabled = true;
      status.textContent = t(lang, "saving");

      window
        .portalFetch("/api/instant-services/orders/" + order.id + "/booking", {
          method: "POST",
          body: JSON.stringify({
            direction: document.getElementById("direction").value,
            passengerCount: passengerNames.length,
            passengerNames: passengerNames,
            airport: FIXED_AIRPORT,
            terminal: document.getElementById("terminal").value.trim(),
            airline: document.getElementById("airline").value.trim(),
            flightNumber: document.getElementById("flightNumber").value.trim(),
            flightRoute: document.getElementById("flightRoute").value.trim(),
            scheduledLocalDate: document.getElementById("scheduledLocalDate").value,
            scheduledLocalTime: document.getElementById("scheduledLocalTime").value,
            scheduledTimezone: FIXED_TIMEZONE,
            specialRequirements: document.getElementById("specialRequirements").value.trim(),
            notes: document.getElementById("notes").value.trim(),
          }),
        })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
          loadOrder();
        })
        .catch(function (data) {
          status.textContent = (data && data.error) || t(lang, "errorGeneric");
          button.disabled = false;
        });
    });
  }

  // ---- Screen: Airport VIP Booking Flexibility and Refund Policy
  // acceptance -- English is the source of truth for this wording (Part
  // VIII of the Order & Book Online directive); the checkbox below is
  // never pre-checked, and acceptance is recorded server-side with the
  // booking's original scheduled departure + a policy version, per
  // worker/src/lib/airportVip.js's recordPolicyAcceptance. ----
  function renderPolicyAcceptance(order) {
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "policyHeading")) + "</h2>" +
      "<p>" + escapeHtml(t(lang, "policyIntro")) + "</p>" +
      "<p>" + escapeHtml(t(lang, "policyCancellation")) + "</p>" +
      "<p>" + escapeHtml(t(lang, "policyLateChange")) + "</p>" +
      "<p>" + escapeHtml(t(lang, "policyUnableToAccommodate")) + "</p>" +
      "<p>" + escapeHtml(t(lang, "policyNonAttendance")) + "</p>" +
      '<p class="muted">' + escapeHtml(t(lang, "policyLegal")) + "</p>" +
      '<form id="instant-services-policy-form" class="enquiry-form">' +
      '<div class="form-field form-field--full"><label class="portal-radio"><input type="checkbox" id="policyAccept"> ' + escapeHtml(t(lang, "policyAcceptLabel")) + "</label></div>" +
      '<div class="enquiry-form-actions"><button type="submit" class="btn btn-primary">' + escapeHtml(t(lang, "policyAcceptButton")) + '</button><p class="form-status" aria-live="polite"></p></div>' +
      "</form></div>";

    var form = document.getElementById("instant-services-policy-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = form.querySelector(".form-status");
      var button = form.querySelector("button[type=submit]");

      if (!document.getElementById("policyAccept").checked) {
        status.textContent = t(lang, "policyAcceptRequired");
        return;
      }

      button.disabled = true;
      status.textContent = t(lang, "saving");

      window
        .portalFetch("/api/instant-services/orders/" + order.id + "/booking/accept-policy", {
          method: "POST",
          body: JSON.stringify({ accepted: true }),
        })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
          loadOrder();
        })
        .catch(function (data) {
          status.textContent = (data && data.error) || t(lang, "errorGeneric");
          button.disabled = false;
        });
    });
  }

  // ---- Screen: review + confirm-and-pay ----
  // Shows exactly ONE all-inclusive total, never an itemized government-
  // fee/FIS-fee breakdown -- per the Order & Book Online pricing
  // requirement, which applies here as much as to the catalogue cards.
  // (service.priceComponents was removed from the customer-facing API in
  // Stage 2; this screen must never have read it in the first place.)
  function renderReview(order, service) {
    var isBooking = service.offeringType === "bookable_service";
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, isBooking ? "reviewHeadingBooking" : "reviewHeading")) + "</h2><p>" + escapeHtml(t(lang, isBooking ? "reviewIntroBooking" : "reviewIntro")) + "</p>" +
      '<table class="instant-services-price-table">' +
      "<tr><td>" + escapeHtml(service.priceLabel || t(lang, "totalLabel")) + "</td><td>" + formatPhp(service.totalPhpCentavos) + "</td></tr>" +
      "<tr><td><strong>" + escapeHtml(t(lang, "totalLabel")) + "</strong></td><td><strong>" + formatPhp(service.totalPhpCentavos) + "</strong></td></tr>" +
      "</table>" +
      '<p class="muted">' + escapeHtml(t(lang, "allInclusiveNotice")) + "</p>" +
      '<div class="enquiry-form-actions"><button type="button" class="btn btn-primary" id="instant-services-confirm-pay">' + escapeHtml(t(lang, "confirmAndPayButton")) + '</button><p class="form-status" aria-live="polite"></p></div>' +
      "</div>";

    document.getElementById("instant-services-confirm-pay").addEventListener("click", function () {
      var status = root.querySelector(".form-status");
      var button = document.getElementById("instant-services-confirm-pay");
      button.disabled = true;
      status.textContent = t(lang, "saving");

      window
        .portalFetch("/api/instant-services/orders/" + order.id + "/confirm-and-pay", { method: "POST" })
        .then(function (resp) {
          if (!resp.ok) return resp.json().then((data) => Promise.reject(data));
          return resp.json();
        })
        .then(function () {
          loadOrder();
        })
        .catch(function (data) {
          status.textContent = (data && data.error) || t(lang, "paymentUnavailable");
          button.disabled = false;
        });
    });
  }

  // ---- Screen: payment (QR Ph) ----
  function renderPayment(order, payment) {
    var amount = order.priceSnapshot ? formatPhp(order.priceSnapshot.totalPhpCentavos) : payment ? "₱" + Number(payment.amountPhp).toFixed(2) : "";
    var merchantLine = payment && payment.merchantDisplayName ? "<p><strong>" + escapeHtml(payment.merchantDisplayName) + "</strong></p>" : "";
    var instructionsLine = payment && payment.instructions ? "<p>" + escapeHtml(payment.instructions) + "</p>" : "";
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "paymentHeading")) + "</h2>" +
      '<p class="instant-service-card__price">' + escapeHtml(t(lang, "amountLabel")) + ": " + amount + "</p>" +
      merchantLine + instructionsLine +
      '<p><img id="instant-services-qr-image" alt="QR Ph" style="max-width:260px;border:1px solid #e2e2dc;border-radius:6px;"></p>' +
      '<label class="portal-upload-label">' + escapeHtml(t(lang, "uploadProofLabel")) + '<input type="file" id="instant-services-proof-upload" accept=".pdf,.jpg,.jpeg,.png,.webp"></label>' +
      '<p class="form-status" aria-live="polite"></p>' +
      "</div>";

    var img = document.getElementById("instant-services-qr-image");
    window
      .portalFetch("/api/instant-services/orders/" + order.id + "/qr-ph-image")
      .then(function (resp) {
        if (!resp.ok) throw new Error("not_configured");
        return resp.blob();
      })
      .then(function (blob) {
        img.src = URL.createObjectURL(blob);
      })
      .catch(function () {
        img.replaceWith(document.createTextNode(t(lang, "paymentUnavailable")));
      });

    var uploadInput = document.getElementById("instant-services-proof-upload");
    uploadInput.addEventListener("change", function () {
      var file = uploadInput.files[0];
      if (!file || !payment) return;
      var status = root.querySelector(".form-status");
      status.textContent = t(lang, "saving");
      file.arrayBuffer().then(function (buffer) {
        window
          .portalFetch("/api/applications/" + payment.applicationId + "/payments/" + payment.id + "/proof", {
            method: "POST",
            headers: { "X-Filename": file.name },
            body: buffer,
          })
          .then(function (resp) {
            if (!resp.ok) throw new Error("upload_failed");
            loadOrder();
          })
          .catch(function () {
            status.textContent = t(lang, "uploadError");
          });
      });
    });
  }

  // ---- Screens: awaiting verification / paid (final states) ----
  // bookingStatus is null for a document order and the booking's own
  // status (lib/airportVip.js BOOKING_STATUSES) for Airport VIP -- shown
  // alongside, never instead of, the payment status, per the explicit
  // "Payment: Verified / Booking: Awaiting availability confirmation"
  // requirement: a verified payment is never represented as the same
  // thing as a confirmed booking.
  var BOOKING_STATUS_LABEL_KEYS = {
    submitted: "bookingStatusSubmitted",
    awaiting_payment_verification: "bookingStatusSubmitted",
    payment_verified: "bookingStatusUnderReview",
    availability_under_review: "bookingStatusUnderReview",
    confirmed: "bookingStatusConfirmed",
    reschedule_requested: "bookingStatusConfirmed",
    rescheduled: "bookingStatusConfirmed",
    completed: "bookingStatusCompleted",
    cancelled: "bookingStatusCancelled",
    refund_pending: "bookingStatusRefundPending",
    refunded: "bookingStatusRefunded",
  };

  function bookingStatusLine(bookingStatus) {
    var key = BOOKING_STATUS_LABEL_KEYS[bookingStatus];
    if (!key) return "";
    return '<p class="instant-service-card__eligibility"><strong>' + escapeHtml(t(lang, "bookingStatusLabel")) + ":</strong> " + escapeHtml(t(lang, key)) + "</p>";
  }

  function receiptUrl(order) {
    return "/instant-services/receipt/?order=" + encodeURIComponent(order.id) + "&lang=" + encodeURIComponent(lang);
  }

  function renderAwaitingVerification(order, bookingStatus) {
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "paymentSubmittedHeading")) + "</h2><p>" + escapeHtml(t(lang, "paymentSubmittedBody")) + "</p>" +
      bookingStatusLine(bookingStatus) +
      "<p>" + escapeHtml(t(lang, "referenceLabel")) + ": <strong>" + escapeHtml(order.id) + "</strong></p>" +
      '<p><a class="btn btn-secondary" href="/portal/">' + escapeHtml(t(lang, "portalLinkText")) + "</a> " +
      '<a class="btn btn-secondary" href="' + receiptUrl(order) + '">' + escapeHtml(t(lang, "viewReceiptText")) + "</a></p>" +
      "</div>";
  }

  function renderPaid(order, bookingStatus) {
    root.innerHTML =
      '<div class="card"><h2>' + escapeHtml(t(lang, "paidHeading")) + "</h2><p>" + escapeHtml(t(lang, "paidBody")) + "</p>" +
      bookingStatusLine(bookingStatus) +
      '<p><a class="btn btn-primary" href="/portal/">' + escapeHtml(t(lang, "portalLinkText")) + "</a> " +
      '<a class="btn btn-secondary" href="' + receiptUrl(order) + '">' + escapeHtml(t(lang, "viewReceiptText")) + "</a></p>" +
      "</div>";
  }

  // ---- The state machine: decide which screen to show from the order's
  // actual current state. Called on load and after every step completes.
  // For a bookable_service, the booking's own intake (flight/passenger
  // details -> policy acceptance) replaces the questionnaire/delivery-
  // address steps a document order goes through -- everything from
  // confirm-and-pay onward is the SAME shared payment flow either way. ----
  function loadOrder() {
    renderLoading();
    window
      .portalFetch("/api/instant-services/orders/" + orderId)
      .then(function (resp) {
        if (!resp.ok) return Promise.reject(new Error("order_not_found"));
        return resp.json();
      })
      .then(function (data) {
        var order = data.order;
        var service = data.service;
        var isBooking = service.offeringType === "bookable_service";

        if (!isBooking) {
          if (order.status === "paid") return renderPaid(order, null);
          if (order.status === "awaiting_verification") return renderAwaitingVerification(order, null);
          if (order.status === "awaiting_payment") return renderPayment(order, data.payment);

          // Still "draft": figure out which step of the application is next.
          if (!order.submissionId) {
            return window
              .portalFetch("/api/instant-services/orders/" + order.id + "/application", { method: "POST" })
              .then(function (r) { return r.json(); })
              .then(function () { loadOrder(); });
          }
          if (!data.submissionStatus || data.submissionStatus === "draft" || data.submissionStatus === "revision_requested") {
            return renderQuestionnaire({ id: order.id, submissionId: order.submissionId });
          }
          if (service.supportsDelivery && !data.deliveryAddress) {
            return renderDeliveryAddress(order);
          }
          return renderReview(order, service);
        }

        // Bookable service (Airport VIP): always fetch the booking's own
        // state, since the order's own status alone never tells the
        // customer whether availability has actually been confirmed.
        return window
          .portalFetch("/api/instant-services/orders/" + order.id + "/booking")
          .then(function (r) { return r.json(); })
          .then(function (bookingData) {
            var booking = bookingData.booking;
            var policyAccepted = bookingData.policyAccepted;

            if (order.status === "paid") return renderPaid(order, booking && booking.status);
            if (order.status === "awaiting_verification") return renderAwaitingVerification(order, booking && booking.status);
            if (order.status === "awaiting_payment") return renderPayment(order, data.payment);

            if (!booking) return renderBookingForm(order, service, null);
            if (!policyAccepted) return renderPolicyAcceptance(order);
            return renderReview(order, service);
          });
      })
      .catch(function () {
        renderError(t(lang, "errorGeneric"));
      });
  }

  // ---- Entry point ----
  if (orderId) {
    loadOrder();
  } else if (serviceId) {
    renderLoading();
    window
      .portalFetch("/api/instant-services/catalogue/" + serviceId + "?lang=" + encodeURIComponent(lang))
      .then(function (resp) {
        if (!resp.ok) return Promise.reject(new Error("not_found"));
        return resp.json();
      })
      .then(function (data) {
        renderGuestDetails(data.service);
      })
      .catch(function () {
        renderError(t(lang, "serviceNotFound"));
      });
  } else {
    renderError(t(lang, "serviceNotFound"));
  }
})();
