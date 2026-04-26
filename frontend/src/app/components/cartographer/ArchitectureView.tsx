'use client';
import { useState } from 'react';
import { Layers, FileCode, AlertCircle } from 'lucide-react';

interface ArchitectureViewProps {
  repositoryId: string;
  showLegend: boolean;
}

interface Cluster {
  id: string;
  name: string;
  role: string;
  fileCount: number;
  convention: string;
  allowedDeps: string[];
  forbiddenDeps: string[];
}

export function ArchitectureView({ repositoryId }: ArchitectureViewProps) {
  const [selectedCluster, setSelectedCluster] = useState<Cluster | null>(null);

  // Mock cluster data
  const clusters: Cluster[] = [
    {
      id: '1',
      name: 'Controllers',
      role: 'HTTP request handlers',
      fileCount: 12,
      convention: '*Controller.ts',
      allowedDeps: ['Services', 'Models'],
      forbiddenDeps: ['Database'],
    },
    {
      id: '2',
      name: 'Services',
      role: 'Business logic layer',
      fileCount: 18,
      convention: '*Service.ts',
      allowedDeps: ['Models', 'Database', 'Utils'],
      forbiddenDeps: ['Controllers'],
    },
    {
      id: '3',
      name: 'Models',
      role: 'Data structures and types',
      fileCount: 24,
      convention: '*Model.ts or types/*.ts',
      allowedDeps: [],
      forbiddenDeps: ['Controllers', 'Services'],
    },
    {
      id: '4',
      name: 'Database',
      role: 'Data persistence layer',
      fileCount: 8,
      convention: 'db/*.ts',
      allowedDeps: ['Models'],
      forbiddenDeps: ['Controllers', 'Services'],
    },
  ];

  return (
    <div className="h-full flex overflow-hidden bg-[#1e1e1e]">
      {/* Cluster Diagram */}
      <div className="flex-1 relative bg-[#1a1a1a] p-5 overflow-auto">
        <div className="grid grid-cols-2 gap-5 max-w-4xl mx-auto mt-20">
          {clusters.map((cluster) => (
            <button
              key={cluster.id}
              onClick={() => setSelectedCluster(cluster)}
              className={`p-5 rounded-lg border-2 transition-all text-left aspect-square ${
                selectedCluster?.id === cluster.id
                  ? 'border-[#2DD4BF] bg-[#2DD4BF]/10'
                  : 'border-gray-700 bg-[#252526] hover:border-gray-600'
              }`}
            >
              <div className="flex items-start gap-5 mb-5">
                <Layers className="h-5 w-5 text-[#2DD4BF] flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h3 className="text-base font-bold text-white mb-1">{cluster.name}</h3>
                  <p className="text-xs text-gray-400">{cluster.role}</p>
                </div>
              </div>

              <div className="space-y-3 text-xs text-gray-300">
                <div className="flex items-center gap-2">
                  <FileCode className="h-3 w-3 text-gray-500" />
                  <span>{cluster.fileCount} files</span>
                </div>
                <div className="text-gray-500 font-mono text-xs">{cluster.convention}</div>
              </div>

              {cluster.forbiddenDeps.length > 0 && (
                <div className="mt-3 flex items-start gap-2 text-xs text-yellow-500">
                  <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span className="text-xs">Has forbidden dependencies</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Convention Side Panel */}
      {selectedCluster && (
        <div className="w-96 border-l border-[#3e3e42] bg-[#252526] p-5 overflow-auto">
          <h3 className="text-base font-bold text-white mb-3">Convention Manifest</h3>

          <div className="space-y-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Cluster</div>
              <div className="text-xs text-white font-medium">{selectedCluster.name}</div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Role</div>
              <div className="text-xs text-white">{selectedCluster.role}</div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Naming Convention</div>
              <div className="text-xs font-mono bg-[#1e1e1e] p-3 rounded border border-[#3e3e42] text-white">
                {selectedCluster.convention}
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Files</div>
              <div className="text-xs text-white">{selectedCluster.fileCount} files</div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Allowed Dependencies</div>
              <div className="space-y-1">
                {selectedCluster.allowedDeps.length > 0 ? (
                  selectedCluster.allowedDeps.map((dep) => (
                    <div key={dep} className="text-xs text-green-400 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      {dep}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-500 italic">None</div>
                )}
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Forbidden Dependencies</div>
              <div className="space-y-1">
                {selectedCluster.forbiddenDeps.length > 0 ? (
                  selectedCluster.forbiddenDeps.map((dep) => (
                    <div key={dep} className="text-xs text-red-400 flex items-center gap-2">
                      <AlertCircle className="w-3 h-3" />
                      {dep}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-gray-500 italic">None</div>
                )}
              </div>
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">Characteristic Patterns</div>
              <div className="space-y-1 text-xs text-gray-300">
                <div>• Export single default class</div>
                <div>• Dependency injection via constructor</div>
                <div>• Error handling with try/catch</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
