/** Nhãn tiếng Việt cho giá trị enum từ API (value gửi API giữ nguyên). */

const STATUS_LABELS: Record<string, string> = {
  draft: "Nháp",
  generating: "Đang tạo",
  review: "Chờ duyệt",
  approved: "Đã duyệt",
  scheduled: "Đã lên lịch",
  published: "Đã đăng",
  failed: "Thất bại",
  queued: "Xếp hàng",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  canceled: "Đã hủy",
  draft_uploaded: "Đã tải bản nháp",
  success: "Thành công",
  received: "Đã nhận",
  processed: "Đã xử lý",
  changes_requested: "Yêu cầu chỉnh sửa",
  rejected: "Từ chối",
  connected: "Đã kết nối",
  expired: "Hết hạn",
  error: "Lỗi",
  disconnected: "Ngắt kết nối",
  unknown: "Không rõ"
};

const CHANNEL_LABELS: Record<string, string> = {
  tiktok: "TikTok",
  shopee: "Shopee",
  facebook: "Facebook"
};

const RENDER_STEP_LABELS: Record<string, string> = {
  preprocess: "Tiền xử lý",
  script: "Kịch bản",
  compose: "Ghép video",
  encode: "Mã hóa",
  finalized: "Hoàn tất",
  queued: "Xếp hàng",
  error: "Lỗi",
  canceled: "Đã hủy"
};

export function viBadgeLabel(value: string): string {
  if (value in CHANNEL_LABELS) {
    return CHANNEL_LABELS[value];
  }
  return STATUS_LABELS[value] ?? value;
}

export function viStatus(value: string): string {
  return STATUS_LABELS[value] ?? CHANNEL_LABELS[value] ?? value;
}

export function viRenderStep(value: string): string {
  return RENDER_STEP_LABELS[value] ?? viStatus(value);
}

export function viAlertLabel(key: string): string {
  const map: Record<string, string> = {
    token_expiry_count: "Token sắp hết hạn (24 giờ)",
    queue_depth: "Độ sâu hàng đợi"
  };
  return map[key] ?? key;
}

export function viProviderMode(mode: string): string {
  if (mode === "mock") {
    return "Mô phỏng";
  }
  if (mode === "sandbox/proxy") {
    return "Sandbox / proxy";
  }
  return mode;
}

export function viAssetKind(kind: string): string {
  const map: Record<string, string> = {
    image: "Ảnh",
    audio: "Âm thanh",
    video: "Video"
  };
  return map[kind] ?? kind;
}

/** Giai đoạn dispatch (ví dụ tiktok_dispatch) */
export function viPublishStage(stage: string): string {
  const map: Record<string, string> = {
    tiktok_dispatch: "Gửi TikTok",
    shopee_dispatch: "Gửi Shopee",
    facebook_dispatch: "Gửi Facebook"
  };
  return map[stage] ?? stage;
}

export function viSeverity(severity: string): string {
  const map: Record<string, string> = {
    info: "Thông tin",
    warning: "Cảnh báo",
    critical: "Nghiêm trọng"
  };
  return map[severity] ?? severity;
}
