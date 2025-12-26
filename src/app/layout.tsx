import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "쇼츠 박사 | 유튜브 쇼츠 자동 생성",
  description: "50-60대를 위한 유튜브 쇼츠 영상을 AI로 자동 생성하고 업로드합니다.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        />
      </head>
      <body className="min-h-screen">
        <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-card)]">
          <div className="container flex items-center justify-between h-16">
            <a href="/" className="flex items-center gap-2 no-underline hover:no-underline">
              <span className="text-2xl">🎬</span>
              <span className="text-xl font-bold text-[var(--color-primary)]">
                쇼츠 박사
              </span>
            </a>
            <nav className="flex items-center gap-6">
              <a 
                href="/" 
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] font-medium"
              >
                영상 만들기
              </a>
              <a 
                href="/jobs" 
                className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] font-medium"
              >
                작업 목록
              </a>
            </nav>
          </div>
        </header>
        <main className="py-8">
          {children}
        </main>
        <footer className="border-t border-[var(--color-border)] py-6 mt-auto">
          <div className="container text-center text-[var(--color-text-muted)] text-sm">
            © 2024 쇼츠 박사. 50-60대를 위한 유튜브 쇼츠 자동 생성 서비스
          </div>
        </footer>
      </body>
    </html>
  );
}
