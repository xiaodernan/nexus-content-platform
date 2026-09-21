import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEXUS Studio',
  description: 'Turn ideas into executable digital worlds — the NEXUS creative operating system.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div id="nexus-root">{children}</div>
      </body>
    </html>
  );
}
