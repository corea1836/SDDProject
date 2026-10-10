import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // 기본은 jsdom(컴포넌트 테스트)이다.
    // 서버 코드 테스트(route, service, validation)는 파일 맨 위에 `// @vitest-environment node`를 달아
    // node 환경에서 돌린다. jsdom의 FormData/File과 Node의 Request가 섞이면 multipart 본문이 깨진다.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
