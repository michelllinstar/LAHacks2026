'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { Box, Database, Code, Users } from 'lucide-react';
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

// Map a backend GraphNodeWire kind onto the local GraphNode.type discriminator.
function mapKind(kind: string): GraphNode['type'] {
  const k = kind.toLowerCase();
  if (k.includes('class')) return 'class';
  if (k.includes('interface')) return 'interface';
  if (k.includes('module') || k.includes('file') || k.includes('package')) return 'module';
  return 'function';
}

// Deterministic radial layout — wire nodes have no positions, so we lay
// them out in concentric rings keyed off their order in the projection.
// This is intentionally cheap; a future enhancement is force-directed.
function projectionToNodes(graph: GraphProjection | undefined): GraphNode[] {
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
  return graph.nodes.map((n, i) => {
    // Lay out on concentric rings of ~12 nodes.
    const ringSize = 12;
    const ring = Math.floor(i / ringSize);
    const idxOnRing = i % ringSize;
    const radius = 200 + ring * 280;
    const ringCount = Math.min(ringSize, count - ring * ringSize);
    const angle = (idxOnRing / ringCount) * Math.PI * 2;
    const cluster = (n.metadata?.cluster_id as string | undefined) ?? (n.metadata?.cluster as string | undefined) ?? 'Unclustered';
    const methods = (n.metadata?.methods as string[] | undefined) ?? [];
    const properties = (n.metadata?.properties as string[] | undefined) ?? [];
    return {
      id: n.id,
      name: n.label,
      type: mapKind(n.kind),
      cluster,
      methods,
      properties,
      dependencies: (adjacency.get(n.id) ?? []).map((tid) => idToName.get(tid) ?? tid),
      x: cx + Math.cos(angle) * radius - 120,
      y: cy + Math.sin(angle) * radius - 100,
    };
  });
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
  x: number;
  y: number;
}

