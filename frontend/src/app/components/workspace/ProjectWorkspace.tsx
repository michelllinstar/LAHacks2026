'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Files, Search, GitBranch, Settings, ChevronRight, X, Plus,
  Play, Bug, AlertCircle, Terminal, ChevronDown, FileCode,
  Copy, Layers, Share2, MoreVertical, ArrowLeft, Package,
  Bot, Send, Sparkles
} from 'lucide-react';
import { FilesPanel } from './FilesPanel';
import { DiagramGenerator } from '../DiagramGenerator';
import { CloudinaryUploader } from '../CloudinaryUploader';
import { CodePreview } from '../CodePreview';

interface ProjectWorkspaceProps {
  projectId: string;
  projectName: string;
  projectType: 'github' | 'local';
  onBack: () => void;
  onShare: () => void;
  onUpload: () => void;
}

type ActivityBarItem = 'explorer' | 'search' | 'source-control' | 'extensions';
type BottomPanelTab = 'chat' | 'problems' | 'output' | 'debug';

interface Tab {
  id: string;
  fileName: string;
  type: 'code' | 'diagram';
  code?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export function ProjectWorkspace({ projectId, projectName, projectType, onBack, onShare, onUpload }: ProjectWorkspaceProps) {
  const router = useRouter();
  const [activeActivity, setActiveActivity] = useState<ActivityBarItem>('explorer');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomPanelTab>('chat');
  const [fileCodeMap, setFileCodeMap] = useState<Record<string, string>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hi! I\'m your UML diagram assistant. Select a file and I\'ll help you understand its structure and relationships.',
      timestamp: new Date(),
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const mountedRef = useRef(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(350);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Floating UML window state
  const [umlWindowPosition, setUmlWindowPosition] = useState({ x: 100, y: 100 });
  const [umlWindowSize, setUmlWindowSize] = useState({ width: 600, height: 500 });
  const [isDraggingUml, setIsDraggingUml] = useState(false);
  const [isResizingUml, setIsResizingUml] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const fileSelectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatResponseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fileSelectTimeoutRef.current !== null) {
        clearTimeout(fileSelectTimeoutRef.current);
      }
      if (chatResponseTimeoutRef.current !== null) {
        clearTimeout(chatResponseTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Handle panel resize and UML window drag/resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingSidebar) {
        const activityBarWidth = 48; // 12 * 4px
        const newWidth = e.clientX - activityBarWidth;
        setSidebarWidth(Math.max(180, Math.min(500, newWidth)));
      }
      if (isResizingRight) {
        const windowWidth = window.innerWidth;
        const newWidth = windowWidth - e.clientX;
        setRightPanelWidth(Math.max(250, Math.min(800, newWidth)));
      }
      if (isDraggingUml) {
        setUmlWindowPosition({
          x: e.clientX - dragOffset.x,
          y: e.clientY - dragOffset.y,
        });
      }
      if (isResizingUml) {
        setUmlWindowSize({
          width: Math.max(400, e.clientX - umlWindowPosition.x),
          height: Math.max(300, e.clientY - umlWindowPosition.y),
        });
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      setIsResizingRight(false);
      setIsDraggingUml(false);
      setIsResizingUml(false);
    };

    if (isResizingSidebar || isResizingRight || isDraggingUml || isResizingUml) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizingSidebar, isResizingRight, isDraggingUml, isResizingUml, dragOffset, umlWindowPosition]);

