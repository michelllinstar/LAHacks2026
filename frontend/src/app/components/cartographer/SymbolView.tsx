'use client';
import { useState } from 'react';

interface SymbolViewProps {
  repositoryId: string;
  showLegend: boolean;
}

export function SymbolView({ repositoryId }: SymbolViewProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // Mock symbol data
  const symbols = [
    { id: '1', name: 'UserService', type: 'class', file: 'src/services/user.ts', calls: 12 },
    { id: '2', name: 'AuthController', type: 'class', file: 'src/controllers/auth.ts', calls: 8 },
    { id: '3', name: 'DatabaseManager', type: 'class', file: 'src/db/manager.py', calls: 24 },
    { id: '4', name: 'validateEmail', type: 'function', file: 'src/utils/validation.ts', calls: 15 },
    { id: '5', name: 'PaymentProcessor', type: 'class', file: 'src/services/payment.ts', calls: 6 },
  ];

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Graph Visualization Area */}
        <div className="flex-1 relative bg-[#1a1a1a]">
          {/* Placeholder for Cytoscape.js graph */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-64 h-64 mx-auto mb-5 border-2 border-dashed border-gray-700 rounded-lg flex items-center justify-center">
                <div className="text-gray-500">
                  <div className="text-2xl mb-5">Symbol Graph Visualization</div>
                  <div className="text-base">Force-directed graph will render here</div>
                  <div className="text-base mt-5">{symbols.length} symbols indexed</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Symbol Details Panel */}
        {selectedSymbol && (
          <div className="w-96 border-l border-[#3e3e42] bg-[#252526] p-5">
            <h3 className="text-2xl font-bold text-white mb-5">Symbol Details</h3>
            <div className="space-y-5 text-base text-gray-300">
              <div>
                <div className="text-gray-500 mb-2">Name</div>
                <div className="text-white">UserService</div>
              </div>
              <div>
                <div className="text-gray-500 mb-2">Type</div>
                <div className="text-white">Class</div>
              </div>
              <div>
                <div className="text-gray-500 mb-2">Location</div>
                <div className="text-white">src/services/user.ts:12-45</div>
              </div>
              <div>
                <div className="text-gray-500 mb-2">Calls</div>
                <div className="text-white">12 outgoing, 8 incoming</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
