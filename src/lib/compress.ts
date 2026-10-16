import { computeProject } from "./pertCpm";
import { suggestCrash } from "./report";
import type { Activity, CrashHistoryEntry } from "./types";

export interface CostPoint {
  duration: number;
  cost: number;
  label: string;
}

export interface CompressPlan {
  steps: CrashHistoryEntry[];
  activities: Activity[];
  startDuration: number;
  startCost: number;
  finalDuration: number;
  finalCost: number;
  criticalPath: string[];
  reached: boolean;
  points: CostPoint[];
  summary: string;
}

function weeks(value: number): string {
  return `${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} semanas`;
}

function money(value: number): string {
  return `$${Math.round(value).toLocaleString("es-ES")}`;
}

/** Acelera actividades críticas completas, de la más barata a la más cara, hasta llegar al objetivo. */
export function compressToTarget(activities: Activity[], targetWeeks: number): CompressPlan {
  let working = activities.map((activity) => ({ ...activity, predecessors: [...activity.predecessors], crashed: false }));
  const start = computeProject(working, "Crashing");
  const steps: CrashHistoryEntry[] = [];
  const points: CostPoint[] = [{ duration: start.projectDuration, cost: start.totalCost, label: "Base" }];

  while (steps.length < 40) {
    const now = computeProject(working, "Crashing");
    if (now.projectDuration <= targetWeeks + 1e-6) break;
    const best = suggestCrash(working);
    if (!best) break;
    working = working.map((activity) => (activity.id === best.id ? { ...activity, crashed: true } : activity));
    const after = computeProject(working, "Crashing");
    steps.push({
      step: steps.length + 1,
      activityId: best.id,
      activityName: best.name,
      weeksReduced: best.weeksReduced,
      projectDuration: after.projectDuration,
      totalCost: after.totalCost,
      incrementalCost: best.extraCost,
    });
    points.push({ duration: after.projectDuration, cost: after.totalCost, label: best.id });
  }

  const final = computeProject(working, "Crashing");
  const reached = final.projectDuration <= targetWeeks + 1e-6;
  const extra = final.totalCost - start.totalCost;
  const saved = start.projectDuration - final.projectDuration;
  let summary = `Compresión hacia ${weeks(targetWeeks)}.`;
  if (!steps.length && reached) {
    summary += ` El plan base ya dura ${weeks(start.projectDuration)} y cumple el objetivo.`;
  } else if (reached) {
    summary += ` Se alcanza en ${steps.length} paso(s): ${weeks(start.projectDuration)} → ${weeks(final.projectDuration)}, costo extra ${money(extra)}.`;
  } else {
    summary += ` Lo más corto posible es ${weeks(final.projectDuration)} (−${weeks(saved)}, +${money(extra)}). El objetivo de ${weeks(targetWeeks)} no se alcanza con los tiempos intensivos.`;
  }

  return {
    steps,
    activities: working,
    startDuration: start.projectDuration,
    startCost: start.totalCost,
    finalDuration: final.projectDuration,
    finalCost: final.totalCost,
    criticalPath: final.criticalPath,
    reached,
    points,
    summary,
  };
}
