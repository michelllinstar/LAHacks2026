'use client';
import { useState } from 'react';
import { Image as ImageIcon, Download, ExternalLink } from 'lucide-react';

interface CloudinaryGalleryProps {
  diagrams: Array<{
    url: string;
    filename: string;
    timestamp: number;
  }>;
}

export function CloudinaryGallery({ diagrams }: CloudinaryGalleryProps) {
  const [selectedDiagram, setSelectedDiagram] = useState<number | null>(null);

  if (diagrams.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 p-6 bg-white rounded-lg border">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <ImageIcon className="h-5 w-5 text-blue-600" />
        Your Cloudinary Diagram Library
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {diagrams.map((diagram, idx) => (
          <div
            key={idx}
            className={`relative group cursor-pointer rounded-lg border overflow-hidden transition-all ${
              selectedDiagram === idx ? 'ring-2 ring-[#2DD4BF]' : 'hover:shadow-md'
            }`}
            onClick={() => setSelectedDiagram(idx)}
          >
            <div className="aspect-square bg-gray-100 flex items-center justify-center p-4">
              <img
                src={diagram.url}
                alt={diagram.filename}
                className="max-w-full max-h-full object-contain"
              />
            </div>

            {/* Overlay on hover */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
              <div className="flex gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    window.open(diagram.url, '_blank');
                  }}
                  className="p-2 bg-white rounded-full hover:bg-gray-100"
                  title="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // Download logic
                  }}
                  className="p-2 bg-white rounded-full hover:bg-gray-100"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* File name */}
            <div className="p-2 bg-gray-50">
              <p className="text-xs truncate">{diagram.filename}</p>
              <p className="text-xs text-gray-500">
                {new Date(diagram.timestamp).toLocaleDateString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {selectedDiagram !== null && (
        <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-semibold mb-2">Cloudinary Transformations</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="font-medium min-w-[100px]">Original:</span>
              <code className="text-xs bg-white px-2 py-1 rounded break-all">
                {diagrams[selectedDiagram].url}
              </code>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium min-w-[100px]">Thumbnail:</span>
              <code className="text-xs bg-white px-2 py-1 rounded break-all">
                {diagrams[selectedDiagram].url.replace('/upload/', '/upload/w_200,h_150,c_fill/')}
              </code>
            </div>
            <div className="flex items-start gap-2">
              <span className="font-medium min-w-[100px]">Optimized:</span>
              <code className="text-xs bg-white px-2 py-1 rounded break-all">
                {diagrams[selectedDiagram].url.replace('/upload/', '/upload/f_auto,q_auto,w_800/')}
              </code>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
