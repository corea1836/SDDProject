import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "썸네일 메이커",
  description: "프롬프트와 사진으로 유튜브 썸네일 시안을 만들어요",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body className="bg-[#0a0a0a] text-neutral-300 antialiased">
        {children}
      </body>
    </html>
  );
}
