'use client';
import { useState } from 'react';
import { ArrowLeft, Share2, Settings, MoreVertical, Grid, List, Maximize2, Download, FileCode, Layers } from 'lucide-react';
import { ChatAgent } from './ChatAgent';

interface ProjectOverviewProps {
  projectId: string;
  projectName: string;
  projectType: 'github' | 'local';
  onBack: () => void;
  onShare: () => void;
}

interface DiagramSection {
  id: string;
  title: string;
  description: string;
  fileCount: number;
}

export function ProjectOverview({ projectId, projectName, projectType, onBack, onShare }: ProjectOverviewProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isChatMinimized, setIsChatMinimized] = useState(false);
  const [selectedDiagram, setSelectedDiagram] = useState<string | null>(null);

  const diagrams: DiagramSection[] = [
    {
      id: 'core-services',
      title: 'Core Services',
      description: 'Main service layer classes and their relationships',
      fileCount: 8,
    },
    {
      id: 'controllers',
      title: 'API Controllers',
      description: 'REST API controller architecture',
      fileCount: 5,
    },
    {
      id: 'data-layer',
      title: 'Data Access Layer',
      description: 'Database models and repositories',
      fileCount: 6,
    },
    {
      id: 'utilities',
      title: 'Utility Classes',
      description: 'Helper classes and utilities',
      fileCount: 4,
    },
    {
      id: 'models',
      title: 'Domain Models',
      description: 'Core business entities',
      fileCount: 7,
    },
    {
      id: 'system-flow',
      title: 'System Flow',
      description: 'High-level system architecture flow',
      fileCount: 12,
    },
  ];

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--adobe-bg-base)' }}>
      {/* Top Navigation */}
      <nav style={{
        backgroundColor: 'var(--adobe-bg-layer-1)',
        borderBottom: '1px solid var(--adobe-border-default)',
      }}>
        <div className="px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <button
                onClick={onBack}
                className="p-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--adobe-text-tertiary)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--adobe-bg-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-5">
                <Layers className="h-5 w-5" style={{ color: 'var(--adobe-blue-400)' }} />
                <div>
                  <h1 className="font-semibold" style={{ color: 'var(--adobe-text-primary)' }}>
                    {projectName} - Overview
                  </h1>
                  <div className="flex items-center gap-5 text-xs" style={{ color: 'var(--adobe-text-quaternary)' }}>
                    <FileCode className="h-3 w-3" />
                    <span>{diagrams.reduce((acc, d) => acc + d.fileCount, 0)} files analyzed</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="flex items-center gap-1 p-1 rounded-lg" style={{
                backgroundColor: 'var(--adobe-bg-base)',
                border: '1px solid var(--adobe-border-default)',
              }}>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${viewMode === 'grid' ? 'bg-[var(--adobe-bg-layer-2)]' : ''}`}
                  style={{ color: viewMode === 'grid' ? 'var(--adobe-text-primary)' : 'var(--adobe-text-tertiary)' }}
                >
                  <Grid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${viewMode === 'list' ? 'bg-[var(--adobe-bg-layer-2)]' : ''}`}
                  style={{ color: viewMode === 'list' ? 'var(--adobe-text-primary)' : 'var(--adobe-text-tertiary)' }}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>

              <button
                onClick={onShare}
                className="px-5 py-2 rounded-lg transition-colors flex items-center gap-5"
                style={{
                  backgroundColor: 'var(--adobe-bg-hover)',
                  color: 'var(--adobe-text-primary)',
                }}
              >
                <Share2 className="h-4 w-4" />
                Share
              </button>

              <button className="p-2 rounded-lg transition-colors" style={{ color: 'var(--adobe-text-tertiary)' }}>
                <Settings className="h-5 w-5" />
              </button>

              <button className="p-2 rounded-lg transition-colors" style={{ color: 'var(--adobe-text-tertiary)' }}>
                <MoreVertical className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Diagrams Area */}
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-5" style={{ color: 'var(--adobe-text-primary)' }}>
                UML Class Diagrams
              </h2>
              <p style={{ color: 'var(--adobe-text-secondary)' }}>
                Comprehensive overview of your project architecture
              </p>
            </div>

            {/* Diagrams Grid/List */}
            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {diagrams.map((section) => (
                  <DiagramCard
                    key={section.id}
                    section={section}
                    onExpand={() => setSelectedDiagram(section.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {diagrams.map((section) => (
                  <DiagramCard
                    key={section.id}
                    section={section}
                    onExpand={() => setSelectedDiagram(section.id)}
                    isListView
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat Agent Panel */}
        <div
          className="flex-shrink-0 border-l"
          style={{
            width: isChatMinimized ? '0' : '400px',
            borderColor: 'var(--adobe-border-default)',
            transition: 'width 200ms ease-in-out',
            overflow: 'hidden',
          }}
        >
          <ChatAgent
            projectName={projectName}
            isMinimized={isChatMinimized}
            onToggleMinimize={() => setIsChatMinimized(!isChatMinimized)}
          />
        </div>
      </div>

      {/* Expanded Diagram Modal */}
      {selectedDiagram && (
        <DiagramModal
          section={diagrams.find(d => d.id === selectedDiagram)!}
          onClose={() => setSelectedDiagram(null)}
        />
      )}
    </div>
  );
}

function DiagramCard({ section, onExpand, isListView }: {
  section: DiagramSection;
  onExpand: () => void;
  isListView?: boolean;
}) {

  return (
    <div
      className="rounded-xl border overflow-hidden group transition-all"
      style={{
        backgroundColor: 'var(--adobe-bg-layer-1)',
        borderColor: 'var(--adobe-border-default)',
      }}
    >
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--adobe-border-default)' }}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="font-semibold mb-1" style={{ color: 'var(--adobe-text-primary)' }}>
              {section.title}
            </h3>
            <p className="text-base mb-5" style={{ color: 'var(--adobe-text-tertiary)' }}>
              {section.description}
            </p>
            <div className="flex items-center gap-5 text-xs" style={{ color: 'var(--adobe-text-quaternary)' }}>
              <span>{section.fileCount} files</span>
            </div>
          </div>

          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onExpand}
              className="p-2 rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--adobe-bg-hover)' }}
              title="Expand diagram"
            >
              <Maximize2 className="h-4 w-4" style={{ color: 'var(--adobe-text-tertiary)' }} />
            </button>
            <button
              className="p-2 rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--adobe-bg-hover)' }}
              title="Download diagram"
            >
              <Download className="h-4 w-4" style={{ color: 'var(--adobe-text-tertiary)' }} />
            </button>
          </div>
        </div>
      </div>

      {/* Diagram */}
      <div
        className="p-6 overflow-auto flex items-center justify-center"
        style={{
          backgroundColor: 'var(--adobe-gray-950)',
          maxHeight: isListView ? '400px' : '300px',
          minHeight: '200px',
        }}
      >
        <div className="text-center">
          <Layers className="h-16 w-16 mx-auto mb-5 opacity-20" style={{ color: 'var(--adobe-text-tertiary)' }} />
          <p className="text-base" style={{ color: 'var(--adobe-text-tertiary)' }}>
            {section.title} Diagram
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--adobe-text-quaternary)' }}>
            UML visualization for {section.fileCount} files
          </p>
        </div>
      </div>
    </div>
  );
}

function DiagramModal({ section, onClose }: { section: DiagramSection; onClose: () => void }) {

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ backgroundColor: 'var(--adobe-bg-overlay)' }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl border max-w-6xl w-full max-h-[90vh] overflow-auto"
        style={{
          backgroundColor: 'var(--adobe-bg-layer-1)',
          borderColor: 'var(--adobe-border-default)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--adobe-border-default)' }}>
          <div>
            <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--adobe-text-primary)' }}>
              {section.title}
            </h2>
            <p style={{ color: 'var(--adobe-text-tertiary)' }}>{section.description}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--adobe-bg-hover)' }}
          >
            <MoreVertical className="h-5 w-5" style={{ color: 'var(--adobe-text-tertiary)' }} />
          </button>
        </div>

        {/* Diagram */}
        <div className="p-8 flex items-center justify-center min-h-[400px]" style={{ backgroundColor: 'var(--adobe-gray-950)' }}>
          <div className="text-center">
            <Layers className="h-24 w-24 mx-auto mb-5 opacity-20" style={{ color: 'var(--adobe-text-tertiary)' }} />
            <p className="text-2xl font-semibold mb-5" style={{ color: 'var(--adobe-text-primary)' }}>
              {section.title} Diagram
            </p>
            <p className="text-base" style={{ color: 'var(--adobe-text-tertiary)' }}>
              UML class diagram for {section.fileCount} analyzed files
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
