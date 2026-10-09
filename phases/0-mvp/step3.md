# Step 3: studio-page

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` — §1 여정, §2 화면, §3 동작 규칙, §4-2 생성 에러(클라이언트 행)
- `/docs/ARCHITECTURE.md` — 데이터 흐름, 상태 관리
- `/docs/UI_GUIDE.md` — 레이아웃
- `/docs/ADR.md`
- 이전 step 산출물: `/src/types/thumbnail.ts`, `/src/lib/validation.ts`, `/src/app/api/thumbnails/route.ts`, `/src/components/ThumbnailForm.tsx`, `/src/components/RoundCard.tsx`, `/src/app/layout.tsx`, `/src/app/page.tsx`, `/vitest.setup.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

`ThumbnailStudio`로 폼·라운드·API를 연결하고 페이지에 올린다. **테스트(`ThumbnailStudio.test.tsx`)를 먼저 작성**한 뒤 구현하라.

### 1. `src/components/ThumbnailStudio.tsx` (+ `ThumbnailStudio.test.tsx`)
```ts
export default function ThumbnailStudio(): JSX.Element; // 'use client', props 없음
```

**상태** (`useState`만 쓴다. 상태 관리 라이브러리나 별도 reducer 파일은 쓰지 않는다)
- `createInput: ThumbnailInput`. 초기값은 `{ mode: "create", prompt: "", caption: "", image: null, count: 2 }`이다.
- `revise: { input: ThumbnailInput; base: { seq: number; index: number; dataUrl: string } } | null`. null이 아니면 수정 모드다.
- `rounds: Round[]`. 최신이 앞이다. 다음 라운드 번호(seq)는 1부터 증가한다.
- 진행 중 요청의 `AbortController`는 `useRef`에 둔다. `busy = rounds.some(r => r.status === "generating")`.

**동작** (`docs/PRD.md` §3을 그대로 구현)
- **제출**: 현재 모드의 입력(`revise?.input ?? createInput`)으로 시작한다.
  - 입력 스냅샷과 `base`를 담은 generating 라운드를 맨 앞에 추가하고 요청을 보낸다.
  - 폼 값은 어떤 결과에서도 지우지 않는다.
- **요청**:
  - FormData에 `mode`, `prompt`, `caption`, `count`, `image`(있을 때)를 담아 `fetch("/api/thumbnails", { method: "POST", body, signal })`를 보낸다.
  - 180초 타임아웃: `setTimeout`으로 abort하되 사유를 구분할 수 있게 한다.
  - 응답이 ok면 `images`로 done 처리하고, 아니면 응답 JSON의 `error`로 error 처리한다. JSON을 읽을 수 없으면 "이미지 생성 서버에 일시적인 문제가 있어요" / retryable true로 처리한다.
  - fetch 예외:
    - 타임아웃이면 "생성이 너무 오래 걸려 멈췄어요. 시안 개수를 줄이거나 다시 시도해보세요"(retryable)
    - 사용자 취소면 아무것도 하지 않는다(취소 핸들러가 처리).
    - 그 외에는 "인터넷 연결을 확인하고 다시 시도해주세요"(retryable)
- **취소**: abort하고 그 라운드를 목록에서 제거한다.
- **같은 입력으로 다시 생성**: 그 라운드의 `input`과 `base`로 새 라운드를 만든다(입력 패널은 그대로).
- **다시 시도**: 실패 라운드를 목록에서 빼고, 같은 `input`/`base`로 새 generating 라운드를 맨 앞에 추가한다.
- **닫기**: 라운드를 제거한다.
- **이 시안으로 수정하기 (round, index)**:
  - 기반 시안 data URL을 `File`(`image/jpeg`, 이름 `base-{seq}-{index}.jpg`)로 바꿔 `revise.input.image`에 넣는다.
  - 이미 수정 모드였다면 prompt/caption/count는 유지하고 기반만 바꾼다. 처음이면 prompt `""`, caption `""`, count 2다.
  - `createInput`은 건드리지 않는다. 입력 패널로 `scrollIntoView`한다(jsdom에서도 안전하게 optional call).
