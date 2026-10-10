// @vitest-environment node
import OpenAI, { APIConnectionError, APIError } from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ThumbnailInput } from "@/types/thumbnail";
import { buildPrompt, generateThumbnails, toUserError } from "./thumbnail";

const PROMPT = '어두운 우주 배경에 놀란 표정의 내 얼굴을 오른쪽에 크게\n"충격" 느낌으로!';
const CAPTION = "월 천만원 버는 법";

const POLICY_ERROR = {
  status: 422,
  error: {
    message:
      "이미지 생성 정책에 걸렸어요. 실존 유명인, 폭력·선정적 표현, 상표·로고를 빼고 다시 시도해보세요",
    retryable: false,
  },
};
const RATE_LIMIT_ERROR = {
  status: 429,
  error: { message: "요청이 몰려 있어요. 잠시 후 다시 시도해주세요", retryable: true },
};
const CONFIG_ERROR = {
  status: 500,
  error: { message: "서비스 설정에 문제가 있어요. 운영자에게 문의해주세요", retryable: false },
};
const UPSTREAM_ERROR = {
  status: 502,
  error: { message: "이미지 생성 서버에 일시적인 문제가 있어요", retryable: true },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("buildPrompt", () => {
  describe("create", () => {
    it.each([
      { caption: "", hasImage: false },
      { caption: "", hasImage: true },
      { caption: CAPTION, hasImage: false },
      { caption: CAPTION, hasImage: true },
    ])("썸네일 가이드 뒤에 설명 원문을 붙인다 (caption=$caption, hasImage=$hasImage)", ({ caption, hasImage }) => {
      const result = buildPrompt({ mode: "create", prompt: PROMPT, caption, hasImage });

      expect(result).toContain("YouTube thumbnail");
      expect(result).toContain("16:9");
      expect(result).toContain("focal point");
      expect(result).toContain("high contrast");
      expect(result).toContain("large and bold enough to read on a small screen");
      expect(result).toContain(PROMPT);
      expect(result.indexOf("focal point")).toBeLessThan(result.indexOf(PROMPT));
    });

    it("문구가 있으면 따옴표로 감싼 원문을 철자 그대로·한 번만·크고 굵게 넣고 다른 글자는 금지하며 한글 정확도를 요구한다", () => {
      const result = buildPrompt({ mode: "create", prompt: PROMPT, caption: CAPTION, hasImage: false });

      expect(result).toContain(`"${CAPTION}"`);
      expect(result).toContain("exactly as written");
      expect(result).toContain("exactly once");
      expect(result).toContain("large bold letters");
      expect(result).toContain("Do not add any other text");
      expect(result).toContain("Korean (Hangul)");
      expect(result).not.toContain("other than what the description asks for");
    });

    it("문구가 없으면 설명이 요구한 글자 외에는 넣지 말라고 지시한다", () => {
      const result = buildPrompt({ mode: "create", prompt: PROMPT, caption: "", hasImage: false });

      expect(result).toContain("Do not add any text other than what the description asks for");
      expect(result).not.toContain("exactly once");
      expect(result).not.toContain("Korean (Hangul)");
    });

    it("공백뿐인 문구는 문구 없음으로 다룬다", () => {
      expect(buildPrompt({ mode: "create", prompt: PROMPT, caption: "   ", hasImage: false })).toBe(
        buildPrompt({ mode: "create", prompt: PROMPT, caption: "", hasImage: false }),
      );
    });

    it("사진이 있으면 사진 속 인물·피사체를 주인공으로 쓰고 얼굴과 정체성을 유지하라고 지시한다", () => {
      const result = buildPrompt({ mode: "create", prompt: PROMPT, caption: "", hasImage: true });

      expect(result).toContain("person or subject in the provided photo as the main subject");
      expect(result).toContain("face and identity");
    });

    it("사진이 없으면 사진 지시를 넣지 않는다", () => {
      const result = buildPrompt({ mode: "create", prompt: PROMPT, caption: CAPTION, hasImage: false });

      expect(result).not.toContain("provided photo");
      expect(result).not.toContain("face and identity");
    });
  });

  describe("revise", () => {
    it.each([{ caption: "" }, { caption: CAPTION }])(
      "제공된 썸네일 편집 지시 뒤에 수정 요청 원문을 붙인다 (caption=$caption)",
      ({ caption }) => {
        const result = buildPrompt({ mode: "revise", prompt: PROMPT, caption, hasImage: true });

        expect(result).toContain("Edit the provided thumbnail");
        expect(result).toContain("Apply only the changes below");
        expect(result).toContain("keep everything else");
        expect(result).toContain("composition, people, text");
        expect(result).toContain(PROMPT);
        expect(result.indexOf("Apply only the changes below")).toBeLessThan(result.indexOf(PROMPT));
        expect(result).not.toContain("Create a YouTube thumbnail");
      },
    );

    it("새 문구가 있으면 기존 문구를 따옴표로 감싼 원문으로 철자 그대로 교체하라고 지시한다", () => {
      const result = buildPrompt({ mode: "revise", prompt: PROMPT, caption: CAPTION, hasImage: true });

      expect(result).toContain(`Replace the existing caption with "${CAPTION}"`);
      expect(result).toContain("exactly as written");
    });

    it("새 문구가 없으면 교체 지시를 넣지 않는다", () => {
      const result = buildPrompt({ mode: "revise", prompt: PROMPT, caption: "", hasImage: true });

      expect(result).not.toContain("Replace the existing caption");
    });

    it("hasImage와 상관없이 같은 지시를 만든다 (create의 사진 지시를 섞지 않는다)", () => {
      const withImage = buildPrompt({ mode: "revise", prompt: PROMPT, caption: CAPTION, hasImage: true });

      expect(withImage).toBe(
        buildPrompt({ mode: "revise", prompt: PROMPT, caption: CAPTION, hasImage: false }),
      );
      expect(withImage).not.toContain("face and identity");
    });
  });
});

describe("generateThumbnails", () => {
  function makeInput(overrides: Partial<ThumbnailInput> = {}): ThumbnailInput {
    return { mode: "create", prompt: PROMPT, caption: CAPTION, image: null, count: 3, ...overrides };
  }

  function makeClient(response: unknown = { data: [{ b64_json: "AAA" }, { b64_json: "BBB" }] }) {
    const generate = vi.fn().mockResolvedValue(response);
    const edit = vi.fn().mockResolvedValue(response);
    const client = { images: { generate, edit } } as unknown as OpenAI;
    return { client, generate, edit };
  }

  it("사진이 없으면 images.generate를 공통 파라미터와 signal로 호출한다", async () => {
    const { client, generate, edit } = makeClient();
    const signal = new AbortController().signal;

    await generateThumbnails(makeInput(), { client, signal });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith(
      {
        model: "gpt-image-2.5-flare",
        prompt: buildPrompt({ mode: "create", prompt: PROMPT, caption: CAPTION, hasImage: false }),
        n: 3,
        size: "1280x720",
        quality: "high",
        output_format: "jpeg",
      },
      { signal },
    );
    expect(edit).not.toHaveBeenCalled();
  });

  it("사진이 있으면 images.edit에 파일을 image로 넘기고 사진 지시가 든 프롬프트를 쓴다", async () => {
    const { client, generate, edit } = makeClient();
    const signal = new AbortController().signal;
    const image = new File([new Uint8Array(8)], "me.png", { type: "image/png" });

    await generateThumbnails(makeInput({ image, count: 2 }), { client, signal });

    expect(edit).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledWith(
      {
        model: "gpt-image-2.5-flare",
        prompt: buildPrompt({ mode: "create", prompt: PROMPT, caption: CAPTION, hasImage: true }),
        n: 2,
        size: "1280x720",
        quality: "high",
        output_format: "jpeg",
        image,
      },
      { signal },
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("revise는 기반 시안으로 images.edit를 호출하고 수정 프롬프트를 쓴다", async () => {
    const { client, edit } = makeClient();
    const image = new File([new Uint8Array(8)], "base.jpg", { type: "image/jpeg" });

    await generateThumbnails(makeInput({ mode: "revise", image, count: 4 }), { client });

    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: buildPrompt({ mode: "revise", prompt: PROMPT, caption: CAPTION, hasImage: true }),
        n: 4,
        image,
      }),
      { signal: undefined },
    );
  });

  it("b64_json을 JPEG data URL로 바꾸고 b64_json이 없는 항목은 건너뛴다", async () => {
    const { client } = makeClient({
      data: [{ b64_json: "AAA" }, { url: "https://example.com/x.jpg" }, { b64_json: "CCC" }],
    });

    await expect(generateThumbnails(makeInput(), { client })).resolves.toEqual([
      "data:image/jpeg;base64,AAA",
      "data:image/jpeg;base64,CCC",
    ]);
  });

  it("응답에 data가 없으면 빈 배열을 반환한다", async () => {
    const { client } = makeClient({});

    await expect(generateThumbnails(makeInput(), { client })).resolves.toEqual([]);
  });

  it("OpenAI 에러는 그대로 던져 toUserError가 변환하게 한다", async () => {
    const { client, generate } = makeClient();
    const upstream = APIError.generate(429, { error: { message: "slow down" } }, undefined, new Headers());
    generate.mockRejectedValue(upstream);

    await expect(generateThumbnails(makeInput(), { client })).rejects.toBe(upstream);
  });

  it("OPENAI_API_KEY가 비어 있으면 OpenAI를 호출하기 전에 던지고, toUserError는 500 서비스 설정 에러로 바꾼다", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network disabled"));

    const err = await generateThumbnails(makeInput()).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(toUserError(err)).toEqual(CONFIG_ERROR);
  });
});

