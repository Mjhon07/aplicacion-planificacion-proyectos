import type { Activity, ComputedActivity, GraphEdge, GraphLayoutResult, GraphNodeLayout, Method, ProjectResult } from "./types";

const NODE_W = 120;
const NODE_H = 80;
const COL_GAP = 200;
const ROW_GAP = 112;
const PAD_X = 90;
const PAD_Y = 70;

const EPS = 1e-6;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function nextActivityId(existing: Activity[]): string {
  const used = new Set(existing.map((a) => a.id));
  for (let i = 0; i < 26; i++) {
    const id = String.fromCharCode(65 + i);
    if (!used.has(id)) return id;
  }
  let n = 1;
  while (used.has(`A${n}`)) n++;
  return `A${n}`;
}

export function createActivity(partial?: Partial<Activity>, existing: Activity[] = []): Activity {
  const id = partial?.id ?? nextActivityId(existing);
  return {
    id,
    name: partial?.name ?? `Actividad ${id}`,
    phase: partial?.phase ?? "",
    predecessors: partial?.predecessors ?? [],
    duration: partial?.duration ?? 2,
    optimistic: partial?.optimistic ?? 1,
    mostLikely: partial?.mostLikely ?? 2,
    pessimistic: partial?.pessimistic ?? 4,
    normalTime: partial?.normalTime ?? 2,
    crashTime: partial?.crashTime ?? 1,
    normalCost: partial?.normalCost ?? 1000,
    crashCost: partial?.crashCost ?? 1500,
    crashed: partial?.crashed ?? false,
  };
}

/** ID reservado del nodo virtual de inicio en el diagrama */
export const START_NODE_ID = "INICIO";

const PREDECESSOR_WORDS = new Set(["Y", "DE", "DEL", "AND", "OR", "CON", "LAS", "LOS", "EL", "LA"]);

export function parsePredecessors(value: string): string[] {
  const raw = value
    .split(/[,;\s\-–—/]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s && s !== "-" && s !== "—" && s !== "NINGUNA" && s !== "N/A" && s !== START_NODE_ID && !PREDECESSOR_WORDS.has(s));

  // "AB" o "ABC" → A, B, C (atajo al tipiar sin comas)
  const expanded: string[] = [];
  for (const token of raw) {
    if (/^[A-Z]{2,}$/.test(token)) expanded.push(...token.split(""));
    else expanded.push(token);
  }
  return [...new Set(expanded)];
}

export function formatPredecessors(preds: string[]): string {
  return preds.length ? preds.join(", ") : "—";
}

function expectedTime(a: number, m: number, b: number): number {
  return (a + 4 * m + b) / 6;
}

function variance(a: number, b: number): number {
  const v = (b - a) / 6;
  return v * v;
}

/** Costo marginal Cij = (CN - CI) / (TN - TI) según especificación */
export function marginalCost(normalCost: number, crashCost: number, normalTime: number, crashTime: number): number | null {
  const dt = normalTime - crashTime;
  if (dt <= EPS) return null;
  return (normalCost - crashCost) / dt;
}

function resolveDuration(activity: Activity, method: Method): number {
  if (method === "PERT") {
    return expectedTime(activity.optimistic, activity.mostLikely, activity.pessimistic);
  }
  if (method === "Crashing") {
    return activity.crashed ? activity.crashTime : activity.normalTime;
  }
  return activity.duration;
}

function buildAdjacency(activities: Activity[]): {
  byId: Map<string, Activity>;
  successors: Map<string, string[]>;
  errors: string[];
} {
  const byId = new Map(activities.map((a) => [a.id, a]));
  const successors = new Map<string, string[]>(activities.map((a) => [a.id, []]));
  const errors: string[] = [];

  for (const act of activities) {
    for (const pred of act.predecessors) {
      if (!byId.has(pred)) {
        errors.push(`La actividad ${act.id} referencia la predecesora inexistente "${pred}".`);
        continue;
      }
      if (pred === act.id) {
        errors.push(`La actividad ${act.id} no puede ser predecesora de sí misma.`);
        continue;
      }
      successors.get(pred)!.push(act.id);
    }
  }

  return { byId, successors, errors };
}

