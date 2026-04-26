'use client';
import { useEffect, useState } from 'react';
import { Loader2, FileCode } from 'lucide-react';

interface DiagramGeneratorProps {
  code: string;
  filename: string;
  onDiagramGenerated: (svg: string) => void;
}

export function DiagramGenerator({ code, filename, onDiagramGenerated }: DiagramGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(true);
  const [classes, setClasses] = useState<string[]>([]);
  const [functions, setFunctions] = useState<string[]>([]);

  useEffect(() => {
    analyzeCode();
  }, [code]);

  const analyzeCode = async () => {
    setIsGenerating(true);

    await new Promise(resolve => setTimeout(resolve, 1500));

    const lines = code.split('\n');
    const foundClasses: string[] = [];
    const foundFunctions: string[] = [];

    lines.forEach(line => {
      const classMatch = line.match(/class\s+(\w+)/);
      const functionMatch = line.match(/(?:function|def|fn|func|async|const|let)\s+(\w+)/);

      if (classMatch && !foundClasses.includes(classMatch[1])) {
        foundClasses.push(classMatch[1]);
      }
      if (functionMatch && !foundFunctions.includes(functionMatch[1])) {
        foundFunctions.push(functionMatch[1]);
      }
    });

    setClasses(foundClasses);
    setFunctions(foundFunctions);
    setIsGenerating(false);
    onDiagramGenerated('placeholder-svg');
  };

  if (isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-[#252526] min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-[#2DD4BF] mb-5" />
        <span className="text-xs text-gray-400">Analyzing code structure...</span>
      </div>
    );
  }

  return (
    <div className="bg-[#252526]">
      <div className="space-y-5">
        {classes.length > 0 && (
          <div>
            <h4 className="text-xs uppercase text-gray-400 font-semibold mb-5">Classes ({classes.length})</h4>
            <div className="flex flex-wrap gap-1.5">
              {classes.map((cls, idx) => (
                <div
                  key={idx}
                  className="px-2 py-1 bg-[#1e1e1e] border border-[#2DD4BF]/30 rounded text-[#4ec9b0] text-xs font-mono"
                >
                  {cls}
                </div>
              ))}
            </div>
          </div>
        )}

        {functions.length > 0 && (
          <div>
            <h4 className="text-xs uppercase text-gray-400 font-semibold mb-5">Functions ({functions.length})</h4>
            <div className="flex flex-wrap gap-1.5">
              {functions.slice(0, 10).map((fn, idx) => (
                <div
                  key={idx}
                  className="px-2 py-1 bg-[#1e1e1e] border border-[#c586c0]/30 rounded text-[#dcdcaa] text-xs font-mono"
                >
                  {fn}()
                </div>
              ))}
              {functions.length > 10 && (
                <div className="px-2 py-1 bg-[#1e1e1e] rounded text-gray-500 text-xs">
                  +{functions.length - 10}
                </div>
              )}
            </div>
          </div>
        )}

        {classes.length === 0 && functions.length === 0 && (
          <div className="text-center py-8">
            <FileCode className="h-10 w-10 text-gray-600 mx-auto mb-5" />
            <p className="text-xs text-gray-500">No symbols detected</p>
          </div>
        )}

        <div className="mt-4 p-3 bg-[#1e1e1e] border border-[#2DD4BF]/20 rounded">
          <p className="text-xs text-gray-500">
            ✓ {code.split('\n').length} lines analyzed
          </p>
        </div>
      </div>
    </div>
  );
}
