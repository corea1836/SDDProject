# UI 디자인 가이드

## 디자인 원칙
1. 도구처럼 보여야 한다. 마케팅 페이지가 아니라 영상마다 여는 작업 화면이다. 랜딩·히어로 섹션을 만들지 않는다.
2. 주인공은 썸네일 시안이다. UI 크롬은 무채색으로 두어 시안의 색이 돋보이게 한다.
3. 다음에 할 일이 항상 보여야 한다. 빈 화면에는 안내를, 에러에는 원인과 다음 행동을 함께 보여준다.

## AI 슬롭 안티패턴 — 하지 마라
| 금지 사항 | 이유 |
|-----------|------|
| backdrop-filter: blur() | glass morphism은 AI 템플릿의 가장 흔한 징후 |
| gradient-text (배경 그라데이션 텍스트) | AI가 만든 SaaS 랜딩의 1번 특징 |
| "Powered by AI" 배지 | 기능이 아니라 장식. 사용자에게 가치 없음 |
| box-shadow 글로우 애니메이션 | 네온 글로우 = AI 슬롭 |
| 보라/인디고 브랜드 색상 | "AI = 보라색" 클리셰 |
| 모든 카드에 동일한 rounded-2xl | 균일한 둥근 모서리는 템플릿 느낌 |
| 배경 gradient orb (blur-3xl 원형) | 모든 AI 랜딩 페이지에 있는 장식 |

## 색상
다크모드 고정이다. 라이트 모드를 지원하지 않는다.

### 배경
| 용도 | 값 |
|------|------|
| 페이지 | #0a0a0a |
| 카드·패널 | #141414 |
| 입력 필드·자리표시자 | bg-neutral-900 |

### 텍스트
| 용도 | 값 |
|------|------|
| 주 텍스트 | text-white |
| 본문 | text-neutral-300 |
| 보조 (힌트·카운터·요약) | text-neutral-400 |
| 비활성 | text-neutral-500 |

### 데이터/시맨틱 색상
| 용도 | 값 |
|------|------|
| 에러 (메시지·초과 카운터·에러 카드 테두리) | #ef4444 |
| 중립/테두리 | #525252, border-neutral-800 |

성공 색상은 쓰지 않는다. 완료는 시안이 나타나는 것으로 충분하다.

## 컴포넌트
### 카드 (라운드 카드, 입력 패널)
```
rounded-lg bg-[#141414] border border-neutral-800 p-5
에러 카드: border-[#ef4444]/60
```

### 시안 이미지
```
aspect-video w-full rounded-md object-cover   (자리표시자: aspect-video rounded-md bg-neutral-900 animate-pulse)
```

### 버튼
```
Primary:   rounded-md bg-white text-black font-medium px-4 py-2.5 hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-400
Secondary: rounded-md border border-neutral-700 text-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-800
Text:      text-sm text-neutral-400 hover:text-neutral-200
```
- Primary는 화면에 하나만 둔다([썸네일 만들기] 또는 [수정 시안 만들기]).
- 시안별 동작(다운로드·작게 보기·수정)은 Secondary, 닫기·돌아가기·취소는 Text 버튼이다.

### 입력 필드
```
w-full rounded-md bg-neutral-900 border border-neutral-800 px-3 py-2.5 text-neutral-100
placeholder:text-neutral-500 focus:outline-none focus:border-neutral-500
에러 상태: border-[#ef4444]
```
- 라벨은 필드 위에 둔다(`text-sm font-medium text-neutral-200`). 필수는 `*`, 선택은 "(선택)"을 붙인다.
- 카운터와 에러 메시지는 필드 바로 아래에 `text-xs`로 둔다.

### 시안 개수 선택
- 라디오 그룹(2·3·4)을 세그먼트 형태로 만든다. 선택된 항목은 `bg-white text-black`, 나머지는 `border border-neutral-700 text-neutral-300`이다.

### 예시 칩
```
rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800
```

### 사진 드롭존
```
rounded-md border border-dashed border-neutral-700 bg-neutral-900 px-4 py-6 text-sm text-neutral-400
드래그 중: border-neutral-400
```

### 다이얼로그 (작게 보기)
- 네이티브 `<dialog>`를 쓴다. 배경은 `bg-[#141414]`, backdrop은 `bg-black/70` 단색이다(blur 금지).

## 레이아웃
- 전체 너비: max-w-6xl, 좌우 패딩 px-4 (lg:px-6)
- 1024px 이상(`lg:`): 2단 그리드. 입력 패널 `lg:w-[380px]` sticky top-6, 결과 패널은 나머지
- 1024px 미만: 1단(입력 → 결과)
- 시안 그리드: `grid grid-cols-1 sm:grid-cols-2 gap-3`
- 정렬: 좌측 정렬 기본. 빈 화면 안내도 좌측 정렬
- 간격: 필드 간 space-y-5, 라운드 카드 간 space-y-4

## 타이포그래피
| 용도 | 스타일 |
|------|--------|
| 페이지 제목 (헤더 "썸네일 메이커") | text-lg font-semibold text-white |
| 패널·카드 제목 | text-sm font-medium text-neutral-200 |
| 본문 | text-sm text-neutral-300 leading-relaxed |
| 힌트·카운터·메타 | text-xs text-neutral-400 |

## 애니메이션
- 생성 중 자리표시자의 `animate-pulse`만 허용한다.
- 그 외 모든 애니메이션·트랜지션 금지. hover 시 배경색 변경만 허용한다.

## 아이콘
- 아이콘 라이브러리를 쓰지 않는다. 필요한 곳(경고 ⚠ 등)은 텍스트 문자나 인라인 SVG(strokeWidth 1.5)로 처리한다.
- 아이콘을 둥근 배경 박스로 감싸지 않는다.
