"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  ALLOWED_IMAGE_TYPES,
  COUNTS,
  MAX_CAPTION_LENGTH,
  MAX_IMAGE_BYTES,
  MAX_PROMPT_LENGTH,
  validateImage,
  validateInput,
} from "@/lib/validation";
import type { ThumbnailInput } from "@/types/thumbnail";

type ThumbnailFormProps = {
  value: ThumbnailInput; // value.mode로 create/revise 표시 결정
  onChange: (next: ThumbnailInput) => void;
  onSubmit: () => void; // 검증 통과 시에만 호출
  busy: boolean; // 생성 중이면 제출 버튼 비활성
  base?: { seq: number; index: number; dataUrl: string }; // revise 모드의 기반 시안
  onExitRevise?: () => void;
};

type FieldErrors = ReturnType<typeof validateInput>;

const EXAMPLES = [
  {
    label: "게임",
    prompt: "어두운 던전에서 거대한 드래곤과 마주 선 게임 캐릭터, 붉은 조명과 강한 대비, 캐릭터는 왼쪽에 크게",
    caption: "보스 1분 컷",
  },
  {
    label: "요리",
    prompt: "나무 도마 위에 김이 모락모락 나는 김치찌개 클로즈업, 따뜻한 조명, 음식이 화면 대부분을 차지하게",
    caption: "10분 김치찌개",
  },
  {
    label: "재테크",
    prompt: "밝은 배경에 놀란 표정의 사람이 오른쪽에 크게, 왼쪽에는 위로 치솟는 초록색 그래프",
    caption: "월급 외 수입 만들기",
  },
];

const MULTIPLE_PHOTOS_NOTICE = "사진은 1장만 쓸 수 있어 첫 번째 사진만 올렸어요";
const LABEL = "block text-sm font-medium text-neutral-200";
const TEXT_BUTTON = "text-sm text-neutral-400 hover:text-neutral-200";

function fieldClass(error?: string) {
  return `mt-2 w-full rounded-md border bg-neutral-900 px-3 py-2.5 text-neutral-100 placeholder:text-neutral-500 focus:outline-none ${
    error ? "border-[#ef4444]" : "border-neutral-800 focus:border-neutral-500"
  }`;
}

