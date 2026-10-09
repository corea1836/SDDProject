export type Mode = "create" | "revise";
export type Count = 2 | 3 | 4;

export type ThumbnailInput = {
  mode: Mode;
  prompt: string; // create: 설명, revise: 수정 요청
  caption: string; // 빈 문자열 = 없음
  image: File | null; // create: 선택 사진, revise: 기반 시안
  count: Count;
};

export type UserError = { message: string; retryable: boolean };
export type ApiResponse = { images: string[] } | { error: UserError };

export type Round = {
  id: string;
  seq: number; // #라운드 번호
  kind: Mode;
  input: ThumbnailInput; // 재생성·다시 시도용 스냅샷
  base?: { seq: number; index: number }; // revise일 때 기반 시안 번호 (#seq-index)
  status: "generating" | "done" | "error";
  images: string[]; // data URL
  error?: UserError;
  startedAt: number;
};
