'use client';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FileCode } from 'lucide-react';

interface CodePreviewProps {
  code: string;
  filename: string;
}

export function CodePreview({ code, filename }: CodePreviewProps) {
  const getLanguage = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase();
    const languageMap: { [key: string]: string } = {
      'js': 'javascript',
      'jsx': 'jsx',
      'ts': 'typescript',
      'tsx': 'tsx',
      'py': 'python',
      'java': 'java',
      'cpp': 'cpp',
      'c': 'c',
      'go': 'go',
      'rs': 'rust',
    };
    return languageMap[ext || ''] || 'javascript';
  };

  return (
    <div className="h-full overflow-auto bg-[#1e1e1e]">
      <SyntaxHighlighter
        language={getLanguage(filename)}
        style={vscDarkPlus}
        showLineNumbers
        customStyle={{
          margin: 0,
          padding: '16px',
          borderRadius: 0,
          background: '#1e1e1e',
          fontSize: '13px',
          lineHeight: '1.6',
        }}
        lineNumberStyle={{
          minWidth: '3em',
          paddingRight: '1em',
          color: '#858585',
          textAlign: 'right',
          userSelect: 'none',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
