import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals를 끄면 RTL 자동 cleanup이 동작하지 않으므로 직접 등록한다.
afterEach(() => {
  cleanup();
});

// jsdom에는 <dialog>의 showModal/close가 없어 open 속성만 토글하는 최소 stub을 둔다.
// node 환경 테스트(서버 코드)에는 HTMLDialogElement가 없으므로 건너뛴다.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
}
