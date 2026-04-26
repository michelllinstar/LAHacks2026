'use client';
import { useCartographerStore } from '../../../lib/store';

interface RootFlowViewProps {
  repositoryId: string;
  /** 'tiers' shows the Frontend ⇄ Backend ⇄ Database tier flowchart with
   *  «HTTP» / «SQL» protocol stereotypes; 'layers' zooms into the Backend
   *  tier and stacks the four canonical layers (Controller / Service /
   *  Repository / Entity) with downward UML dependency arrows. */
  level: 'tiers' | 'layers';
}

const LAYER_BANDS = [
  { name: 'Controller', tone: '#5EEAD4', desc: 'translates HTTP requests into method calls' },
  { name: 'Service',    tone: '#34D399', desc: 'business logic / orchestration' },
  { name: 'Repository', tone: '#FBBF24', desc: 'persistence & data access' },
  { name: 'Entity',     tone: '#F59E0B', desc: 'domain types' },
] as const;

const FILE_HINTS: Record<typeof LAYER_BANDS[number]['name'], RegExp> = {
  Controller: /controller|router|route|handler|api/i,
  Service:    /service|usecase|use_case|manager|orchestrat/i,
  Repository: /repository|repo|dao|store|gateway/i,
  Entity:     /entity|model|domain|schema/i,
};

function classifyBand(label: string, filePath: string | null | undefined): typeof LAYER_BANDS[number]['name'] {
  const haystack = `${label} ${filePath ?? ''}`;
  for (const b of LAYER_BANDS) {
    if (FILE_HINTS[b.name].test(haystack)) return b.name;
  }
  return 'Service';
}

// Tier classification — picks Frontend / Backend / Database based on the
// file's top-level directory and a fallback keyword sweep over the full
// path. Anything that doesn't match a known tier falls into Backend, since
// it's the most common default.
type TierName = 'Frontend' | 'Backend' | 'Database';
const TIER_ORDER: TierName[] = ['Frontend', 'Backend', 'Database'];

const TIER_DIR_HINTS: Record<TierName, RegExp> = {
  Frontend: /^(frontend|client|web|webapp|ui|app|spa|mobile|ios|android|public|static|pages|views)/i,
  Database: /^(db|database|sql|migrations|schema|prisma|sqlite|postgres|mongo|fixtures|seeds)/i,
  Backend:  /^(backend|server|api|services|core|lib|src|internal)/i,
};

const TIER_PATH_HINTS: Record<TierName, RegExp> = {
  Frontend: /\b(frontend|client|web|webapp|react|vue|svelte|angular|next|tsx|jsx)\b/i,
  Database: /\b(database|sql|prisma|migration|schema|orm|sqlite|postgres|mongo)\b/i,
  Backend:  /\b(backend|server|api|fastapi|express|django|flask|spring)\b/i,
};

function classifyTier(filePath: string | null | undefined): TierName {
  const fp = (filePath ?? '').toLowerCase();
  if (!fp) return 'Backend';
  const top = fp.split('/').filter(Boolean)[0] ?? '';
  for (const t of TIER_ORDER) {
    if (TIER_DIR_HINTS[t].test(top)) return t;
  }
  for (const t of TIER_ORDER) {
    if (TIER_PATH_HINTS[t].test(fp)) return t;
  }
  // Frontend-y file extensions are a strong signal even when the path
  // doesn't include the keyword (a flat repo of *.tsx files, etc.).
  if (/\.(tsx|jsx|vue|svelte|html|css|scss)$/.test(fp)) return 'Frontend';
  if (/\.(sql|prisma)$/.test(fp)) return 'Database';
  return 'Backend';
}

