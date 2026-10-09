# Step 2: ui-components

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/PRD.md` — 특히 §2 화면, §3 동작 규칙, §4-1 입력 검증
- `/docs/UI_GUIDE.md` — 색상·컴포넌트 클래스·레이아웃·애니메이션 제한
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md`
- 이전 step 산출물: `/src/types/thumbnail.ts`, `/src/lib/validation.ts`, `/vitest.config.ts`, `/vitest.setup.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

props만 받는 표현 컴포넌트 2개를 만든다. 둘 다 `'use client'`다. 각 컴포넌트는 **테스트(`*.test.tsx`)를 먼저 작성**한 뒤 구현하라. fetch, 라운드 목록 관리, 전역 상태는 step 3의 `ThumbnailStudio` 몫이다.

### 1. `src/components/ThumbnailForm.tsx` (+ `ThumbnailForm.test.tsx`)
```ts
type ThumbnailFormProps = {
  value: ThumbnailInput;                                      // value.mode로 create/revise 표시 결정
  onChange: (next: ThumbnailInput) => void;
  onSubmit: () => void;                                       // 검증 통과 시에만 호출
  busy: boolean;                                              // 생성 중이면 제출 버튼 비활성
  base?: { seq: number; index: number; dataUrl: string };     // revise 모드의 기반 시안
  onExitRevise?: () => void;
};
```
- **controlled 폼**이다. 필드 값은 `value`/`onChange`로만 다룬다. 자체 state는 필드 에러 메시지, 사진 안내 메시지, 미리보기 URL 같은 UI 상태에만 쓴다.
- **create 모드**(`docs/PRD.md` §2-1):
  - 설명 textarea(필수)와 `n/2000` 카운터를 둔다.
  - 예시 칩 [게임][요리][재테크]는 prompt와 caption이 **둘 다 비어 있을 때만** 보인다. 클릭하면 컴포넌트 안 상수에 정의한 예시 prompt+caption을 채운다.
  - 문구 input과 `n/40` 카운터, 라벨 "썸네일 문구 (선택 · 15자 이내 권장)"를 둔다.
  - 사진 드롭존을 둔다.
  - 시안 개수 라디오 그룹(2/3/4)과 "시안이 많을수록 오래 걸려요" 힌트를 둔다.
  - 제출 버튼 라벨은 "썸네일 만들기"다.
- **revise 모드**(§2-3):
  - 상단에 기반 시안 이미지, "기반 시안 #seq-index", [← 새로 만들기로 돌아가기](`onExitRevise`)를 둔다.
  - 라벨은 "무엇을 바꿀까요?"와 "새 문구 (선택 · 비우면 기존 문구 유지)"다.
  - 사진 드롭존과 예시 칩은 숨긴다.
  - 제출 버튼 라벨은 "수정 시안 만들기"다.
- **제출**:
  - 버튼은 `busy`일 때만 비활성이고, 라벨은 "만드는 중…"이다.
  - 제출하면 `validateInput(value)`로 검사한다. 에러가 있으면 각 필드 아래에 메시지를 보여주고, 첫 오류 필드(prompt → caption → image 순)로 포커스를 옮긴다. 이때 `onSubmit`은 호출하지 않는다.
  - 필드 에러는 `aria-describedby`로 연결한다. 해당 필드가 바뀌면 그 필드의 에러를 지운다.
- **카운터**: 제한을 넘으면 카운터에 에러 색(#ef4444)을 쓴다. 입력 자체를 잘라내지는 않는다.
- **사진** (create 모드):
  - 파일 input은 `accept="image/png,image/jpeg,image/webp"`이고, 클릭과 드래그앤드롭을 모두 지원한다.
  - 파일이 들어오면 `validateImage`로 검사한다. 실패하면 첨부하지 않고(기존 사진 유지) 드롭존 아래에 메시지를 띄운다.
  - 여러 장을 드롭하면 첫 장만 쓰고 "사진은 1장만 쓸 수 있어 첫 번째 사진만 올렸어요"를 안내한다.
  - 첨부되면 미리보기(`URL.createObjectURL`, 교체·언마운트 시 revoke), 파일명, [삭제]를 보여주고 "얼굴이 잘 보이는 정면 사진일수록 좋아요" 팁을 붙인다.
- 테스트(`@testing-library/user-event`): 모드별 표시 요소, 칩 노출 조건과 채우기, 빈 prompt 제출 시 메시지+포커스+`onSubmit` 미호출, 정상 제출 시 `onSubmit` 호출, 2000/40자 초과, 잘못된 형식·10MB 초과 사진 거부(기존 사진 유지), 다중 드롭 시 첫 장만, 삭제, `busy` 시 버튼 비활성, `onExitRevise` 호출.
  - jsdom에는 `URL.createObjectURL`/`revokeObjectURL`이 없으므로 테스트에서 stub한다.

### 2. `src/components/RoundCard.tsx` (+ `RoundCard.test.tsx`)
```ts
type RoundCardProps = {
  round: Round;
  busy: boolean;                         // 어떤 라운드든 생성 중이면 true → [같은 입력으로 다시 생성]/[다시 시도] 비활성
  onCancel: () => void;
  onRegenerate: () => void;              // 같은 입력으로 다시 생성
  onRetry: () => void;
  onDismiss: () => void;
  onRevise: (index: number) => void;     // 이 시안으로 수정하기. index는 1부터 (#seq-index 표기와 동일)
};
```
- **헤더**: `#seq 새로 만들기` 또는 `#seq 수정 · 기반 #x-y`를 쓰고, 뒤에 `· N장`(N = `round.input.count`)을 붙인다. 실패하면 `· 실패`를 붙인다.
- **입력 요약 한 줄**: create는 설명 앞부분(약 40자에서 말줄임), "문구: …", "사진 첨부"다. revise는 수정 요청 앞부분과 "새 문구: …"다. 없는 항목은 생략한다.
- **generating**: count만큼 16:9 자리표시자(`animate-pulse`)를 보여준다. "{n}초 경과 · 보통 30초~2분"은 컴포넌트 내부 interval로 1초마다 `round.startedAt` 기준으로 갱신한다. [취소]는 `onCancel`이다.
- **done**:
  - 시안 그리드를 보여준다. 이미지 alt는 "시안 #seq-i"다.
  - 시안마다 [다운로드](`<a href={dataUrl} download="thumbnail-{seq}-{i}.jpg">`), [작게 보기], [이 시안으로 수정하기](`onRevise(i)`)를 둔다.
  - 헤더 쪽에 [같은 입력으로 다시 생성](`onRegenerate`, `busy`면 비활성)을 둔다.
  - `images.length < count`면 "요청한 {count}장 중 {images.length}장만 만들어졌어요"를 표시한다.