export function UnifiedGraphView({ repositoryId, showLegend, agentLogCollapsed, activeModes, onNodeSelect, zoomLevel, onZoomChange, onResetView, highlightedCluster, sidebarCollapsed }: UnifiedGraphViewProps) {
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

  // Live graph data sourced from the Cartographer store. The store is
  // populated by CartographerWorkspace's initial fetch + SSE handler.
  const layer = pickLayer(activeModes);
  const projection = useCartographerStore(
    (s) => s.byRepo[repositoryId]?.graphs[layer],
  );

  // Derived nodes from the projection, then a local override layer for
  // user-driven drags so positions don't snap back when the projection
  // re-renders (e.g. after an SSE refetch).
  const baseNodes = useMemo(() => projectionToNodes(projection), [projection]);
  const [positionOverrides, setPositionOverrides] = useState<Record<string, { x: number; y: number }>>({});

  const nodes: GraphNode[] = useMemo(
    () =>
      baseNodes.map((n) =>
        positionOverrides[n.id]
          ? { ...n, x: positionOverrides[n.id].x, y: positionOverrides[n.id].y }
          : n,
      ),
    [baseNodes, positionOverrides],
  );

  // Setter shim so existing code that calls `setNodes(prev => ...)` still
  // works. Translates updates into position overrides since projection is
  // store-owned and shouldn't be mutated locally.
  const setNodes = (updater: GraphNode[] | ((prev: GraphNode[]) => GraphNode[])) => {
    const next = typeof updater === 'function' ? (updater as (p: GraphNode[]) => GraphNode[])(nodes) : updater;
    const overrides: Record<string, { x: number; y: number }> = {};
    for (const n of next) overrides[n.id] = { x: n.x, y: n.y };
    setPositionOverrides(overrides);
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

  // Auto-center and fit when viewport changes
  useEffect(() => {
    if (!canvasRef.current) return;

    // Use a small timeout to ensure the viewport has resized
    const timeoutId = setTimeout(() => {
      if (!canvasRef.current) return;

      const viewportWidth = canvasRef.current.clientWidth;
      const viewportHeight = canvasRef.current.clientHeight;

      // Calculate bounds of all nodes
      if (nodes.length > 0) {
        const padding = 50; // Padding from edges
        const minX = Math.min(...nodes.map(n => n.x));
        const minY = Math.min(...nodes.map(n => n.y));
        const maxX = Math.max(...nodes.map(n => n.x + 240));
        const maxY = Math.max(...nodes.map(n => n.y + 200));

        const graphWidth = maxX - minX;
        const graphHeight = maxY - minY;

        // Calculate required zoom to fit everything in viewport
        const widthRatio = (viewportWidth - padding * 2) / graphWidth;
        const heightRatio = (viewportHeight - padding * 2) / graphHeight;
        const optimalZoom = Math.min(widthRatio, heightRatio, 1) * 100; // Don't zoom in beyond 100%

        // Constrain zoom between 50% and 100%
        const constrainedZoom = Math.max(50, Math.min(100, optimalZoom));

        // If current zoom would make content overflow, adjust it
        const currentZoomRatio = zoomLevel / 100;
        const scaledGraphWidth = graphWidth * currentZoomRatio;
        const scaledGraphHeight = graphHeight * currentZoomRatio;

        let finalZoom = zoomLevel;
        if (scaledGraphWidth > viewportWidth - padding * 2 || scaledGraphHeight > viewportHeight - padding * 2) {
          finalZoom = constrainedZoom;
          onZoomChange(finalZoom);
        }

        // Center the graph in the viewport with the final zoom
        const scale = finalZoom / 100;
        const centerX = (viewportWidth - graphWidth * scale) / 2 - minX * scale;
        const centerY = (viewportHeight - graphHeight * scale) / 2 - minY * scale;

        setPanX(centerX);
        setPanY(centerY);
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [agentLogCollapsed, sidebarCollapsed, nodes]);

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
        const maxX = Math.max(...nodes.map(n => n.x + 240));
        const maxY = Math.max(...nodes.map(n => n.y + 200));

        const graphWidth = (maxX - minX) * scale;
        const graphHeight = (maxY - minY) * scale;

        // Allow panning but ensure at least 20% of the graph stays visible
        const maxPanX = viewportWidth * 0.8;
        const minPanX = -(graphWidth - viewportWidth * 0.2);
        const maxPanY = viewportHeight * 0.8;
        const minPanY = -(graphHeight - viewportHeight * 0.2);

        const constrainedPanX = Math.max(minPanX, Math.min(maxPanX, newPanX));
        const constrainedPanY = Math.max(minPanY, Math.min(maxPanY, newPanY));

        setPanX(constrainedPanX);
        setPanY(constrainedPanY);
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

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'class':
        return 'from-blue-500 to-blue-600';
      case 'interface':
        return 'from-purple-500 to-purple-600';
      case 'function':
        return 'from-green-500 to-green-600';
      case 'module':
        return 'from-orange-500 to-orange-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

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
    const maxX = Math.max(...clusterNodes.map(n => n.x + 240)) + padding;
    const maxY = Math.max(...clusterNodes.map(n => n.y + 200)) + padding;

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
          className="absolute inset-0"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoomLevel / 100})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          }}
        >
          {/* Connection Lines */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              zIndex: 0,
              transition: draggingNodeId ? 'none' : 'all 0.1s ease-out'
            }}
          >
            {activeModes.has('symbol') &&
              nodes.map((node) =>
                node.dependencies?.map((depName) => {
                  const target = nodes.find((n) => n.name === depName);
                  if (target) {
                    // Offset from center of node
                    const startX = node.x + 120;
                    const startY = node.y + 100;
                    const endX = target.x + 120;
                    const endY = target.y + 100;

                    return (
                      <g key={`symbol-${node.id}-${target.id}`}>
                        <line
                          x1={startX}
                          y1={startY}
                          x2={endX}
                          y2={endY}
                          stroke="#4a5568"
                          strokeWidth="2"
                          strokeDasharray="5 5"
                          markerEnd="url(#arrowhead-symbol)"
                        />
                      </g>
                    );
                  }
                  return null;
                })
              )}
            {activeModes.has('flow') &&
              nodes.map((node) =>
                node.dependencies?.map((depName) => {
                  const target = nodes.find((n) => n.name === depName);
                  if (target) {
                    // Dynamic control point for curved flow
                    const controlX = (node.x + target.x) / 2 + 120;
                    const controlY = Math.min(node.y, target.y) - 50;

                    return (
                      <path
                        key={`flow-${node.id}-${target.id}`}
                        d={`M ${node.x + 120} ${node.y + 100} Q ${controlX} ${controlY} ${target.x + 120} ${target.y + 100}`}
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

            {activeModes.has('architecture') &&
              nodes.map((node) =>
                node.dependencies?.map((depName) => {
                  const target = nodes.find((n) => n.name === depName);
                  if (target) {
                    const startX = node.x + 120;
                    const startY = node.y + 100;
                    const endX = target.x + 120;
                    const endY = target.y + 100;

                    // Different colors for cross-cluster vs same-cluster dependencies
                    const isInterCluster = node.cluster !== target.cluster;

                    return (
                      <line
                        key={`arch-${node.id}-${target.id}`}
                        x1={startX}
                        y1={startY}
                        x2={endX}
                        y2={endY}
                        stroke={isInterCluster ? "#dc2626" : "#4a5568"}
                        strokeWidth="2"
                        strokeDasharray={isInterCluster ? "3 3" : "5 5"}
                        opacity="0.4"
                        markerEnd={isInterCluster ? "url(#arrowhead-inter)" : "url(#arrowhead-symbol)"}
                      />
                    );
                  }
                  return null;
                })
              )}
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

          {/* Cluster Boundaries (Architecture Mode) */}
          {activeModes.has('architecture') && (
            <>
              {['Controllers', 'Services', 'Database', 'Routes', 'Utils'].map(clusterName => {
                const bounds = getClusterBounds(clusterName);
                if (!bounds) return null;
                return (
                  <div
                    key={clusterName}
                    className={`absolute rounded-lg border-2 transition-all ${getClusterColor(clusterName)}`}
                    style={{
                      left: bounds.left,
                      top: bounds.top,
                      width: bounds.width,
                      height: bounds.height,
                      transition: draggingNodeId ? 'none' : 'all 0.2s ease-out',
                    }}
                  >
                    <div className="text-xs text-gray-400 font-semibold p-2">{clusterName}</div>
                  </div>
                );
              })}
            </>
          )}

          {/* Graph Nodes with UML Diagrams */}
          {nodes.map((node) => (
            <div
              key={node.id}
              onClick={() => handleNodeClick(node)}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              className={`graph-node absolute cursor-move hover:scale-105 ${
                selectedNode?.id === node.id ? 'ring-2 ring-[#007acc] scale-105' : ''
              } ${draggingNodeId === node.id ? 'scale-105 opacity-80' : ''}`}
              style={{
                left: node.x,
                top: node.y,
                width: 240,
                transition: draggingNodeId === node.id ? 'none' : 'transform 0.2s ease-out',
              }}
            >
              {/* Agent Highlight Indicator */}
              {highlightedCluster === node.cluster && (
                <div
                  className="absolute -top-2 -right-2 z-20 animate-pulse"
                  style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    backgroundColor: getAgentColor(node.cluster),
                    boxShadow: `0 0 12px ${getAgentColor(node.cluster)}`,
                    border: '2px solid white',
                  }}
                />
              )}

              {/* UML-style component box */}
              <div className="bg-[#252526] border-2 border-[#3e3e42] rounded-lg overflow-hidden shadow-lg hover:border-[#007acc] hover:shadow-2xl transition-all">
                {/* Header */}
                <div className={`bg-gradient-to-r ${getNodeColor(node.type)} px-3 py-2`}>
                  <div className="flex items-center gap-2 mb-1">
                    {node.type === 'class' && <Box className="h-4 w-4 text-white" />}
                    {node.type === 'function' && <Code className="h-4 w-4 text-white" />}
                    {node.type === 'module' && <Database className="h-4 w-4 text-white" />}
                    <span className="text-xs text-white/70 uppercase">&lt;&lt;{node.type}&gt;&gt;</span>
                  </div>
                  <div className="text-sm font-bold text-white">{node.name}</div>
                </div>

                {/* Properties */}
                {node.properties && node.properties.length > 0 && (
                  <div className="border-b border-[#3e3e42] px-3 py-2 bg-[#2d2d2d]">
                    {node.properties.map((prop, idx) => (
                      <div key={idx} className="text-xs text-gray-300 font-mono">
                        - {prop}
                      </div>
                    ))}
                  </div>
                )}

                {/* Methods */}
                {node.methods && node.methods.length > 0 && (
                  <div className="px-3 py-2 bg-[#1e1e1e]">
                    {node.methods.map((method, idx) => (
                      <div key={idx} className="text-xs text-gray-300 font-mono">
                        + {method}
                      </div>
                    ))}
                  </div>
                )}

                {/* Cluster Badge */}
                <div className="px-3 py-1.5 bg-[#252526] border-t border-[#3e3e42] flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-gray-500" />
                    <span className="text-xs text-gray-500">{node.cluster}</span>
                  </div>
                  {activeModes.has('symbol') && node.dependencies && node.dependencies.length > 0 && (
                    <span className="text-xs text-blue-400">{node.dependencies.length} deps</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mode Info */}
      <div className="absolute bottom-4 left-4 bg-[#252526] border border-[#3e3e42] rounded-lg px-3 py-2">
        <div className="text-xs text-gray-400 mb-1">
          Active Layers: {Array.from(activeModes).map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(', ')}
        </div>
        <div className="text-[10px] text-gray-500 flex items-center gap-3">
          <span>🖱️ Drag background to pan</span>
          <span>📦 Drag nodes - connections follow</span>
          <span>⌨️ +/- or pinch to zoom</span>
          <span>🎯 Click for details</span>
        </div>
      </div>
    </div>
  );
}