export function RootFlowView({ repositoryId, level }: RootFlowViewProps) {
  // Live counts straight off the symbol projection — the same source the
  // graph view consumes — so this flowchart reflects whatever the indexer
  // has loaded for the active repo.
  const symbolGraph = useCartographerStore((s) => s.byRepo[repositoryId]?.graphs.symbol);
  const counts: Record<typeof LAYER_BANDS[number]['name'], number> = {
    Controller: 0, Service: 0, Repository: 0, Entity: 0,
  };
  // Per-tier class count, derived from each file's top-level directory.
  // Empty tiers stay at zero — the renderer fades them so the diagram
  // truthfully reflects whether a tier even exists in the upload.
  const tierCounts: Record<TierName, number> = {
    Frontend: 0, Backend: 0, Database: 0,
  };
  if (symbolGraph) {
    for (const n of symbolGraph.nodes) {
      const sym = (n.metadata?.symbol_kind as string | undefined)?.toLowerCase();
      if (sym === 'method' || sym === 'function') continue;
      const fp = (n.metadata?.file_path as string | undefined) ?? null;
      counts[classifyBand(n.label, fp)] += 1;
      tierCounts[classifyTier(fp)] += 1;
    }
  }

  return (
    <div className="h-full w-full bg-[#1a1a1a] flex items-center justify-center overflow-auto">
      <svg
        viewBox={level === 'tiers' ? '0 0 1000 480' : '0 0 720 760'}
        preserveAspectRatio="xMidYMid meet"
        className="max-w-full max-h-full"
        style={{ width: '90%', height: '90%' }}
      >
        <defs>
          <marker id="rfv-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
            <path d="M0 0 L9 5 L0 10" fill="none" stroke="#9ca3af" strokeWidth="1.5" />
          </marker>
          <marker id="rfv-amber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto">
            <path d="M0 0 L9 5 L0 10" fill="none" stroke="#FBBF24" strokeWidth="1.5" />
          </marker>
        </defs>

        {level === 'tiers' && <TierFlow counts={counts} tierCounts={tierCounts} />}
        {level === 'layers' && <LayerFlow counts={counts} />}
      </svg>
    </div>
  );
}

interface FlowProps {
  counts: Record<typeof LAYER_BANDS[number]['name'], number>;
  tierCounts?: Record<TierName, number>;
}

// Tier flowchart — three horizontal tiles linked by «HTTP» and «SQL»
// dependency arrows. Each tile reflects the live class count from the
// uploaded files; tiers with zero classes fade out so the diagram is honest
// about which tiers are actually present in the project.
function TierFlow({ counts, tierCounts }: FlowProps) {
  const tCounts = tierCounts ?? { Frontend: 0, Backend: 0, Database: 0 };
  const tierY = 120;
  const tierH = 220;
  const tierW = 280;
  const xs = { frontend: 40, backend: 360, database: 700 };
  const total = counts.Controller + counts.Service + counts.Repository + counts.Entity;
  const tierPresent = (n: TierName) => tCounts[n] > 0;
  const tierAccent = (n: TierName, base: string) => (tierPresent(n) ? base : '#6b7280');

  return (
    <g>
      {/* Frontend tier */}
      <g opacity={tierPresent('Frontend') ? 1 : 0.45}>
        <Tier
          x={xs.frontend}
          y={tierY}
          w={tierW}
          h={tierH}
          accent={tierAccent('Frontend', '#FBBF24')}
          stereotype="«tier»"
          name="Frontend"
          subtitle={tierPresent('Frontend') ? `${tCounts.Frontend} classes` : 'no frontend code uploaded'}
        />
      </g>

      {/* Backend tier with stacked layer summary */}
      <g opacity={tierPresent('Backend') ? 1 : 0.45}>
        <rect
          x={xs.backend}
          y={tierY}
          width={tierW}
          height={tierH}
          rx="14"
          fill={`${tierAccent('Backend', '#5EEAD4')}1a`}
          stroke={`${tierAccent('Backend', '#5EEAD4')}aa`}
          strokeWidth="1.6"
        />
        <text x={xs.backend + tierW / 2} y={tierY + 24} textAnchor="middle" fontSize="11" fontStyle="italic" fill={tierAccent('Backend', '#5EEAD4')} fontFamily="ui-monospace, Menlo">
          «tier»
        </text>
        <text x={xs.backend + tierW / 2} y={tierY + 44} textAnchor="middle" fontSize="16" fontWeight={700} fill="#fff">Backend</text>
        <text x={xs.backend + tierW / 2} y={tierY + 60} textAnchor="middle" fontSize="10" fill="#9ca3af">
          {tierPresent('Backend')
            ? `${total} classes across ${LAYER_BANDS.filter((b) => counts[b.name] > 0).length} layers`
            : 'no backend code uploaded'}
        </text>
        {LAYER_BANDS.map((b, i) => {
          const has = counts[b.name] > 0;
          return (
            <g key={b.name} opacity={has ? 1 : 0.4}>
              <rect
                x={xs.backend + 16}
                y={tierY + 78 + i * 32}
                width={tierW - 32}
                height={26}
                rx="6"
                fill={`${b.tone}26`}
                stroke={`${b.tone}aa`}
                strokeWidth="1"
              />
              <text x={xs.backend + 28} y={tierY + 96 + i * 32} fontSize="11" fill="#fff" fontWeight={600} fontFamily="ui-monospace, Menlo">
                {b.name}
              </text>
              <text x={xs.backend + tierW - 28} y={tierY + 96 + i * 32} textAnchor="end" fontSize="10" fill={b.tone} fontFamily="ui-monospace, Menlo">
                {counts[b.name]}
              </text>
            </g>
          );
        })}
      </g>

      {/* Database tier */}
      <g opacity={tierPresent('Database') ? 1 : 0.45}>
        <Tier
          x={xs.database}
          y={tierY}
          w={tierW - 40}
          h={tierH}
          accent={tierAccent('Database', '#FBBF24')}
          stereotype="«tier»"
          name="Database"
          subtitle={tierPresent('Database') ? `${tCounts.Database} classes` : 'no database code uploaded'}
        />
      </g>

      {/* Frontend → Backend protocol arrow */}
      <g opacity={tierPresent('Frontend') && tierPresent('Backend') ? 1 : 0.4}>
        <ProtocolEdge
          x1={xs.frontend + tierW}
          y1={tierY + tierH / 2}
          x2={xs.backend}
          y2={tierY + tierH / 2}
          stereotype="«HTTP»"
          markerId="rfv-amber"
          stroke="#FBBF24"
        />
      </g>
      {/* Backend → Database protocol arrow */}
      <g opacity={tierPresent('Backend') && tierPresent('Database') ? 1 : 0.4}>
        <ProtocolEdge
          x1={xs.backend + tierW}
          y1={tierY + tierH / 2}
          x2={xs.database}
          y2={tierY + tierH / 2}
          stereotype="«SQL»"
          markerId="rfv-amber"
          stroke="#FBBF24"
        />
      </g>

      <text x={500} y={420} textAnchor="middle" fontSize="11" fill="#6b7280" fontStyle="italic">
        Tiers reflect the uploaded files — faded boxes are not present in this project.
      </text>
    </g>
  );
}

