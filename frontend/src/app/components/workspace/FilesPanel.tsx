'use client';
import { FileCode, Folder, Clock, MoreVertical, Star, ChevronDown, ChevronRight, ChevronLeft } from 'lucide-react';
import { useState } from 'react';

interface File {
  id: string;
  name: string;
  type: 'file' | 'folder';
  modified: Date;
  size?: string;
  starred?: boolean;
  thumbnail?: string;
  folder?: string;
}

interface FolderStructure {
  id: string;
  name: string;
  files: File[];
  isOpen: boolean;
}

interface FilesPanelProps {
  onFileSelect: (file: File) => void;
  onCollapse?: () => void;
}

type TabType = 'recent' | 'starred' | 'all';

export function FilesPanel({ onFileSelect, onCollapse }: FilesPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('recent');
  const [projectCollapsed, setProjectCollapsed] = useState(false);
  const [files, setFiles] = useState<File[]>([
    {
      id: '1',
      name: 'UserService.tsx',
      type: 'file',
      modified: new Date('2026-04-25'),
      size: '2.3 KB',
      starred: true,
      folder: 'services',
    },
    {
      id: '2',
      name: 'AuthController.java',
      type: 'file',
      modified: new Date('2026-04-24'),
      size: '4.1 KB',
      folder: 'controllers',
    },
    {
      id: '3',
      name: 'DatabaseManager.py',
      type: 'file',
      modified: new Date('2026-04-23'),
      size: '1.8 KB',
      starred: true,
      folder: 'database',
    },
    {
      id: '4',
      name: 'PaymentProcessor.go',
      type: 'file',
      modified: new Date('2026-04-22'),
      size: '3.2 KB',
      folder: 'services',
    },
    {
      id: '5',
      name: 'ApiRouter.ts',
      type: 'file',
      modified: new Date('2026-04-21'),
      size: '2.7 KB',
      folder: 'routes',
    },
    {
      id: '6',
      name: 'ProductService.tsx',
      type: 'file',
      modified: new Date('2026-04-20'),
      size: '5.1 KB',
      folder: 'services',
    },
  ]);

  const [folders, setFolders] = useState<Record<string, boolean>>({
    services: true,
    controllers: true,
    database: true,
    routes: true,
  });

  const toggleStar = (fileId: string) => {
    setFiles(prevFiles =>
      prevFiles.map(file =>
        file.id === fileId ? { ...file, starred: !file.starred } : file
      )
    );
  };

  const toggleFolder = (folderName: string) => {
    setFolders(prev => ({ ...prev, [folderName]: !prev[folderName] }));
  };

  const getFilteredFiles = () => {
    switch (activeTab) {
      case 'starred':
        return files.filter(f => f.starred);
      case 'all':
        return files;
      case 'recent':
      default:
        return files.slice().sort((a, b) => b.modified.getTime() - a.modified.getTime());
    }
  };

  const groupFilesByFolder = (fileList: File[]) => {
    const grouped: Record<string, File[]> = {};
    fileList.forEach(file => {
      const folder = file.folder || 'root';
      if (!grouped[folder]) grouped[folder] = [];
      grouped[folder].push(file);
    });
    return grouped;
  };

  const filteredFiles = getFilteredFiles();
  const groupedFiles = groupFilesByFolder(filteredFiles);

  return (
    <div className="h-full flex flex-col bg-[#252526]">
      {/* Header */}
      <div className="px-2 py-1.5 border-b border-[#1e1e1e] flex items-center justify-between">
        <h3 className="text-[11px] uppercase text-gray-400 font-semibold tracking-wide">Explorer</h3>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="p-0.5 hover:bg-[#2a2d2e] rounded transition-colors"
            title="Collapse Explorer"
          >
            <ChevronLeft className="h-3.5 w-3.5 text-gray-400 hover:text-white" />
          </button>
        )}
      </div>

      {/* Project Name */}
      <div className="px-1.5 py-1 border-b border-[#1e1e1e]">
        <button
          onClick={() => setProjectCollapsed(!projectCollapsed)}
          className="w-full flex items-center gap-0.5 px-1 py-0.5 hover:bg-[#2a2d2e] rounded text-[11px] text-white transition-colors"
        >
          {projectCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
          <Folder className="h-3 w-3 text-[#007acc]" />
          <span className="font-medium">PROJECT</span>
        </button>
      </div>

      {/* Files Tree View */}
      {!projectCollapsed && (
        <div className="flex-1 overflow-auto">
        {Object.keys(groupedFiles).map((folderName) => (
          <div key={folderName}>
            {/* Folder */}
            <button
              onClick={() => toggleFolder(folderName)}
              className="w-full flex items-center gap-0.5 px-1.5 py-0.5 hover:bg-[#2a2d2e] text-[11px] text-white transition-colors"
            >
              {folders[folderName] ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <Folder className="h-3 w-3 text-[#dcb67a]" />
              <span>{folderName}</span>
            </button>

            {/* Files in Folder */}
            {folders[folderName] && (
              <div className="ml-2 border-l border-[#3e3e42]">
                {groupedFiles[folderName].map((file) => (
                  <div
                    key={file.id}
                    onClick={() => onFileSelect(file)}
                    className="relative w-full flex items-center gap-0.5 px-1.5 py-0.5 ml-1.5 hover:bg-[#2a2d2e] text-[11px] text-gray-300 hover:text-white transition-colors group cursor-pointer"
                    title={`Open ${file.name} with UML diagram`}
                  >
                    <div className="absolute -left-1.5 top-1/2 w-1.5 h-px bg-[#3e3e42]" />
                    <FileCode className="h-3 w-3 text-[#519aba]" />
                    <span className="flex-1 text-left truncate">{file.name}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStar(file.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Star className={`h-2.5 w-2.5 ${
                        file.starred
                          ? 'text-yellow-500 fill-yellow-500'
                          : 'text-gray-500'
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Empty State */}
        {filteredFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 px-3">
            <Folder className="h-8 w-8 text-gray-600 mb-2" />
            <p className="text-[11px] text-gray-400">
              No files in workspace
            </p>
          </div>
        )}
        </div>
      )}

      {/* Bottom Actions */}
      <div className="border-t border-[#1e1e1e] p-1">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setActiveTab('recent')}
            className={`flex-1 px-1.5 py-0.5 text-[10px] rounded transition-colors ${
              activeTab === 'recent'
                ? 'bg-[#37373d] text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2a2d2e]'
            }`}
          >
            Recent
          </button>
          <button
            onClick={() => setActiveTab('starred')}
            className={`flex-1 px-1.5 py-0.5 text-[10px] rounded transition-colors ${
              activeTab === 'starred'
                ? 'bg-[#37373d] text-white'
                : 'text-gray-400 hover:text-white hover:bg-[#2a2d2e]'
            }`}
          >
            ⭐ Starred
          </button>
        </div>
      </div>
    </div>
  );
}
