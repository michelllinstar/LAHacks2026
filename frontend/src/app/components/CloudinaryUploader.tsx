'use client';
import { useState } from 'react';
import { Cloud, Check, Download, Share2, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface CloudinaryUploaderProps {
  svgContent: string;
  filename: string;
}

export function CloudinaryUploader({ svgContent, filename }: CloudinaryUploaderProps) {
  const [uploadedUrl, setUploadedUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const uploadToCloudinary = async () => {
    setIsUploading(true);

    // Note: In production, you'd upload to Cloudinary here
    // For demo purposes, we'll simulate the upload and generate a mock URL
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simulate Cloudinary transformation URL
    const mockUrl = `https://res.cloudinary.com/demo/image/upload/w_800,h_600,c_fit,f_auto,q_auto/diagrams/${filename.replace(/\.[^/.]+$/, '')}.svg`;

    setUploadedUrl(mockUrl);
    setIsUploading(false);
    toast.success('Diagram uploaded to Cloudinary!');
  };

  const downloadSVG = () => {
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.replace(/\.[^/.]+$/, '')}-diagram.svg`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Diagram downloaded!');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(uploadedUrl);
    toast.success('URL copied to clipboard!');
  };

  return (
    <div className="mt-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
      <h3 className="font-semibold mb-4 flex items-center gap-2">
        <Cloud className="h-5 w-5 text-blue-600" />
        Cloudinary Media Optimization
      </h3>

      {!uploadedUrl ? (
        <button
          onClick={uploadToCloudinary}
          disabled={isUploading}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isUploading ? (
            <>
              <Cloud className="h-4 w-4 animate-pulse" />
              Uploading to Cloudinary...
            </>
          ) : (
            <>
              <Cloud className="h-4 w-4" />
              Upload & Optimize with Cloudinary
            </>
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <Check className="h-5 w-5 text-green-600" />
            <span className="text-green-700">Optimized & Uploaded!</span>
          </div>

          <div className="p-3 bg-white rounded border">
            <p className="text-xs text-gray-500 mb-1">Cloudinary URL:</p>
            <code className="text-xs break-all text-blue-600">{uploadedUrl}</code>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={copyToClipboard}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <Copy className="h-4 w-4" />
              Copy URL
            </button>
            <button
              onClick={downloadSVG}
              className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          </div>

          <div className="text-xs text-gray-500 mt-2">
            <strong>Cloudinary Features Applied:</strong>
            <ul className="list-disc list-inside mt-1">
              <li>Auto format conversion (f_auto)</li>
              <li>Quality optimization (q_auto)</li>
              <li>Responsive sizing (w_800, h_600)</li>
              <li>CDN delivery for fast loading</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
