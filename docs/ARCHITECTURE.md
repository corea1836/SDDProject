# 아키텍처

MVP다. 아래 파일 구성이 전부이며, 여기에 없는 파일·추상화·라이브러리를 추가하지 않는다.

## 디렉토리 구조
```
src/
├── app/
│   ├── layout.tsx                    # 루트 레이아웃 + metadata (lang="ko", 다크 배경)
│   ├── page.tsx                      # <ThumbnailStudio />만 렌더
│   └── api/thumbnails/
│       ├── route.ts                  # POST: formData → validateInput → generateThumbnails → JSON
│       └── route.test.ts
├── components/
│   ├── ThumbnailStudio.tsx           # 'use client'. 유일한 상태 보유자. fetch·취소·타이머·이탈 경고·빈 화면 안내
│   ├── ThumbnailForm.tsx             # create·revise 공용 controlled 폼 (설명·문구·사진·개수·예시 칩)
│   ├── RoundCard.tsx                 # 생성 중/완료/실패 카드 + 시안별 다운로드·작게 보기·수정
│   └── *.test.tsx
├── lib/
│   ├── validation.ts                 # 제한 상수 + validateInput / validateImage (서버·클라이언트 공용, 순수 함수)
│   └── validation.test.ts
├── services/
│   ├── thumbnail.ts                  # buildPrompt + generateThumbnails + toUserError. OpenAI SDK를 쓰는 유일한 곳
│   └── thumbnail.test.ts
└── types/
    └── thumbnail.ts                  # 공용 타입
```
테스트는 대상 파일 옆에 `*.test.ts(x)`로 둔다. `.claude/hooks/tdd-guard.sh`가 테스트 파일이 없는 구현 파일 작성을 막는다.

## 패턴
- 페이지는 Server Component(`page.tsx`)이고, 인터랙션은 `ThumbnailStudio` 하나의 Client Component 트리에서 처리한다.
- `ThumbnailForm`과 `RoundCard`는 props만 받는 표현 컴포넌트다. fetch나 전역 상태를 직접 다루지 않고, 동작은 콜백 props로 위임한다.
- 서버 로직은 Route Handler(`route.ts`)가 입력 파싱·검증과 HTTP 응답을 맡고, `services/thumbnail.ts`가 프롬프트 구성·OpenAI 호출·에러 변환을 맡는다.
- 테스트 가능성을 위해 `generateThumbnails`는 OpenAI client를 선택 인자로 주입받는다(기본값은 `OPENAI_API_KEY`로 만든 client).

## 공용 타입 (`src/types/thumbnail.ts`)
```ts
export type Mode = "create" | "revise";
export type Count = 2 | 3 | 4;

export type ThumbnailInput = {
  mode: Mode;
  prompt: string;          // create: 설명, revise: 수정 요청
  caption: string;         // 빈 문자열 = 없음
  image: File | null;      // create: 선택 사진, revise: 기반 시안
  count: Count;
};

export type UserError = { message: string; retryable: boolean };
export type ApiResponse = { images: string[] } | { error: UserError };

export type Round = {
  id: string;
  seq: number;                                   // #라운드 번호
  kind: Mode;
  input: ThumbnailInput;                         // 재생성·다시 시도용 스냅샷
  base?: { seq: number; index: number };         // revise일 때 기반 시안 번호 (#seq-index)
  status: "generating" | "done" | "error";
  images: string[];                              // data URL
  error?: UserError;
  startedAt: number;
};
```

## 핵심 시그니처
```ts
// src/lib/validation.ts
export const MAX_PROMPT_LENGTH = 2000;
export const MAX_CAPTION_LENGTH = 40;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const COUNTS = [2, 3, 4] as const;
export function validateImage(file: File): string | null;                       // 에러 메시지 또는 null
export function validateInput(input: ThumbnailInput): Partial<Record<"prompt" | "caption" | "image" | "count", string>>; // 빈 객체 = 통과

// src/services/thumbnail.ts
export function buildPrompt(input: Pick<ThumbnailInput, "mode" | "prompt" | "caption"> & { hasImage: boolean }): string;
export function generateThumbnails(input: ThumbnailInput, options?: { signal?: AbortSignal; client?: OpenAI }): Promise<string[]>;
export function toUserError(err: unknown): { status: number; error: UserError };
```

## 데이터 흐름
```
ThumbnailForm (입력) ─onSubmit→ ThumbnailStudio
  → validateInput (클라이언트, 실패 시 필드 에러 표시 후 중단)
  → rounds 맨 앞에 generating 라운드 추가
  → fetch POST /api/thumbnails (FormData, AbortController, 180초 타임아웃)
      → route.ts: formData 파싱 → validateInput (실패 시 400)
      → services/thumbnail.ts: buildPrompt → images.generate | images.edit (signal 전달)
      → 성공 { images } / 실패 toUserError → { error } + status
  → 라운드를 done(images) 또는 error(error)로 갱신
  → RoundCard 렌더 (다운로드·작게 보기·수정·다시 생성·다시 시도 콜백은 Studio로)
```

## 상태 관리
- 상태 관리 라이브러리를 쓰지 않는다. `ThumbnailStudio`의 `useState`만 쓴다.
  - `createInput: ThumbnailInput` — 새로 만들기 폼 값. 수정 모드에 들어가도 보존된다.
  - `revise: { input: ThumbnailInput; base: { seq; index; dataUrl } } | null` — null이 아니면 수정 모드다.
  - `rounds: Round[]` — 최신이 앞이다. 메모리에만 두며 새로고침하면 사라진다.
- 진행 중인 요청의 `AbortController`는 `useRef`에 둔다. `generating` 라운드는 동시에 최대 1개다.
- 서버는 상태가 없다. 업로드·생성 이미지를 저장하지 않는다.
