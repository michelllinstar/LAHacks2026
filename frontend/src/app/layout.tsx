import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import '../styles/tailwind.css';

export const metadata: Metadata = {
  title: 'CodeViz AI',
  description: 'AI-powered codebase visualization and architecture explorer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-right" theme="dark" />
      </body>
    </html>
  );
}
