import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// globals를 끄면 RTL 자동 cleanup이 동작하지 않으므로 직접 등록한다.
afterEach(() => {
  cleanup();
});
