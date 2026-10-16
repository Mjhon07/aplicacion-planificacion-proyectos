import * as XLSX from "xlsx";
import { computeProject, createActivity, formatPredecessors, parsePredecessors } from "./pertCpm";
import { completionProbability } from "./stats";
import type { Activity, ProjectResult } from "./types";

const INPUT_HEADERS = [
  "ACTIVIDAD",
  "NOMBRE",
  "FASE",
  "PRECEDENTES",
  "DURACION (semanas)",
  "COSTO (USD)",
  "TIEMPO OPTIMISTA (a)",
  "TIEMPO MAS PROBABLE (m)",
  "TIEMPO PESIMISTA (b)",
  "TIEMPO NORMAL",
  "TIEMPO INTENSIVO",
  "COSTO NORMAL",
  "COSTO INTENSIVO",
] as const;

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/usd|\$|€/gi, "").replace(/\s/g, "");
  if (!s || s === "-" || s === "—" || s === "–") return null;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    const parts = s.split(",");
    const thousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3);
    s = thousands ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0 && parts[0].length <= 3) {
      s = s.replace(".", "");
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

type ColKey =
  | "id"
  | "name"
  | "phase"
  | "preds"
  | "duration"
  | "cost"
  | "a"
  | "m"
  | "b"
  | "normalTime"
  | "crashTime"
  | "normalCost"
  | "crashCost";

const ALIASES: Record<ColKey, string[]> = {
  id: ["actividad", "id", "codigo", "code"],
  name: ["nombre", "nombre de la actividad", "descripcion", "description"],
  phase: ["fase", "etapa"],
  preds: ["precedentes", "predecesoras", "predecesor", "precedente", "preds"],
  duration: ["duracion", "duracion semanas", "tiempo base", "semanas"],
  cost: ["costo", "costo usd", "coste", "presupuesto"],
  a: ["tiempo optimista", "optimista", "a"],
  m: ["tiempo mas probable", "mas probable", "probable", "m"],
  b: ["tiempo pesimista", "pesimista", "b"],
  normalTime: ["tiempo normal", "tn"],
  crashTime: ["tiempo intensivo", "tiempo acelerado", "ti"],
  normalCost: ["costo normal", "cn"],
  crashCost: ["costo intensivo", "costo acelerado", "ci"],
};

function columnMap(headers: unknown[]): Partial<Record<ColKey, number>> {
  const map: Partial<Record<ColKey, number>> = {};
  headers.forEach((header, index) => {
    const key = norm(cellText(header));
    if (!key || key === "tiempo" || key === "varianza") return;
    (Object.keys(ALIASES) as ColKey[]).forEach((col) => {
      if (map[col] !== undefined) return;
      if (ALIASES[col].includes(key)) map[col] = index;
    });
  });
  return map;
}

function activityRow(activity: Activity): (string | number)[] {
  return [
    activity.id,
    activity.name,
    activity.phase,
    formatPredecessors(activity.predecessors),
    activity.duration,
    activity.normalCost,
    activity.optimistic,
    activity.mostLikely,
    activity.pessimistic,
    activity.normalTime,
    activity.crashTime,
    activity.normalCost,
    activity.crashCost,
  ];
}

function instructionsSheet(): XLSX.WorkSheet {
  const rows = [
    ["Plantilla Pathwise — lista para importar"],
    [""],
    ["1. Llena la hoja Actividades. No cambies los nombres de las columnas."],
    ["2. ACTIVIDAD es el código (A, B, C…). PRECEDENTES acepta A,  E, F  o  E y F  o un guion si no tiene."],
    ["3. DURACION (semanas) es el tiempo del modo CPM. COSTO (USD) es el costo normal."],
    ["4. a, m y b se usan en PERT. Si los dejas vacíos, la app los estima a partir de la duración."],
    ["5. TIEMPO NORMAL / INTENSIVO y COSTOS se usan en Crashing. Si faltan, se derivan de duración y costo."],
    ["6. En la app: Importar Excel y elige este archivo. El grafo y la ruta crítica se calculan solos."],
    [""],
    ["Este archivo ya trae el proyecto de ejemplo: reconocimiento de lengua de señas (LSC)."],
    ["Fase A–D: datos e IA. Fase E–H: app, integración y despliegue."],
    ["Ruta crítica esperada en CPM: A → B → C → D → E → G → H (22 semanas). F corre en paralelo."],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 110 }];
  return sheet;
}