function topologicalOrder(ids: string[], predecessors: Map<string, string[]>, successors: Map<string, string[]>): { order: string[]; cycle: boolean } {
  const indegree = new Map(ids.map((id) => [id, predecessors.get(id)?.length ?? 0]));
  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];

  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const succ of successors.get(id) ?? []) {
      const next = (indegree.get(succ) ?? 0) - 1;
      indegree.set(succ, next);
      if (next === 0) queue.push(succ);
    }
  }

  return { order, cycle: order.length !== ids.length };
}

export function computeProject(activities: Activity[], method: Method): ProjectResult {
  if (activities.length === 0) {
    return {
      activities: [],
      projectDuration: 0,
      criticalPath: [],
      criticalCount: 0,
      totalCost: 0,
      errors: [],
    };
  }

  const { successors, errors } = buildAdjacency(activities);
  const predMap = new Map(activities.map((a) => [a.id, a.predecessors.filter((p) => activities.some((x) => x.id === p))]));
  const ids = activities.map((a) => a.id);
  const { order, cycle } = topologicalOrder(ids, predMap, successors);

  if (cycle) {
    return {
      activities: [],
      projectDuration: 0,
      criticalPath: [],
      criticalCount: 0,
      totalCost: 0,
      errors: [...errors, "Hay un ciclo en las dependencias. Revisa las predecesoras."],
    };
  }

  const durationMap = new Map(activities.map((a) => [a.id, resolveDuration(a, method)]));
  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  for (const id of order) {
    const preds = predMap.get(id) ?? [];
    const start = preds.length === 0 ? 0 : Math.max(...preds.map((p) => ef.get(p) ?? 0));
    const dur = durationMap.get(id) ?? 0;
    es.set(id, start);
    ef.set(id, start + dur);
  }

  const projectDuration = Math.max(...ids.map((id) => ef.get(id) ?? 0), 0);
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  for (const id of [...order].reverse()) {
    const succs = successors.get(id) ?? [];
    const finish = succs.length === 0 ? projectDuration : Math.min(...succs.map((s) => ls.get(s) ?? projectDuration));
    const dur = durationMap.get(id) ?? 0;
    lf.set(id, finish);
    ls.set(id, finish - dur);
  }

  const computed: ComputedActivity[] = activities.map((a) => {
    const dur = durationMap.get(a.id) ?? 0;
    const earlyStart = es.get(a.id) ?? 0;
    const earlyFinish = ef.get(a.id) ?? 0;
    const lateStart = ls.get(a.id) ?? 0;
    const lateFinish = lf.get(a.id) ?? 0;
    const slack = lateStart - earlyStart;
    const critical = Math.abs(slack) < EPS;
    const base: ComputedActivity = {
      id: a.id,
      name: a.name,
      predecessors: a.predecessors,
      successors: successors.get(a.id) ?? [],
      duration: round2(dur),
      es: round2(earlyStart),
      ef: round2(earlyFinish),
      ls: round2(lateStart),
      lf: round2(lateFinish),
      slack: round2(slack),
      critical,
    };

    if (method === "PERT") {
      const t = expectedTime(a.optimistic, a.mostLikely, a.pessimistic);
      const v = variance(a.optimistic, a.pessimistic);
      base.expectedTime = round2(t);
      base.variance = round2(v);
      base.stdDev = round2(Math.sqrt(v));
    }

    if (method === "Crashing") {
      const cij = marginalCost(a.normalCost, a.crashCost, a.normalTime, a.crashTime);
      base.marginalCost = cij === null ? undefined : round2(cij);
      base.canCrash = !a.crashed && a.normalTime - a.crashTime > EPS;
      base.crashed = a.crashed;
      base.normalCost = a.normalCost;
      base.crashCost = a.crashCost;
      base.normalTime = a.normalTime;
      base.crashTime = a.crashTime;
    }

    return base;
  });

  // Ruta crítica en orden topológico (no el orden de entrada)
  const criticalOrdered = order.filter((id) => {
    const act = computed.find((a) => a.id === id);
    return act?.critical;
  });
  const criticalPath = criticalOrdered;
  const criticalSet = new Set(criticalPath);

  let projectVariance: number | undefined;
  let projectStdDev: number | undefined;
  let projectOptimistic: number | undefined;
  let projectMostLikely: number | undefined;
  let projectPessimistic: number | undefined;

  if (method === "PERT") {
    const critActs = activities.filter((a) => criticalSet.has(a.id));
    projectVariance = round2(critActs.reduce((sum, a) => sum + variance(a.optimistic, a.pessimistic), 0));
    projectStdDev = round2(Math.sqrt(projectVariance));
    projectOptimistic = round2(critActs.reduce((sum, a) => sum + a.optimistic, 0));
    projectMostLikely = round2(critActs.reduce((sum, a) => sum + a.mostLikely, 0));
    projectPessimistic = round2(critActs.reduce((sum, a) => sum + a.pessimistic, 0));
  }

  const totalCost =
    method === "Crashing"
      ? activities.reduce((sum, a) => sum + (a.crashed ? a.crashCost : a.normalCost), 0)
      : activities.reduce((sum, a) => sum + a.normalCost, 0);

  return {
    activities: computed,
    projectDuration: round2(projectDuration),
    criticalPath,
    criticalCount: criticalPath.length,
    totalCost,
    projectVariance,
    projectStdDev,
    projectOptimistic,
    projectMostLikely,
    projectPessimistic,
    errors,
  };
}