// Layer flowchart — four boxes stacked vertically with dashed open-arrow
// UML dependency arrows running top-to-bottom. Mirrors the standard
// Controller → Service → Repository → Entity layered architecture.
function LayerFlow({ counts }: FlowProps) {
  const cx = 360;
  const boxW = 460;
  const boxH = 110;
  const gap = 60;
  const top = 100;

  return (
    <g>
      {/* Frontend tier stub */}
      <rect x={cx - 70} y={20} width={140} height={28} rx={6} fill="#1a1a1a" stroke="#FBBF24" strokeDasharray="4 3" strokeWidth="1" />
      <text x={cx} y={39} textAnchor="middle" fontSize="11" fontFamily="ui-monospace, Menlo" fill="#FBBF24">FRONTEND TIER</text>
      <line x1={cx} y1={48} x2={cx} y2={top - 4} stroke="#FBBF24" strokeWidth="1.5" strokeDasharray="5 4" markerEnd="url(#rfv-amber)" />
      <rect x={cx - 24} y={62} width={48} height={18} rx={9} fill="#1a1a1a" stroke="#FBBF24" strokeWidth="1" />
      <text x={cx} y={75} textAnchor="middle" fontSize="10" fill="#fde68a" fontStyle="italic" fontFamily="ui-monospace, Menlo">«HTTP»</text>

      {/* 4 layer boxes — empty bands fade so the user can tell at a glance
          which layers are actually present in the uploaded code. */}
      {LAYER_BANDS.map((b, i) => {
        const y = top + i * (boxH + gap);
        const has = counts[b.name] > 0;
        return (
          <g key={b.name} opacity={has ? 1 : 0.45}>
            <rect x={cx - boxW / 2} y={y} width={boxW} height={boxH} rx={12} fill={`${b.tone}1A`} stroke={`${b.tone}aa`} strokeWidth="1.6" />
            <text x={cx} y={y + 28} textAnchor="middle" fontSize="13" fontStyle="italic" fill={b.tone} fontFamily="ui-monospace, Menlo">
              «layer»
            </text>
            <text x={cx} y={y + 56} textAnchor="middle" fontSize="22" fontWeight={700} fill="#fff">
              {b.name}
            </text>
            <text x={cx} y={y + 78} textAnchor="middle" fontSize="11" fill="#9ca3af" fontStyle="italic">
              {b.desc}
            </text>
            <text x={cx + boxW / 2 - 16} y={y + 98} textAnchor="end" fontSize="11" fill={b.tone} fontFamily="ui-monospace, Menlo">
              {counts[b.name]} {counts[b.name] === 1 ? 'class' : 'classes'}
            </text>
          </g>
        );
      })}

      {/* Inter-layer dashed dependency arrows (top-to-bottom) */}
      {[0, 1, 2].map((i) => {
        const yStart = top + i * (boxH + gap) + boxH;
        const yEnd = top + (i + 1) * (boxH + gap) - 4;
        return (
          <line
            key={`edge-${i}`}
            x1={cx}
            y1={yStart}
            x2={cx}
            y2={yEnd}
            stroke="#9ca3af"
            strokeWidth="1.6"
            strokeDasharray="6 4"
            markerEnd="url(#rfv-open)"
          />
        );
      })}

      {/* Repository → Database side stub */}
      {(() => {
        const repoIdx = LAYER_BANDS.findIndex((b) => b.name === 'Repository');
        const repoY = top + repoIdx * (boxH + gap) + boxH / 2;
        const xRight = cx + boxW / 2;
        const dbX = xRight + 80;
        return (
          <g>
            <line x1={xRight} y1={repoY} x2={dbX} y2={repoY} stroke="#FBBF24" strokeWidth="1.6" strokeDasharray="6 4" markerEnd="url(#rfv-amber)" />
            <rect x={xRight + (dbX - xRight) / 2 - 24} y={repoY - 22} width={48} height={18} rx={9} fill="#1a1a1a" stroke="#FBBF24" strokeWidth="1" />
            <text x={xRight + (dbX - xRight) / 2} y={repoY - 9} textAnchor="middle" fontSize="10" fill="#fde68a" fontStyle="italic" fontFamily="ui-monospace, Menlo">«SQL»</text>
            <rect x={dbX} y={repoY - 28} width={84} height={56} rx={6} fill="#1a1a1a" stroke="#FBBF24" strokeWidth="1.2" strokeDasharray="5 4" />
            <text x={dbX + 42} y={repoY - 10} textAnchor="middle" fontSize="10" fontFamily="ui-monospace, Menlo" fill="#FBBF24">«tier»</text>
            <text x={dbX + 42} y={repoY + 8} textAnchor="middle" fontSize="12" fontWeight={700} fill="#fff">Database</text>
          </g>
        );
      })()}
    </g>
  );
}

