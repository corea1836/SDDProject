# Step 0: project-setup

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md`
- `/docs/UI_GUIDE.md`
- `/.gitignore`
- `/.claude/settings.json`, `/.claude/hooks/tdd-guard.sh` (훅이 무엇을 막는지 이해할 것)

이 step은 첫 step이라 아직 애플리케이션 코드가 없다. 이 step은 이후 step이 코드를 작성할 수 있는 빈 Next.js + 테스트 환경만 만든다.

## 작업

### 1. Next.js 프로젝트 스캐폴딩
프로젝트 루트는 비어 있지 않다(`CLAUDE.md`, `docs/`, `scripts/`, `.claude/`, `phases/`, `.gitignore`). 그래서 `create-next-app`을 루트에서 바로 실행하면 실패한다. 다음 순서로 진행하라.

1. `/tmp` 아래 임시 디렉토리에 `npx create-next-app@latest`로 프로젝트를 생성한다. 조건은 TypeScript, Tailwind CSS, ESLint, App Router, `src/` 디렉토리, import alias `@/*`, npm이다. 대화형 프롬프트가 뜨지 않도록 `--help`로 플래그를 확인해 지정하고, git 초기화와 설치는 생략하는 플래그를 쓴다.
2. 생성된 파일 중 아래만 프로젝트 루트로 복사한다.
   - `package.json`, `tsconfig.json`, `next.config.*`, `eslint.config.*`, `postcss.config.*`, `src/`
3. 루트에서 `npm install`을 실행한다.
4. `package.json`의 `name`을 `thumbnail-maker`로 바꾼다.

### 2. 기본 템플릿 정리 (빈 화면으로)
- `src/app/page.tsx`: 기본 Next.js 데모 내용을 지운다. `<main>` 안에 "썸네일 메이커" 텍스트만 남긴다. 실제 UI는 step 3에서 만든다.
- `src/app/layout.tsx`: `<html lang="ko">`, metadata title `썸네일 메이커`, description `프롬프트와 사진으로 유튜브 썸네일 시안을 만들어요`.
  - `next/font` 사용을 제거하고 시스템 폰트를 쓴다. 이유: 빌드 시 외부 폰트 다운로드에 의존하지 않게 한다.
  - body 클래스는 `bg-[#0a0a0a] text-neutral-300 antialiased`.
- `src/app/globals.css`: `@import "tailwindcss";`와 최소한의 body 배경(#0a0a0a)만 남긴다. 라이트/다크 CSS 변수 같은 기본 템플릿 내용은 지운다.
- `public/`의 기본 데모 SVG는 복사하지 않는다(쓰지 않음).

### 3. 테스트 환경 (Vitest + React Testing Library)
- devDependencies: `vitest`, `@vitejs/plugin-react`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`.
  - `@/*` alias를 테스트에서 해석하는 데 필요한 최소 설정을 추가한다(`vitest.config.ts`의 `resolve.alias` 또는 `vite-tsconfig-paths` 중 택1).
- `vitest.config.ts`:
  - 기본 environment는 `jsdom`이다.
  - `setupFiles: ["./vitest.setup.ts"]`.
  - `include`는 `src/**/*.test.{ts,tsx}`.
- `vitest.setup.ts`: `@testing-library/jest-dom/vitest`를 import한다.
- 서버 코드 테스트(route, service, validation)는 파일 맨 위에 `// @vitest-environment node` 주석을 달아 node 환경에서 돌린다. 이 규칙을 `vitest.config.ts`에 주석으로 남겨라.
  - 이유: jsdom의 `FormData`/`File`과 Node의 `Request`가 섞이면 multipart 본문이 깨진다.
- `package.json` scripts: `"test": "vitest run --passWithNoTests"`. `dev`/`build`/`lint`는 create-next-app 기본값을 유지한다.

### 4. OpenAI SDK와 환경 변수
- dependencies에 `openai`(최신)를 설치한다.
- 루트에 `.env.example`을 만든다. 내용은 `OPENAI_API_KEY=` 한 줄이다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm run test
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가? (`src/app` 존재, 불필요한 데모 파일 없음)
   - ADR 기술 스택을 벗어나지 않았는가? (Next.js 16, Tailwind, Vitest, openai)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
   - 루트의 `CLAUDE.md`, `docs/`, `scripts/`, `.claude/`, `phases/`, `.gitignore`가 원래 내용 그대로인가? (`git diff`로 확인)
3. 결과에 따라 `phases/0-mvp/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 루트의 `CLAUDE.md`, `docs/*`, `scripts/*`, `.claude/*`, `phases/*`, `.gitignore`를 덮어쓰거나 수정하지 마라. 이유: Harness 가드레일과 설계 문서다.
- create-next-app이 만든 `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore`를 루트로 복사하지 마라. 이유: 기존 규칙 문서와 충돌한다.
- `rm -rf`를 쓰지 마라. 이유: `.claude/settings.json` 훅이 차단한다. 임시 디렉토리는 `/tmp`에 두고 지우지 않아도 된다.
- 애플리케이션 로직(API 라우트, 컴포넌트, 서비스)을 만들지 마라. 이유: step 1~3의 범위다.
- 상태 관리·데이터 페칭·UI 키트·아이콘 라이브러리를 설치하지 마라. 이유: MVP 범위 밖이다(CLAUDE.md CRITICAL).
- `.env.local`을 만들거나 실제 API 키를 쓰지 마라.
