"use client";

import { useEffect, useRef, useState } from "react";
import type { ApiResponse, Round, ThumbnailInput, UserError } from "@/types/thumbnail";
import RoundCard from "./RoundCard";
import ThumbnailForm from "./ThumbnailForm";

type Base = { seq: number; index: number; dataUrl: string };

const TIMEOUT_MS = 180_000;
const TIMEOUT_REASON = "timeout";
const EMPTY_INPUT: ThumbnailInput = { mode: "create", prompt: "", caption: "", image: null, count: 2 };
const SERVER_ERROR: UserError = { message: "이미지 생성 서버에 일시적인 문제가 있어요", retryable: true };
const NETWORK_ERROR: UserError = { message: "인터넷 연결을 확인하고 다시 시도해주세요", retryable: true };
const TIMEOUT_ERROR: UserError = {
  message: "생성이 너무 오래 걸려 멈췄어요. 시안 개수를 줄이거나 다시 시도해보세요",
  retryable: true,
};
const STEPS = ["① 원하는 썸네일을 설명해요", "② 문구·사진을 더하면 더 정확해요", "③ 시안을 비교해 고르고 내려받아요"];

function toFormData(input: ThumbnailInput): FormData {
  const body = new FormData();
  body.set("mode", input.mode);
  body.set("prompt", input.prompt);
  body.set("caption", input.caption);
  body.set("count", String(input.count));
  if (input.image) body.set("image", input.image);
  return body;
}

// 본문을 JSON으로 읽지 못하거나 형식이 다르면 서버 쪽 일시 오류로 본다.
async function postThumbnails(input: ThumbnailInput, signal: AbortSignal): Promise<ApiResponse> {
  const res = await fetch("/api/thumbnails", { method: "POST", body: toFormData(input), signal });
  const data: Partial<{ images: string[]; error: UserError }> | null = await res.json().catch(() => null);
  if (res.ok && data?.images) return { images: data.images };
  if (!res.ok && data?.error) return { error: data.error };
  return { error: SERVER_ERROR };
}

// fetch(dataUrl)를 쓰지 않고 atob로 디코딩한다(테스트의 fetch mock과 섞이지 않도록).
function dataUrlToFile(dataUrl: string, name: string): File {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return new File([Uint8Array.from(binary, (char) => char.charCodeAt(0))], name, { type: "image/jpeg" });
}

// 라운드 카드는 추가될 때 한 번만 마운트되므로, 마운트 시점에 스크롤하면 새 카드로 이동한다.
function scrollIntoViewOnMount(el: HTMLElement | null) {
  el?.scrollIntoView?.({ block: "nearest" });
}

export default function ThumbnailStudio() {
  const [createInput, setCreateInput] = useState<ThumbnailInput>(EMPTY_INPUT);
  const [revise, setRevise] = useState<{ input: ThumbnailInput; base: Base } | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const nextSeqRef = useRef(1);
  const panelRef = useRef<HTMLElement>(null);

  const busy = rounds.some((r) => r.status === "generating");
  const hasResults = rounds.some((r) => r.status !== "error");

  useEffect(() => {
    if (!hasResults) return;
    function warn(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = true; // preventDefault를 무시하는 구형 브라우저용
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasResults]);

  // replaceId: 다시 시도할 때 목록에서 빼는 실패 라운드
  async function generate(input: ThumbnailInput, base?: Round["base"], replaceId?: string) {
    if (controllerRef.current) return; // 동시 생성은 1건뿐이다
    const controller = new AbortController();
    controllerRef.current = controller;
    const seq = nextSeqRef.current++;
    const id = `round-${seq}`;
    const round: Round = { id, seq, kind: input.mode, input, base, status: "generating", images: [], startedAt: Date.now() };
    setRounds((prev) => [round, ...prev.filter((r) => r.id !== replaceId)]);
    setAnnouncement("썸네일을 만들고 있어요");

    const timer = setTimeout(() => controller.abort(TIMEOUT_REASON), TIMEOUT_MS);
    const result = await postThumbnails(input, controller.signal).catch((): ApiResponse => ({ error: NETWORK_ERROR }));
    clearTimeout(timer);
    if (controllerRef.current === controller) controllerRef.current = null;

    const timedOut = controller.signal.reason === TIMEOUT_REASON;
    // 사용자 취소면 cancel이 이미 카드를 지우고 알렸다.
    if (controller.signal.aborted && !timedOut) return;
    const outcome: ApiResponse = timedOut ? { error: TIMEOUT_ERROR } : result;
    const patch: Partial<Round> =
      "images" in outcome ? { status: "done", images: outcome.images } : { status: "error", error: outcome.error };
    setRounds((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setAnnouncement("images" in outcome ? `시안 ${outcome.images.length}장이 만들어졌어요` : outcome.error.message);
  }

  function submit() {
    if (revise) generate(revise.input, { seq: revise.base.seq, index: revise.base.index });
    else generate(createInput);
  }

  function removeRound(id: string) {
    setRounds((prev) => prev.filter((r) => r.id !== id));
  }

  function cancel(id: string) {
    controllerRef.current?.abort();
    controllerRef.current = null;
    removeRound(id);
    setAnnouncement("생성을 취소했어요");
  }

  function startRevise(round: Round, index: number) {
    const dataUrl = round.images[index - 1];
    const image = dataUrlToFile(dataUrl, `base-${round.seq}-${index}.jpg`);
    // 이미 수정 모드면 수정 요청·새 문구·개수는 두고 기반 시안만 바꾼다. createInput은 건드리지 않는다.
    setRevise((prev) => ({
      input: { ...(prev?.input ?? { ...EMPTY_INPUT, mode: "revise" }), image },
      base: { seq: round.seq, index, dataUrl },
    }));
    panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
      <header>
        <h1 className="text-lg font-semibold text-white">썸네일 메이커</h1>
      </header>

      <main className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
        <section
          ref={panelRef}
          aria-label="입력"
          className="rounded-lg border border-neutral-800 bg-[#141414] p-5 lg:sticky lg:top-6 lg:w-[380px]"
        >
          <ThumbnailForm
            value={revise?.input ?? createInput}
            onChange={(next) => (revise ? setRevise({ ...revise, input: next }) : setCreateInput(next))}
            onSubmit={submit}
            busy={busy}
            base={revise?.base}
            onExitRevise={() => setRevise(null)}
          />
        </section>

        <section aria-label="결과" className="min-w-0">
          {rounds.length === 0 ? (
            <div>
              <h2 className="text-sm font-medium text-neutral-200">썸네일, 이렇게 만들어요</h2>
              <ol className="mt-3 space-y-2 text-sm leading-relaxed text-neutral-300">
                {STEPS.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="space-y-4">
              {rounds.map((round) => (
                <div key={round.id} ref={scrollIntoViewOnMount}>
                  <RoundCard
                    round={round}
                    busy={busy}
                    onCancel={() => cancel(round.id)}
                    onRegenerate={() => generate(round.input, round.base)}
                    onRetry={() => generate(round.input, round.base, round.id)}
                    onDismiss={() => removeRound(round.id)}
                    onRevise={(index) => startRevise(round, index)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
