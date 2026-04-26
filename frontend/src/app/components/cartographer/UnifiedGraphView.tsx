'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useCartographerStore } from '../../../lib/store';
import type { GraphProjection, LayerName } from '../../../lib/types';

// Pick which projection feeds the unified view based on which graph modes
// are active. Symbol mode is the default base layer; flow/architecture
// override when their own modes are toggled on.
function pickLayer(modes: Set<GraphMode>): LayerName {
  if (modes.has('flow')) return 'flow';
  if (modes.has('architecture')) return 'architecture';
  return 'symbol';
}

// Map a backend symbol-kind string onto the local GraphNode.type discriminator.
// The Layer 1 indexer emits one of: class, function, method, type, variable
// (see backend/indexer/layer1_symbols.py). The graph projection wraps each
// symbol with a constant top-level kind="symbol" and stashes the real kind
// under ``metadata.symbol_kind`` — callers should pass that, not the wire
// node's outer ``kind``.
function mapKind(kind: string | undefined | null): GraphNode['type'] {
  const k = (kind ?? '').toLowerCase();
  if (k === 'class') return 'class';
  if (k === 'interface' || k === 'type') return 'interface';
  if (k === 'module' || k === 'file' || k === 'package') return 'module';
  // function, method, variable, arrow_function, anything else → function
  return 'function';
}

// Deterministic radial layout — wire nodes have no positions, so we lay
// them out in concentric rings keyed off their order in the projection.
// Spacing scales with the rendered card size so nodes stay packed.
function projectionToNodes(graph: GraphProjection | undefined, cardW: number, cardH: number): GraphNode[] {
  if (!graph) return [];
  const adjacency = new Map<string, string[]>();
  for (const n of graph.nodes) adjacency.set(n.id, []);
  for (const e of graph.edges) {
    const list = adjacency.get(e.source);
    if (list) list.push(e.target);
  }
  const idToName = new Map<string, string>();
  for (const n of graph.nodes) idToName.set(n.id, n.label);

  const count = graph.nodes.length;
  const cx = 600;
  const cy = 350;
  const innerRadius = cardW * 1.1;
  const ringStep = Math.max(cardW, cardH) * 1.15;
  return graph.nodes.map((n, i) => {
    const ringSize = 12;
    const ring = Math.floor(i / ringSize);
    const idxOnRing = i % ringSize;
    const radius = innerRadius + ring * ringStep;
    const ringCount = Math.min(ringSize, count - ring * ringSize);
    const angle = (idxOnRing / ringCount) * Math.PI * 2;
    const cluster = (n.metadata?.cluster_id as string | undefined) ?? (n.metadata?.cluster as string | undefined) ?? 'Unclustered';
    const methods = (n.metadata?.methods as string[] | undefined) ?? [];
    const properties = (n.metadata?.properties as string[] | undefined) ?? [];
    const filePath = (n.metadata?.file_path as string | undefined) ?? null;
    return {
      id: n.id,
      name: n.label,
      // Prefer the real symbol kind from metadata; fall back to the wire-node
      // ``kind`` (which is ``"symbol"`` for layer 1 — uninformative).
      type: mapKind((n.metadata?.symbol_kind as string | undefined) ?? n.kind),
      cluster,
      methods,
      properties,
      filePath,
      dependencies: (adjacency.get(n.id) ?? []).map((tid) => idToName.get(tid) ?? tid),
      x: cx + Math.cos(angle) * radius - cardW / 2,
      y: cy + Math.sin(angle) * radius - cardH / 2,
    };
  });
}

export interface PathFilter {
  path: string;
  kind: 'file' | 'folder';
}

function matchesPathFilter(node: GraphNode, filter: PathFilter | null): boolean {
  if (!filter) return true;
  if (!node.filePath) return false;
  if (filter.kind === 'file') return node.filePath === filter.path;
  const prefix = filter.path.endsWith('/') ? filter.path : filter.path + '/';
  return node.filePath === filter.path || node.filePath.startsWith(prefix);
}

interface UnifiedGraphViewProps {
  repositoryId: string;
  showLegend: boolean;
  agentLogCollapsed: boolean;
  activeModes: Set<GraphMode>;
  onNodeSelect: (node: GraphNode | null) => void;
  zoomLevel: number;
  onZoomChange: (zoom: number) => void;
  onResetView: () => void;
  highlightedCluster: string | null;
  sidebarCollapsed?: boolean;
  pathFilter?: PathFilter | null;
}

export type GraphMode = 'symbol' | 'flow' | 'architecture';