export function buildActivitiesSheet(activities: Activity[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([Array.from(INPUT_HEADERS), ...activities.map(activityRow)]);
  sheet["!cols"] = [
    { wch: 12 },
    { wch: 36 },
    { wch: 48 },
    { wch: 16 },
    { wch: 20 },
    { wch: 14 },
    { wch: 22 },
    { wch: 24 },
    { wch: 22 },
    { wch: 16 },
    { wch: 18 },
    { wch: 14 },
    { wch: 16 },
  ];
  return sheet;
}

export function buildWorkbook(activities: Activity[], result?: ProjectResult | null, targetWeeks?: number): XLSX.WorkBook {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, instructionsSheet(), "Como usar");
  XLSX.utils.book_append_sheet(workbook, buildActivitiesSheet(activities), "Actividades");

  if (result && result.activities.length) {
    const byId = new Map(activities.map((a) => [a.id, a]));
    const network = [
      ["ACTIVIDAD", "NOMBRE", "DURACION USADA", "IC", "TC", "IL", "TL", "HOLGURA", "ESTADO", "t ESPERADO", "VARIANZA"],
      ...result.activities.map((item) => {
        const raw = byId.get(item.id);
        return [
          item.id,
          item.name,
          item.duration,
          item.es,
          item.ef,
          item.ls,
          item.lf,
          item.slack,
          item.critical ? "Crítica" : "Normal",
          item.expectedTime ?? raw?.mostLikely ?? item.duration,
          item.variance ?? "",
        ];
      }),
    ];
    const networkSheet = XLSX.utils.aoa_to_sheet(network);
    networkSheet["!cols"] = network[0].map(() => ({ wch: 16 }));
    XLSX.utils.book_append_sheet(workbook, networkSheet, "Red calculada");

    const critical = result.criticalPath.join("");
    const sigma = result.projectStdDev ?? 0;
    const mu = result.projectDuration;
    const results = [
      ["RESULTADOS DEL PROYECTO", ""],
      ["Ruta crítica", critical || "—"],
      ["Ruta crítica (con inicio)", result.criticalPath.length ? `Inicio → ${result.criticalPath.join(" → ")}` : "Inicio"],
      ["Tiempo del proyecto (semanas)", mu],
      ["Varianza del proyecto", result.projectVariance ?? ""],
      ["Desviación estándar", result.projectStdDev ?? ""],
      ["Tiempo más probable (μ)", result.projectMostLikely ?? ""],
      ["Tiempo optimista (μ − σ)", result.projectOptimistic ?? ""],
      ["Tiempo pesimista (μ + σ)", result.projectPessimistic ?? ""],
      ["Tiempo mu - sigma", result.projectStdDev !== undefined ? Math.round((mu - sigma) * 100) / 100 : ""],
      ["Tiempo mu + sigma", result.projectStdDev !== undefined ? Math.round((mu + sigma) * 100) / 100 : ""],
      ["Costo total (USD)", result.totalCost],
      ["Actividades críticas", result.criticalCount],
    ];
    const pert = result.projectStdDev !== undefined ? result : computeProject(activities, "PERT");
    const target = targetWeeks ?? pert.projectDuration;
    const odds = completionProbability(target, pert.projectDuration, pert.projectStdDev ?? 0);
    results.push(
      ["", ""],
      ["PROBABILIDAD PERT", ""],
      ["μ esperado (semanas)", pert.projectDuration],
      ["σ (semanas)", pert.projectStdDev ?? 0],
      ["μ − σ", Math.round((pert.projectDuration - (pert.projectStdDev ?? 0)) * 100) / 100],
      ["μ + σ", Math.round((pert.projectDuration + (pert.projectStdDev ?? 0)) * 100) / 100],
      ["Objetivo X (semanas)", target],
      ["Z = (X − μ) / σ", odds.z ?? "σ = 0"],
      ["P(T ≤ X)", odds.probability],
    );
    const resultsSheet = XLSX.utils.aoa_to_sheet(results);
    resultsSheet["!cols"] = [{ wch: 48 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(workbook, resultsSheet, "Resultados");
  }

  return workbook;
}

export function downloadWorkbook(workbook: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(workbook, filename);
}

export function parseActivitiesSheet(data: ArrayBuffer): { activities: Activity[]; errors: string[] } {
  const workbook = XLSX.read(data, { type: "array" });
  const sheetName =
    workbook.SheetNames.find((name) => norm(name) === "actividades") ??
    workbook.SheetNames.find((name) => norm(name) !== "como usar" && norm(name) !== "resultados" && norm(name) !== "red calculada") ??
    workbook.SheetNames[0];

  if (!sheetName) return { activities: [], errors: ["El archivo no tiene hojas."] };

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[sheetName], {
    header: 1,
    raw: true,
    defval: "",
  });

  const headerIndex = rows.findIndex((row) => row.some((cell) => ALIASES.id.includes(norm(cellText(cell))) || ALIASES.name.includes(norm(cellText(cell))) || ALIASES.preds.includes(norm(cellText(cell)))));
  if (headerIndex < 0) {
    return { activities: [], errors: ["No encontré la fila de encabezados. Usa la plantilla de ejemplo."] };
  }

  const map = columnMap(rows[headerIndex]);
  if (map.id === undefined && map.name === undefined) {
    return { activities: [], errors: ["Falta la columna ACTIVIDAD o NOMBRE."] };
  }

  const activities: Activity[] = [];
  const errors: string[] = [];

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const idCell = map.id !== undefined ? cellText(row[map.id]).toUpperCase() : "";
    const nameCell = map.name !== undefined ? cellText(row[map.name]) : "";
    if (!idCell && !nameCell) return;
    if (norm(idCell) === "actividad" || norm(nameCell) === "nombre") return;

    const id = /^[A-Z][A-Z0-9]{0,5}$/.test(idCell) ? idCell : "";
    const name = nameCell || (id ? `Actividad ${id}` : idCell);
    const resolvedId = id || name.slice(0, 3).toUpperCase() || `A${offset + 1}`;

    const duration = map.duration !== undefined ? parseNumber(row[map.duration]) : null;
    const optimistic = map.a !== undefined ? parseNumber(row[map.a]) : null;
    const mostLikely = map.m !== undefined ? parseNumber(row[map.m]) : null;
    const pessimistic = map.b !== undefined ? parseNumber(row[map.b]) : null;
    const weeks = duration ?? mostLikely ?? optimistic ?? 1;
    const cost = map.cost !== undefined ? parseNumber(row[map.cost]) : null;
    const normalCost = map.normalCost !== undefined ? parseNumber(row[map.normalCost]) : null;
    const crashCost = map.crashCost !== undefined ? parseNumber(row[map.crashCost]) : null;
    const normalTime = map.normalTime !== undefined ? parseNumber(row[map.normalTime]) : null;
    const crashTime = map.crashTime !== undefined ? parseNumber(row[map.crashTime]) : null;
    const baseCost = normalCost ?? cost ?? 0;
    const baseTime = normalTime ?? weeks;

    const predsRaw = map.preds !== undefined ? cellText(row[map.preds]) : "";
    activities.push(
      createActivity({
        id: resolvedId,
        name,
        phase: map.phase !== undefined ? cellText(row[map.phase]) : "",
        predecessors: parsePredecessors(predsRaw),
        duration: Math.max(0.1, duration ?? mostLikely ?? weeks),
        optimistic: Math.max(0, optimistic ?? Math.max(1, weeks - 1)),
        mostLikely: Math.max(0, mostLikely ?? weeks),
        pessimistic: Math.max(0, pessimistic ?? weeks + 2),
        normalTime: Math.max(0.1, baseTime),
        crashTime: Math.max(0.1, crashTime ?? Math.max(1, baseTime - 1)),
        normalCost: Math.max(0, baseCost),
        crashCost: Math.max(0, crashCost ?? Math.round(baseCost * 1.4)),
        crashed: false,
      }),
    );
  });

  if (!activities.length) errors.push("No hay actividades en la hoja. Revisa que la primera fila sea el encabezado.");

  const ids = new Set(activities.map((a) => a.id));
  activities.forEach((activity) => {
    activity.predecessors.filter((pred) => !ids.has(pred)).forEach((pred) => {
      errors.push(`La actividad ${activity.id} menciona la predecesora ${pred}, que no está en el archivo.`);
    });
  });

  return { activities, errors };
}
