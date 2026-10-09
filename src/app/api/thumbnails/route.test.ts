// @vitest-environment node
import { APIError } from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateThumbnails } from "@/services/thumbnail";
import { POST } from "./route";

vi.mock("@/services/thumbnail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/thumbnail")>()),
  generateThumbnails: vi.fn(),
}));

const PROMPT = "어두운 우주 배경에 놀란 표정의 내 얼굴";

function post(fields: Record<string, string | File>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.append(key, value);
  return new Request("http://localhost/api/thumbnails", { method: "POST", body: formData });
}

function upstream(status: number, code?: string) {
  return APIError.generate(
    status,
    { error: { message: "upstream raw message", code } },
    undefined,
    new Headers(),
  );
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.mocked(generateThumbnails).mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/thumbnails", () => {
  describe("성공", () => {
    it("200과 { images }를 반환하고, 기본값(create·count 2·문구 없음·사진 없음)과 request.signal로 생성한다", async () => {
      vi.mocked(generateThumbnails).mockResolvedValue(["data:image/jpeg;base64,AAA"]);
      const request = post({ prompt: PROMPT });

      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ images: ["data:image/jpeg;base64,AAA"] });
      expect(generateThumbnails).toHaveBeenCalledWith(
        { mode: "create", prompt: PROMPT, caption: "", image: null, count: 2 },
        { signal: request.signal },
      );
    });

    it("revise·문구·개수·사진 필드를 ThumbnailInput으로 변환한다", async () => {
      vi.mocked(generateThumbnails).mockResolvedValue([]);
      const image = new File([new Uint8Array([1, 2, 3])], "base.jpg", { type: "image/jpeg" });

      const response = await POST(
        post({ mode: "revise", prompt: "배경을 빨간색으로", caption: "월 천만원", count: "4", image }),
      );

      expect(response.status).toBe(200);
      const [input] = vi.mocked(generateThumbnails).mock.calls[0];
      expect(input).toMatchObject({
        mode: "revise",
        prompt: "배경을 빨간색으로",
        caption: "월 천만원",
        count: 4,
      });
      expect(input.image).toBeInstanceOf(File);
      expect(input.image?.name).toBe("base.jpg");
      expect(input.image?.type).toBe("image/jpeg");
      expect(input.image?.size).toBe(3);
    });

    it("mode가 revise가 아니면 create로 다룬다", async () => {
      vi.mocked(generateThumbnails).mockResolvedValue([]);

      await POST(post({ mode: "edit", prompt: PROMPT }));

      expect(vi.mocked(generateThumbnails).mock.calls[0][0].mode).toBe("create");
    });

    it("크기가 0인 파일과 문자열 image는 사진 없음으로 다룬다", async () => {
      vi.mocked(generateThumbnails).mockResolvedValue([]);

      await POST(post({ prompt: PROMPT, image: new File([], "empty.png", { type: "image/png" }) }));
      await POST(post({ prompt: PROMPT, image: "not-a-file" }));

      expect(vi.mocked(generateThumbnails).mock.calls[0][0].image).toBeNull();
      expect(vi.mocked(generateThumbnails).mock.calls[1][0].image).toBeNull();
    });

    it("문자열이 아닌 caption은 빈 문자열로 둔다", async () => {
      vi.mocked(generateThumbnails).mockResolvedValue([]);

      await POST(post({ prompt: PROMPT, caption: new File(["x"], "c.txt", { type: "text/plain" }) }));

      expect(vi.mocked(generateThumbnails).mock.calls[0][0].caption).toBe("");
    });
  });

  describe("400", () => {
    it("formData를 읽을 수 없으면 요청 형식 에러를 반환한다", async () => {
      const request = new Request("http://localhost/api/thumbnails", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: PROMPT }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: { message: "요청 형식이 올바르지 않아요", retryable: false },
      });
      expect(generateThumbnails).not.toHaveBeenCalled();
    });

    it.each([
      ["prompt 없음 (create)", {}, "어떤 썸네일을 원하는지 적어주세요"],
      ["prompt 공백 (revise)", { mode: "revise", prompt: "  " }, "무엇을 바꿀지 적어주세요"],
      ["prompt 2000자 초과", { prompt: "가".repeat(2001) }, "2000자 이내로 줄여주세요"],
      ["caption 40자 초과", { prompt: PROMPT, caption: "가".repeat(41) }, "40자 이내로 줄여주세요"],
      ["revise인데 사진 없음", { mode: "revise", prompt: "더 밝게" }, "수정할 시안이 없어요"],
      ["count 5", { prompt: PROMPT, count: "5" }, "시안 개수는 2~4장 중에서 골라주세요"],
      ["count 숫자 아님", { prompt: PROMPT, count: "many" }, "시안 개수는 2~4장 중에서 골라주세요"],
    ])("%s → 검증 메시지", async (_label, fields, message) => {
      const response = await POST(post(fields));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: { message, retryable: false } });
      expect(generateThumbnails).not.toHaveBeenCalled();
    });

    it("사진 형식이 틀리면 사진 메시지를 반환한다", async () => {
      const image = new File([new Uint8Array(8)], "a.heic", { type: "image/heic" });

      const response = await POST(post({ prompt: PROMPT, image }));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: {
          message: "PNG, JPG, WEBP 사진만 올릴 수 있어요. 아이폰 HEIC 사진은 JPG로 바꿔서 올려주세요",
          retryable: false,
        },
      });
    });

    it("여러 필드가 틀리면 첫 번째 에러 메시지만 반환한다", async () => {
      const response = await POST(post({ mode: "revise", caption: "가".repeat(41), count: "9" }));

      expect(await response.json()).toEqual({
        error: { message: "무엇을 바꿀지 적어주세요", retryable: false },
      });
    });
  });

  describe("생성 실패", () => {
    it.each([
      [
        "정책 거부",
        upstream(400, "moderation_blocked"),
        422,
        {
          message:
            "이미지 생성 정책에 걸렸어요. 실존 유명인, 폭력·선정적 표현, 상표·로고를 빼고 다시 시도해보세요",
          retryable: false,
        },
      ],
      [
        "429",
        upstream(429, "rate_limit_exceeded"),
        429,
        { message: "요청이 몰려 있어요. 잠시 후 다시 시도해주세요", retryable: true },
      ],
      [
        "insufficient_quota",
        upstream(429, "insufficient_quota"),
        500,
        { message: "서비스 설정에 문제가 있어요. 운영자에게 문의해주세요", retryable: false },
      ],
      [
        "401",
        upstream(401),
        500,
        { message: "서비스 설정에 문제가 있어요. 운영자에게 문의해주세요", retryable: false },
      ],
      [
        "upstream 500",
        upstream(500),
        502,
        { message: "이미지 생성 서버에 일시적인 문제가 있어요", retryable: true },
      ],
      [
        "알 수 없는 에러",
        new Error("boom"),
        502,
        { message: "이미지 생성 서버에 일시적인 문제가 있어요", retryable: true },
      ],
    ])("%s → toUserError의 status와 { error }", async (_label, err, status, error) => {
      vi.mocked(generateThumbnails).mockRejectedValue(err);

      const response = await POST(post({ prompt: PROMPT }));

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error });
    });

    it("응답과 로그에 OpenAI 원문 메시지나 프롬프트를 남기지 않고, status와 upstream status만 로그한다", async () => {
      vi.mocked(generateThumbnails).mockRejectedValue(upstream(503));

      const response = await POST(post({ prompt: PROMPT, caption: "비밀 문구" }));

      expect(await response.text()).not.toContain("upstream raw message");
      expect(consoleError).toHaveBeenCalledTimes(1);
      const logged = JSON.stringify(consoleError.mock.calls[0]);
      expect(logged).toContain("502");
      expect(logged).toContain("503");
      expect(logged).not.toContain(PROMPT);
      expect(logged).not.toContain("비밀 문구");
      expect(logged).not.toContain("upstream raw message");
    });
  });
});
