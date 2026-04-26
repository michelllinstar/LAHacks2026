'use client';
import {
  GitBranch, GitCommit, GitMerge, RefreshCw, MoreHorizontal, Check,
  ChevronDown, ChevronRight, Plus, RotateCcw, X, FileText,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { listRepos } from '../../../lib/api';
import type { RepoSummary } from '../../../lib/types';

interface SourceControlPanelProps {
  onCollapse?: () => void;
}

type ChangeStatus = 'M' | 'U' | 'A' | 'D' | 'R' | 'C';

interface FileChange {
  path: string;
  status: ChangeStatus;
  staged: boolean;
}

interface Commit {
  hash: string;
  author: string;
  message: string;
  time: string;
  refs?: string[];
  laneColor: string;
  parents: number;
}

const STATUS_META: Record<ChangeStatus, { label: string; color: string }> = {
  M: { label: 'Modified', color: '#e2c08d' },
  U: { label: 'Untracked', color: '#73c991' },
  A: { label: 'Added', color: '#81b88b' },
  D: { label: 'Deleted', color: '#c74e39' },
  R: { label: 'Renamed', color: '#73c991' },
  C: { label: 'Conflict', color: '#c74e39' },
};

const MOCK_CHANGES: FileChange[] = [
  { path: 'frontend/src/app/components/cartographer/CartographerWorkspace.tsx', status: 'M', staged: false },
  { path: 'frontend/src/app/components/cartographer/UnifiedGraphView.tsx', status: 'M', staged: false },
  { path: 'frontend/src/styles/adobe-design-system.css', status: 'M', staged: false },
  { path: 'frontend/src/styles/globals.css', status: 'M', staged: false },
  { path: 'frontend/src/styles/theme.css', status: 'M', staged: false },
  { path: 'frontend/src/app/components/workspace/SourceControlPanel.tsx', status: 'U', staged: false },
];

const MOCK_COMMITS: Commit[] = [
  { hash: '7a1b2b2', author: 'michelllinstar', message: "Merge remote-tracking branch 'origin/main'", time: '2h', refs: ['HEAD', 'main', 'origin/main'], laneColor: '#3794ff', parents: 2 },
  { hash: 'bcba767', author: 'michelllinstar', message: 'frontend', time: '5h', laneColor: '#3794ff', parents: 1 },
  { hash: '6d67fdc', author: 'michelllinstar', message: 'Audit fixes + permissive demo login', time: '1d', laneColor: '#3794ff', parents: 1 },
  { hash: '90dded8', author: 'michelllinstar', message: 'Migrate to Next.js App Router routes + drop legacy frontend tree', time: '1d', laneColor: '#3794ff', parents: 1 },
  { hash: '746a8c6', author: 'michelllinstar', message: 'Wire frontend (App Router rewrite) to live backend', time: '2d', laneColor: '#3794ff', parents: 1 },
];

function basename(p: string) {
  const idx = p.lastIndexOf('/');
  return idx === -1 ? p : p.slice(idx + 1);
}
function dirname(p: string) {
  const idx = p.lastIndexOf('/');
  return idx === -1 ? '' : p.slice(0, idx);
}

export function SourceControlPanel({ onCollapse }: SourceControlPanelProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [repos, setRepos] = useState<RepoSummary[]>([]);
  const [reposLoaded, setReposLoaded] = useState(false);
  const [changes, setChanges] = useState<FileChange[]>(MOCK_CHANGES);
  const [openSections, setOpenSections] = useState({
    repos: true,
    staged: true,
    changes: true,
    graph: true,
  });
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRepos()
      .then((data) => {
        if (cancelled) return;
        setRepos(data);
        if (data.length > 0) setActiveRepo(data[0].hash);
      })
      .catch(() => {})
      .finally(() => !cancelled && setReposLoaded(true));
    return () => { cancelled = true; };
  }, []);

  const staged = useMemo(() => changes.filter((c) => c.staged), [changes]);
  const unstaged = useMemo(() => changes.filter((c) => !c.staged), [changes]);

  const stage = (path: string) =>
    setChanges((prev) => prev.map((c) => (c.path === path ? { ...c, staged: true } : c)));
  const unstage = (path: string) =>
    setChanges((prev) => prev.map((c) => (c.path === path ? { ...c, staged: false } : c)));
  const discard = (path: string) =>
    setChanges((prev) => prev.filter((c) => c.path !== path));
  const stageAll = () => setChanges((prev) => prev.map((c) => ({ ...c, staged: true })));

  const toggle = (key: keyof typeof openSections) =>
    setOpenSections((s) => ({ ...s, [key]: !s[key] }));

  const showRepos = repos.length > 1;

  return (
    <div className="flex flex-col h-full text-[#cccccc] text-[13px] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2 h-9">
        <h3 className="text-[11px] uppercase tracking-wide font-semibold text-[#cccccc]">
          Source Control
        </h3>
        <div className="flex items-center gap-1 text-[#cccccc]">
          <button title="Refresh" className="p-1 hover:bg-[#2a2d2e] rounded">
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button title="Commit" className="p-1 hover:bg-[#2a2d2e] rounded">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button title="More Actions..." className="p-1 hover:bg-[#2a2d2e] rounded">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {onCollapse && (
            <button title="Collapse" onClick={onCollapse} className="p-1 hover:bg-[#2a2d2e] rounded">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Commit message + button */}
      <div className="px-2 pb-2">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder={`Message (Ctrl+Enter to commit on '${repos[0]?.name ?? 'main'}')`}
          rows={2}
          className="w-full bg-[#3c3c3c] border border-[#3c3c3c] focus:border-[#007fd4] focus:outline-none px-2 py-1.5 text-[13px] text-[#cccccc] placeholder-[#6e6e6e] rounded-sm resize-none"
        />
        <button
          disabled={staged.length === 0 || !commitMessage.trim()}
          className="mt-1 w-full h-[26px] bg-[#0e639c] hover:bg-[#1177bb] disabled:bg-[#0e639c]/50 disabled:cursor-not-allowed text-white text-[13px] flex items-center justify-center gap-1.5 rounded-sm"
        >
          <Check className="h-3.5 w-3.5" />
          Commit
        </button>
      </div>

      <div className="overflow-y-auto flex-1">
        {/* Repositories */}
        {showRepos && (
          <Section
            label="Source Control Repositories"
            open={openSections.repos}
            onToggle={() => toggle('repos')}
            count={repos.length}
          >
            {repos.map((r) => (
              <div
                key={r.hash}
                onClick={() => setActiveRepo(r.hash)}
                className={`flex items-center gap-2 pl-6 pr-3 h-[22px] cursor-pointer ${
                  activeRepo === r.hash ? 'bg-[#37373d]' : 'hover:bg-[#2a2d2e]'
                }`}
              >
                <GitBranch className="h-3.5 w-3.5 text-[#cccccc] flex-shrink-0" />
                <span className="truncate flex-1">{r.name}</span>
                <span className="text-[11px] text-[#858585] truncate">main</span>
              </div>
            ))}
            {reposLoaded && repos.length === 0 && (
              <div className="pl-6 pr-3 py-1 text-[12px] text-[#858585]">No repositories.</div>
            )}
          </Section>
        )}

        {/* Staged Changes */}
        {staged.length > 0 && (
          <Section
            label="Staged Changes"
            open={openSections.staged}
            onToggle={() => toggle('staged')}
            count={staged.length}
            actions={
              <button
                title="Unstage All Changes"
                onClick={(e) => {
                  e.stopPropagation();
                  setChanges((prev) => prev.map((c) => ({ ...c, staged: false })));
                }}
                className="p-0.5 hover:bg-[#3a3d3e] rounded"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            }
          >
            {staged.map((c) => (
              <ChangeRow
                key={c.path}
                change={c}
                hovered={hoveredRow === `s:${c.path}`}
                onHover={(h) => setHoveredRow(h ? `s:${c.path}` : null)}
                actions={[
                  { icon: <RotateCcw className="h-3.5 w-3.5" />, title: 'Unstage Changes', onClick: () => unstage(c.path) },
                ]}
              />
            ))}
          </Section>
        )}

        {/* Changes */}
        <Section
          label="Changes"
          open={openSections.changes}
          onToggle={() => toggle('changes')}
          count={unstaged.length}
          actions={
            <>
              <button
                title="Discard All Changes"
                onClick={(e) => e.stopPropagation()}
                className="p-0.5 hover:bg-[#3a3d3e] rounded"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                title="Stage All Changes"
                onClick={(e) => { e.stopPropagation(); stageAll(); }}
                className="p-0.5 hover:bg-[#3a3d3e] rounded"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </>
          }
        >
          {unstaged.length === 0 && (
            <div className="pl-6 pr-3 py-1 text-[12px] text-[#858585]">No changes.</div>
          )}
          {unstaged.map((c) => (
            <ChangeRow
              key={c.path}
              change={c}
              hovered={hoveredRow === `c:${c.path}`}
              onHover={(h) => setHoveredRow(h ? `c:${c.path}` : null)}
              actions={[
                { icon: <X className="h-3.5 w-3.5" />, title: 'Discard Changes', onClick: () => discard(c.path) },
                { icon: <Plus className="h-3.5 w-3.5" />, title: 'Stage Changes', onClick: () => stage(c.path) },
              ]}
            />
          ))}
        </Section>

        {/* Graph */}
        <Section
          label="Graph"
          open={openSections.graph}
          onToggle={() => toggle('graph')}
        >
          <div className="pb-2">
            {MOCK_COMMITS.map((commit, i) => (
              <CommitRow
                key={commit.hash}
                commit={commit}
                isLast={i === MOCK_COMMITS.length - 1}
              />
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  label, open, onToggle, count, actions, children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="group/section">
      <div
        onClick={onToggle}
        className="flex items-center gap-1 pl-2 pr-3 h-[22px] cursor-pointer hover:bg-[#2a2d2e] text-[11px] uppercase tracking-wide font-semibold text-[#cccccc]"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <span className="flex-1 truncate">{label}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover/section:opacity-100">
          {actions}
        </div>
        {count != null && (
          <span className="ml-1 min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#4d4d4d] text-[#cccccc] text-[11px] font-normal flex items-center justify-center">
            {count}
          </span>
        )}
      </div>
      {open && <div>{children}</div>}
    </div>
  );
}

function ChangeRow({
  change, hovered, onHover, actions,
}: {
  change: FileChange;
  hovered: boolean;
  onHover: (h: boolean) => void;
  actions: { icon: React.ReactNode; title: string; onClick: () => void }[];
}) {
  const meta = STATUS_META[change.status];
  const name = basename(change.path);
  const dir = dirname(change.path);
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className="flex items-center gap-2 pl-6 pr-2 h-[22px] cursor-pointer hover:bg-[#2a2d2e]"
      title={change.path}
    >
      <FileText className="h-3.5 w-3.5 text-[#519aba] flex-shrink-0" />
      <span className="truncate flex-shrink-0" style={{ color: meta.color }}>{name}</span>
      <span className="truncate text-[12px] text-[#858585] flex-1">{dir}</span>
      <div className="flex items-center gap-1">
        {hovered ? (
          actions.map((a, i) => (
            <button
              key={i}
              title={a.title}
              onClick={(e) => { e.stopPropagation(); a.onClick(); }}
              className="p-0.5 text-[#cccccc] hover:bg-[#3a3d3e] rounded"
            >
              {a.icon}
            </button>
          ))
        ) : (
          <span
            className="w-4 text-center text-[12px] font-semibold"
            style={{ color: meta.color }}
            title={meta.label}
          >
            {change.status}
          </span>
        )}
      </div>
    </div>
  );
}

function CommitRow({ commit, isLast }: { commit: Commit; isLast: boolean }) {
  return (
    <div className="flex items-stretch hover:bg-[#2a2d2e] cursor-pointer h-[44px]">
      {/* Graph lane */}
      <div className="relative w-8 flex-shrink-0 flex justify-center">
        {!isLast && (
          <div
            className="absolute top-0 bottom-0 w-[2px]"
            style={{ background: commit.laneColor, left: '50%', transform: 'translateX(-50%)' }}
          />
        )}
        <div
          className="relative z-10 mt-[14px] h-3 w-3 rounded-full border-2"
          style={{ borderColor: commit.laneColor, background: '#1e1e1e' }}
        >
          {commit.parents > 1 && (
            <GitMerge
              className="absolute -inset-1 h-5 w-5"
              style={{ color: commit.laneColor }}
            />
          )}
        </div>
      </div>
      {/* Commit details */}
      <div className="flex-1 min-w-0 py-1 pr-3">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13px] text-[#cccccc]">{commit.message}</span>
          {commit.refs?.map((ref) => (
            <span
              key={ref}
              className="flex items-center gap-1 px-1.5 h-[16px] text-[10px] rounded-sm bg-[#3a3d41] text-[#cccccc] flex-shrink-0"
            >
              <GitBranch className="h-2.5 w-2.5" />
              {ref}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[#858585] mt-0.5">
          <span className="truncate">{commit.author}</span>
          <span>•</span>
          <span className="font-mono">{commit.hash.slice(0, 7)}</span>
          <span>•</span>
          <span>{commit.time}</span>
        </div>
      </div>
    </div>
  );
}
