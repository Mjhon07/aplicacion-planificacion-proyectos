export type Method = "CPM" | "PERT" | "Crashing";

export interface Activity {
  id: string;
  name: string;
  /** IDs de predecesoras; vacío = sin predecesoras */
  predecessors: string[];
  /** Modo CPM: duración en semanas */
  duration: number;
  /** Modo PERT */
  optimistic: number;
  mostLikely: number;
  pessimistic: number;
  /** Modo Crashing */
  normalTime: number;
  crashTime: number;
  normalCost: number;
  crashCost: number;
  /** Si la actividad ya fue acelerada en el modo Crashing */
  crashed: boolean;
}

export interface ComputedActivity {
  id: string;
  name: string;
  predecessors: string[];
  successors: string[];
  /** Duración usada en la red (semanas) */
  duration: number;
  /** IC — inicio más cercano (ES) */
  es: number;
  /** TC — terminación más cercana (EF) */
  ef: number;
  /** IL — inicio más lejano (LS) */
  ls: number;
  /** TL — terminación más lejana (LF) */
  lf: number;
  slack: number;
  critical: boolean;
  /** Nodo virtual de inicio (duración 0) */
  isStart?: boolean;
  /** PERT */
  expectedTime?: number;
  variance?: number;
  stdDev?: number;
  /** Crashing */
  marginalCost?: number;
  canCrash?: boolean;
  crashed?: boolean;
  normalCost?: number;
  crashCost?: number;
  normalTime?: number;
  crashTime?: number;
}

export interface ProjectResult {
  activities: ComputedActivity[];
  projectDuration: number;
  criticalPath: string[];
  criticalCount: number;
  totalCost: number;
  /** PERT */
  projectVariance?: number;
  projectStdDev?: number;
  projectOptimistic?: number;
  projectMostLikely?: number;
  projectPessimistic?: number;
  errors: string[];
}

export interface CrashHistoryEntry {
  step: number;
  activityId: string;
  activityName: string;
  weeksReduced: number;
  projectDuration: number;
  totalCost: number;
  incrementalCost: number;
}

export interface GraphNodeLayout {
  id: string;
  /** Centro del nodo en píxeles */
  x: number;
  /** Centro del nodo en píxeles */
  y: number;
}

export interface GraphLayoutResult {
  nodes: GraphNodeLayout[];
  edges: GraphEdge[];
  displayActivities: ComputedActivity[];
  /** Tamaño del lienzo en píxeles */
  width: number;
  height: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  critical: boolean;
}
