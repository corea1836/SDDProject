import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ThumbnailStudio from "./ThumbnailStudio";

// base64 "AAAA", "BBBB"
const IMAGES = ["data:image/jpeg;base64,QUFBQQ==", "data:image/jpeg;base64,QkJCQg=="];
const PROMPT = "어두운 우주 배경에 놀란 표정의 내 얼굴";
const CAPTION = "보스 1분 컷";
const RATE_LIMITED = "요청이 몰려 있어요. 잠시 후 다시 시도해주세요";
const TIMEOUT_MESSAGE = "생성이 너무 오래 걸려 멈췄어요. 시안 개수를 줄이거나 다시 시도해보세요";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const jsonResponse = (body: unknown, status = 200) => Response.json(body, { status });

// 응답 시점을 테스트에서 정하는 요청
function deferredResponse() {
  let resolve!: (res: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// abort될 때까지 응답하지 않는 요청 (취소·타임아웃용)
function hangUntilAbort(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
}

const promptField = () => screen.getByLabelText(/어떤 썸네일을 원하세요\?/);
const reviseField = () => screen.getByLabelText(/무엇을 바꿀까요\?/);
const captionField = () => screen.getByLabelText(/썸네일 문구/);
const sentInit = (call: number) => fetchMock.mock.calls[call][1];
const sentBody = (call: number) => sentInit(call)?.body as FormData;
const roundTitles = () => screen.queryAllByRole("heading", { name: /^#\d/ }).map((h) => h.textContent);

function renderStudio() {
  const user = userEvent.setup();
  render(<ThumbnailStudio />);
  return { user };
}

async function submitCreate(user: ReturnType<typeof userEvent.setup>) {
  await user.type(promptField(), PROMPT);
  await user.click(screen.getByRole("button", { name: "썸네일 만들기" }));
}

function dispatchBeforeUnload() {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe("첫 화면", () => {
  it("헤더와 3단계 안내, 예시 칩을 보여준다", () => {
    renderStudio();

    expect(screen.getByRole("heading", { level: 1, name: "썸네일 메이커" })).toBeInTheDocument();
    expect(screen.getByText("썸네일, 이렇게 만들어요")).toBeInTheDocument();
    expect(screen.getByText("① 원하는 썸네일을 설명해요")).toBeInTheDocument();
    expect(screen.getByText("② 문구·사진을 더하면 더 정확해요")).toBeInTheDocument();
    expect(screen.getByText("③ 시안을 비교해 고르고 내려받아요")).toBeInTheDocument();
    for (const label of ["게임", "요리", "재테크"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("검증에 실패하면 요청을 보내지 않고 라운드도 만들지 않는다", async () => {
    const { user } = renderStudio();

    await user.click(screen.getByRole("button", { name: "썸네일 만들기" }));

    expect(screen.getByText("어떤 썸네일을 원하는지 적어주세요")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });
});

describe("생성", () => {
  it("제출하면 생성 중 카드와 비활성 버튼을 보여주고, 응답이 오면 시안을 보여주며 입력은 남긴다", async () => {
    const pending = deferredResponse();
    fetchMock.mockReturnValueOnce(pending.promise);
    const { user } = renderStudio();
    await user.type(captionField(), CAPTION);

    await submitCreate(user);

    expect(roundTitles()).toEqual(["#1 새로 만들기 · 2장"]);
    expect(screen.getByText(/초 경과/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "만드는 중…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("썸네일을 만들고 있어요");
    expect(screen.queryByText("썸네일, 이렇게 만들어요")).not.toBeInTheDocument();

    await act(async () => pending.resolve(jsonResponse({ images: IMAGES })));

    expect(await screen.findByAltText("시안 #1-1")).toHaveAttribute("src", IMAGES[0]);
    expect(screen.getByAltText("시안 #1-2")).toHaveAttribute("src", IMAGES[1]);
    expect(screen.getByRole("status")).toHaveTextContent("시안 2장이 만들어졌어요");
    expect(screen.getByRole("button", { name: "썸네일 만들기" })).toBeEnabled();
    expect(promptField()).toHaveValue(PROMPT);
    expect(captionField()).toHaveValue(CAPTION);
  });

  it("mode·prompt·caption·count를 FormData로 담아 /api/thumbnails에 POST한다", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ images: IMAGES }));
    const { user } = renderStudio();
    await user.type(captionField(), CAPTION);
    await user.click(screen.getByRole("radio", { name: "3" }));

    await submitCreate(user);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/thumbnails");
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = sentBody(0);
    expect(body.get("mode")).toBe("create");
    expect(body.get("prompt")).toBe(PROMPT);
    expect(body.get("caption")).toBe(CAPTION);
    expect(body.get("count")).toBe("3");
    expect(body.has("image")).toBe(false);
    await screen.findByAltText("시안 #1-1");
  });

  it("사진을 첨부하면 image도 함께 보낸다", async () => {
    URL.createObjectURL = vi.fn(() => "blob:face.png");
    URL.revokeObjectURL = vi.fn();
    fetchMock.mockResolvedValueOnce(jsonResponse({ images: IMAGES }));
    const { user } = renderStudio();
    const photo = new File([new Uint8Array(8)], "face.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/사진 \(선택 · 1장\)/), photo);

    await submitCreate(user);

    expect(sentBody(0).get("image")).toBe(photo);
    await screen.findByAltText("시안 #1-1");
  });
});

describe("실패", () => {
  it("retryable 에러면 [다시 시도]로 같은 입력을 다시 보내고, 실패 카드를 새 카드로 바꾼다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { message: RATE_LIMITED, retryable: true } }, 429))
      .mockResolvedValueOnce(jsonResponse({ images: IMAGES }));
    const { user } = renderStudio();
    await submitCreate(user);

    expect(await screen.findByText(`⚠ ${RATE_LIMITED}`)).toBeInTheDocument();
    expect(roundTitles()).toEqual(["#1 새로 만들기 · 실패"]);
    expect(screen.getByRole("status")).toHaveTextContent(RATE_LIMITED);
    expect(promptField()).toHaveValue(PROMPT);

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(1).get("prompt")).toBe(PROMPT);
    expect(await screen.findByAltText("시안 #2-1")).toBeInTheDocument();
    expect(roundTitles()).toEqual(["#2 새로 만들기 · 2장"]);
  });

  it("retryable이 false면 [다시 시도] 없이 [닫기]로 카드를 지운다", async () => {
    const policy = "이미지 생성 정책에 걸렸어요. 실존 유명인, 폭력·선정적 표현, 상표·로고를 빼고 다시 시도해보세요";
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: { message: policy, retryable: false } }, 422));
    const { user } = renderStudio();
    await submitCreate(user);

    expect(await screen.findByText(`⚠ ${policy}`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "닫기" }));

    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByText("썸네일, 이렇게 만들어요")).toBeInTheDocument();
  });

  it("응답 본문을 JSON으로 읽을 수 없으면 일시적인 서버 문제로 보고 다시 시도를 권한다", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Gateway Timeout</html>", { status: 504 }));
    const { user } = renderStudio();
    await submitCreate(user);

    expect(await screen.findByText("⚠ 이미지 생성 서버에 일시적인 문제가 있어요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("fetch가 reject되면 네트워크 에러를 보여준다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { user } = renderStudio();
    await submitCreate(user);

    expect(await screen.findByText("⚠ 인터넷 연결을 확인하고 다시 시도해주세요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });

  it("180초 동안 응답이 없으면 요청을 멈추고 타임아웃 에러를 보여준다", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(hangUntilAbort);
    render(<ThumbnailStudio />);
    fireEvent.change(promptField(), { target: { value: PROMPT } });
    fireEvent.click(screen.getByRole("button", { name: "썸네일 만들기" }));
    const signal = sentInit(0)?.signal;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(179_000);
    });
    expect(signal?.aborted).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(signal?.aborted).toBe(true);
    expect(screen.getByText(`⚠ ${TIMEOUT_MESSAGE}`)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(TIMEOUT_MESSAGE);
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeEnabled();
  });
});

describe("취소", () => {
  it("요청을 abort하고 카드를 지운 뒤 취소를 알리며, 입력은 남긴다", async () => {
    fetchMock.mockImplementationOnce(hangUntilAbort);
    const { user } = renderStudio();
    await submitCreate(user);
    const signal = sentInit(0)?.signal;

    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("생성을 취소했어요");
    expect(promptField()).toHaveValue(PROMPT);
    expect(screen.getByRole("button", { name: "썸네일 만들기" })).toBeEnabled();
  });
});

describe("같은 입력으로 다시 생성", () => {
  it("그 라운드의 입력으로 새 라운드를 맨 위에 추가하고, 이전 라운드와 입력 패널은 그대로 둔다", async () => {
    const second = deferredResponse();
    fetchMock.mockResolvedValueOnce(jsonResponse({ images: IMAGES })).mockReturnValueOnce(second.promise);
    const { user } = renderStudio();
    await submitCreate(user);
    await screen.findByAltText("시안 #1-1");
    await user.clear(promptField());
    await user.type(promptField(), "다른 설명");

    await user.click(screen.getByRole("button", { name: "같은 입력으로 다시 생성" }));

    expect(sentBody(1).get("prompt")).toBe(PROMPT);
    expect(roundTitles()).toEqual(["#2 새로 만들기 · 2장", "#1 새로 만들기 · 2장"]);
    // 생성 중에는 다른 생성 요청을 시작할 수 없다.
    expect(screen.getByRole("button", { name: "같은 입력으로 다시 생성" })).toBeDisabled();
    expect(promptField()).toHaveValue("다른 설명");

    await act(async () => second.resolve(jsonResponse({ images: IMAGES })));

    expect(await screen.findByAltText("시안 #2-1")).toBeInTheDocument();
    expect(screen.getByAltText("시안 #1-1")).toBeInTheDocument();
  });
});

describe("수정 모드", () => {
  it("기반 시안을 image로 mode=revise 요청을 보내고, 돌아가면 create 입력을 복원한다", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ images: IMAGES }))
      .mockResolvedValueOnce(jsonResponse({ images: IMAGES }));
    const { user } = renderStudio();
    await user.type(captionField(), CAPTION);
    await submitCreate(user);
    await screen.findByAltText("시안 #1-1");

    await user.click(screen.getAllByRole("button", { name: "이 시안으로 수정하기" })[0]);

    expect(screen.getByRole("heading", { name: "시안 수정" })).toBeInTheDocument();
    expect(screen.getByAltText("기반 시안 #1-1")).toHaveAttribute("src", IMAGES[0]);
    expect(screen.queryByLabelText(/사진 \(선택 · 1장\)/)).not.toBeInTheDocument();
    expect(reviseField()).toHaveValue("");

    // 다른 시안을 고르면 기반만 바뀌고 수정 요청은 남는다.
    await user.type(reviseField(), "문구를 더 크게");
    await user.click(screen.getAllByRole("button", { name: "이 시안으로 수정하기" })[1]);
    expect(screen.getByAltText("기반 시안 #1-2")).toHaveAttribute("src", IMAGES[1]);
    expect(reviseField()).toHaveValue("문구를 더 크게");

    await user.click(screen.getByRole("button", { name: "수정 시안 만들기" }));

    const body = sentBody(1);
    expect(body.get("mode")).toBe("revise");
    expect(body.get("prompt")).toBe("문구를 더 크게");
    expect(body.get("caption")).toBe("");
    expect(body.get("count")).toBe("2");
    const image = body.get("image") as File;
    expect(image.name).toBe("base-1-2.jpg");
    expect(image.type).toBe("image/jpeg");
    expect(await image.text()).toBe("BBBB");
    expect(await screen.findByAltText("시안 #2-1")).toBeInTheDocument();
    expect(roundTitles()).toEqual(["#2 수정 · 기반 #1-2 · 2장", "#1 새로 만들기 · 2장"]);
    expect(reviseField()).toHaveValue("문구를 더 크게");

    await user.click(screen.getByRole("button", { name: "← 새로 만들기로 돌아가기" }));

    expect(promptField()).toHaveValue(PROMPT);
    expect(captionField()).toHaveValue(CAPTION);
  });
});

describe("이탈 경고", () => {
  it("결과가 있으면 beforeunload를 막는다", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ images: IMAGES }));
    const { user } = renderStudio();
    expect(dispatchBeforeUnload()).toBe(false);

    await submitCreate(user);
    await screen.findByAltText("시안 #1-1");

    expect(dispatchBeforeUnload()).toBe(true);
  });

  it("생성 중에도 막고, 취소해 카드가 없어지면 해제한다", async () => {
    fetchMock.mockImplementationOnce(hangUntilAbort);
    const { user } = renderStudio();
    await submitCreate(user);

    expect(dispatchBeforeUnload()).toBe(true);

    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(dispatchBeforeUnload()).toBe(false);
  });

  it("실패 카드만 있으면 막지 않는다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { user } = renderStudio();
    await submitCreate(user);
    await screen.findByText("⚠ 인터넷 연결을 확인하고 다시 시도해주세요");

    expect(dispatchBeforeUnload()).toBe(false);
  });
});

describe("스크롤", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    // jsdom에는 scrollIntoView가 없다.
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("새 라운드 카드로, 수정 모드에 들어가면 입력 패널로 스크롤한다", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ images: IMAGES }));
    const { user } = renderStudio();
    await submitCreate(user);

    expect(scrollIntoView.mock.contexts.at(-1)).toContainElement(
      screen.getByRole("heading", { name: "#1 새로 만들기 · 2장" }),
    );

    await screen.findByAltText("시안 #1-1");
    await user.click(screen.getAllByRole("button", { name: "이 시안으로 수정하기" })[0]);

    expect(scrollIntoView.mock.contexts.at(-1)).toContainElement(reviseField());
  });
});
