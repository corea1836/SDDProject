# 프로젝트: thumbnail-maker

유튜브 채널 운영자가 프롬프트(필수)와 사진(선택 1장)으로 썸네일 시안을 만들고, 고르고, 다듬고, 내려받는 MVP 웹 서비스.

## 기술 스택
- Next.js 16 (App Router)
- TypeScript strict mode
- Tailwind CSS
- Vitest + React Testing Library (jsdom)
- `openai` Node SDK — 이미지 모델 `gpt-image-2.5-flare`

## 아키텍처 규칙
- CRITICAL: OpenAI SDK는 `src/services/thumbnail.ts`에서만 import/호출한다. 클라이언트 코드는 `/api/thumbnails` 라우트만 호출한다.
- CRITICAL: `OPENAI_API_KEY`는 서버 전용이다. `NEXT_PUBLIC_` 접두사를 붙이거나 클라이언트 번들에 노출하지 말 것.
- CRITICAL: 사용자 입력(폼 값)을 성공·실패·취소 어떤 경우에도 자동으로 지우지 말 것.
- CRITICAL: 업로드 사진이나 생성 이미지를 서버(디스크·DB·외부 저장소)에 저장하지 말 것. 서비스는 stateless다.
- CRITICAL: MVP다. `docs/ARCHITECTURE.md`의 파일 구성을 벗어나는 새 파일·추상화·라이브러리(상태 관리, 데이터 페칭, UI 키트 등)를 추가하지 말 것.
- 모델·크기·품질 등 OpenAI 호출 상수는 `src/services/thumbnail.ts` 한 곳에만 둔다.
- 입력 검증 규칙과 제한 상수는 `src/lib/validation.ts` 한 곳에 두고 서버와 클라이언트가 함께 쓴다.
- 사용자에게 보이는 문구는 한국어로 쓴다. 클라이언트로 OpenAI 원문 에러나 스택을 보내지 않는다.
- 유저 플로우·화면·에러 처리 명세는 `docs/PRD.md`를, UI 규칙은 `docs/UI_GUIDE.md`를 따른다.

## 개발 프로세스
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성할 것 (TDD). 테스트 파일은 대상 파일 옆에 `*.test.ts(x)`로 둔다.
- CRITICAL: 테스트에서 실제 OpenAI API를 호출하지 말 것. SDK와 `fetch`는 mock한다.
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:)

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트 (vitest run)