- **새로 만들기로 돌아가기**: `revise`를 null로 둔다. `createInput`이 그대로 복원되어 보인다.
- **이탈 경고**: generating이나 done 라운드가 1개 이상이면 `beforeunload` 리스너를 등록한다(`preventDefault` + `returnValue` 설정). 조건이 사라지면 해제한다.
- **aria-live**: `role="status"` 영역 하나에 상황별 문구를 쓴다.
  - 시작: "썸네일을 만들고 있어요"
  - 완료: "시안 N장이 만들어졌어요"
  - 실패: 에러 메시지
  - 취소: "생성을 취소했어요"
- 새 라운드가 추가되면 그 카드로 `scrollIntoView`한다(optional call).

**화면** (`docs/PRD.md` §2, `docs/UI_GUIDE.md` 레이아웃)
- 헤더 "썸네일 메이커"를 둔다.
- 그 아래는 `lg:` 2단 그리드다. 좌측은 입력 패널(`lg:w-[380px]`, sticky)에 `ThumbnailForm`, 우측은 결과 패널이다.
- 결과 패널:
  - 라운드가 없으면 3단계 안내를 보여준다: "썸네일, 이렇게 만들어요" / "① 원하는 썸네일을 설명해요" / "② 문구·사진을 더하면 더 정확해요" / "③ 시안을 비교해 고르고 내려받아요".
  - 라운드가 있으면 `RoundCard` 목록을 보여준다.

**테스트** (`global.fetch`를 `vi.fn`으로 mock하고, `@testing-library/user-event`를 쓴다)
1. 첫 화면에 3단계 안내와 예시 칩이 보인다.
2. 설명을 입력하고 제출하면 생성 중 카드가 나오고 버튼이 비활성이 된다. 응답 후 시안 이미지가 보이고, 입력값은 남아 있다.
3. FormData에 mode/prompt/caption/count가 담겨 `/api/thumbnails`로 POST된다.
4. 서버 에러 응답(retryable true)이면 에러 카드와 [다시 시도]가 보인다. 다시 시도하면 새 요청을 보내고, 성공하면 시안이 보인다.
5. retryable false 에러면 [다시 시도]가 없다.
6. fetch가 reject되면(네트워크) 네트워크 메시지가 보인다.
7. 취소하면 카드가 사라지고 "생성을 취소했어요"를 알린다. 입력은 유지된다.
8. 180초가 지나면 타임아웃 메시지가 보인다(`vi.useFakeTimers`).
9. 같은 입력으로 다시 생성하면 이전 라운드는 남고 새 라운드가 맨 위에 추가된다.
10. [이 시안으로 수정하기] → 수정 모드 UI가 나오고, 제출하면 `mode=revise`와 `image`가 전송된다. [돌아가기] 후 이전 create 입력이 복원된다.
11. 결과가 있을 때 `beforeunload` 이벤트가 `preventDefault`된다.

### 2. `src/app/page.tsx`
`<ThumbnailStudio />`만 렌더한다(Server Component). step 0의 placeholder를 대체한다.

### 3. `src/app/layout.tsx`
step 0 설정(lang="ko", metadata, 다크 배경)을 유지한다. 필요하면 UI_GUIDE의 페이지 배경과 기본 텍스트 색만 맞춘다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (새 파일은 `ThumbnailStudio.tsx`와 그 테스트뿐)
   - ADR 기술 스택을 벗어나지 않았는가? (상태 관리·페칭 라이브러리 없음)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (OpenAI 직접 호출 없음, 입력 자동 삭제 없음)
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- data URL을 File로 바꿀 때 `fetch(dataUrl)`를 쓰지 마라. 이유: 테스트의 `fetch` mock과 섞인다. `atob`로 디코딩해 `Uint8Array` → `File`로 만든다.
- 상태를 `localStorage`/`sessionStorage`에 저장하지 마라. 이유: ADR-005(세션 메모리만).
- 별도 hook/reducer/api-client 파일을 만들지 마라. 이유: MVP 파일 구성(CLAUDE.md CRITICAL). 필요하면 같은 파일 안의 함수로 둔다.
- 동시에 두 개 이상 생성 요청을 보내지 마라. 이유: PRD §3 동시 생성 1건.
- 실제 OpenAI API나 실제 네트워크를 호출하는 테스트를 쓰지 마라.
- 기존 테스트를 깨뜨리지 마라.
