# Step 1: thumbnail-api

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` — 특히 §4 검증과 에러, §5 API
- `/docs/ARCHITECTURE.md` — 공용 타입과 핵심 시그니처
- `/docs/ADR.md`
- 이전 step 산출물: `/package.json`, `/vitest.config.ts`, `/vitest.setup.ts`, `/tsconfig.json`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

서버 쪽 전체(타입 → 검증 → 서비스 → 라우트)를 만든다. 각 파일은 **테스트를 먼저 작성**한 뒤 구현하라. TDD guard 훅이 테스트 없는 구현 파일 작성을 막는다.

### 1. `src/types/thumbnail.ts`
`docs/ARCHITECTURE.md`의 "공용 타입"을 그대로 정의한다(`Mode`, `Count`, `ThumbnailInput`, `UserError`, `ApiResponse`, `Round`).

### 2. `src/lib/validation.ts` (+ `validation.test.ts`, node 환경)
```ts
export const MAX_PROMPT_LENGTH = 2000;
export const MAX_CAPTION_LENGTH = 40;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const COUNTS = [2, 3, 4] as const;
export function validateImage(file: File): string | null;
export function validateInput(input: ThumbnailInput): Partial<Record<"prompt" | "caption" | "image" | "count", string>>;
```
- 메시지와 규칙은 `docs/PRD.md` §4-1 표를 **문구까지 정확히** 따른다.
- 길이는 trim한 값으로 잰다.
- 빈 프롬프트 메시지는 mode에 따라 다르다.
- `image`는 create에서는 선택(있으면 `validateImage`), revise에서는 필수("수정할 시안이 없어요")다.
- count가 `COUNTS`에 없으면 count 에러를 낸다.
- 순수 함수다. 브라우저 전용 API를 쓰지 않는다. 클라이언트에서도 import되기 때문이다.

### 3. `src/services/thumbnail.ts` (+ `thumbnail.test.ts`, node 환경)
```ts
export function buildPrompt(input: Pick<ThumbnailInput, "mode" | "prompt" | "caption"> & { hasImage: boolean }): string;
export function generateThumbnails(input: ThumbnailInput, options?: { signal?: AbortSignal; client?: OpenAI }): Promise<string[]>;
export function toUserError(err: unknown): { status: number; error: UserError };
```
- 상수는 모듈 상단에 둔다: `MODEL = "gpt-image-2.5-flare"`, `SIZE = "1280x720"`, `QUALITY = "high"`, `OUTPUT_FORMAT = "jpeg"`.
- **buildPrompt**: `docs/PRD.md` §5 "프롬프트 템플릿"을 따른다. 지시문은 영어로 써도 되지만 다음은 반드시 지킨다.
  - 사용자 prompt와 caption은 **원문 그대로**(번역·수정 없이) 포함한다. caption은 따옴표로 감싼다.
  - mode(create/revise) × caption 유무 × hasImage 조합별로 PRD에 적힌 지시가 들어가는지 테스트로 고정한다.
- **generateThumbnails**:
  - `input.image`가 없으면 `client.images.generate`, 있으면 `client.images.edit`(`image: input.image`)를 호출한다.
  - 공통 파라미터는 `model`, `prompt: buildPrompt(...)`, `n: input.count`, `size`, `quality`, `output_format`이다. 두 번째 인자(request options)로 `{ signal }`을 넘긴다.
  - 응답 `data[].b64_json`을 `data:image/jpeg;base64,...` 배열로 바꿔 반환한다. `b64_json`이 없는 항목은 건너뛴다.
  - client를 주입받지 않았으면 함수 안에서 `new OpenAI({ maxRetries: 0 })`로 만든다.
  - `OPENAI_API_KEY`가 비어 있으면 OpenAI를 호출하기 전에 에러를 던진다. `toUserError`는 이 에러를 500 "서비스 설정" 에러로 바꿔야 한다(구현 방식은 자유, 테스트로 고정).
- **toUserError**: `docs/PRD.md` §4-2 표의 HTTP status, message(문구 정확히), retryable을 그대로 매핑한다.
  - OpenAI SDK의 `APIError` 계열에서 `status`와 `code`를 읽는다.
  - `code`가 `moderation_blocked` 또는 `content_policy_violation`이면 422다.
  - 429이면서 `code`가 `insufficient_quota`이면 500 서비스 설정 에러, 그 외 429는 429다.
  - 401/403은 500이다.
  - 그 밖의 모든 에러(알 수 없는 값 포함)는 502다.
- 테스트는 가짜 client 객체(`images.generate`/`images.edit`를 `vi.fn()`으로)를 주입해 쓴다. generate/edit 분기, 전달 파라미터, signal 전달, data URL 변환, 키 누락, 에러 매핑 표의 모든 행을 검증한다.
- SDK 타입이 `"1280x720"`이나 모델명·quality 값을 허용하지 않아 타입 에러가 나면, 먼저 최신 `openai` 버전인지 확인하라. 그래도 안 되면 그 파라미터에만 최소한의 타입 단언을 쓴다.

### 4. `src/app/api/thumbnails/route.ts` (+ `route.test.ts`, node 환경)
```ts
export async function POST(request: Request): Promise<Response>;
```
1. `await request.formData()`를 읽는다. 실패하면 400 `{ error: { message: "요청 형식이 올바르지 않아요", retryable: false } }`를 반환한다.
2. 각 필드를 `ThumbnailInput`으로 변환한다.
   - `mode`는 `"revise"`일 때만 revise이고, 나머지는 create다.
   - `prompt`와 `caption`은 문자열이 아니면 `""`로 둔다.
   - `count`는 숫자로 변환하고, 없으면 2다.
   - `image`는 `File`이고 size > 0일 때만 쓰고, 아니면 null이다.
3. `validateInput`이 에러를 반환하면 400과 함께 첫 번째 에러 메시지를 `retryable: false`로 보낸다.
4. `generateThumbnails(input, { signal: request.signal })`를 호출한다. 성공하면 200 `{ images }`를 반환한다.
5. 예외가 나면 `toUserError`로 변환해 그 status와 `{ error }`를 반환한다. `console.error`에는 status와 upstream status 정도만 남기고 프롬프트 내용은 남기지 않는다.
- 테스트에서는 `vi.mock`으로 `@/services/thumbnail`의 `generateThumbnails`만 mock하고 `toUserError`는 실제 구현을 쓴다. 이렇게 200/400/422/429/500/502 응답의 status와 JSON 형태를 검증한다. FormData는 `new Request(url, { method: "POST", body: formData })`로 만든다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (이 step에서 만든 파일은 위 4개와 각 테스트뿐)
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (OpenAI import는 `services/thumbnail.ts`에만, 원문 에러 비노출)
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 테스트에서 실제 OpenAI API를 호출하지 마라. 이유: 비용이 발생하고 키가 없다. `.env.local`을 만들지 마라.
- 모듈 최상위에서 OpenAI client를 생성하지 마라. 이유: 키가 없는 빌드·테스트 환경에서는 import만으로 throw된다.
- 서버에 이미지를 저장하지 마라(디스크·메모리 캐시 포함). 이유: CLAUDE.md CRITICAL(stateless).
- SDK 자동 재시도를 켜거나 서버 타임아웃·재시도 로직을 추가하지 마라. 이유: ADR-006.
- 에러 코드 enum이나 별도 에러 파일(`lib/errors.ts` 등)을 만들지 마라. 이유: ADR-007, MVP 파일 구성.
- UI 컴포넌트를 만들지 마라. 이유: step 2~3의 범위다.
- 기존 테스트를 깨뜨리지 마라.
