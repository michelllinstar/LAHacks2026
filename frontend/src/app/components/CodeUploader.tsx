'use client';
import { Upload, FileCode } from 'lucide-react';
import { useState } from 'react';

interface CodeUploaderProps {
  onCodeUpload: (code: string, filename: string) => void;
}

export function CodeUploader({ onCodeUpload }: CodeUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      readFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      readFile(file);
    }
  };

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onCodeUpload(content, file.name);
    };
    reader.readAsText(file);
  };

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
        isDragging
          ? 'border-[#2DD4BF] bg-blue-50'
          : 'border-gray-300 hover:border-gray-400'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
      <h3 className="mb-2">Drop your code file here</h3>
      <p className="text-gray-500 mb-4">or click to browse</p>
      <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
        <FileCode className="h-4 w-4" />
        Choose File
        <input
          type="file"
          className="hidden"
          accept=".js,.jsx,.ts,.tsx,.py,.java,.cpp,.c,.go,.rs"
          onChange={handleFileInput}
        />
      </label>
      <p className="text-xs text-gray-400 mt-4">
        Supports: JavaScript, TypeScript, Python, Java, C++, Go, Rust
      </p>
    </div>
  );
}