export default function ThumbnailForm({ value, onChange, onSubmit, busy, base, onExitRevise }: ThumbnailFormProps) {
  const revise = value.mode === "revise";
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorsMode, setErrorsMode] = useState(value.mode);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const captionRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  // 모드가 바뀌면 이전 모드에서 난 에러는 보여주지 않는다.
  if (errorsMode !== value.mode) {
    setErrorsMode(value.mode);
    setErrors({});
  }

  function change(patch: Partial<ThumbnailInput>) {
    // 사용자가 고친 필드의 에러만 지운다.
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof FieldErrors)[]) delete next[key];
      return next;
    });
    onChange({ ...value, ...patch });
  }

  function attachPhoto(files: File[]) {
    const [file] = files;
    if (!file) return;
    const error = validateImage(file);
    if (error) {
      // 첨부를 거부하고 기존 사진은 그대로 둔다.
      setErrors((prev) => ({ ...prev, image: error }));
      setPhotoNotice(null);
      return;
    }
    setPhotoNotice(files.length > 1 ? MULTIPLE_PHOTOS_NOTICE : null);
    change({ image: file });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    attachPhoto(Array.from(e.dataTransfer.files));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const found = validateInput(value);
    setErrors(found);
    const firstInvalid = found.prompt ? promptRef : found.caption ? captionRef : found.image ? photoRef : null;
    firstInvalid?.current?.focus();
    if (Object.keys(found).length === 0) onSubmit();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {revise && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium text-neutral-200">시안 수정</h2>
            <button type="button" onClick={onExitRevise} className={TEXT_BUTTON}>
              ← 새로 만들기로 돌아가기
            </button>
          </div>
          {base && (
            <div className="flex items-center gap-3">
              <Image
                src={base.dataUrl}
                alt={`기반 시안 #${base.seq}-${base.index}`}
                width={1280}
                height={720}
                className="aspect-video h-auto w-32 shrink-0 rounded-md object-cover"
              />
              <div>
                <p className="text-sm text-neutral-200">
                  기반 시안 #{base.seq}-{base.index}
                </p>
                <p className="mt-1 text-xs text-neutral-400">이 시안을 바탕으로 바꿀 부분만 고쳐요</p>
              </div>
            </div>
          )}
          {errors.image && <p className="text-xs text-[#ef4444]">{errors.image}</p>}
        </div>
      )}

      <div>
        <label htmlFor="thumbnail-prompt" className={LABEL}>
          {revise ? "무엇을 바꿀까요?" : "어떤 썸네일을 원하세요?"} *
        </label>
        <textarea
          id="thumbnail-prompt"
          ref={promptRef}
          rows={4}
          value={value.prompt}
          onChange={(e) => change({ prompt: e.target.value })}
          placeholder={
            revise ? "예) 문구를 더 크게, 배경을 빨간색으로" : "예) 어두운 우주 배경에 놀란 표정의 내 얼굴을 오른쪽에 크게"
          }
          aria-invalid={errors.prompt ? true : undefined}
          aria-describedby={errors.prompt ? "thumbnail-prompt-error" : undefined}
          className={fieldClass(errors.prompt)}
        />
        <FieldFooter
          errorId="thumbnail-prompt-error"
          error={errors.prompt}
          length={value.prompt.length}
          max={MAX_PROMPT_LENGTH}
        />
      </div>

      {!revise && value.prompt === "" && value.caption === "" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-neutral-400">예시로 시작:</span>
          {EXAMPLES.map((example) => (
            <button
              key={example.label}
              type="button"
              onClick={() => change({ prompt: example.prompt, caption: example.caption })}
              className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            >
              {example.label}
            </button>
          ))}
        </div>
      )}

      <div>
        <label htmlFor="thumbnail-caption" className={LABEL}>
          {revise ? "새 문구 (선택 · 비우면 기존 문구 유지)" : "썸네일 문구 (선택 · 15자 이내 권장)"}
        </label>
        <input
          id="thumbnail-caption"
          ref={captionRef}
          type="text"
          value={value.caption}
          onChange={(e) => change({ caption: e.target.value })}
          aria-invalid={errors.caption ? true : undefined}
          aria-describedby={errors.caption ? "thumbnail-caption-error" : undefined}
          className={fieldClass(errors.caption)}
        />
        <FieldFooter
          errorId="thumbnail-caption-error"
          error={errors.caption}
          length={value.caption.length}
          max={MAX_CAPTION_LENGTH}
        />
      </div>

      {!revise && (
        <div>
          <label htmlFor="thumbnail-photo" className={LABEL}>
            사진 (선택 · 1장)
          </label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={`mt-2 rounded-md border border-dashed bg-neutral-900 px-4 py-6 text-sm text-neutral-400 focus-within:border-neutral-500 ${
              dragging ? "border-neutral-400" : "border-neutral-700"
            }`}
          >
            <input
              id="thumbnail-photo"
              ref={photoRef}
              type="file"
              accept={ALLOWED_IMAGE_TYPES.join(",")}
              onChange={(e) => {
                attachPhoto(Array.from(e.target.files ?? []));
                // 같은 파일을 지웠다가 다시 골라도 change가 일어나도록 비운다.
                e.target.value = "";
              }}
              aria-invalid={errors.image ? true : undefined}
              aria-describedby={errors.image ? "thumbnail-photo-error" : undefined}
              className="sr-only"
            />
            {value.image ? (
              <div className="flex items-center gap-3">
                <PhotoPreview file={value.image} />
                <span className="min-w-0 flex-1 truncate text-neutral-300">{value.image.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPhotoNotice(null);
                    change({ image: null });
                  }}
                  className={TEXT_BUTTON}
                >
                  삭제
                </button>
              </div>
            ) : (
              <label htmlFor="thumbnail-photo" className="block cursor-pointer">
                끌어다 놓거나 클릭해서 올리기
                <span className="mt-1 block text-xs text-neutral-500">
                  PNG·JPG·WEBP, {MAX_IMAGE_BYTES / (1024 * 1024)}MB 이하
                </span>
              </label>
            )}
          </div>
          {errors.image && (
            <p id="thumbnail-photo-error" className="mt-1.5 text-xs text-[#ef4444]">
              {errors.image}
            </p>
          )}
          {photoNotice && <p className="mt-1.5 text-xs text-neutral-400">{photoNotice}</p>}
          {value.image && <p className="mt-1.5 text-xs text-neutral-400">얼굴이 잘 보이는 정면 사진일수록 좋아요</p>}
        </div>
      )}

      <fieldset>
        <legend className={LABEL}>시안 개수</legend>
        <div className="mt-2 flex gap-2">
          {COUNTS.map((count) => (
            <label
              key={count}
              className={`cursor-pointer rounded-md border px-4 py-1.5 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-neutral-400 ${
                value.count === count
                  ? "border-white bg-white text-black"
                  : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
              }`}
            >
              <input
                type="radio"
                name="thumbnail-count"
                value={count}
                checked={value.count === count}
                onChange={() => change({ count })}
                className="sr-only"
              />
              {count}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-neutral-400">시안이 많을수록 오래 걸려요</p>
      </fieldset>

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-white px-4 py-2.5 font-medium text-black hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-400"
      >
        {busy ? "만드는 중…" : revise ? "수정 시안 만들기" : "썸네일 만들기"}
      </button>
    </form>
  );
}

function FieldFooter({ errorId, error, length, max }: { errorId: string; error?: string; length: number; max: number }) {
  return (
    <div className="mt-1.5 flex gap-3 text-xs">
      {error && (
        <p id={errorId} className="text-[#ef4444]">
          {error}
        </p>
      )}
      <span className={`ml-auto shrink-0 ${length > max ? "text-[#ef4444]" : "text-neutral-400"}`}>
        {length}/{max}
      </span>
    </div>
  );
}

// 객체 URL은 effect에서 img에 직접 붙이고, 사진이 바뀌거나 언마운트되면 해제한다.
function PhotoPreview({ file }: { file: File }) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const url = URL.createObjectURL(file);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // eslint-disable-next-line @next/next/no-img-element -- src를 effect에서 객체 URL로 붙이므로 next/image를 쓸 수 없다
  return <img ref={imgRef} alt="첨부한 사진 미리보기" className="h-12 w-12 shrink-0 rounded object-cover" />;
}
