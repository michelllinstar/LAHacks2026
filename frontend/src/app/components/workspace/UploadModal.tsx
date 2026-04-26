'use client';
import { X } from 'lucide-react';
import { CodeUploader } from '../CodeUploader';

interface UploadModalProps {
  onClose: () => void;
  onUpload: (code: string, filename: string) => void;
}

export function UploadModal({ onClose, onUpload }: UploadModalProps) {
  const handleCodeUpload = (code: string, filename: string) => {
    onUpload(code, filename);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#2d2d2d] rounded-2xl border border-gray-800 w-full max-w-3xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white">Upload Code</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#3a3a3a] rounded-lg transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <CodeUploader onCodeUpload={handleCodeUpload} />
        </div>
      </div>
    </div>
  );
}
