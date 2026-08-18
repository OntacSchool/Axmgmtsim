import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AX 경영 시뮬레이션',
  description: 'AI 전환 기업의 사업 확장 의사결정 시뮬레이터',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
