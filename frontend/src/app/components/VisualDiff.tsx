'use client';
import { useState } from 'react';
import { GitCompare, Check } from 'lucide-react';

interface VisualDiffProps {
  diagram1Url: string;
  diagram2Url: string;
}

export function VisualDiff({ diagram1Url, diagram2Url }: VisualDiffProps) {
  const [sliderPosition, setSliderPosition] = useState(50);

  return (
    <div className="mt-6 p-6 bg-white rounded-lg border">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <GitCompare className="h-5 w-5 text-indigo-600" />
        Visual Diff Comparison
      </h3>

      <div className="relative overflow-hidden rounded-lg border" style={{ height: '400px' }}>
        {/* Before Image */}
        <div className="absolute inset-0">
          <img
            src={diagram1Url}
            alt="Original diagram"
            className="w-full h-full object-contain"
          />
          <div className="absolute top-2 left-2 px-2 py-1 bg-red-500 text-white text-xs rounded">
            Before
          </div>
        </div>

        {/* After Image with Slider */}
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <img
            src={diagram2Url}
            alt="Updated diagram"
            className="w-full h-full object-contain"
          />
          <div className="absolute top-2 right-2 px-2 py-1 bg-green-500 text-white text-xs rounded">
            After
          </div>
        </div>

        {/* Slider Handle */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-ew-resize"
          style={{ left: `${sliderPosition}%` }}
          onMouseDown={(e) => {
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const rect = e.currentTarget.parentElement?.getBoundingClientRect();
              if (rect) {
                const x = moveEvent.clientX - rect.left;
                const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
                setSliderPosition(percentage);
              }
            };

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
            <GitCompare className="h-4 w-4 text-gray-600" />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
        <Check className="h-4 w-4 text-green-600" />
        <span>Powered by Cloudinary overlay transformations</span>
      </div>
    </div>
  );
}
