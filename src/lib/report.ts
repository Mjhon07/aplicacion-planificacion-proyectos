import { computeProject } from "./pertCpm";
import { completionProbability } from "./stats";
import type { Activity, Method, ProjectResult } from "./types";

function weeks(value: number): string {
  return `${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} semanas`;
}

function money(value: number): string {
  return `$${value.toLocaleString("es-ES", { maximumFractionDigits: 0 })}`;
}

function percent(value: number): string {
  return `${(value * 100).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

const METHOD_LABEL: Record<Method, string> = {
  CPM: "CPM determinista",
  PERT: "PERT probabilístico",
  Crashing: "Aceleración (crashing)",
};

export interface CrashSuggestion {
  id: string;
  name: string;
  weeksReduced: number;
  extraCost: number;
  newDuration: number;
  marginalCost: number;
}

export function suggestCrash(activities: Activity[]): CrashSuggestion | null {
  const current = computeProject(activities, "Crashing");
  const options = current.activities
    .filter((activity) => activity.critical && activity.canCrash)
    .map((activity) => {
      const raw = activities.find((item) => item.id === activity.id);
      if (!raw) return null;
      const after = computeProject(
        activities.map((item) => (item.id === raw.id ? { ...item, crashed: true } : item)),
        "Crashing",
      );
      const weeksReduced = Math.round((current.projectDuration - after.projectDuration) * 100) / 100;
      return {
        id: raw.id,
        name: raw.name,
        weeksReduced,
        extraCost: raw.crashCost - raw.normalCost,
        newDuration: after.projectDuration,
        marginalCost: activity.marginalCost ?? 0,
      };
    })
    .filter((item): item is CrashSuggestion => item !== null && item.weeksReduced > 0);

  options.sort((a, b) => a.extraCost / a.weeksReduced - b.extraCost / b.weeksReduced);
  return options[0] ?? null;
}

export function buildReport(options: {
  projectName: string;
  method: Method;
  activities: Activity[];
  result: ProjectResult;
  pert: ProjectResult;
  targetWeeks: number;
}): string {
  const { projectName, method, activities, result, pert, targetWeeks } = options;
  const path = result.criticalPath.length ? `Inicio → ${result.criticalPath.join(" → ")}` : "Inicio";
  const slack = result.activities.filter((activity) => !activity.critical && activity.slack > 0);
  const sigma = pert.projectStdDev ?? 0;
  const mean = pert.projectDuration;
  const odds = completionProbability(targetWeeks, mean, sigma);
  const crash = suggestCrash(activities);

  const lines = [
    `Informe PERT-CPM — ${projectName}`,
    `Modo activo: ${METHOD_LABEL[method]}`,
    "",
    `El proyecto dura ${weeks(result.projectDuration)} y el costo considerado es ${money(result.totalCost)}.`,
    `La ruta crítica es ${path}. Un retraso en cualquiera de esas actividades mueve la fecha final.`,
    "",
    slack.length
      ? `Holgura disponible:\n${slack.map((activity) => `- ${activity.id} ${activity.name}: ${weeks(activity.slack)}`).join("\n")}`
      : "Todas las actividades están en la ruta crítica.",
    "",
    "Estimación PERT (tiempos esperados de la ruta crítica):",
    `- Tiempo esperado μ: ${weeks(mean)}`,
    `- Varianza: ${(pert.projectVariance ?? 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `- Desviación estándar σ: ${weeks(sigma)}`,
    `- Intervalo μ − σ a μ + σ: ${weeks(mean - sigma)} a ${weeks(mean + sigma)}`,
    odds.certain
      ? `- No hay incertidumbre (σ = 0). Terminar en ${weeks(targetWeeks)} es ${odds.probability === 1 ? "seguro" : "imposible"} con estas estimaciones.`
      : `- Z para ${weeks(targetWeeks)}: ${(odds.z ?? 0).toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `- Probabilidad de terminar en ${weeks(targetWeeks)} o menos: ${percent(odds.probability)}`,
  ];

  if (crash) {
    lines.push(
      "",
      "Aceleración sugerida:",
      `Conviene acelerar primero ${crash.id} (${crash.name}): el proyecto bajaría a ${weeks(crash.newDuration)} (−${weeks(crash.weeksReduced)}) con un costo extra de ${money(crash.extraCost)}.`,
    );
  } else {
    lines.push("", "Aceleración sugerida: no hay una actividad crítica que acorte el proyecto si se lleva a su tiempo intensivo.");
  }

  return lines.join("\n");
}
