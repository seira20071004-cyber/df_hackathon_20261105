import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = {title: 'Bridge Work | 職場の困ったをつなぐ', description: '多言語の職場相談とナレッジ共有', icons:{icon:'/bridge-icon-32.png',apple:'/bridge-icon-180.png'}};
export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="ja"><body>{children}</body></html>;
}
