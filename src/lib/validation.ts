import type { ThumbnailInput } from "@/types/thumbnail";

// 서버(route)와 클라이언트(폼)가 함께 쓰므로 브라우저·Node 전용 API를 쓰지 않는다.
export const MAX_PROMPT_LENGTH = 2000;
export const MAX_CAPTION_LENGTH = 40;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const COUNTS = [2, 3, 4] as const;

export function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "PNG, JPG, WEBP 사진만 올릴 수 있어요. 아이폰 HEIC 사진은 JPG로 바꿔서 올려주세요";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `${MAX_IMAGE_BYTES / (1024 * 1024)}MB 이하 사진만 올릴 수 있어요`;
  }
  return null;
}

export function validateInput(
  input: ThumbnailInput,
): Partial<Record<"prompt" | "caption" | "image" | "count", string>> {
  const errors: Partial<Record<"prompt" | "caption" | "image" | "count", string>> = {};

  const prompt = input.prompt.trim();
  if (!prompt) {
    errors.prompt =
      input.mode === "revise" ? "무엇을 바꿀지 적어주세요" : "어떤 썸네일을 원하는지 적어주세요";
  } else if (prompt.length > MAX_PROMPT_LENGTH) {
    errors.prompt = `${MAX_PROMPT_LENGTH}자 이내로 줄여주세요`;
  }

  if (input.caption.trim().length > MAX_CAPTION_LENGTH) {
    errors.caption = `${MAX_CAPTION_LENGTH}자 이내로 줄여주세요`;
  }

  if (input.image) {
    const imageError = validateImage(input.image);
    if (imageError) errors.image = imageError;
  } else if (input.mode === "revise") {
    errors.image = "수정할 시안이 없어요";
  }

  if (!COUNTS.includes(input.count)) {
    errors.count = "시안 개수는 2~4장 중에서 골라주세요";
  }

  return errors;
}