function createStartNode(successors: string[] = [], critical = true): ComputedActivity {
  return {
    id: START_NODE_ID,
    name: "Inicio",
    predecessors: [],
    successors,
    duration: 0,
    es: 0,
    ef: 0,
    ls: 0,
    lf: 0,
    slack: 0,
    critical,
    isStart: true,
  };
}

/** Nodo virtual Inicio (todo en 0) + actividades calculadas para el diagrama */
export function buildGraphActivities(computed: ComputedActivity[]): ComputedActivity[] {
  if (computed.length === 0) {
    // Solo el nodo Inicio: proyecto vacío
    return [createStartNode([], true)];
  }

  const sources = computed.filter((a) => a.predecessors.length === 0);
  const startNode = createStartNode(
    sources.map((a) => a.id),
    sources.some((a) => a.critical),
  );

  return [startNode, ...computed];
}

/** Layout por niveles topológicos en píxeles (canvas crece con el proyecto) */
export function layoutGraph(computed: ComputedActivity[]): GraphLayoutResult {
  const displayActivities = buildGraphActivities(computed);
  if (displayActivities.length === 0) {
    return { nodes: [], edges: [], displayActivities: [], width: 400, height: 320 };
  }

  const level = new Map<string, number>();
  const byId = new Map(displayActivities.map((a) => [a.id, a]));

  level.set(START_NODE_ID, 0);

  const visit = (id: string): number => {
    if (level.has(id)) return level.get(id)!;
    const act = byId.get(id);
    if (!act) {
      level.set(id, 1);
      return 1;
    }
    if (act.predecessors.length === 0) {
      level.set(id, 1);
      return 1;
    }
    const lvl = Math.max(...act.predecessors.map((p) => (byId.has(p) ? visit(p) : 0))) + 1;
    level.set(id, lvl);
    return lvl;
  };

  displayActivities.forEach((a) => {
    if (a.id !== START_NODE_ID) visit(a.id);
  });

  const maxLevel = Math.max(...level.values(), 0);
  const buckets = new Map<number, string[]>();
  for (const a of displayActivities) {
    const lvl = level.get(a.id) ?? 0;
    if (!buckets.has(lvl)) buckets.set(lvl, []);
    buckets.get(lvl)!.push(a.id);
  }

  const maxRows = Math.max(...[...buckets.values()].map((ids) => ids.length), 1);
  const contentH = Math.max(maxRows - 1, 0) * ROW_GAP;
  const height = Math.max(320, PAD_Y * 2 + contentH + NODE_H);
  const width = Math.max(400, PAD_X * 2 + maxLevel * COL_GAP + NODE_W);

  const nodes: GraphNodeLayout[] = [];
  for (const [lvl, ids] of buckets) {
    ids.sort((a, b) => {
      if (a === START_NODE_ID) return -1;
      if (b === START_NODE_ID) return 1;
      return a.localeCompare(b);
    });
    const x = PAD_X + lvl * COL_GAP + NODE_W / 2;
    const blockH = Math.max(ids.length - 1, 0) * ROW_GAP;
    const startY = height / 2 - blockH / 2;
    ids.forEach((id, index) => {
      nodes.push({ id, x, y: startY + index * ROW_GAP });
    });
  }

  const edges: GraphEdge[] = [];
  for (const a of computed) {
    if (a.predecessors.length === 0) {
      edges.push({ from: START_NODE_ID, to: a.id, critical: a.critical });
    }
  }
  for (const a of computed) {
    for (const pred of a.predecessors) {
      if (!byId.has(pred)) continue;
      edges.push({
        from: pred,
        to: a.id,
        critical: byId.get(pred)!.critical && a.critical,
      });
    }
  }

  return { nodes, edges, displayActivities, width, height };
}