interface TierProps {
  x: number;
  y: number;
  w: number;
  h: number;
  accent: string;
  stereotype: string;
  name: string;
  subtitle: string;
}

function Tier({ x, y, w, h, accent, stereotype, name, subtitle }: TierProps) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="14" fill={`${accent}1A`} stroke={`${accent}aa`} strokeWidth="1.6" strokeDasharray="6 4" />
      <text x={x + w / 2} y={y + h / 2 - 10} textAnchor="middle" fontSize="11" fontStyle="italic" fill={accent} fontFamily="ui-monospace, Menlo">
        {stereotype}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 14} textAnchor="middle" fontSize="22" fontWeight={700} fill="#fff">
        {name}
      </text>
      <text x={x + w / 2} y={y + h / 2 + 36} textAnchor="middle" fontSize="11" fill="#9ca3af">
        {subtitle}
      </text>
    </g>
  );
}

interface ProtocolEdgeProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stereotype: string;
  markerId: string;
  stroke: string;
}

function ProtocolEdge({ x1, y1, x2, y2, stereotype, markerId, stroke }: ProtocolEdgeProps) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const labelW = stereotype.length * 7 + 14;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="1.7" strokeDasharray="6 4" markerEnd={`url(#${markerId})`} />
      <rect x={midX - labelW / 2} y={midY - 12} width={labelW} height={20} rx={10} fill="#1a1a1a" stroke={stroke} strokeWidth="1" />
      <text x={midX} y={midY + 2} textAnchor="middle" fontSize="11" fontStyle="italic" fill={stroke === '#FBBF24' ? '#fde68a' : '#fff'} fontFamily="ui-monospace, Menlo">
        {stereotype}
      </text>
    </g>
  );
}
