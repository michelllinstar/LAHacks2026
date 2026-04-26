'use client';
import { CheckCircle, Shield, AlertCircle } from 'lucide-react';

export function InvariantToolbar() {
  return (
    <div
      className="h-10 bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center px-3 gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-[#3e3e42] scrollbar-track-transparent hover:scrollbar-thumb-[#4e4e52]"
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: '#3e3e42 transparent',
        flexWrap: 'nowrap',
      }}
    >
      <div className="flex items-center gap-2 px-3 py-1 bg-[#1e1e1e] rounded border border-[#3e3e42] flex-shrink-0">
        <span className="text-xs text-gray-400 whitespace-nowrap">Invariants:</span>
        <span className="text-xs text-white font-semibold">24</span>
      </div>
      <div className="w-px h-6 bg-[#3e3e42] flex-shrink-0" />
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <CheckCircle className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />
          <span className="text-xs text-gray-300 whitespace-nowrap">Test</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-blue-400 flex-shrink-0" />
          <span className="text-xs text-gray-300 whitespace-nowrap">Check</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 text-yellow-400 flex-shrink-0" />
          <span className="text-xs text-gray-300 whitespace-nowrap">Comment</span>
        </div>
      </div>
      <div className="w-px h-6 bg-[#3e3e42] flex-shrink-0" />
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-green-500 flex-shrink-0" />
          <span className="text-xs text-gray-300 whitespace-nowrap">High ≥90%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-yellow-500 flex-shrink-0" />
          <span className="text-xs text-gray-300 whitespace-nowrap">Med ≥70%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-red-500 flex-shrink-0" />
          <span className="text-xs text-gray-300 whitespace-nowrap">Low &lt;70%</span>
        </div>
      </div>
    </div>
  );
}
