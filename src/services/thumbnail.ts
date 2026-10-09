import OpenAI, { APIError } from "openai";
import type { ThumbnailInput, UserError } from "@/types/thumbnail";

// OpenAI 호출 상수는 이곳에만 둔다 (ADR-002, ADR-003).
const MODEL = "gpt-image-2.5-flare";
const SIZE = "1280x720";
const QUALITY = "high";
const OUTPUT_FORMAT = "jpeg";

const POLICY_ERROR: UserError = {
  message:
    "이미지 생성 정책에 걸렸어요. 실존 유명인, 폭력·선정적 표현, 상표·로고를 빼고 다시 시도해보세요",
  retryable: false,
};
const RATE_LIMIT_ERROR: UserError = {
  message: "요청이 몰려 있어요. 잠시 후 다시 시도해주세요",
  retryable: true,
};
const CONFIG_ERROR: UserError = {
  message: "서비스 설정에 문제가 있어요. 운영자에게 문의해주세요",
  retryable: false,
};
const UPSTREAM_ERROR: UserError = {
  message: "이미지 생성 서버에 일시적인 문제가 있어요",
  retryable: true,
};

class MissingApiKeyError extends Error {}

export function buildPrompt(
  input: Pick<ThumbnailInput, "mode" | "prompt" | "caption"> & { hasImage: boolean },
): string {
  const prompt = input.prompt.trim();
  const caption = input.caption.trim();

  if (input.mode === "revise") {
    const lines = [
      "Edit the provided thumbnail. Apply only the changes below and keep everything else (composition, people, text) unchanged.",
      "",
      "Requested changes:",
      prompt,
    ];
    if (caption) {
      lines.push(
        "",
        `Text: Replace the existing caption with "${caption}", exactly as written, character for character. Render Korean (Hangul) characters accurately.`,
      );
    }
    return lines.join("\n");
  }

  const lines = [
    "Create a YouTube thumbnail (16:9).",
    "Thumbnail guidelines: one eye-catching focal point, high contrast, and any text large and bold enough to read on a small screen.",
    "",
    "Creator's description:",
    prompt,
    "",
    caption
      ? `Text: Render the caption "${caption}" exactly as written, character for character, exactly once, in large bold letters. Do not add any other text. Render Korean (Hangul) characters accurately.`
      : "Text: Do not add any text other than what the description asks for.",
  ];
  if (input.hasImage) {
    lines.push(
      "",
      "Photo: Use the person or subject in the provided photo as the main subject. Keep their face and identity unchanged.",
    );
  }
  return lines.join("\n");
}

export async function generateThumbnails(
  input: ThumbnailInput,
  options: { signal?: AbortSignal; client?: OpenAI } = {},
): Promise<string[]> {
  const { signal, client } = options;
  if (!client && !process.env.OPENAI_API_KEY) {
    throw new MissingApiKeyError("OPENAI_API_KEY is not set");
  }
  // 재시도는 사용자가 결정한다 (ADR-006).
  const openai = client ?? new OpenAI({ maxRetries: 0 });

  const params = {
    model: MODEL,
    prompt: buildPrompt({
      mode: input.mode,
      prompt: input.prompt,
      caption: input.caption,
      hasImage: input.image !== null,
    }),
    n: input.count,
    size: SIZE,
    quality: QUALITY,
    output_format: OUTPUT_FORMAT,
  } as const;

  const response = input.image
    ? await openai.images.edit({ ...params, image: input.image }, { signal })
    : await openai.images.generate(params, { signal });

  return (response.data ?? []).flatMap((item) =>
    item.b64_json ? [`data:image/jpeg;base64,${item.b64_json}`] : [],
  );
}

export function toUserError(err: unknown): { status: number; error: UserError } {
  if (err instanceof MissingApiKeyError) {
    return { status: 500, error: CONFIG_ERROR };
  }
  if (!(err instanceof APIError)) {
    return { status: 502, error: UPSTREAM_ERROR };
  }
  if (err.code === "moderation_blocked" || err.code === "content_policy_violation") {
    return { status: 422, error: POLICY_ERROR };
  }
  if (err.status === 429) {
    return err.code === "insufficient_quota"
      ? { status: 500, error: CONFIG_ERROR }
      : { status: 429, error: RATE_LIMIT_ERROR };
  }
  if (err.status === 401 || err.status === 403) {
    return { status: 500, error: CONFIG_ERROR };
  }
  return { status: 502, error: UPSTREAM_ERROR };
}