describe("toUserError", () => {
  function upstream(status: number, code?: string) {
    return APIError.generate(
      status,
      { error: { message: "upstream raw message", type: "invalid_request_error", code } },
      undefined,
      new Headers(),
    );
  }

  it.each([
    ["moderation_blocked (400)", upstream(400, "moderation_blocked"), POLICY_ERROR],
    ["content_policy_violation (400)", upstream(400, "content_policy_violation"), POLICY_ERROR],
    ["429 rate_limit_exceeded", upstream(429, "rate_limit_exceeded"), RATE_LIMIT_ERROR],
    ["429 코드 없음", upstream(429), RATE_LIMIT_ERROR],
    ["429 insufficient_quota", upstream(429, "insufficient_quota"), CONFIG_ERROR],
    ["401", upstream(401, "invalid_api_key"), CONFIG_ERROR],
    ["403", upstream(403), CONFIG_ERROR],
    ["400 기타", upstream(400, "invalid_value"), UPSTREAM_ERROR],
    ["500", upstream(500), UPSTREAM_ERROR],
    ["503", upstream(503), UPSTREAM_ERROR],
    ["연결 실패", new APIConnectionError({ message: "Connection error." }), UPSTREAM_ERROR],
    ["일반 Error", new Error("boom"), UPSTREAM_ERROR],
    ["문자열", "boom", UPSTREAM_ERROR],
    ["undefined", undefined, UPSTREAM_ERROR],
  ])("%s → PRD §4-2 매핑", (_label, err, expected) => {
    expect(toUserError(err)).toEqual(expected);
  });

  it("OpenAI 원문 메시지를 사용자 에러에 담지 않는다", () => {
    for (const err of [upstream(400, "moderation_blocked"), upstream(429), upstream(401), upstream(500)]) {
      expect(JSON.stringify(toUserError(err))).not.toContain("upstream raw message");
    }
  });
});