- **error**:
  - ⚠와 `round.error.message`를 보여준다.
  - `retryable`일 때만 [다시 시도](`onRetry`, `busy`면 비활성)를 보여준다. [닫기](`onDismiss`)는 항상 보여준다.
  - 테두리는 UI_GUIDE의 에러 카드 스타일이다.
- **작게 보기**(§2-4):
  - 컴포넌트 안에 네이티브 `<dialog>`를 두고 `showModal()`로 연다.
  - 같은 이미지를 약 360px과 약 168px 폭으로 나란히 보여주고, 옆에 제목 자리 회색 막대를 둔다.
  - 안내 문구는 "작은 화면에서 이렇게 보여요"와 "문구가 이 크기에서도 한눈에 읽히는지 확인해보세요"이고, [닫기]를 둔다.
  - 유튜브 로고나 UI는 흉내 내지 않는다.
- 테스트: 세 상태별 렌더링, 경과 초 증가(`vi.useFakeTimers`), 각 콜백 호출과 `onRevise`의 1부터 시작하는 index, 다운로드 링크의 `href`/`download` 속성, retryable에 따른 [다시 시도] 노출, `busy` 시 비활성, 부분 결과 안내, 작게 보기 열기/닫기.
  - jsdom에는 `HTMLDialogElement.prototype.showModal`/`close`가 없으므로 `vitest.setup.ts`에 최소 stub을 추가한다(`open` 속성 토글).

## Acceptance Criteria

```bash
npm run lint && npm run build && npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (이 step에서 만든 파일은 위 2개 컴포넌트, 각 테스트, `vitest.setup.ts` 수정뿐)
   - UI_GUIDE의 금지 패턴(blur, 그라데이션, 글로우, 보라색, pulse 외 애니메이션)을 쓰지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (컴포넌트에서 fetch/OpenAI 호출 없음)
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 컴포넌트 안에서 `fetch`나 `/api` 호출을 하지 마라. 이유: 요청·상태는 step 3의 `ThumbnailStudio`가 맡는다(ARCHITECTURE 패턴).
- `PhotoInput`, `CountSelector`, `SmallPreviewDialog` 같은 하위 컴포넌트 파일로 쪼개지 마라. 이유: MVP 파일 구성(CLAUDE.md CRITICAL). 같은 파일 안의 내부 함수 컴포넌트는 괜찮다.
- 아이콘·UI 라이브러리를 설치하지 마라. 이유: UI_GUIDE, MVP.
- 검증 규칙이나 메시지를 컴포넌트에 하드코딩하지 마라. 이유: `lib/validation.ts` 단일 출처(CLAUDE.md). 사진 1장 안내처럼 PRD에 있는 UI 전용 문구는 예외다.
- 기존 테스트를 깨뜨리지 마라.