/** Curva en coordenadas de píxeles del lienzo */
export function edgePath(from: GraphNodeLayout, to: GraphNodeLayout, nodeHalfW = NODE_W / 2): string {
  const x1 = from.x + nodeHalfW - 4;
  const y1 = from.y;
  const x2 = to.x - nodeHalfW + 4;
  const y2 = to.y;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export const SAMPLE_PROJECT_NAME = "Reconocimiento de lengua de señas (LSC)";

const PHASE_DATA = "Fases iniciales y procesamiento de datos";
const PHASE_APP = "Desarrollo frontend, integración y pruebas";

/** Duración dada por el usuario; a/m/b y crashing se derivan para que el ejemplo sirva en los 3 modos. */
function sampleActivity(
  id: string,
  name: string,
  predecessors: string[],
  weeks: number,
  cost: number,
  phase: string,
): Activity {
  return createActivity({
    id,
    name,
    phase,
    predecessors,
    duration: weeks,
    optimistic: Math.max(1, weeks - 1),
    mostLikely: weeks,
    pessimistic: weeks + 2,
    normalTime: weeks,
    crashTime: Math.max(1, weeks - 1),
    normalCost: cost,
    crashCost: Math.round(cost * 1.4),
  });
}

export const SAMPLE_ACTIVITIES: Activity[] = [
  sampleActivity("A", "Requerimientos y Arquitectura", [], 3, 3500, PHASE_DATA),
  sampleActivity("B", "Recolección de Corpus LSC", ["A"], 4, 2000, PHASE_DATA),
  sampleActivity("C", "Preprocesamiento (Landmarks)", ["B"], 3, 2500, PHASE_DATA),
  sampleActivity("D", "Entrenamiento del Modelo de IA", ["C"], 5, 4000, PHASE_DATA),
  sampleActivity("E", "Validación y Ajuste IA", ["D"], 2, 1500, PHASE_APP),
  sampleActivity("F", "Desarrollo de App Móvil", ["A"], 6, 5000, PHASE_APP),
  sampleActivity("G", "Integración IA + App", ["E", "F"], 3, 2500, PHASE_APP),
  sampleActivity("H", "Pruebas de Campo y Despliegue", ["G"], 2, 1000, PHASE_APP),
];
