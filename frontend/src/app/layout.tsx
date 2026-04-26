import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import '../styles/tailwind.css';

export const metadata: Metadata = {
  title: 'MarkCodePolo',
  description: 'AI-powered codebase visualization and architecture explorer.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="top-right"
          theme="dark"
          closeButton
          duration={4000}
          toastOptions={{
            unstyled: false,
            classNames: {
              toast:
                'group pointer-events-auto !rounded-lg !border !border-[#3e3e42] !bg-[#252526]/95 !text-gray-100 !shadow-[0_8px_32px_rgba(0,0,0,0.45)] !backdrop-blur-md !pl-4',
              title: '!text-[13px] !font-semibold !text-white',
              description: '!text-[12px] !text-gray-400 !mt-0.5',
              actionButton:
                '!bg-blue-500 hover:!bg-blue-600 !text-white !text-[12px] !rounded-md !px-2.5 !py-1',
              cancelButton:
                '!bg-[#3a3a3a] hover:!bg-[#4a4a4a] !text-gray-200 !text-[12px] !rounded-md !px-2.5 !py-1',
              closeButton:
                '!bg-transparent !border-none !text-gray-500 hover:!text-white hover:!bg-[#3e3e42] !left-auto !right-2 !top-2',
              error: '!border-l-4 !border-l-red-500',
              success: '!border-l-4 !border-l-emerald-500',
              warning: '!border-l-4 !border-l-amber-500',
              info: '!border-l-4 !border-l-[#007acc]',
            },
          }}
        />
      </body>
    </html>
  );
}
