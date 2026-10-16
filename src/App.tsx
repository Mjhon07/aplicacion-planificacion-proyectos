import { useEffect, useMemo, useRef, useState } from "react";
import CostCurve from "./components/CostCurve";
import GanttChart from "./components/GanttChart";
import NetworkDiagram from "./components/NetworkDiagram";
import ReportDialog from "./components/ReportDialog";
import { compressToTarget } from "./lib/compress";
import { buildWorkbook, downloadWorkbook, parseActivitiesSheet } from "./lib/excel";
import { buildNetworkSvg, downloadPngFile } from "./lib/graphImage";
import { buildReport } from "./lib/report";
import { completionProbability } from "./lib/stats";
import {
  SAMPLE_ACTIVITIES,
  SAMPLE_PROJECT_NAME,
  computeProject,
  createActivity,
  formatPredecessors,
  layoutGraph,
  nextActivityId,
  parsePredecessors,
} from "./lib/pertCpm";
import type { Activity, CrashHistoryEntry, Method } from "./lib/types";

type IconName =
  | "grid"
  | "network"
  | "list"
  | "chart"
  | "history"
  | "settings"
  | "help"
  | "plus"
  | "play"
  | "more"
  | "clock"
  | "bolt"
  | "coins"
  | "trash"
  | "undo";

type Section = "dashboard" | "network" | "activities" | "analysis" | "history";

const icons: Record<IconName, React.ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  network: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="12" cy="18" r="3" />
      <path d="m8.6 7.5 6.8 0M7.5 8.6l3 6.5M16.5 8.6l-3 6.5" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4" cy="6" r="1" />
      <circle cx="4" cy="12" r="1" />
      <circle cx="4" cy="18" r="1" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9a2.3 2.3 0 1 1 3.6 1.9c-.8.6-1.4 1-1.4 2.1M12 17h.01" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  play: <path d="m9 7 8 5-8 5Z" fill="currentColor" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  bolt: <path d="m13 2-7 12h6l-1 8 7-12h-6Z" />,
  coins: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </>
  ),
  undo: <path d="M3 7v6h6M3 13a9 9 0 1 0 3-7.7" />,
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function Button({
  children,
  className = "",
  onClick,
  title,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button type={type} className={`button ${className}`} onClick={onClick} title={title} disabled={disabled}>
      {children}
    </button>
  );
}