  const handleFileSelect = (file: any) => {
    const mockCode = `class ${file.name.split('.')[0]} {
  constructor() {
    this.data = [];
  }

  async fetchData() {
    return await this.fetch();
  }

  processData(input) {
    return input.toUpperCase();
  }
}`;

    // Store code for this file
    setFileCodeMap(prev => ({ ...prev, [file.name]: mockCode }));

    // Create tab IDs
    const codeTabId = `${file.name}-code`;
    const diagramTabId = `${file.name}-diagram`;

    // Check if tabs already exist
    const codeTabExists = tabs.some(t => t.id === codeTabId);
    const diagramTabExists = tabs.some(t => t.id === diagramTabId);

    const newTabs = [...tabs];

    // Add code tab if doesn't exist
    if (!codeTabExists) {
      newTabs.push({
        id: codeTabId,
        fileName: file.name,
        type: 'code',
        code: mockCode,
      });
    }

    // Add diagram tab if doesn't exist
    if (!diagramTabExists) {
      newTabs.push({
        id: diagramTabId,
        fileName: `${file.name} (UML)`,
        type: 'diagram',
        code: mockCode,
      });
    }

    setTabs(newTabs);
    setActiveTabId(codeTabId);

    // Auto-send explanation to chat
    fileSelectTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      const folderPath = file.folder ? `${file.folder}/` : '';
      const assistantMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `I've analyzed **${folderPath}${file.name}**. Here's what I found:

**File Location:**
${file.folder ? `- Located in \`${file.folder}/\` directory` : '- Root level file'}

**Class Structure:**
- \`${file.name.split('.')[0]}\` class with a constructor
- Contains a \`data\` array property

**Methods:**
- \`fetchData()\` - Async method that fetches data
- \`processData(input)\` - Transforms input to uppercase

**Architecture Pattern:**
This follows a service pattern with:
- Data storage capability
- Asynchronous data fetching
- Data transformation utilities

**UML Diagram:**
View the UML diagram tab to see the visual class structure and relationships!

Would you like me to explain any specific part in more detail?`,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, assistantMessage]);
      setShowBottomPanel(true);
      setActiveBottomTab('chat');
    }, 500);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsTyping(true);

    chatResponseTimeoutRef.current = setTimeout(() => {
      if (!mountedRef.current) return;
      const activeTab = getActiveTab();
      const response = generateChatResponse(chatInput, activeTab);
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setChatMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 1000);
  };

  const generateChatResponse = (query: string, activeTab?: Tab): string => {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('class') || lowerQuery.includes('structure')) {
      return `The current file contains a class structure with:
- Constructor initialization
- Async data fetching capability
- Data processing methods

The class follows object-oriented principles with clear separation of concerns.`;
    }

    if (lowerQuery.includes('method') || lowerQuery.includes('function')) {
      return `**Methods in this class:**

1. \`constructor()\` - Initializes the data array
2. \`fetchData()\` - Async method for data retrieval
3. \`processData(input)\` - Transforms input data

Each method has a specific responsibility, making the code maintainable.`;
    }

    if (lowerQuery.includes('improve') || lowerQuery.includes('suggest')) {
      return `**Improvement Suggestions:**

✅ **Current Strengths:**
- Clear method naming
- Async/await pattern usage
- Simple data structure

💡 **Potential Improvements:**
1. Add error handling for \`fetchData()\`
2. Type validation for \`processData()\` input
3. Consider adding JSDoc comments
4. Add data validation in constructor

Would you like me to elaborate on any of these?`;
    }

    if (lowerQuery.includes('relationship') || lowerQuery.includes('depend')) {
      return `**Class Relationships:**

This class is self-contained with no external dependencies shown in the current view.

**Internal Relationships:**
- \`data\` property is used by both fetch and process methods
- Methods work independently but share the class state

For a full dependency analysis, I'd need to see imports and usage context.`;
    }

    return `I can help you understand the UML diagram and code structure. Try asking about:

- **"Explain the class structure"** - Overview of classes and organization
- **"What methods are available?"** - List of all methods
- **"Suggest improvements"** - Code quality recommendations
- **"Explain relationships"** - How components interact

What would you like to know?`;
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.id === tabId);

    // Remove both code and diagram tabs for this file
    const baseFileName = tab?.fileName.replace(' (UML)', '');
    const newTabs = tabs.filter(t =>
      !t.fileName.startsWith(baseFileName || '')
    );

    setTabs(newTabs);

    if (activeTabId === tabId && newTabs.length > 0) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    } else if (newTabs.length === 0) {
      setActiveTabId('');
    }
  };

  const getActiveTab = () => tabs.find(t => t.id === activeTabId);

  const getCodeTab = () => {
    const activeTab = getActiveTab();
    if (!activeTab) return null;
    const baseFileName = activeTab.fileName.replace(' (UML)', '');
    return tabs.find(t => t.fileName === baseFileName && t.type === 'code');
  };

  const getDiagramTab = () => {
    const activeTab = getActiveTab();
    if (!activeTab) return null;
    const baseFileName = activeTab.fileName.replace(' (UML)', '');
    return tabs.find(t => t.fileName === `${baseFileName} (UML)` && t.type === 'diagram');
  };

  const handleDiagramGenerated = (svg: string) => {
    // Handle diagram generation if needed
  };

  return (
    <div
      className="h-screen flex flex-col bg-[#1e1e1e] relative"
      style={{
        cursor: isResizingSidebar || isResizingRight ? 'col-resize' : isDraggingUml ? 'move' : isResizingUml ? 'nwse-resize' : 'default',
        userSelect: (isResizingSidebar || isResizingRight || isDraggingUml || isResizingUml) ? 'none' : 'auto'
      }}
    >
      {/* VS Code Title Bar */}
      <div className="h-9 bg-[#323233] flex items-center px-2 text-xs border-b border-[#1e1e1e]">
        <button
          onClick={onBack}
          className="p-1.5 hover:bg-[#3e3e42] rounded transition-colors mr-2"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-gray-400" />
        </button>

        <div className="flex items-center gap-2 flex-1">
          <FileCode className="h-3.5 w-3.5 text-[#007acc]" />
          <span className="text-gray-300 font-medium">{projectName}</span>
          <span className="text-gray-500">-</span>
          <span className="text-gray-500 text-[11px]">{projectType === 'github' ? 'GitHub' : 'Local'}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const newSplitView = !splitView;
              setSplitView(newSplitView);

              // If enabling split view and currently on a diagram tab, switch to code tab
              if (newSplitView && activeTabId.endsWith('-diagram')) {
                const activeTab = getActiveTab();
                const baseFileName = activeTab?.fileName.replace(' (UML)', '');
                const codeTab = tabs.find(t => t.fileName === baseFileName && t.type === 'code');
                if (codeTab) {
                  setActiveTabId(codeTab.id);
                }
              }

              // Position the UML window next to the editor when opening
              if (newSplitView) {
                const editorArea = document.getElementById('editor-area');
                if (editorArea === null) {
                  // Fallback: center the floating window if the editor element is unavailable
                  setUmlWindowPosition({ x: 100, y: 100 });
                  return;
                }
                const rect = editorArea.getBoundingClientRect();
                setUmlWindowPosition({
                  x: rect.left + rect.width - 620, // 20px padding from right edge
                  y: rect.top + 20, // 20px from top
                });
              }
            }}
            className={`px-2 py-1 hover:bg-[#3e3e42] rounded transition-colors flex items-center gap-1.5 ${
              splitView ? 'text-[#007acc]' : 'text-gray-400 hover:text-white'
            }`}
            title="Toggle split view"
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="text-xs">Split</span>
          </button>
          <button
            onClick={() => router.push(`/workspace/${projectId}/overview`)}
            className="px-2 py-1 hover:bg-[#3e3e42] rounded text-gray-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Overview</span>
          </button>
          <button
            onClick={onShare}
            className="p-1.5 hover:bg-[#3e3e42] rounded transition-colors"
          >
            <Share2 className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <button className="p-1.5 hover:bg-[#3e3e42] rounded transition-colors">
            <Settings className="h-3.5 w-3.5 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar (Far Left) */}
        <div className="w-12 bg-[#333333] flex flex-col items-center py-2 border-r border-[#1e1e1e]">
          <button
            onClick={() => {
              if (activeActivity === 'explorer' && !sidebarCollapsed) {
                setSidebarCollapsed(true);
              } else {
                setActiveActivity('explorer');
                setSidebarCollapsed(false);
              }
            }}
            className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
              activeActivity === 'explorer' && !sidebarCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
            title={sidebarCollapsed ? 'Show Explorer' : 'Hide Explorer'}
          >
            <Files className="h-6 w-6" />
            {activeActivity === 'explorer' && !sidebarCollapsed && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />
            )}
          </button>

          <button
            onClick={() => {
              setActiveActivity('search');
              setSidebarCollapsed(false);
            }}
            className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
              activeActivity === 'search' && !sidebarCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Search className="h-6 w-6" />
            {activeActivity === 'search' && !sidebarCollapsed && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />
            )}
          </button>

          <button
            onClick={() => {
              setActiveActivity('source-control');
              setSidebarCollapsed(false);
            }}
            className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
              activeActivity === 'source-control' && !sidebarCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <GitBranch className="h-6 w-6" />
            {activeActivity === 'source-control' && !sidebarCollapsed && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />
            )}
          </button>

          <button
            onClick={() => {
              setActiveActivity('extensions');
              setSidebarCollapsed(false);
            }}
            className={`w-12 h-12 flex items-center justify-center transition-colors relative ${
              activeActivity === 'extensions' && !sidebarCollapsed
                ? 'text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Package className="h-6 w-6" />
            {activeActivity === 'extensions' && !sidebarCollapsed && (
              <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-white" />
            )}
          </button>

          <div className="flex-1" />

          <button
            onClick={onUpload}
            className="w-12 h-12 flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            title="Upload Code"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>

        {/* Sidebar */}
        {!sidebarCollapsed && (
          <>
            <div className="bg-[#252526] border-r border-[#1e1e1e] flex flex-col" style={{ width: `${sidebarWidth}px` }}>
              {activeActivity === 'explorer' && (
                <FilesPanel
                  onFileSelect={handleFileSelect}
                  onCollapse={() => setSidebarCollapsed(true)}
                />
              )}
            {activeActivity === 'search' && (
              <div className="p-4">
                <h3 className="text-xs uppercase text-gray-400 font-semibold mb-3">Search</h3>
                <input
                  type="text"
                  placeholder="Search in files..."
                  className="w-full bg-[#3c3c3c] border border-[#1e1e1e] px-3 py-1.5 text-sm text-white rounded focus:outline-none focus:border-[#007acc]"
                />
              </div>
            )}
            {activeActivity === 'source-control' && (
              <div className="p-4">
                <h3 className="text-xs uppercase text-gray-400 font-semibold mb-3">Source Control</h3>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <GitBranch className="h-4 w-4" />
                  <span>main</span>
                </div>
              </div>
            )}
            {activeActivity === 'extensions' && (
              <div className="p-4">
                <h3 className="text-xs uppercase text-gray-400 font-semibold mb-3">Extensions</h3>
                <p className="text-sm text-gray-500">No extensions installed</p>
              </div>
            )}
            </div>

            {/* Resize Handle */}
            <div
              onMouseDown={() => setIsResizingSidebar(true)}
              className="w-1 bg-[#1e1e1e] hover:bg-[#007acc] cursor-col-resize transition-colors flex-shrink-0"
              title="Drag to resize"
            />
          </>
        )}

        {/* Editor Group */}
        <div className="flex-1 flex flex-col">
          {/* Tabs Bar */}
          {tabs.length > 0 && (
            <div className="h-9 bg-[#252526] border-b border-[#1e1e1e] flex items-center overflow-x-auto overflow-y-hidden scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent">
              {tabs.filter(tab => splitView ? tab.type === 'code' : true).map((tab) => (
                <div
                  key={tab.id}
                  onClick={() => setActiveTabId(tab.id)}
                  className={`h-9 px-3 flex items-center gap-2 border-r border-[#1e1e1e] cursor-pointer group flex-shrink-0 ${
                    activeTabId === tab.id
                      ? 'bg-[#1e1e1e] text-white'
                      : 'bg-[#2d2d2d] text-gray-400 hover:bg-[#1e1e1e]'
                  }`}
                >
                  {tab.type === 'code' ? (
                    <FileCode className="h-3.5 w-3.5 text-[#519aba] flex-shrink-0" />
                  ) : (
                    <Layers className="h-3.5 w-3.5 text-[#c586c0] flex-shrink-0" />
                  )}
                  <span className="text-xs whitespace-nowrap">{tab.fileName}</span>
                  <button
                    onClick={(e) => closeTab(tab.id, e)}
                    className="opacity-0 group-hover:opacity-100 hover:bg-[#3e3e42] rounded p-0.5 transition-all flex-shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Editor Content */}
          <div id="editor-area" className="flex-1 overflow-hidden flex">
            {tabs.length === 0 ? (
              <div className="flex-1 flex items-center justify-center bg-[#1e1e1e]">
                <div className="text-center max-w-md">
                  <FileCode className="h-16 w-16 text-gray-600 mx-auto mb-4" />
                  <h2 className="text-lg font-semibold text-white mb-2">
                    Select a file to view
                  </h2>
                  <p className="text-sm text-gray-400 mb-6">
                    Choose a file from the explorer or upload new code
                  </p>
                  <button
                    onClick={onUpload}
                    className="px-4 py-2 bg-[#0e639c] hover:bg-[#1177bb] text-white text-sm rounded transition-colors inline-flex items-center gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Upload Code
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-auto bg-[#1e1e1e]">
                {(() => {
                  const activeTab = getActiveTab();
                  if (!activeTab) return null;

                  if (activeTab.type === 'code') {
                    return (
                      <CodePreview
                        code={activeTab.code || ''}
                        filename={activeTab.fileName}
                      />
                    );
                  } else {
                    return (
                      <div className="p-6">
                        <div className="mb-4 bg-[#252526] border border-[#3e3e42] rounded-lg p-4">
                          <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                            <Layers className="h-4 w-4 text-[#c586c0]" />
                            UML Diagram Analysis
                          </h3>
                          <p className="text-xs text-gray-400 mb-2">
                            Auto-generated structure analysis for {activeTab.fileName.replace(' (UML)', '')}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <span className="px-2 py-0.5 bg-[#007acc]/20 text-[#007acc] rounded">
                              Interactive Diagram
                            </span>
                            <span>•</span>
                            <span>Ask the AI assistant about this diagram</span>
                          </div>
                        </div>
                        <DiagramGenerator
                          code={activeTab.code || ''}
                          filename={activeTab.fileName.replace(' (UML)', '')}
                          onDiagramGenerated={handleDiagramGenerated}
                        />
                      </div>
                    );
                  }
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Floating UML Window */}
        {splitView && (() => {
          const diagramTab = getDiagramTab();
          if (!diagramTab) return null;

          return (
            <div
              className="absolute bg-[#252526] border border-[#007acc] rounded-lg shadow-2xl flex flex-col overflow-hidden"
              style={{
                left: `${umlWindowPosition.x}px`,
                top: `${umlWindowPosition.y}px`,
                width: `${umlWindowSize.width}px`,
                height: `${umlWindowSize.height}px`,
                zIndex: 1000,
              }}
            >
              {/* Window Header */}
              <div
                className="h-9 bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center justify-between px-3 cursor-move"
                onMouseDown={(e) => {
                  setIsDraggingUml(true);
                  setDragOffset({
                    x: e.clientX - umlWindowPosition.x,
                    y: e.clientY - umlWindowPosition.y,
                  });
                }}
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-[#c586c0]" />
                  <span className="text-xs text-white font-medium">{diagramTab.fileName}</span>
                </div>
                <button
                  onClick={() => setSplitView(false)}
                  className="p-1 hover:bg-[#3e3e42] rounded transition-colors"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5 text-gray-400 hover:text-white" />
                </button>
              </div>

              {/* Window Content */}
              <div className="flex-1 overflow-auto bg-[#1e1e1e]">
                <div className="p-6">
                  <div className="mb-4 bg-[#252526] border border-[#3e3e42] rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-[#c586c0]" />
                      UML Diagram Analysis
                    </h3>
                    <p className="text-xs text-gray-400 mb-2">
                      Auto-generated structure analysis for {diagramTab.fileName.replace(' (UML)', '')}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="px-2 py-0.5 bg-[#007acc]/20 text-[#007acc] rounded">
                        Interactive Diagram
                      </span>
                      <span>•</span>
                      <span>Ask the AI assistant about this diagram</span>
                    </div>
                  </div>
                  <DiagramGenerator
                    code={diagramTab.code || ''}
                    filename={diagramTab.fileName.replace(' (UML)', '')}
                    onDiagramGenerated={handleDiagramGenerated}
                  />
                </div>
              </div>

              {/* Resize Handle */}
              <div
                className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setIsResizingUml(true);
                }}
                style={{
                  background: 'linear-gradient(135deg, transparent 50%, #007acc 50%)',
                }}
              />
            </div>
          );
        })()}

        {/* Right Panel - AI Assistant */}
        {!rightPanelCollapsed && (
          <>
            {/* Resize Handle */}
            <div
              onMouseDown={() => setIsResizingRight(true)}
              className="w-1 bg-[#1e1e1e] hover:bg-[#007acc] cursor-col-resize transition-colors flex-shrink-0"
              title="Drag to resize"
            />

            <div className="bg-[#252526] border-l border-[#1e1e1e] flex flex-col" style={{ width: `${rightPanelWidth}px` }}>
              {/* Panel Header */}
              <div className="h-9 bg-[#252526] flex items-center justify-between px-3 border-b border-[#1e1e1e]">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[#007acc]" />
                  <h3 className="text-xs font-semibold text-white">AI Assistant</h3>
                </div>
                <button
                  onClick={() => setRightPanelCollapsed(true)}
                  className="p-1 hover:bg-[#3e3e42] rounded transition-colors"
                  title="Collapse Panel"
                >
                  <ChevronRight className="h-4 w-4 text-gray-400 hover:text-white" />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-auto p-3 space-y-3">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0">
                        <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                          <Bot className="h-3.5 w-3.5 text-white" />
                        </div>
                      </div>
                    )}

                    <div
                      className={`max-w-[85%] rounded px-3 py-2 text-xs ${
                        message.role === 'user'
                          ? 'bg-[#007acc] text-white'
                          : 'bg-[#1e1e1e] text-gray-300 border border-[#3e3e42]'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{message.content}</div>
                      <div className="text-[10px] mt-1 opacity-60">
                        {message.timestamp.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex gap-2 justify-start">
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <Bot className="h-3.5 w-3.5 text-white" />
                      </div>
                    </div>
                    <div className="bg-[#1e1e1e] border border-[#3e3e42] rounded px-3 py-2">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatMessagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="border-t border-[#3e3e42] p-3 bg-[#252526]">
                <div className="flex gap-2 items-end">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Ask about the UML diagram..."
                    className="flex-1 bg-[#3c3c3c] border border-[#1e1e1e] px-3 py-2 text-xs text-white rounded focus:outline-none focus:border-[#007acc]"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || isTyping}
                    className="px-3 py-2 bg-[#007acc] hover:bg-[#1177bb] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors flex items-center gap-1 text-xs"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-[10px] mt-2 text-gray-500 flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  AI can make mistakes. Verify important information.
                </p>
              </div>
            </div>
          </>
        )}
        </div>
      </div>

      {/* Status Bar */}
      <div className="h-6 bg-[#007acc] flex items-center px-3 text-xs text-white">
        <div className="flex items-center gap-3">
          <GitBranch className="h-3 w-3" />
          <span>main</span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-4 text-white/90">
          <span>Ln 1, Col 1</span>
          <span>UTF-8</span>
          <span>TypeScript</span>
          {rightPanelCollapsed && (
            <button
              onClick={() => setRightPanelCollapsed(false)}
              className="hover:bg-white/10 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
            >
              <Bot className="h-3 w-3" />
              AI Assistant
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
