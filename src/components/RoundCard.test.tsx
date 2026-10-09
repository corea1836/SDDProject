import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Round } from "@/types/thumbnail";
import RoundCard from "./RoundCard";

const IMAGES = ["data:image/jpeg;base64,QUFBQQ==", "data:image/jpeg;base64,QkJCQg=="];

function makeRound(overrides: Partial<Round> = {}): Round {
  return {
    id: "round-2",
    seq: 2,
    kind: "create",
    input: { mode: "create", prompt: "어두운 우주 배경에 놀란 표정", caption: "", image: null, count: 2 },
    status: "done",
    images: IMAGES,
    startedAt: Date.now(),
    ...overrides,
  };
}

function renderCard(round: Round, busy = false) {
  const handlers = {
    onCancel: vi.fn(),
    onRegenerate: vi.fn(),
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
    onRevise: vi.fn(),
  };
  const user = userEvent.setup();
  const view = render(<RoundCard round={round} busy={busy} {...handlers} />);
  return { user, ...handlers, ...view };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("헤더와 입력 요약", () => {
  it("새로 만들기는 설명·문구·사진 첨부를 요약한다", () => {
    renderCard(
      makeRound({
        input: {
          mode: "create",
          prompt: "어두운 우주 배경에 놀란 표정",
          caption: "월 천만원 버는 법",
          image: new File(["x"], "face.png", { type: "image/png" }),
          count: 2,
        },
      }),
    );

    expect(screen.getByRole("heading", { name: "#2 새로 만들기 · 2장" })).toBeInTheDocument();
    expect(
      screen.getByText('"어두운 우주 배경에 놀란 표정" · 문구: 월 천만원 버는 법 · 사진 첨부'),
    ).toBeInTheDocument();
  });

  it("없는 항목은 생략하고 긴 설명은 40자에서 말줄임한다", () => {
    renderCard(makeRound({ input: { ...makeRound().input, prompt: "가".repeat(50) } }));

    expect(screen.getByText(`"${"가".repeat(40)}…"`)).toBeInTheDocument();
  });

  it("수정은 기반 시안 번호와 수정 요청·새 문구를 요약한다", () => {
    renderCard(
      makeRound({
        seq: 3,
        kind: "revise",
        base: { seq: 1, index: 2 },
        input: {
          mode: "revise",
          prompt: "문구를 더 크게, 배경을 빨간색으로",
          caption: "월 천만원 버는 법",
          image: new File(["x"], "base-1-2.jpg", { type: "image/jpeg" }),
          count: 2,
        },
      }),
    );

    expect(screen.getByRole("heading", { name: "#3 수정 · 기반 #1-2 · 2장" })).toBeInTheDocument();
    expect(screen.getByText('"문구를 더 크게, 배경을 빨간색으로" · 새 문구: 월 천만원 버는 법')).toBeInTheDocument();
  });

  it("실패하면 헤더에 '실패'를 붙인다", () => {
    renderCard(makeRound({ seq: 1, status: "error", images: [], error: { message: "x", retryable: true } }));

    expect(screen.getByRole("heading", { name: "#1 새로 만들기 · 실패" })).toBeInTheDocument();
  });
});

describe("생성 중", () => {
  it("개수만큼 16:9 자리표시자와 [취소]를 보여준다", async () => {
    const round = makeRound({ status: "generating", images: [], input: { ...makeRound().input, count: 3 } });
    const { user, onCancel, container } = renderCard(round);

    expect(container.querySelectorAll(".aspect-video.animate-pulse")).toHaveLength(3);
    expect(screen.getByText("0초 경과 · 보통 30초~2분")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "같은 입력으로 다시 생성" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("경과 초를 startedAt 기준으로 1초마다 갱신한다", () => {
    vi.useFakeTimers();
    renderCard(makeRound({ status: "generating", images: [], startedAt: Date.now() - 23_000 }));

    expect(screen.getByText("23초 경과 · 보통 30초~2분")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText("25초 경과 · 보통 30초~2분")).toBeInTheDocument();
  });
});

describe("완료", () => {
  it("시안 그리드와 시안별 다운로드 링크를 보여준다", () => {
    renderCard(makeRound());

    expect(screen.getByAltText("시안 #2-1")).toHaveAttribute("src", IMAGES[0]);
    expect(screen.getByAltText("시안 #2-2")).toHaveAttribute("src", IMAGES[1]);
    const links = screen.getAllByRole("link", { name: "다운로드" });
    expect(links.map((a) => [a.getAttribute("href"), a.getAttribute("download")])).toEqual([
      [IMAGES[0], "thumbnail-2-1.jpg"],
      [IMAGES[1], "thumbnail-2-2.jpg"],
    ]);
  });

  it("[이 시안으로 수정하기]는 1부터 시작하는 순번으로 onRevise를 부른다", async () => {
    const { user, onRevise } = renderCard(makeRound());

    await user.click(screen.getAllByRole("button", { name: "이 시안으로 수정하기" })[1]);

    expect(onRevise).toHaveBeenCalledWith(2);
  });

  it("[같은 입력으로 다시 생성]은 onRegenerate를 부른다", async () => {
    const { user, onRegenerate } = renderCard(makeRound());

    await user.click(screen.getByRole("button", { name: "같은 입력으로 다시 생성" }));

    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it("busy면 [같은 입력으로 다시 생성]만 비활성이다", () => {
    renderCard(makeRound(), true);

    expect(screen.getByRole("button", { name: "같은 입력으로 다시 생성" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", { name: /작게 보기|이 시안으로 수정하기/ })) {
      expect(button).toBeEnabled();
    }
  });

  it("받은 장수가 요청보다 적으면 안내한다", () => {
    renderCard(makeRound({ input: { ...makeRound().input, count: 3 } }));

    expect(screen.getByText("요청한 3장 중 2장만 만들어졌어요")).toBeInTheDocument();
  });

  it("요청한 만큼 받으면 부분 결과 안내가 없다", () => {
    renderCard(makeRound());

    expect(screen.queryByText(/장만 만들어졌어요/)).not.toBeInTheDocument();
  });
});

describe("실패", () => {
  const failed = (retryable: boolean) =>
    makeRound({
      status: "error",
      images: [],
      error: { message: "요청이 몰려 있어요. 잠시 후 다시 시도해주세요", retryable },
    });

  it("에러 카드 테두리로 원인과 [다시 시도]·[닫기]를 보여준다", async () => {
    const { user, onRetry, onDismiss } = renderCard(failed(true));

    expect(screen.getByRole("article")).toHaveClass("border-[#ef4444]/60");
    expect(screen.getByText("⚠ 요청이 몰려 있어요. 잠시 후 다시 시도해주세요")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    await user.click(screen.getByRole("button", { name: "닫기" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("retryable이 false면 [다시 시도] 없이 [닫기]만 보여준다", () => {
    renderCard(failed(false));

    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "닫기" })).toBeEnabled();
  });

  it("busy면 [다시 시도]는 비활성이고 [닫기]는 쓸 수 있다", () => {
    renderCard(failed(true), true);

    expect(screen.getByRole("button", { name: "다시 시도" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "닫기" })).toBeEnabled();
  });
});

describe("작게 보기", () => {
  it("고른 시안을 360px·168px로 보여주는 다이얼로그를 열고 닫는다", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const { user } = renderCard(makeRound());

    await user.click(screen.getAllByRole("button", { name: "작게 보기" })[1]);

    const dialog = screen.getByRole("dialog", { name: "작은 화면에서 이렇게 보여요" });
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByText("문구가 이 크기에서도 한눈에 읽히는지 확인해보세요.")).toBeInTheDocument();
    expect(within(dialog).getByText(/약 360px/)).toBeInTheDocument();
    expect(within(dialog).getByText(/약 168px/)).toBeInTheDocument();
    const previews = within(dialog).getAllByRole("img");
    expect(previews).toHaveLength(2);
    for (const img of previews) expect(img).toHaveAttribute("src", IMAGES[1]);

    await user.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(dialog).not.toHaveAttribute("open");
  });
});
