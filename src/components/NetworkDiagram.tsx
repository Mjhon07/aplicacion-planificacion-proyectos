import { useEffect, useRef, useState } from "react";
import { START_NODE_ID, edgePath } from "../lib/pertCpm";
import type { ComputedActivity, GraphEdge, GraphNodeLayout, Method } from "../lib/types";

function fmt(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  displayActivities: ComputedActivity[];
  edges: GraphEdge[];
  layoutById: Map<string, GraphNodeLayout>;
  canvasWidth: number;
  canvasHeight: number;
  method: Method;
  selected: string;
  onSelect: (id: string) => void;
  onCrash: (id: string) => void;
  criticalPathLabel: string;
  projectDurationLabel: string;
  onDownloadPng?: () => void;
};

export default function NetworkDiagram({
  displayActivities,
  edges,
  layoutById,
  canvasWidth,
  canvasHeight,
  method,
  selected,
  onSelect,
  onCrash,
  criticalPathLabel,
  projectDurationLabel,
  onDownloadPng,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const panRef = useRef({ active: false, x: 0, y: 0, left: 0, top: 0 });

  const goToStart = () => {
    const vp = viewportRef.current;
    if (!vp) return;
    const start = layoutById.get(START_NODE_ID);
    if (!start) {
      vp.scrollTo({ left: 0, top: 0, behavior: "smooth" });
      return;
    }
    const left = Math.max(0, start.x * zoom - vp.clientWidth * 0.2);
    const top = Math.max(0, start.y * zoom - vp.clientHeight / 2);
    vp.scrollTo({ left, top, behavior: "smooth" });
  };

  const setZoomClamped = (value: number) => {
    setZoom(Math.min(1.6, Math.max(0.45, Math.round(value * 100) / 100)));
  };

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom((z) => Math.min(1.6, Math.max(0.45, Math.round((z + delta) * 100) / 100)));
    };

    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".graph-node")) return;
    const vp = viewportRef.current;
    if (!vp) return;
    panRef.current = {
      active: true,
      x: e.clientX,
      y: e.clientY,
      left: vp.scrollLeft,
      top: vp.scrollTop,
    };
    setPanning(true);
    vp.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current.active) return;
    const vp = viewportRef.current;
    if (!vp) return;
    vp.scrollLeft = panRef.current.left - (e.clientX - panRef.current.x);
    vp.scrollTop = panRef.current.top - (e.clientY - panRef.current.y);
  };

  const endPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current.active) return;
    panRef.current.active = false;
    setPanning(false);
    try {
      viewportRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="graph-toolbar">
        <span className="graph-hint">Arrastra el fondo para mover · Ctrl + rueda para zoom</span>
        <div className="graph-controls">
          <button type="button" className="button button-secondary zoom-btn" onClick={goToStart} title="Ir al nodo Inicio">
            Ir a Inicio
          </button>
          {onDownloadPng && (
            <button type="button" className="button button-secondary zoom-btn" onClick={onDownloadPng} title="Descargar el diagrama completo en PNG">
              PNG
            </button>
          )}
          <button type="button" className="zoom" onClick={() => setZoomClamped(zoom - 0.1)} title="Alejar">
            −
          </button>
          <span className="zoom zoom-label">{Math.round(zoom * 100)}%</span>
          <button type="button" className="zoom" onClick={() => setZoomClamped(zoom + 0.1)} title="Acercar">
            +
          </button>
          <button type="button" className="zoom" onClick={() => setZoom(1)} title="Zoom 100%">
            ⟲
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`graph ${panning ? "graph-panning" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        <div
          className="graph-canvas"
          style={{
            width: canvasWidth * zoom,
            height: canvasHeight * zoom,
          }}
        >
          <div
            className="graph-world"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              transform: `scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
            <svg className="connections" width={canvasWidth} height={canvasHeight} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
              <defs>
                <marker id="arrowRed" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" className="arrow-critical" />
                </marker>
                <marker id="arrowGray" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" className="arrow-normal" />
                </marker>
              </defs>
              {edges.map((edge) => {
                const from = layoutById.get(edge.from);
                const to = layoutById.get(edge.to);
                if (!from || !to) return null;
                return (
                  <path
                    key={`${edge.from}-${edge.to}`}
                    d={edgePath(from, to)}
                    className={`edge ${edge.critical ? "critical-edge" : "normal-edge"}`}
                  />
                );
              })}
            </svg>

            {displayActivities.map((node) => {
              const pos = layoutById.get(node.id);
              if (!pos) return null;
              const isStart = node.isStart || node.id === START_NODE_ID;
              const crashable = !isStart && method === "Crashing" && !!node.canCrash;
              return (
                <button
                  key={node.id}
                  type="button"
                  className={`graph-node ${node.critical ? "node-critical" : ""} ${selected === node.id ? "node-selected" : ""} ${node.crashed ? "node-crashed" : ""} ${crashable ? "node-crashable" : ""} ${isStart ? "node-start" : ""}`}
                  style={{ left: pos.x, top: pos.y }}
                  onClick={() => {
                    if (!isStart) onSelect(node.id);
                  }}
                  onDoubleClick={() => {
                    if (crashable) onCrash(node.id);
                  }}
                  title={isStart ? "Nodo de inicio del proyecto (tiempo 0)" : crashable ? "Doble clic para acelerar" : node.name}
                >
                  <div className="node-grid">
                    <div className="cell ic">
                      <strong>{fmt(node.es)}</strong>
                    </div>
                    <div className="cell name">
                      <span className={`node-symbol ${isStart ? "start-label" : ""}`}>{isStart ? "Inicio" : node.id}</span>
                    </div>
                    <div className="cell tc">
                      <strong>{fmt(node.ef)}</strong>
                    </div>
                    <div className="cell il">
                      <strong>{fmt(node.ls)}</strong>
                    </div>
                    <div className="cell dur">
                      <strong>{fmt(node.duration)}</strong>
                    </div>
                    <div className="cell tl">
                      <strong>{fmt(node.lf)}</strong>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="graph-footer">
        <span>
          Ruta crítica: <strong>{criticalPathLabel}</strong>
        </span>
        <span>{projectDurationLabel}</span>
      </div>
    </>
  );
}