function fmt(n: number, digits = 2): string {
  return n.toLocaleString("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function money(n: number): string {
  return `$${n.toLocaleString("es-ES")}`;
}

function App() {
  const [method, setMethod] = useState<Method>("CPM");
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [activities, setActivities] = useState<Activity[]>(SAMPLE_ACTIVITIES);
  const [selected, setSelected] = useState("A");
  const [crashHistory, setCrashHistory] = useState<CrashHistoryEntry[]>([]);
  const [calcPulse, setCalcPulse] = useState(0);
  const [activityCountInput, setActivityCountInput] = useState(String(SAMPLE_ACTIVITIES.length));
  const [excelNote, setExcelNote] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [targetWeeks, setTargetWeeks] = useState(0);
  const [targetEdited, setTargetEdited] = useState(false);
  const [savedBase, setSavedBase] = useState<Activity[] | null>(null);
  const [compressTarget, setCompressTarget] = useState(20);
  const [compressEdited, setCompressEdited] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const result = useMemo(() => computeProject(activities, method), [activities, method, calcPulse]);
  const pertResult = useMemo(() => (method === "PERT" ? result : computeProject(activities, "PERT")), [activities, method, result]);
  const graph = useMemo(() => layoutGraph(result.activities), [result.activities]);
  const layoutById = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const computedById = useMemo(() => new Map(result.activities.map((a) => [a.id, a])), [result.activities]);
  const criticalPathLabel = useMemo(() => {
    if (!result.criticalPath.length) return activities.length === 0 ? "Inicio" : "—";
    return ["Inicio", ...result.criticalPath].join(" → ");
  }, [result.criticalPath, activities.length]);

  useEffect(() => {
    if (!targetEdited) setTargetWeeks(pertResult.projectDuration);
  }, [pertResult.projectDuration, targetEdited]);

  const odds = useMemo(
    () => completionProbability(targetWeeks, pertResult.projectDuration, pertResult.projectStdDev ?? 0),
    [targetWeeks, pertResult.projectDuration, pertResult.projectStdDev],
  );
  const networkSvg = useMemo(
    () => buildNetworkSvg(graph.displayActivities, graph.edges, graph.nodes, graph.width, graph.height),
    [graph],
  );
  const baseActivities = useMemo(() => {
    const source = savedBase ?? activities;
    return source.map((activity) => ({ ...activity, predecessors: [...activity.predecessors], crashed: false }));
  }, [savedBase, activities]);
  const compressPlan = useMemo(() => compressToTarget(baseActivities, compressTarget), [baseActivities, compressTarget]);
  const baseResult = useMemo(() => computeProject(baseActivities, "Crashing"), [baseActivities]);
  const acceleratedResult = useMemo(() => computeProject(compressPlan.activities, "Crashing"), [compressPlan.activities]);

  useEffect(() => {
    if (!compressEdited) setCompressTarget(Math.max(0, Math.round((baseResult.projectDuration - 2) * 100) / 100));
  }, [baseResult.projectDuration, compressEdited]);

  const reportText = useMemo(
    () =>
      `${buildReport({
        projectName: SAMPLE_PROJECT_NAME,
        method,
        activities,
        result,
        pert: pertResult,
        targetWeeks,
      })}\n\n${compressPlan.summary}`,
    [method, activities, result, pertResult, targetWeeks, compressPlan.summary],
  );

  const active = activities.find((a) => a.id === selected) ?? activities[0];
  const activeComputed = active ? computedById.get(active.id) : undefined;
  const baselineCost = useMemo(() => activities.reduce((s, a) => s + a.normalCost, 0), [activities]);

  const updateActivity = (id: string, patch: Partial<Activity>) => {
    setActivities((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const addActivity = () => {
    const id = nextActivityId(activities);
    const last = activities.at(-1);
    const created = createActivity(
      {
        id,
        name: `Actividad ${id}`,
        predecessors: last ? [last.id] : [],
        duration: 2,
        optimistic: 1,
        mostLikely: 2,
        pessimistic: 4,
        normalTime: 2,
        crashTime: 1,
        normalCost: 1000,
        crashCost: 1500,
      },
      activities,
    );
    setActivities([...activities, created]);
    setSelected(id);
    setActivityCountInput(String(activities.length + 1));
  };

  const removeActivity = (id: string) => {
    const next = activities
      .filter((a) => a.id !== id)
      .map((a) => ({ ...a, predecessors: a.predecessors.filter((p) => p !== id) }));
    setActivities(next);
    setSelected(next[0]?.id ?? "");
    setActivityCountInput(String(next.length));
    setCrashHistory((h) => h.filter((e) => e.activityId !== id));
  };

  const resizeActivities = () => {
    const n = Math.max(0, Math.min(26, Number.parseInt(activityCountInput, 10) || 0));
    setActivityCountInput(String(n));
    setActivities((prev) => {
      if (n === prev.length) return prev;
      if (n < prev.length) {
        const keep = prev.slice(0, n);
        const ids = new Set(keep.map((a) => a.id));
        return keep.map((a) => ({ ...a, predecessors: a.predecessors.filter((p) => ids.has(p)) }));
      }
      const next = [...prev];
      while (next.length < n) {
        const id = nextActivityId(next);
        const last = next.at(-1);
        next.push(
          createActivity(
            {
              id,
              name: `Actividad ${id}`,
              predecessors: last ? [last.id] : [],
            },
            next,
          ),
        );
      }
      return next;
    });
    if (n === 0) setSelected("");
    setCrashHistory([]);
  };

  const resetCrash = () => {
    setActivities((prev) => prev.map((a) => ({ ...a, crashed: false })));
    setCrashHistory([]);
  };

  const crashActivity = (id: string) => {
    const act = activities.find((a) => a.id === id);
    const computed = computedById.get(id);
    if (!act || !computed || act.crashed || !computed.canCrash) return;

    const beforeDuration = result.projectDuration;
    const beforeCost = result.totalCost;
    const updated = activities.map((a) => (a.id === id ? { ...a, crashed: true } : a));
    const after = computeProject(updated, "Crashing");

    setActivities(updated);
    setCrashHistory((prev) => [
      ...prev,
      {
        step: prev.length + 1,
        activityId: id,
        activityName: act.name,
        weeksReduced: roundWeeks(beforeDuration - after.projectDuration),
        projectDuration: after.projectDuration,
        totalCost: after.totalCost,
        incrementalCost: after.totalCost - beforeCost,
      },
    ]);
  };

  const calculate = () => setCalcPulse((n) => n + 1);

  const applyCompressedPlan = () => {
    setActivities(compressPlan.activities.map((activity) => ({ ...activity, predecessors: [...activity.predecessors] })));
    setCrashHistory(compressPlan.steps);
    setMethod("Crashing");
    setExcelNote(compressPlan.reached ? `Plan acelerado aplicado: ${fmt(compressPlan.finalDuration)} sem.` : compressPlan.summary);
  };

  const restoreBasePlan = () => {
    setActivities(baseActivities.map((activity) => ({ ...activity, predecessors: [...activity.predecessors] })));
    setCrashHistory([]);
    setExcelNote("Volviste al plan base, con tiempos normales.");
  };

  const goToSection = (section: Section) => {
    setActiveSection(section);
    const map: Record<Section, string> = {
      dashboard: "dashboard",
      network: "network-diagram",
      activities: "activities-table",
      analysis: "plans-panel",
      history: "crash-history",
    };
    document.getElementById(map[section])?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const switchMethod = (next: Method) => {
    setMethod(next);
    if (next !== "Crashing") {
      /* keep crashed state for when user returns */
    }
  };

  const nonCriticalSlack = result.activities.filter((a) => !a.critical).reduce((max, a) => Math.max(max, a.slack), 0);
  const maxSlackAct = result.activities.filter((a) => !a.critical).sort((a, b) => b.slack - a.slack)[0];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="network" size={22} />
          </div>
          <div>
            <strong>Pathwise</strong>
            <span>PERT · CPM · Crashing</span>
          </div>
        </div>
        <nav className="main-nav">
          <span className="nav-label">ESPACIO DE TRABAJO</span>
          <Button className={`nav-item ${activeSection === "dashboard" ? "active" : ""}`} onClick={() => goToSection("dashboard")}>
            <Icon name="grid" />
            Dashboard
          </Button>
          <Button className={`nav-item ${activeSection === "network" ? "active" : ""}`} onClick={() => goToSection("network")}>
            <Icon name="network" />
            Diagrama de red
          </Button>
          <Button className={`nav-item ${activeSection === "activities" ? "active" : ""}`} onClick={() => goToSection("activities")}>
            <Icon name="list" />
            Actividades
            <span className="nav-count">{activities.length}</span>
          </Button>
          <Button className={`nav-item ${activeSection === "analysis" ? "active" : ""}`} onClick={() => goToSection("analysis")}>
            <Icon name="chart" />
            Análisis
          </Button>
          <Button className={`nav-item ${activeSection === "history" ? "active" : ""}`} onClick={() => goToSection("history")}>
            <Icon name="history" />
            Historial
          </Button>
        </nav>
        <div className="sidebar-bottom">
          <Button className="nav-item" title="Tiempos en semanas">
            <Icon name="settings" />
            Unidad: semanas
          </Button>
          <Button
            className="nav-item"
            onClick={() => {
              setActivities(SAMPLE_ACTIVITIES.map((a) => ({ ...a, crashed: false })));
              setCrashHistory([]);
              setSavedBase(null);
              setCompressEdited(false);
              setTargetEdited(false);
              setSelected("A");
              setActivityCountInput(String(SAMPLE_ACTIVITIES.length));
            }}
          >
            <Icon name="help" />
            Restaurar ejemplo
          </Button>
          <div className="profile">
            <div className="avatar">PM</div>
            <div>
              <strong>Planificador</strong>
              <span>Proyecto en semanas</span>
            </div>
            <Icon name="more" />
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <div className="eyebrow">SIMULADOR DE RED · MÉTODO PERT-CPM</div>
            <div className="page-title">
              {SAMPLE_PROJECT_NAME} <span className="status-dot">En cálculo</span>
            </div>
          </div>
          <div className="top-actions">
            <span className="saved">{excelNote || (result.errors.length ? "Revisa las dependencias" : "Cálculo actualizado")}</span>
            <input
              ref={fileInputRef}
              className="file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void file.arrayBuffer().then((buffer) => {
                  const parsed = parseActivitiesSheet(buffer);
                  if (!parsed.activities.length) {
                    setExcelNote(parsed.errors[0] ?? "No se pudo importar el Excel.");
                    return;
                  }
                  setActivities(parsed.activities);
                  setSavedBase(null);
                  setCompressEdited(false);
                  setSelected(parsed.activities[0]?.id ?? "");
                  setActivityCountInput(String(parsed.activities.length));
                  setCrashHistory([]);
                  setExcelNote(
                    parsed.errors.length
                      ? `Importadas ${parsed.activities.length} actividades. ${parsed.errors[0]}`
                      : `Importadas ${parsed.activities.length} actividades desde Excel.`,
                  );
                });
              }}
            />
            <Button className="button-secondary" onClick={() => fileInputRef.current?.click()}>
              Importar Excel
            </Button>
            <Button className="button-secondary" onClick={() => downloadWorkbook(buildWorkbook(activities, result, targetWeeks), "pathwise-lsc.xlsx")}>
              Exportar Excel
            </Button>
            <Button className="button-secondary" onClick={() => setReportOpen(true)}>
              Informe
            </Button>
            <Button className="button-secondary" onClick={() => downloadWorkbook(buildWorkbook(SAMPLE_ACTIVITIES), "ejemplo-actividades-lsc.xlsx")}>
              Descargar ejemplo
            </Button>
            <Button className="button-primary" onClick={calculate}>
              <Icon name="play" size={15} />
              Calcular proyecto
            </Button>
          </div>
        </header>

        <section className="content" id="dashboard">
          <div className="method-row">
            <div className="method-tabs">
              {(
                [
                  ["CPM", "CPM determinista", "Tiempos fijos"],
                  ["PERT", "PERT probabilístico", "Tres estimaciones"],
                  ["Crashing", "Crashing", "Tiempo vs. costo"],
                ] as const
              ).map(([key, label, sub]) => (
                <Button key={key} onClick={() => switchMethod(key)} className={`method-tab ${method === key ? "selected" : ""}`}>
                  <span>{label}</span>
                  <small>{sub}</small>
                </Button>
              ))}
            </div>
            <div className="count-setup">
              <label>
                N.º actividades
                <input
                  type="number"
                  min={0}
                  max={26}
                  value={activityCountInput}
                  onChange={(e) => setActivityCountInput(e.target.value)}
                  onBlur={resizeActivities}
                  onKeyDown={(e) => e.key === "Enter" && resizeActivities()}
                />
              </label>
              <Button className="button-secondary" onClick={resizeActivities}>
                Aplicar
              </Button>
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="error-banner">
              {result.errors.map((err) => (
                <div key={err}>{err}</div>
              ))}
            </div>
          )}

          <div className="metrics">
            <Metric icon="clock" tone="indigo" label="Duración del proyecto" value={`${fmt(result.projectDuration)} sem.`} meta={method === "Crashing" && crashHistory.length ? `Tras ${crashHistory.length} aceleración(es)` : "Último nodo / ruta crítica"} />
            <Metric icon="bolt" tone="coral" label="Actividades críticas" value={`${result.criticalCount} de ${activities.length}`} meta={criticalPathLabel} />
            <Metric
              icon="chart"
              tone="mint"
              label={method === "PERT" ? "Desviación estándar" : "Holgura máxima"}
              value={method === "PERT" ? `${fmt(result.projectStdDev ?? 0)} sem.` : `${fmt(nonCriticalSlack)} sem.`}
              meta={method === "PERT" ? `Varianza: ${fmt(result.projectVariance ?? 0)}` : maxSlackAct ? `Actividad ${maxSlackAct.id}` : "Sin holgura"}
            />
            <Metric
              icon="coins"
              tone="amber"
              label={method === "Crashing" ? "Costo total" : "Costo estimado"}
              value={money(result.totalCost)}
              meta={method === "Crashing" ? `Base: ${money(baselineCost)}` : `Presupuesto base: ${money(baselineCost)}`}
            />
          </div>

          <div className="main-grid">
            <section className="panel graph-panel" id="network-diagram">
              <div className="panel-heading">
                <div>
                  <div className="panel-title">Diagrama de red</div>
                  <div className="panel-subtitle">
                    Nodo Inicio en 0,00 · IC / TC / IL / TL
                    {method === "Crashing" ? " · Doble clic en nodo acelerable (o botón del panel)" : ""}
                  </div>
                </div>
                <div className="legend">
                  <span>
                    <i className="legend-line critical-line" />
                    Ruta crítica
                  </span>
                  <span>
                    <i className="legend-line normal-line" />
                    No crítica
                  </span>
                </div>
              </div>
              <NetworkDiagram
                displayActivities={graph.displayActivities}
                edges={graph.edges}
                layoutById={layoutById}
                canvasWidth={graph.width}
                canvasHeight={graph.height}
                method={method}
                selected={selected}
                onSelect={setSelected}
                onCrash={crashActivity}
                criticalPathLabel={criticalPathLabel}
                projectDurationLabel={`${fmt(result.projectDuration)} semanas totales`}
                onDownloadPng={() => {
                  void downloadPngFile(networkSvg, "pathwise-grafo.png", graph.width, graph.height).then(
                    () => setExcelNote("Grafo descargado en PNG."),
                    () => setExcelNote("No se pudo descargar el grafo."),
                  );
                }}
              />
            </section>

            <aside className="panel detail-panel">
              <div className="panel-heading">
                <div>
                  <div className="panel-title">Detalle de actividad</div>
                  <div className="panel-subtitle">{active ? `Editando ${active.id}` : "Sin selección"}</div>
                </div>
                {active && (
                  <Button className="icon-button small" title="Eliminar" onClick={() => removeActivity(active.id)}>
                    <Icon name="trash" size={14} />
                  </Button>
                )}
              </div>
              {active ? (
                <>
                  <div className="detail-body">
                    <label>
                      Nombre de la actividad
                      <input value={active.name} onChange={(e) => updateActivity(active.id, { name: e.target.value })} />
                    </label>
                    <label>
                      Fase
                      <input value={active.phase} onChange={(e) => updateActivity(active.id, { phase: e.target.value })} />
                    </label>
                    <div className="field-pair">
                      <label>
                        ID
                        <input value={active.id} disabled />
                      </label>
                      <label>
                        Predecesoras
                        <input
                          value={active.predecessors.join(", ")}
                          placeholder="A, B o vacío"
                          onChange={(e) => updateActivity(active.id, { predecessors: parsePredecessors(e.target.value) })}
                        />
                      </label>
                    </div>

                    {method === "CPM" && (
                      <label>
                        Tiempo base / duración (semanas)
                        <div className="stepper">
                          <Button onClick={() => updateActivity(active.id, { duration: Math.max(0.1, roundWeeks(active.duration - 1)) })}>−</Button>
                          <input
                            type="number"
                            min={0.1}
                            step={0.1}
                            value={active.duration}
                            onChange={(e) => updateActivity(active.id, { duration: Math.max(0.1, Number(e.target.value) || 0.1) })}
                          />
                          <Button onClick={() => updateActivity(active.id, { duration: roundWeeks(active.duration + 1) })}>+</Button>
                        </div>
                      </label>
                    )}

                    {method === "PERT" && (
                      <>
                        <div className="field-pair three">
                          <label>
                            Optimista (a)
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={active.optimistic}
                              onChange={(e) => updateActivity(active.id, { optimistic: Math.max(0, Number(e.target.value) || 0) })}
                            />
                          </label>
                          <label>
                            Probable (m)
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={active.mostLikely}
                              onChange={(e) => updateActivity(active.id, { mostLikely: Math.max(0, Number(e.target.value) || 0) })}
                            />
                          </label>
                          <label>
                            Pesimista (b)
                            <input
                              type="number"
                              min={0}
                              step={0.1}
                              value={active.pessimistic}
                              onChange={(e) => updateActivity(active.id, { pessimistic: Math.max(0, Number(e.target.value) || 0) })}
                            />
                          </label>
                        </div>
                        <div className="pert-stats">
                          <div>
                            <span>t esperado</span>
                            <strong>{fmt(activeComputed?.expectedTime ?? 0)} sem.</strong>
                          </div>
                          <div>
                            <span>Varianza</span>
                            <strong>{fmt(activeComputed?.variance ?? 0)}</strong>
                          </div>
                          <div>
                            <span>Desv. estándar</span>
                            <strong>{fmt(activeComputed?.stdDev ?? 0)}</strong>
                          </div>
                        </div>
                      </>
                    )}

                    {method === "Crashing" && (
                      <>
                        <div className="field-pair">
                          <label>
                            Tiempo normal
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              value={active.normalTime}
                              onChange={(e) => updateActivity(active.id, { normalTime: Math.max(0.1, Number(e.target.value) || 0.1) })}
                            />
                          </label>
                          <label>
                            Tiempo intensivo
                            <input
                              type="number"
                              min={0.1}
                              step={0.1}
                              value={active.crashTime}
                              onChange={(e) => updateActivity(active.id, { crashTime: Math.max(0.1, Number(e.target.value) || 0.1) })}
                            />
                          </label>
                        </div>
                        <div className="field-pair">
                          <label>
                            Costo normal ($)
                            <input
                              type="number"
                              min={0}
                              value={active.normalCost}
                              onChange={(e) => updateActivity(active.id, { normalCost: Math.max(0, Number(e.target.value) || 0) })}
                            />
                          </label>
                          <label>
                            Costo intensivo ($)
                            <input
                              type="number"
                              min={0}
                              value={active.crashCost}
                              onChange={(e) => updateActivity(active.id, { crashCost: Math.max(0, Number(e.target.value) || 0) })}
                            />
                          </label>
                        </div>
                        <div className="crash-box">
                          <div>
                            <span>Costo marginal Cᵢⱼ</span>
                            <strong>{activeComputed?.marginalCost === undefined ? "N/A" : `${fmt(activeComputed.marginalCost)} $/sem.`}</strong>
                          </div>
                          <p className="crash-formula">(CN − CI) / (TN − TI)</p>
                          <div className="cost-delta">
                            <span>Estado</span>
                            <strong>{active.crashed ? "Acelerada" : activeComputed?.canCrash ? "Acelerable" : "Ya en tiempo mínimo"}</strong>
                          </div>
                          {!active.crashed && activeComputed?.canCrash && (
                            <Button className="button-primary crash-action" onClick={() => crashActivity(active.id)}>
                              <Icon name="bolt" size={14} />
                              Acelerar actividad
                            </Button>
                          )}
                          {active.crashed && (
                            <Button
                              className="button-secondary crash-action"
                              onClick={() => {
                                const remaining = activities.map((a) => (a.id === active.id ? { ...a, crashed: false } : a));
                                setActivities(remaining);
                                setCrashHistory((h) => rebuildCrashHistory(remaining, h.filter((e) => e.activityId !== active.id).map((e) => e.activityId)));
                              }}
                            >
                              <Icon name="undo" size={14} />
                              Revertir aceleración
                            </Button>
                          )}
                        </div>
                      </>
                    )}

                    {method !== "Crashing" && (
                      <label>
                        Costo normal ($)
                        <input
                          type="number"
                          min={0}
                          value={active.normalCost}
                          onChange={(e) => updateActivity(active.id, { normalCost: Math.max(0, Number(e.target.value) || 0) })}
                        />
                      </label>
                    )}

                    {activeComputed && (
                      <div className={`critical-notice ${activeComputed.critical ? "" : "notice-normal"}`}>
                        <span className="notice-icon">
                          <Icon name="bolt" size={16} />
                        </span>
                        <div>
                          <strong>{activeComputed.critical ? "Actividad crítica" : "Actividad con holgura"}</strong>
                          <p>
                            IC {fmt(activeComputed.es)} · TC {fmt(activeComputed.ef)} · IL {fmt(activeComputed.ls)} · TL {fmt(activeComputed.lf)} · Holgura{" "}
                            {fmt(activeComputed.slack)} sem.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="detail-actions">
                    <Button className="button-secondary" onClick={addActivity}>
                      <Icon name="plus" size={14} />
                      Nueva
                    </Button>
                    <Button className="button-primary" onClick={calculate}>
                      Recalcular
                    </Button>
                  </div>
                </>
              ) : (
                <div className="detail-body">
                  <p className="empty-hint">Solo queda el nodo Inicio (0,00). Agrega una actividad para armar la red.</p>
                  <Button className="button-primary" onClick={addActivity}>
                    <Icon name="plus" size={14} />
                    Nueva actividad
                  </Button>
                </div>
              )}
            </aside>
          </div>

          <section className="panel analysis-panel" id="gantt-chart">
            <div className="panel-heading">
              <div>
                <div className="panel-title">Diagrama de Gantt</div>
                <div className="panel-subtitle">Barra sólida: ejecución (IC a TC). Tramo claro: holgura hasta el tiempo más lejano. Según el modo activo.</div>
              </div>
              <div className="legend">
                <span><i className="gantt-key critical" />Ruta crítica</span>
                <span><i className="gantt-key normal" />Con holgura</span>
                <span><i className="gantt-key slack" />Holgura</span>
              </div>
            </div>
            <GanttChart activities={result.activities} projectDuration={result.projectDuration} />
          </section>

          <section className="panel analysis-panel" id="plans-panel">
            <div className="panel-heading">
              <div>
                <div className="panel-title">Plan base y plan acelerado</div>
                <div className="panel-subtitle">Cada actividad crítica se acelera completa, empezando por la que menos cuesta por semana ganada.</div>
              </div>
              <div className="report-actions">
                <Button className="button-secondary" onClick={() => setSavedBase(activities.map((activity) => ({ ...activity, predecessors: [...activity.predecessors], crashed: false })))}>
                  Fijar plan base
                </Button>
                <Button className="button-secondary" onClick={() => setSavedBase(null)} disabled={!savedBase}>
                  Seguir el plan en pantalla
                </Button>
              </div>
            </div>
            <div className="plan-toolbar">
              <label>
                Quiero terminar en (semanas)
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={compressTarget}
                  onChange={(event) => {
                    setCompressEdited(true);
                    setCompressTarget(Math.max(0, Number(event.target.value) || 0));
                  }}
                />
              </label>
              <p>{savedBase ? "La base está fija y no cambia si editas la red." : "La base es el plan en pantalla con tiempos normales."} {compressPlan.summary}</p>
            </div>
            <div className="plan-compare">
              <article>
                <span>Plan base</span>
                <strong>{fmt(baseResult.projectDuration)} sem.</strong>
                <small>{money(baseResult.totalCost)}</small>
                <p>Inicio → {baseResult.criticalPath.join(" → ") || "—"}</p>
              </article>
              <article className="plan-fast">
                <span>Plan acelerado</span>
                <strong>{fmt(acceleratedResult.projectDuration)} sem.</strong>
                <small>{money(acceleratedResult.totalCost)} · extra {money(acceleratedResult.totalCost - baseResult.totalCost)}</small>
                <p>Inicio → {acceleratedResult.criticalPath.join(" → ") || "—"}</p>
              </article>
            </div>
            <CostCurve points={compressPlan.points} />
            {compressPlan.steps.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>PASO</th>
                      <th>ACELERAR</th>
                      <th>SEMANAS GANADAS</th>
                      <th>DURACIÓN</th>
                      <th>COSTO EXTRA</th>
                      <th>COSTO TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compressPlan.steps.map((step) => (
                      <tr key={step.step}>
                        <td>{step.step}</td>
                        <td>
                          <span className="table-id critical-id">{step.activityId}</span>
                          <strong>{step.activityName}</strong>
                        </td>
                        <td>−{fmt(step.weeksReduced)} sem.</td>
                        <td>{fmt(step.projectDuration)} sem.</td>
                        <td>+{money(step.incrementalCost)}</td>
                        <td>{money(step.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="plan-actions">
              <Button className="button-primary" onClick={applyCompressedPlan} disabled={!compressPlan.steps.length}>
                Aplicar plan acelerado
              </Button>
              <Button className="button-secondary" onClick={restoreBasePlan}>
                Volver al plan base
              </Button>
            </div>
          </section>

          {method === "PERT" && (
            <section className="panel analysis-panel" id="analysis-panel">
              <div className="panel-heading">
                <div>
                  <div className="panel-title">Resultados PERT del proyecto</div>
                  <div className="panel-subtitle">Basados en la suma de la ruta crítica · t = (a + 4m + b) / 6</div>
                </div>
              </div>
              <div className="pert-global">
                <div>
                  <span>Tiempo esperado (ruta crítica)</span>
                  <strong>{fmt(result.projectDuration)} sem.</strong>
                </div>
                <div>
                  <span>Varianza total</span>
                  <strong>{fmt(result.projectVariance ?? 0)}</strong>
                </div>
                <div>
                  <span>Desviación estándar</span>
                  <strong>{fmt(result.projectStdDev ?? 0)} sem.</strong>
                </div>
                <div>
                  <span>Σ Optimista (a)</span>
                  <strong>{fmt(result.projectOptimistic ?? 0)} sem.</strong>
                </div>
                <div>
                  <span>Σ Más probable (m)</span>
                  <strong>{fmt(result.projectMostLikely ?? 0)} sem.</strong>
                </div>
                <div>
                  <span>Σ Pesimista (b)</span>
                  <strong>{fmt(result.projectPessimistic ?? 0)} sem.</strong>
                </div>
                <div>
                  <span>μ − σ</span>
                  <strong>{fmt(result.projectDuration - (result.projectStdDev ?? 0))} sem.</strong>
                </div>
                <div>
                  <span>μ + σ</span>
                  <strong>{fmt(result.projectDuration + (result.projectStdDev ?? 0))} sem.</strong>
                </div>
              </div>
              <div className="probability-box">
                <label>
                  Quiero terminar en (semanas)
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={targetWeeks}
                    onChange={(event) => {
                      setTargetEdited(true);
                      setTargetWeeks(Math.max(0, Number(event.target.value) || 0));
                    }}
                  />
                </label>
                <div>
                  <span>Z = (X − μ) / σ</span>
                  <strong>{odds.certain ? "σ = 0" : fmt(odds.z ?? 0)}</strong>
                </div>
                <div>
                  <span>P(terminar en X o menos)</span>
                  <strong>{(odds.probability * 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %</strong>
                </div>
                <p>
                  {odds.certain
                    ? "Las estimaciones no tienen dispersión. El proyecto termina exactamente en μ."
                    : "Se asume que la duración del proyecto sigue una distribución normal."}
                </p>
              </div>
            </section>
          )}

          {method === "Crashing" && (
            <section className="panel analysis-panel" id="crash-history">
              <div className="panel-heading">
                <div>
                  <div className="panel-title">Historial de aceleración</div>
                  <div className="panel-subtitle">Cada clic en un nodo acelerable actualiza la red y el costo</div>
                </div>
                <Button className="button-secondary" onClick={resetCrash} disabled={!crashHistory.length && !activities.some((a) => a.crashed)}>
                  <Icon name="undo" size={14} />
                  Reiniciar crashing
                </Button>
              </div>
              {crashHistory.length === 0 ? (
                <div className="empty-history">Selecciona nodos en el grafo (o usa «Acelerar actividad») para comprimir el proyecto.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>PASO</th>
                        <th>ACTIVIDAD</th>
                        <th>REDUCCIÓN</th>
                        <th>DURACIÓN PROYECTO</th>
                        <th>COSTO INCREMENTAL</th>
                        <th>COSTO TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crashHistory.map((h) => (
                        <tr key={h.step}>
                          <td>{h.step}</td>
                          <td>
                            <span className="table-id critical-id">{h.activityId}</span>
                            <strong>{h.activityName}</strong>
                          </td>
                          <td>−{fmt(h.weeksReduced)} sem.</td>
                          <td>{fmt(h.projectDuration)} sem.</td>
                          <td>+{money(h.incrementalCost)}</td>
                          <td>{money(h.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section className="panel table-panel" id="activities-table">
            <div className="panel-heading">
              <div>
                <div className="panel-title">Actividades del proyecto</div>
                <div className="panel-subtitle">
                  {activities.length} actividades · {result.criticalCount} en ruta crítica · unidad: semanas
                </div>
              </div>
              <Button className="button-secondary add-button" onClick={addActivity}>
                <Icon name="plus" size={16} />
                Nueva actividad
              </Button>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ACTIVIDAD</th>
                    <th>FASE</th>
                    <th>PREDECESORAS</th>
                    {method === "PERT" ? (
                      <>
                        <th>a / m / b</th>
                        <th>t / σ²</th>
                      </>
                    ) : method === "Crashing" ? (
                      <>
                        <th>TN / TI</th>
                        <th>CN / CI / Cᵢⱼ</th>
                      </>
                    ) : (
                      <th>DURACIÓN</th>
                    )}
                    <th>IC / TC</th>
                    <th>IL / TL</th>
                    <th>HOLGURA</th>
                    <th>ESTADO</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {result.activities.map((item) => {
                    const raw = activities.find((a) => a.id === item.id)!;
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelected(item.id)}
                        className={selected === item.id ? "row-selected" : ""}
                      >
                        <td>
                          <span className={`table-id ${item.critical ? "critical-id" : ""}`}>{item.id}</span>
                          <strong>{item.name}</strong>
                        </td>
                        <td className="phase-cell">{raw.phase || "—"}</td>
                        <td>{formatPredecessors(item.predecessors)}</td>
                        {method === "PERT" ? (
                          <>
                            <td>
                              {fmt(raw.optimistic)} / {fmt(raw.mostLikely)} / {fmt(raw.pessimistic)}
                            </td>
                            <td>
                              {fmt(item.expectedTime ?? 0)} / {fmt(item.variance ?? 0)}
                            </td>
                          </>
                        ) : method === "Crashing" ? (
                          <>
                            <td>
                              {fmt(raw.normalTime)} / {fmt(raw.crashTime)}
                              {raw.crashed ? " ★" : ""}
                            </td>
                            <td>
                              {money(raw.normalCost)} / {money(raw.crashCost)} / {item.marginalCost === undefined ? "—" : fmt(item.marginalCost)}
                            </td>
                          </>
                        ) : (
                          <td>{fmt(item.duration)} sem.</td>
                        )}
                        <td>
                          {fmt(item.es)} — {fmt(item.ef)}
                        </td>
                        <td>
                          {fmt(item.ls)} — {fmt(item.lf)}
                        </td>
                        <td>
                          <span className={item.critical ? "zero-slack" : "positive-slack"}>{fmt(item.slack)} sem.</span>
                        </td>
                        <td>
                          <span className={item.critical ? "critical-pill" : "normal-pill"}>{item.critical ? "Crítica" : "Normal"}</span>
                        </td>
                        <td>
                          <Button
                            className="icon-button small"
                            title="Eliminar"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeActivity(item.id);
                            }}
                          >
                            <Icon name="trash" size={14} />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {method !== "PERT" && method !== "Crashing" && <div id="analysis-panel" />}
          {method !== "Crashing" && <div id="crash-history" />}
        </section>
      </main>
      <ReportDialog
        open={reportOpen}
        projectName={SAMPLE_PROJECT_NAME}
        text={reportText}
        svg={networkSvg}
        width={graph.width}
        height={graph.height}
        onClose={() => setReportOpen(false)}
      >
        <h3 className="report-gantt-title">Diagrama de Gantt</h3>
        <GanttChart activities={result.activities} projectDuration={result.projectDuration} />
      </ReportDialog>
    </div>
  );
}

function roundWeeks(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Reconstruye el historial de crashing en el orden indicado */
function rebuildCrashHistory(all: Activity[], order: string[]): CrashHistoryEntry[] {
  let current = all.map((a) => ({ ...a, crashed: false }));
  let prev = computeProject(current, "Crashing");
  const history: CrashHistoryEntry[] = [];
  order.forEach((id, index) => {
    const act = current.find((a) => a.id === id);
    if (!act) return;
    current = current.map((a) => (a.id === id ? { ...a, crashed: true } : a));
    const next = computeProject(current, "Crashing");
    history.push({
      step: index + 1,
      activityId: id,
      activityName: act.name,
      weeksReduced: roundWeeks(prev.projectDuration - next.projectDuration),
      projectDuration: next.projectDuration,
      totalCost: next.totalCost,
      incrementalCost: next.totalCost - prev.totalCost,
    });
    prev = next;
  });
  return history;
}

function Metric({ icon, tone, label, value, meta }: { icon: IconName; tone: string; label: string; value: string; meta: string }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon name={icon} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{meta}</small>
      </div>
    </div>
  );
}

export default App;
