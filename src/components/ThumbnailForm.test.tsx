import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IMAGE_BYTES } from "@/lib/validation";
import type { ThumbnailInput } from "@/types/thumbnail";
import ThumbnailForm from "./ThumbnailForm";

type FormProps = ComponentProps<typeof ThumbnailForm>;

const EMPTY: ThumbnailInput = { mode: "create", prompt: "", caption: "", image: null, count: 2 };
const BASE = { seq: 1, index: 2, dataUrl: "data:image/jpeg;base64,QkFTRQ==" };
const FORMAT_ERROR = "PNG, JPG, WEBP 사진만 올릴 수 있어요. 아이폰 HEIC 사진은 JPG로 바꿔서 올려주세요";

function makePhoto(name = "face.png", type = "image/png", size = 1024) {
  return new File([new Uint8Array(size)], name, { type });
}

// controlled 폼이므로 부모처럼 값을 들고 있는 래퍼로 렌더한다.
function renderForm(initial: Partial<ThumbnailInput> = {}, props: Partial<FormProps> = {}) {
  const onChange = vi.fn<(next: ThumbnailInput) => void>();
  const onSubmit = vi.fn();
  function Harness() {
    const [value, setValue] = useState<ThumbnailInput>({ ...EMPTY, ...initial });
    return (
      <ThumbnailForm
        value={value}
        onChange={(next) => {
          onChange(next);
          setValue(next);
        }}
        onSubmit={onSubmit}
        busy={false}
        {...props}
      />
    );
  }
  const user = userEvent.setup();
  const view = render(<Harness />);
  const lastValue = () => onChange.mock.lastCall?.[0];
  return { user, onChange, onSubmit, lastValue, ...view };
}

const promptField = () => screen.getByLabelText(/어떤 썸네일을 원하세요\?/);
const captionField = () => screen.getByLabelText(/썸네일 문구/);
const photoInput = () => screen.getByLabelText(/사진 \(선택 · 1장\)/);
const dropFiles = (files: File[]) => fireEvent.drop(photoInput(), { dataTransfer: { files } });

describe("create 모드", () => {
  it("설명·문구·사진·개수 입력과 [썸네일 만들기] 버튼을 보여준다", () => {
    renderForm();

    expect(promptField().tagName).toBe("TEXTAREA");
    expect(screen.getByText("0/2000")).toBeInTheDocument();
    expect(screen.getByLabelText("썸네일 문구 (선택 · 15자 이내 권장)")).toBeInTheDocument();
    expect(screen.getByText("0/40")).toBeInTheDocument();
    expect(photoInput()).toHaveAttribute("type", "file");
    expect(photoInput()).toHaveAttribute("accept", "image/png,image/jpeg,image/webp");
    expect(screen.getByText("끌어다 놓거나 클릭해서 올리기")).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("value"))).toEqual(["2", "3", "4"]);
    expect(screen.getByRole("radio", { name: "2" })).toBeChecked();
    expect(screen.getByText("시안이 많을수록 오래 걸려요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "썸네일 만들기" })).toBeEnabled();
    expect(screen.queryByText(/기반 시안/)).not.toBeInTheDocument();
  });

  it("입력하면 전체 값을 onChange로 넘기고 카운터가 갱신된다", async () => {
    const { user, lastValue } = renderForm();

    await user.type(promptField(), "우주");
    await user.click(screen.getByRole("radio", { name: "3" }));

    expect(lastValue()).toEqual({ ...EMPTY, prompt: "우주", count: 3 });
    expect(screen.getByText("2/2000")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "3" })).toBeChecked();
  });
});