export interface GraphNode {
  id: string;
  name: string;
  type: 'class' | 'interface' | 'function' | 'module';
  cluster: string;
  methods?: string[];
  properties?: string[];
  dependencies?: string[];
  filePath?: string | null;
  x: number;
  y: number;
}

export function UnifiedGraphView({ repositoryId, showLegend, agentLogCollapsed, activeModes, onNodeSelect, zoomLevel, onZoomChange, onResetView, highlightedCluster, sidebarCollapsed, pathFilter }: UnifiedGraphViewProps) {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);

  const handleNodeClick = (node: GraphNode) => {
    setSelectedNode(node);
    onNodeSelect(node);
  };
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [nodeDragStart, setNodeDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(1200);

  // Track viewport width so each node card can size to ~10% of it.
  useEffect(() => {
    if (!canvasRef.current) return;
    const el = canvasRef.current;
    setViewportWidth(el.clientWidth || 1200);
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) setViewportWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardW = Math.round(Math.max(110, Math.min(200, viewportWidth * 0.10)));
  const cardH = Math.round(cardW * 0.85);

  // Live graph data sourced from the Cartographer store. The store is
  // populated by CartographerWorkspace's initial fetch + SSE handler.
  const layer = pickLayer(activeModes);
  const projection = useCartographerStore(
    (s) => s.byRepo[repositoryId]?.graphs[layer],
  );

  // Derived nodes from the projection, then a local override layer for
  // user-driven drags so positions don't snap back when the projection
  // re-renders (e.g. after an SSE refetch).
  const baseNodes = useMemo(() => projectionToNodes(projection, cardW, cardH), [projection, cardW, cardH]);
  const [positionOverrides, setPositionOverrides] = useState<Record<string, { x: number; y: number }>>({});

  const allNodes: GraphNode[] = useMemo(
    () =>
      baseNodes.map((n) =>
        positionOverrides[n.id]
          ? { ...n, x: positionOverrides[n.id].x, y: positionOverrides[n.id].y }
          : n,
      ),
    [baseNodes, positionOverrides],
  );

  // Show every projected node. Use the explorer's path filter to narrow
  // scope on large repos rather than an arbitrary global cap.
  const nodes: GraphNode[] = useMemo(
    () => (pathFilter ? allNodes.filter((n) => matchesPathFilter(n, pathFilter)) : allNodes),
    [allNodes, pathFilter],
  );

  // Setter shim so existing code that calls `setNodes(prev => ...)` still
  // works. Translates updates into position overrides since projection is
  // store-owned and shouldn't be mutated locally.
  const setNodes = (updater: GraphNode[] | ((prev: GraphNode[]) => GraphNode[])) => {
    const next = typeof updater === 'function' ? (updater as (p: GraphNode[]) => GraphNode[])(nodes) : updater;
    setPositionOverrides((prev) => {
      const merged = { ...prev };
      for (const n of next) merged[n.id] = { x: n.x, y: n.y };
      return merged;
    });
  };

  // Keyboard zoom controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        onZoomChange(Math.min(200, zoomLevel + 10));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        onZoomChange(Math.max(50, zoomLevel - 10));
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [zoomLevel, onZoomChange]);

  // On first load: zoom to show ~10 of the most-connected nodes centered in viewport.
  // On sidebar/log toggle: reuse current zoom, just re-center on the same focal area.
  const initializedRef = useRef(false);
  const lastFilterRef = useRef<string | null>(null);
  useEffect(() => {
    const filterKey = pathFilter ? `${pathFilter.kind}:${pathFilter.path}` : null;
    if (filterKey !== lastFilterRef.current) {
      lastFilterRef.current = filterKey;
      initializedRef.current = false;
    }
    const timeoutId = setTimeout(() => {
      if (!canvasRef.current || nodes.length === 0) return;
      const vw = canvasRef.current.clientWidth;
      const vh = canvasRef.current.clientHeight;

      if (!initializedRef.current) {
        initializedRef.current = true;
        // Pick the 10 most-connected nodes as focal set
        const focal = [...nodes]
          .sort((a, b) => (b.dependencies?.length ?? 0) - (a.dependencies?.length ?? 0))
          .slice(0, 10);

        const pad = 80;
        const minX = Math.min(...focal.map(n => n.x));
        const minY = Math.min(...focal.map(n => n.y));
        const maxX = Math.max(...focal.map(n => n.x + cardW + 20));
        const maxY = Math.max(...focal.map(n => n.y + cardH + 20));
        const fw = maxX - minX;
        const fh = maxY - minY;

        const fitZoom = Math.min((vw - pad * 2) / fw, (vh - pad * 2) / fh, 1) * 100;
        const zoom = Math.max(10, Math.min(100, fitZoom));
        onZoomChange(Math.round(zoom));

        const scale = zoom / 100;
        setPanX((vw - fw * scale) / 2 - minX * scale);
        setPanY((vh - fh * scale) / 2 - minY * scale);
      } else {
        // Just re-center without changing zoom
        const scale = zoomLevel / 100;
        const minX = Math.min(...nodes.map(n => n.x));
        const minY = Math.min(...nodes.map(n => n.y));
        const maxX = Math.max(...nodes.map(n => n.x + cardW + 20));
        const maxY = Math.max(...nodes.map(n => n.y + cardH + 20));
        setPanX((vw - (maxX - minX) * scale) / 2 - minX * scale);
        setPanY((vh - (maxY - minY) * scale) / 2 - minY * scale);
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [agentLogCollapsed, sidebarCollapsed, nodes, pathFilter]);

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0 && !(e.target as HTMLElement).closest('.graph-node')) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNodeId) {
      handleNodeDrag(e);
    } else if (isDragging && canvasRef.current) {
      const newPanX = e.clientX - dragStart.x;
      const newPanY = e.clientY - dragStart.y;

      // Allow some panning but keep at least part of the graph visible
      const viewportWidth = canvasRef.current.clientWidth;
      const viewportHeight = canvasRef.current.clientHeight;
      const scale = zoomLevel / 100;

      // Calculate graph bounds
      if (nodes.length > 0) {
        const minX = Math.min(...nodes.map(n => n.x));
        const minY = Math.min(...nodes.map(n => n.y));
        const maxX = Math.max(...nodes.map(n => n.x + cardW + 20));
        const maxY = Math.max(...nodes.map(n => n.y + cardH + 20));

        const graphWidth = (maxX - minX) * scale;
        const graphHeight = (maxY - minY) * scale;

        setPanX(newPanX);
        setPanY(newPanY);
      } else {
        setPanX(newPanX);
        setPanY(newPanY);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    handleNodeMouseUp();
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setDraggingNodeId(null);
  };


  // Node drag handlers
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      setDraggingNodeId(nodeId);
      const scale = zoomLevel / 100;
      setNodeDragStart({
        x: (e.clientX - panX) / scale - node.x,
        y: (e.clientY - panY) / scale - node.y,
      });
    }
  };

  const handleNodeDrag = (e: React.MouseEvent) => {
    if (draggingNodeId && canvasRef.current) {
      const scale = zoomLevel / 100;
      const newX = (e.clientX - panX) / scale - nodeDragStart.x;
      const newY = (e.clientY - panY) / scale - nodeDragStart.y;

      // Constrain node within reasonable bounds
      const constrainedX = Math.max(-500, Math.min(2000, newX));
      const constrainedY = Math.max(-500, Math.min(2000, newY));

      setNodes(prevNodes =>
        prevNodes.map(node =>
          node.id === draggingNodeId
            ? { ...node, x: constrainedX, y: constrainedY }
            : node
        )
      );
    }
  };

  const handleNodeMouseUp = () => {
    setDraggingNodeId(null);
  };

  // Wheel/trackpad zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    // Detect if this is a pinch gesture (trackpad) or regular scroll
    if (e.ctrlKey || Math.abs(e.deltaY) < 50) {
      // Pinch zoom on trackpad or ctrl+wheel
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      const newZoom = Math.max(50, Math.min(200, zoomLevel * zoomFactor));

      // Zoom towards mouse cursor position
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const scaleFactor = newZoom / zoomLevel;

        setPanX(mouseX - (mouseX - panX) * scaleFactor);
        setPanY(mouseY - (mouseY - panY) * scaleFactor);
      }

      onZoomChange(newZoom);
    }
  };

  // Touch handlers for mobile pinch zoom
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      setLastTouchDistance(distance);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouchDistance !== null) {
      e.preventDefault();

      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );

      const delta = distance - lastTouchDistance;
      const zoomFactor = 1 + (delta / 500);
      const newZoom = Math.max(50, Math.min(200, zoomLevel * zoomFactor));

      onZoomChange(newZoom);
      setLastTouchDistance(distance);
    }
  };

  const handleTouchEnd = () => {
    setLastTouchDistance(null);
  };

  // Color palette per node type — border, header bg, header text, badge bg
  const NODE_COLORS: Record<string, { border: string; header: string; label: string; badge: string; dot: string }> = {
    class:     { border: '#3b82f6', header: '#1e3a5f', label: '#93c5fd', badge: '#172a4a', dot: '#3b82f6' },
    interface: { border: '#a855f7', header: '#3b1f5e', label: '#d8b4fe', badge: '#2a1545', dot: '#a855f7' },
    function:  { border: '#22c55e', header: '#14432a', label: '#86efac', badge: '#0e2e1c', dot: '#22c55e' },
    module:    { border: '#f59e0b', header: '#432d09', label: '#fcd34d', badge: '#2e1e06', dot: '#f59e0b' },
    variable:  { border: '#6b7280', header: '#1f2937', label: '#d1d5db', badge: '#111827', dot: '#6b7280' },
  };
  const getNodeColors = (type: string) => NODE_COLORS[type] ?? NODE_COLORS.variable;

  const getClusterColor = (cluster: string) => {
    const colors: Record<string, string> = {
      Controllers: 'border-yellow-500/30 bg-yellow-500/5',
      Services: 'border-blue-500/30 bg-blue-500/5',
      Database: 'border-purple-500/30 bg-purple-500/5',
      Utils: 'border-green-500/30 bg-green-500/5',
      Routes: 'border-orange-500/30 bg-orange-500/5',
    };
    return colors[cluster] || 'border-gray-500/30 bg-gray-500/5';
  };

  const getAgentColor = (cluster: string) => {
    const colors: Record<string, string> = {
      Controllers: '#eab308',
      Services: '#3b82f6',
      Database: '#a855f7',
      Utils: '#22c55e',
      Routes: '#f97316',
    };
    return colors[cluster] || '#6b7280';
  };

  // Calculate cluster boundaries dynamically based on node positions
  const getClusterBounds = (clusterName: string) => {
    const clusterNodes = nodes.filter(n => n.cluster === clusterName);
    if (clusterNodes.length === 0) return null;

    const padding = 30;
    const minX = Math.min(...clusterNodes.map(n => n.x)) - padding;
    const minY = Math.min(...clusterNodes.map(n => n.y)) - padding;
    const maxX = Math.max(...clusterNodes.map(n => n.x + cardW + 20)) + padding;
    const maxY = Math.max(...clusterNodes.map(n => n.y + cardH + 20)) + padding;

    return {
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  };

  return (
    <div className="h-full flex flex-col bg-[#1e1e1e]">
      {/* Mind Map Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 relative bg-[#1a1a1a] overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          cursor: draggingNodeId ? 'move' : isDragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel / 100})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          {/* Connection Lines — overflow:visible lets edges extend beyond SVG bounds */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              overflow: 'visible',
              zIndex: 0,
              pointerEvents: 'none',
              transition: draggingNodeId ? 'none' : 'all 0.1s ease-out',
            }}
          >
            {/* Symbol mode renders only colored nodes (no edges). */}
            {activeModes.has('flow') &&
              nodes.map((node) =>
                node.dependencies?.map((depName) => {
                  const target = nodes.find((n) => n.name === depName);
                  if (target) {
                    // Dynamic control point for curved flow
                    const controlX = (node.x + target.x) / 2 + cardW / 2;
                    const controlY = Math.min(node.y, target.y) - 50;

                    return (
                      <path
                        key={`flow-${node.id}-${target.id}`}
                        d={`M ${node.x + cardW / 2} ${node.y + cardH / 2} Q ${controlX} ${controlY} ${target.x + cardW / 2} ${target.y + cardH / 2}`}
                        stroke="#007acc"
                        strokeWidth="3"
                        fill="none"
                        markerEnd="url(#arrowhead-flow)"
                        opacity="0.8"
                      />
                    );
                  }
                  return null;
                })
              )}

            {/* Architecture mode renders cluster backgrounds (below) instead of edges. */}
            <defs>
              <marker
                id="arrowhead-symbol"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#4a5568" />
              </marker>
              <marker
                id="arrowhead-flow"
                markerWidth="12"
                markerHeight="12"
                refX="10"
                refY="4"
                orient="auto"
              >
                <polygon points="0 0, 12 4, 0 8" fill="#007acc" />
              </marker>
              <marker
                id="arrowhead-inter"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#dc2626" />
              </marker>
            </defs>
          </svg>

          {/* Cluster Backgrounds (Architecture Mode) */}
          {activeModes.has('architecture') && (
            <>
              {Array.from(new Set(nodes.map((n) => n.cluster))).map((clusterName) => {
                const bounds = getClusterBounds(clusterName);
                if (!bounds) return null;
                const accent = getAgentColor(clusterName);
                const memberCount = nodes.filter((n) => n.cluster === clusterName).length;
                return (
                  <div
                    key={clusterName}
                    className="absolute rounded-2xl"
                    style={{
                      left: bounds.left,
                      top: bounds.top,
                      width: bounds.width,
                      height: bounds.height,
                      background: `linear-gradient(135deg, ${accent}26, ${accent}0d)`,
                      border: `2px solid ${accent}66`,
                      boxShadow: `inset 0 0 60px ${accent}1a`,
                      transition: draggingNodeId ? 'none' : 'all 0.2s ease-out',
                    }}
                  >
                    <div
                      className="absolute -top-3 left-3 px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide flex items-center gap-1.5"
                      style={{ background: '#1a1a1a', color: accent, border: `1px solid ${accent}66` }}
                    >
                      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: accent }} />
                      {clusterName}
                      <span className="text-gray-500">· {memberCount}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* Graph Nodes */}
          {nodes.map((node) => {
            const colors = getNodeColors(node.type);
            const isSelected = selectedNode?.id === node.id;
            const isDraggingThis = draggingNodeId === node.id;
            return (
              <div
                key={node.id}
                onClick={() => handleNodeClick(node)}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                className="graph-node absolute cursor-move"
                style={{
                  left: node.x,
                  top: node.y,
                  width: cardW,
                  transition: isDraggingThis ? 'none' : 'transform 0.15s ease-out',
                  transform: isSelected || isDraggingThis ? 'scale(1.04)' : 'scale(1)',
                  zIndex: isSelected || isDraggingThis ? 10 : 1,
                }}
              >
                {/* Agent highlight pulse */}
                {highlightedCluster === node.cluster && (
                  <div className="absolute -top-2 -right-2 z-20 animate-pulse" style={{
                    width: 14, height: 14, borderRadius: '50%',
                    backgroundColor: colors.dot,
                    boxShadow: `0 0 10px ${colors.dot}`,
                    border: '2px solid white',
                  }} />
                )}

                <div style={{
                  borderRadius: 8,
                  overflow: 'hidden',
                  border: `2px solid ${isSelected ? colors.border : '#3e3e42'}`,
                  boxShadow: isSelected ? `0 0 0 1px ${colors.border}40, 0 4px 20px ${colors.border}30` : '0 2px 8px #0008',
                  background: '#1e1e1e',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}>
                  {/* Colored left stripe + header */}
                  <div style={{
                    background: colors.header,
                    borderLeft: `4px solid ${colors.border}`,
                    padding: '6px 10px 7px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: colors.dot, flexShrink: 0 }} />
                      <span style={{ fontSize: 10, color: colors.label, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {node.type}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', lineHeight: 1.3, wordBreak: 'break-all' }}>
                      {node.name.split('.').pop() ?? node.name}
                    </div>
                    {node.name.includes('.') && (
                      <div style={{ fontSize: 10, color: colors.label + 'aa', marginTop: 2, wordBreak: 'break-all' }}>
                        {node.name}
                      </div>
                    )}
                  </div>

                  {/* Properties */}
                  {node.properties && node.properties.length > 0 && (
                    <div style={{ borderTop: `1px solid ${colors.border}30`, borderLeft: `4px solid ${colors.border}`, background: '#1a1a1a', padding: '4px 10px' }}>
                      {node.properties.slice(0, 3).map((prop, idx) => (
                        <div key={`${node.id}-p-${idx}`} style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>
                          – {prop}
                        </div>
                      ))}
                      {node.properties.length > 3 && (
                        <div style={{ fontSize: 10, color: '#6b7280' }}>+{node.properties.length - 3} more</div>
                      )}
                    </div>
                  )}

                  {/* Methods */}
                  {node.methods && node.methods.length > 0 && (
                    <div style={{ borderTop: `1px solid ${colors.border}30`, borderLeft: `4px solid ${colors.border}`, background: '#161616', padding: '4px 10px' }}>
                      {node.methods.slice(0, 3).map((method, idx) => (
                        <div key={`${node.id}-m-${idx}`} style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>
                          + {method}
                        </div>
                      ))}
                      {node.methods.length > 3 && (
                        <div style={{ fontSize: 10, color: '#6b7280' }}>+{node.methods.length - 3} more</div>
                      )}
                    </div>
                  )}

                  {/* Footer */}
                  <div style={{ borderTop: `1px solid #2a2a2a`, background: '#191919', padding: '4px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, color: '#6b7280' }}>{node.cluster}</span>
                    {node.dependencies && node.dependencies.length > 0 && (
                      <span style={{ fontSize: 10, color: colors.label }}>{node.dependencies.length} deps</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
