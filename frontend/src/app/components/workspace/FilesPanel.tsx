'use client';
import { FileCode, Folder, ChevronDown, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useCartographerStore } from '../../../lib/store';

export interface SelectedPath {
  path: string;
  kind: 'file' | 'folder';
  name?: string;
}

interface FilesPanelProps {
  repositoryId: string;
  selected: SelectedPath | null;
  onFileSelect: (item: SelectedPath | null) => void;
  onCollapse?: () => void;
}

interface TreeNode {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  children: Map<string, TreeNode>;
}

function buildTree(filePaths: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', kind: 'folder', children: new Map() };
  for (const fp of filePaths) {
    const parts = fp.split('/').filter(Boolean);
    let cur = root;
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      acc = acc ? `${acc}/${part}` : part;
      const isLeaf = i === parts.length - 1;
      let child = cur.children.get(part);
      if (!child) {
        child = {
          name: part,
          path: acc,
          kind: isLeaf ? 'file' : 'folder',
          children: new Map(),
        };
        cur.children.set(part, child);
      }
      cur = child;
    }
  }
  return root;
}

// Collapse single-child folder chains (e.g. src/app/components → src/app/components)
function flattenName(node: TreeNode): { display: string; node: TreeNode } {
  let display = node.name;
  let cur = node;
  while (cur.kind === 'folder' && cur.children.size === 1) {
    const only = cur.children.values().next().value as TreeNode;
    if (only.kind !== 'folder') break;
    display = `${display}/${only.name}`;
    cur = only;
  }
  return { display, node: cur };
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (path: string) => void;
  onPick: (item: SelectedPath) => void;
  selectedPath: string | null;
}

function TreeRow({ node, depth, expanded, onToggle, onPick, selectedPath }: TreeRowProps) {
  if (node.kind === 'file') {
    const isSel = selectedPath === node.path;
    return (
      <div
        onClick={() => onPick({ path: node.path, kind: 'file', name: node.name })}
        className={`flex items-center gap-1 py-0.5 text-[11px] cursor-pointer transition-colors ${
          isSel ? 'bg-[#094771] text-white' : 'text-gray-300 hover:text-white hover:bg-[#2a2d2e]'
        }`}
        style={{ paddingLeft: 6 + depth * 12 }}
        title={node.path}
      >
        <FileCode className="h-3 w-3 text-[#519aba] flex-shrink-0" />
        <span className="flex-1 truncate">{node.name}</span>
      </div>
    );
  }

  const { display, node: innerNode } = flattenName(node);
  const open = expanded[innerNode.path] ?? depth < 1;
  const isSel = selectedPath === innerNode.path;
  const childList = [...innerNode.children.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <>
      <div
        className={`flex items-center gap-0.5 py-0.5 text-[11px] cursor-pointer transition-colors ${
          isSel ? 'bg-[#094771] text-white' : 'text-white hover:bg-[#2a2d2e]'
        }`}
        style={{ paddingLeft: 4 + depth * 12 }}
        title={innerNode.path}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(innerNode.path);
          }}
          className="flex items-center"
        >
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        <button
          onClick={() => onPick({ path: innerNode.path, kind: 'folder', name: display })}
          className="flex items-center gap-1 flex-1 min-w-0"
        >
          <Folder className="h-3 w-3 text-[#dcb67a] flex-shrink-0" />
          <span className="truncate">{display}</span>
        </button>
      </div>
      {open &&
        childList.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            onPick={onPick}
            selectedPath={selectedPath}
          />
        ))}
    </>
  );
}

export function FilesPanel({ repositoryId, selected, onFileSelect, onCollapse }: FilesPanelProps) {
  const symbolGraph = useCartographerStore((s) => s.byRepo[repositoryId]?.graphs.symbol);

  const filePaths = useMemo(() => {
    if (!symbolGraph) return [];
    const set = new Set<string>();
    for (const n of symbolGraph.nodes) {
      const fp = n.metadata?.file_path as string | undefined;
      if (fp) set.add(fp);
    }
    return [...set].sort();
  }, [symbolGraph]);

  const tree = useMemo(() => buildTree(filePaths), [filePaths]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (path: string) => setExpanded((p) => ({ ...p, [path]: !(p[path] ?? false) }));

  const rootChildren = [...tree.children.values()].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="h-full flex flex-col bg-[#252526]">
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

      {selected && (
        <div className="px-2 py-1 border-b border-[#1e1e1e] flex items-center gap-1 bg-[#1e1e1e]">
          <span className="text-[10px] uppercase text-gray-500 tracking-wide">Filter:</span>
          <span className="text-[11px] text-gray-200 flex-1 truncate" title={selected.path}>
            {selected.kind === 'folder' ? selected.path + '/' : selected.path}
          </span>
          <button
            onClick={() => onFileSelect(null)}
            className="p-0.5 hover:bg-[#2a2d2e] rounded transition-colors"
            title="Clear filter"
          >
            <X className="h-3 w-3 text-gray-400 hover:text-white" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto py-1 min-h-0">
        {filePaths.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 px-3">
            <Folder className="h-8 w-8 text-gray-600 mb-2" />
            <p className="text-[11px] text-gray-400">
              {symbolGraph ? 'No files indexed yet' : 'Loading…'}
            </p>
          </div>
        ) : (
          rootChildren.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={0}
              expanded={expanded}
              onToggle={toggle}
              onPick={onFileSelect}
              selectedPath={selected?.path ?? null}
            />
          ))
        )}
      </div>

      <div className="border-t border-[#1e1e1e] px-2 py-2 flex-shrink-0">
        <div className="text-[10px] uppercase text-gray-500 font-semibold tracking-wide mb-1.5">Legend</div>
        <div className="flex flex-col gap-1">
          {LEGEND_ITEMS.map(({ type, color }) => (
            <div key={type} className="flex items-center gap-2">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: color }}
              />
              <span className="text-[11px] text-gray-300 capitalize">{type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const LEGEND_ITEMS: { type: string; color: string }[] = [
  { type: 'class', color: '#3b82f6' },
  { type: 'interface', color: '#a855f7' },
  { type: 'function', color: '#22c55e' },
  { type: 'module', color: '#f59e0b' },
  { type: 'variable', color: '#6b7280' },
];