describe("예시 칩", () => {
  it("설명과 문구가 둘 다 비어 있으면 보인다", () => {
    renderForm();

    for (const name of ["게임", "요리", "재테크"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it.each([{ prompt: "우주" }, { caption: "월 천만원" }])("%o 이면 숨긴다", (initial) => {
    renderForm(initial);

    expect(screen.queryByRole("button", { name: "게임" })).not.toBeInTheDocument();
  });

  it("누르면 설명과 문구를 채우고 칩이 사라진다", async () => {
    const { user, lastValue } = renderForm();

    await user.click(screen.getByRole("button", { name: "게임" }));

    expect(promptField()).not.toHaveValue("");
    expect(captionField()).not.toHaveValue("");
    expect(lastValue()).toMatchObject({ mode: "create", image: null, count: 2 });
    expect(screen.queryByRole("button", { name: "요리" })).not.toBeInTheDocument();
  });
});

describe("revise 모드", () => {
  const reviseInput = { mode: "revise" as const, image: makePhoto("base-1-2.jpg", "image/jpeg") };

  it("기반 시안과 수정용 라벨·버튼을 보여주고 사진 입력과 예시 칩은 숨긴다", () => {
    renderForm(reviseInput, { base: BASE });

    expect(screen.getByAltText("기반 시안 #1-2")).toHaveAttribute("src", BASE.dataUrl);
    expect(screen.getByText("기반 시안 #1-2")).toBeInTheDocument();
    expect(screen.getByLabelText(/무엇을 바꿀까요\?/)).toBeInTheDocument();
    expect(screen.getByLabelText("새 문구 (선택 · 비우면 기존 문구 유지)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수정 시안 만들기" })).toBeEnabled();
    expect(screen.queryByLabelText(/사진 \(선택/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "게임" })).not.toBeInTheDocument();
  });

  it("[← 새로 만들기로 돌아가기]를 누르면 onExitRevise를 부른다", async () => {
    const onExitRevise = vi.fn();
    const { user } = renderForm(reviseInput, { base: BASE, onExitRevise });

    await user.click(screen.getByRole("button", { name: "← 새로 만들기로 돌아가기" }));

    expect(onExitRevise).toHaveBeenCalledTimes(1);
  });

  it("수정 요청이 비어 있으면 revise용 메시지를 띄우고 제출하지 않는다", async () => {
    const { user, onSubmit } = renderForm(reviseInput, { base: BASE });

    await user.click(screen.getByRole("button", { name: "수정 시안 만들기" }));

    expect(screen.getByText("무엇을 바꿀지 적어주세요")).toBeInTheDocument();
    expect(screen.getByLabelText(/무엇을 바꿀까요\?/)).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("제출", () => {
  it("설명이 비어 있으면 필드 아래 메시지를 연결하고 포커스를 옮기며 onSubmit을 부르지 않는다", async () => {
    const { user, onSubmit } = renderForm();

    await user.click(screen.getByRole("button", { name: "썸네일 만들기" }));

    expect(screen.getByText("어떤 썸네일을 원하는지 적어주세요")).toBeInTheDocument();
    expect(promptField()).toHaveFocus();
    expect(promptField()).toHaveAccessibleDescription("어떤 썸네일을 원하는지 적어주세요");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("에러가 난 필드를 고치면 그 필드의 에러가 사라진다", async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole("button", { name: "썸네일 만들기" }));
    await user.type(promptField(), "우");

    expect(screen.queryByText("어떤 썸네일을 원하는지 적어주세요")).not.toBeInTheDocument();
    expect(promptField()).not.toHaveAccessibleDescription();
  });

  it("검증을 통과하면 onSubmit을 부른다", async () => {
    const { user, onSubmit } = renderForm();

    await user.type(promptField(), "어두운 우주 배경");
    await user.click(screen.getByRole("button", { name: "썸네일 만들기" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("설명이 2000자를 넘으면 카운터가 빨개지고 제출하지 않는다", async () => {
    const { user, onSubmit } = renderForm({ prompt: "가".repeat(2001) });

    expect(screen.getByText("2001/2000")).toHaveClass("text-[#ef4444]");
    await user.click(screen.getByRole("button", { name: "썸네일 만들기" }));

    expect(screen.getByText("2000자 이내로 줄여주세요")).toBeInTheDocument();
    expect(promptField()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("제한을 넘는 입력을 잘라내지 않는다", async () => {
    const { user } = renderForm({ prompt: "가".repeat(2000) });

    await user.type(promptField(), "나");

    expect(promptField()).toHaveValue(`${"가".repeat(2000)}나`);
    expect(screen.getByText("2001/2000")).toBeInTheDocument();
  });

  it("문구가 40자를 넘으면 카운터가 빨개지고 문구 필드로 포커스한다", async () => {
    const { user, onSubmit } = renderForm({ prompt: "우주", caption: "가".repeat(41) });

    expect(screen.getByText("41/40")).toHaveClass("text-[#ef4444]");
    expect(screen.getByText("2/2000")).not.toHaveClass("text-[#ef4444]");
    await user.click(screen.getByRole("button", { name: "썸네일 만들기" }));

    expect(screen.getByText("40자 이내로 줄여주세요")).toBeInTheDocument();
    expect(captionField()).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ["create", {}],
    ["revise", { mode: "revise" as const }],
  ])("%s 모드에서 busy면 버튼이 '만드는 중…'으로 비활성이다", (_, initial) => {
    renderForm(initial, { busy: true, base: BASE });

    expect(screen.getByRole("button", { name: "만드는 중…" })).toBeDisabled();
  });
});

describe("사진", () => {
  beforeEach(() => {
    // jsdom에는 객체 URL이 없으므로 파일 이름으로 만든 가짜 URL을 쓴다.
    URL.createObjectURL = vi.fn((obj: Blob | MediaSource) => `blob:${(obj as File).name}`);
    URL.revokeObjectURL = vi.fn();
  });

  it("클릭해서 올리면 미리보기·파일명·[삭제]·팁을 보여준다", async () => {
    const { user, lastValue } = renderForm();
    const photo = makePhoto();

    await user.upload(photoInput(), photo);

    expect(lastValue()?.image).toBe(photo);
    expect(screen.getByAltText("첨부한 사진 미리보기")).toHaveAttribute("src", "blob:face.png");
    expect(screen.getByText("face.png")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
    expect(screen.getByText("얼굴이 잘 보이는 정면 사진일수록 좋아요")).toBeInTheDocument();
    expect(screen.queryByText("끌어다 놓거나 클릭해서 올리기")).not.toBeInTheDocument();
  });

  it("형식이 맞지 않는 사진은 첨부하지 않고 기존 사진을 유지한다", async () => {
    const { user, onChange, lastValue } = renderForm();
    const photo = makePhoto();
    await user.upload(photoInput(), photo);

    dropFiles([makePhoto("IMG_0001.heic", "image/heic")]);

    expect(screen.getByText(FORMAT_ERROR)).toBeInTheDocument();
    expect(photoInput()).toHaveAccessibleDescription(FORMAT_ERROR);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(lastValue()?.image).toBe(photo);
    expect(screen.getByText("face.png")).toBeInTheDocument();
  });

  it("10MB를 넘는 사진은 첨부하지 않고 기존 사진을 유지한다", async () => {
    const { user, onChange } = renderForm();
    await user.upload(photoInput(), makePhoto());

    dropFiles([makePhoto("big.png", "image/png", MAX_IMAGE_BYTES + 1)]);

    expect(screen.getByText("10MB 이하 사진만 올릴 수 있어요")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("face.png")).toBeInTheDocument();
  });

  it("거부된 뒤 올바른 사진을 올리면 메시지가 사라진다", () => {
    renderForm();

    dropFiles([makePhoto("IMG_0001.heic", "image/heic")]);
    dropFiles([makePhoto()]);

    expect(screen.queryByText(FORMAT_ERROR)).not.toBeInTheDocument();
    expect(screen.getByText("face.png")).toBeInTheDocument();
  });

  it("여러 장을 드롭하면 첫 장만 첨부하고 안내한다", () => {
    const { lastValue } = renderForm();
    const first = makePhoto("first.png");

    dropFiles([first, makePhoto("second.png")]);

    expect(lastValue()?.image).toBe(first);
    expect(screen.getByText("사진은 1장만 쓸 수 있어 첫 번째 사진만 올렸어요")).toBeInTheDocument();
    expect(screen.getByText("first.png")).toBeInTheDocument();
    expect(screen.queryByText("second.png")).not.toBeInTheDocument();
  });

  it("사진을 바꾸면 이전 미리보기 URL을 해제한다", async () => {
    const { user } = renderForm();
    await user.upload(photoInput(), makePhoto("first.png"));

    dropFiles([makePhoto("second.png")]);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:first.png");
    expect(screen.getByAltText("첨부한 사진 미리보기")).toHaveAttribute("src", "blob:second.png");
  });

  it("[삭제]를 누르면 사진을 비우고 미리보기 URL을 해제한다", async () => {
    const { user, lastValue } = renderForm();
    await user.upload(photoInput(), makePhoto());

    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(lastValue()?.image).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:face.png");
    expect(screen.queryByText("face.png")).not.toBeInTheDocument();
    expect(screen.getByText("끌어다 놓거나 클릭해서 올리기")).toBeInTheDocument();
  });

  it("언마운트되면 미리보기 URL을 해제한다", async () => {
    const { user, unmount } = renderForm();
    await user.upload(photoInput(), makePhoto());

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:face.png");
  });
});
