// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ThumbnailInput } from "@/types/thumbnail";
import {
  ALLOWED_IMAGE_TYPES,
  COUNTS,
  MAX_CAPTION_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_PROMPT_LENGTH,
  validateImage,
  validateInput,
} from "./validation";

function makeFile(type = "image/png", size = 1024) {
  return new File([new Uint8Array(size)], "photo", { type });
}

function makeInput(overrides: Partial<ThumbnailInput> = {}): ThumbnailInput {
  return {
    mode: "create",
    prompt: "우주 배경에 놀란 표정",
    caption: "",
    image: null,
    count: 2,
    ...overrides,
  };
}

describe("제한 상수", () => {
  it("PRD 값과 같다", () => {
    expect(MAX_PROMPT_LENGTH).toBe(2000);
    expect(MAX_CAPTION_LENGTH).toBe(40);
    expect(MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    expect(ALLOWED_IMAGE_TYPES).toEqual(["image/png", "image/jpeg", "image/webp"]);
    expect(COUNTS).toEqual([2, 3, 4]);
  });
});

describe("validateImage", () => {
  it.each(["image/png", "image/jpeg", "image/webp"])("%s 이고 10MB 이하면 통과한다", (type) => {
    expect(validateImage(makeFile(type, MAX_IMAGE_BYTES))).toBeNull();
  });

  it.each(["image/heic", "image/gif", "application/pdf", ""])("%s 형식은 거부한다", (type) => {
    expect(validateImage(makeFile(type))).toBe(
      "PNG, JPG, WEBP 사진만 올릴 수 있어요. 아이폰 HEIC 사진은 JPG로 바꿔서 올려주세요",
    );
  });

  it("10MB를 넘으면 거부한다", () => {
    expect(validateImage(makeFile("image/jpeg", MAX_IMAGE_BYTES + 1))).toBe(
      "10MB 이하 사진만 올릴 수 있어요",
    );
  });
});

describe("validateInput", () => {
  it("올바른 create 입력이면 빈 객체를 반환한다", () => {
    expect(validateInput(makeInput())).toEqual({});
  });

  it("올바른 revise 입력이면 빈 객체를 반환한다", () => {
    expect(
      validateInput(makeInput({ mode: "revise", prompt: "배경을 빨간색으로", image: makeFile() })),
    ).toEqual({});
  });

  describe("prompt", () => {
    it("create에서 trim 후 비어 있으면 설명 메시지를 낸다", () => {
      expect(validateInput(makeInput({ prompt: "   \n " })).prompt).toBe(
        "어떤 썸네일을 원하는지 적어주세요",
      );
    });

    it("revise에서 trim 후 비어 있으면 수정 요청 메시지를 낸다", () => {
      expect(
        validateInput(makeInput({ mode: "revise", prompt: "  ", image: makeFile() })).prompt,
      ).toBe("무엇을 바꿀지 적어주세요");
    });

    it("trim한 길이가 2000자이면 통과한다", () => {
      expect(validateInput(makeInput({ prompt: `  ${"가".repeat(2000)}  ` })).prompt).toBeUndefined();
    });

    it("2000자를 넘으면 길이 메시지를 낸다", () => {
      expect(validateInput(makeInput({ prompt: "가".repeat(2001) })).prompt).toBe(
        "2000자 이내로 줄여주세요",
      );
    });
  });

  describe("caption", () => {
    it("trim한 길이가 40자이면 통과한다", () => {
      expect(validateInput(makeInput({ caption: ` ${"가".repeat(40)} ` })).caption).toBeUndefined();
    });

    it("40자를 넘으면 길이 메시지를 낸다", () => {
      expect(validateInput(makeInput({ caption: "가".repeat(41) })).caption).toBe(
        "40자 이내로 줄여주세요",
      );
    });
  });

  describe("image", () => {
    it("create에서는 없어도 통과한다", () => {
      expect(validateInput(makeInput({ image: null })).image).toBeUndefined();
    });

    it("create에서 있으면 validateImage 규칙을 적용한다", () => {
      expect(validateInput(makeInput({ image: makeFile("image/heic") })).image).toBe(
        "PNG, JPG, WEBP 사진만 올릴 수 있어요. 아이폰 HEIC 사진은 JPG로 바꿔서 올려주세요",
      );
      expect(
        validateInput(makeInput({ image: makeFile("image/png", MAX_IMAGE_BYTES + 1) })).image,
      ).toBe("10MB 이하 사진만 올릴 수 있어요");
    });

    it("revise에서 없으면 수정할 시안이 없다는 메시지를 낸다", () => {
      expect(validateInput(makeInput({ mode: "revise", image: null })).image).toBe(
        "수정할 시안이 없어요",
      );
    });

    it("revise에서 있으면 validateImage 규칙을 적용한다", () => {
      expect(
        validateInput(makeInput({ mode: "revise", image: makeFile("image/gif") })).image,
      ).toBe("PNG, JPG, WEBP 사진만 올릴 수 있어요. 아이폰 HEIC 사진은 JPG로 바꿔서 올려주세요");
    });
  });

  describe("count", () => {
    it.each([2, 3, 4])("%i는 통과한다", (count) => {
      expect(validateInput(makeInput({ count: count as ThumbnailInput["count"] })).count).toBeUndefined();
    });

    it.each([0, 1, 5, 2.5, Number.NaN])("%s는 거부한다", (count) => {
      expect(validateInput(makeInput({ count: count as ThumbnailInput["count"] })).count).toBe(
        "시안 개수는 2~4장 중에서 골라주세요",
      );
    });
  });

  it("여러 필드가 틀리면 폼 순서(prompt → caption → image → count)대로 모두 담는다", () => {
    const errors = validateInput({
      mode: "revise",
      prompt: "",
      caption: "가".repeat(41),
      image: null,
      count: 5 as ThumbnailInput["count"],
    });
    expect(Object.keys(errors)).toEqual(["prompt", "caption", "image", "count"]);
  });
});
