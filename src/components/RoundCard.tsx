"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import type { Round } from "@/types/thumbnail";

type RoundCardProps = {
  round: Round;
  busy: boolean; // 어떤 라운드든 생성 중이면 true → [같은 입력으로 다시 생성]/[다시 시도] 비활성
  onCancel: () => void;
  onRegenerate: () => void; // 같은 입력으로 다시 생성
  onRetry: () => void;
  onDismiss: () => void;
  onRevise: (index: number) => void; // 이 시안으로 수정하기. index는 1부터 (#seq-index 표기와 동일)
};

const SUMMARY_LENGTH = 40;
const SECONDARY_BUTTON =
  "rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800 disabled:text-neutral-500 disabled:hover:bg-transparent";
const TEXT_BUTTON = "text-sm text-neutral-400 hover:text-neutral-200";
const THUMBNAIL = "aspect-video h-auto w-full rounded-md object-cover";

function excerpt(text: string) {
  const trimmed = text.trim();
  return trimmed.length > SUMMARY_LENGTH ? `${trimmed.slice(0, SUMMARY_LENGTH)}…` : trimmed;
}

function summarize({ kind, input }: Round) {
  const caption = input.caption.trim();
  const parts = [`"${excerpt(input.prompt)}"`];
  if (caption) parts.push(`${kind === "revise" ? "새 문구" : "문구"}: ${caption}`);
  // revise의 image는 기반 시안이므로 "사진 첨부"로 표시하지 않는다.
  if (kind === "create" && input.image) parts.push("사진 첨부");
  return parts.join(" · ");
}

export default function RoundCard({ round, busy, onCancel, onRegenerate, onRetry, onDismiss, onRevise }: RoundCardProps) {
  const { seq, status, input, images, error } = round;
  const [smallIndex, setSmallIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();

  const title = round.base ? `#${seq} 수정 · 기반 #${round.base.seq}-${round.base.index}` : `#${seq} 새로 만들기`;
  const smallUrl = smallIndex === null ? null : images[smallIndex - 1];

  function openSmall(index: number) {
    setSmallIndex(index);
    dialogRef.current?.showModal();
  }

  return (
    <article
      className={`rounded-lg border bg-[#141414] p-5 ${status === "error" ? "border-[#ef4444]/60" : "border-neutral-800"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-neutral-200">
            {title} · {status === "error" ? "실패" : `${input.count}장`}
          </h2>
          <p className="mt-1 truncate text-xs text-neutral-400">{summarize(round)}</p>
        </div>
        {status === "generating" && (
          <div className="flex shrink-0 items-center gap-3 text-xs text-neutral-400">
            <Elapsed startedAt={round.startedAt} />
            <button type="button" onClick={onCancel} className={TEXT_BUTTON}>
              취소
            </button>
          </div>
        )}
        {status === "done" && (
          <button type="button" onClick={onRegenerate} disabled={busy} className={SECONDARY_BUTTON}>
            같은 입력으로 다시 생성
          </button>
        )}
        {status === "error" && (
          <button type="button" onClick={onDismiss} className={TEXT_BUTTON}>
            닫기
          </button>
        )}
      </div>

      {status === "generating" && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: input.count }, (_, i) => (
            <div key={i} className="aspect-video animate-pulse rounded-md bg-neutral-900" />
          ))}
        </div>
      )}

      {status === "done" && (
        <>
          {images.length < input.count && (
            <p className="mt-3 text-xs text-neutral-400">
              요청한 {input.count}장 중 {images.length}장만 만들어졌어요
            </p>
          )}
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {images.map((url, i) => {
              const index = i + 1;
              return (
                <li key={index} className="space-y-2">
                  <Image src={url} alt={`시안 #${seq}-${index}`} width={1280} height={720} className={THUMBNAIL} />
                  <div className="flex flex-wrap gap-2">
                    <a href={url} download={`thumbnail-${seq}-${index}.jpg`} className={SECONDARY_BUTTON}>
                      다운로드
                    </a>
                    <button type="button" onClick={() => openSmall(index)} className={SECONDARY_BUTTON}>
                      작게 보기
                    </button>
                    <button type="button" onClick={() => onRevise(index)} className={SECONDARY_BUTTON}>
                      이 시안으로 수정하기
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <dialog
            ref={dialogRef}
            aria-labelledby={dialogTitleId}
            className="m-auto rounded-lg border border-neutral-800 bg-[#141414] p-5 text-neutral-300 backdrop:bg-black/70"
          >
            <div className="flex items-center justify-between gap-6">
              <h3 id={dialogTitleId} className="text-sm font-medium text-neutral-200">
                작은 화면에서 이렇게 보여요
              </h3>
              <button type="button" onClick={() => dialogRef.current?.close()} className={TEXT_BUTTON}>
                닫기
              </button>
            </div>
            {smallUrl && (
              <div className="mt-4 flex flex-wrap items-start gap-6">
                <figure className="w-[360px] shrink-0">
                  <Image
                    src={smallUrl}
                    alt={`시안 #${seq}-${smallIndex} 약 360px`}
                    width={1280}
                    height={720}
                    className={THUMBNAIL}
                  />
                  <TitleBars className="mt-2" />
                  <figcaption className="mt-2 text-xs text-neutral-400">약 360px (모바일 피드)</figcaption>
                </figure>
                <figure>
                  <div className="flex gap-2">
                    <Image
                      src={smallUrl}
                      alt={`시안 #${seq}-${smallIndex} 약 168px`}
                      width={1280}
                      height={720}
                      className="aspect-video h-auto w-[168px] shrink-0 rounded-md object-cover"
                    />
                    <TitleBars className="w-28" />
                  </div>
                  <figcaption className="mt-2 text-xs text-neutral-400">약 168px (추천 영상 목록)</figcaption>
                </figure>
              </div>
            )}
            <p className="mt-4 text-xs text-neutral-400">문구가 이 크기에서도 한눈에 읽히는지 확인해보세요.</p>
          </dialog>
        </>
      )}

      {status === "error" && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-[#ef4444]">⚠ {error?.message}</p>
          {error?.retryable && (
            <button type="button" onClick={onRetry} disabled={busy} className={SECONDARY_BUTTON}>
              다시 시도
            </button>
          )}
        </div>
      )}
    </article>
  );
}

function Elapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return <span>{Math.floor((now - startedAt) / 1000)}초 경과 · 보통 30초~2분</span>;
}

// 영상 제목 자리. 유튜브 UI를 흉내 내지 않고 회색 막대만 둔다.
function TitleBars({ className }: { className: string }) {
  return (
    <div aria-hidden className={`space-y-1.5 ${className}`}>
      <div className="h-2.5 w-full rounded-sm bg-neutral-700" />
      <div className="h-2.5 w-2/3 rounded-sm bg-neutral-700" />
    </div>
  );
}
