import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const PHASE_DATA = "Fases iniciales y procesamiento de datos";
const PHASE_APP = "Desarrollo frontend, integración y pruebas";

function row(id, name, preds, optimistic, mostLikely, pessimistic, crashTime, normalCost, crashCost, phase) {
  return [
    id,
    name,
    phase,
    preds,
    mostLikely,
    normalCost,
    optimistic,
    mostLikely,
    pessimistic,
    mostLikely,
    crashTime,
    normalCost,
    crashCost,
  ];
}

const headers = [
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
];

const activities = [
  row("A", "Requerimientos y Arquitectura", "—", 2, 3, 5, 2, 3500, 5000, PHASE_DATA),
  row("B", "Recolección de Corpus LSC", "A", 3, 4, 6, 2, 2000, 3500, PHASE_DATA),
  row("C", "Preprocesamiento (Landmarks)", "B", 2, 3, 5, 1, 2500, 4000, PHASE_DATA),
  row("D", "Entrenamiento del Modelo de IA", "C", 3, 5, 8, 3, 4000, 7500, PHASE_DATA),
  row("E", "Validación y Ajuste IA", "D", 1, 2, 4, 1, 1500, 2500, PHASE_APP),
  row("F", "Desarrollo de App Móvil", "A", 4, 6, 9, 4, 5000, 8000, PHASE_APP),
  row("G", "Integración IA + App", "E, F", 2, 3, 5, 2, 2500, 4000, PHASE_APP),
  row("H", "Pruebas de Campo y Despliegue", "G", 1, 2, 4, 1, 1000, 2000, PHASE_APP),
];

const instructions = [
  ["Plantilla Pathwise — lista para importar"],
  [""],
  ["1. Llena la hoja Actividades. No cambies los nombres de las columnas."],
  ["2. ACTIVIDAD es el código (A, B, C…). PRECEDENTES acepta A, E, F o E y F, o un guion si no tiene."],
  ["3. DURACION (semanas) es el tiempo del modo CPM. COSTO (USD) es el costo normal."],
  ["4. a, m y b se usan en PERT. Si los dejas vacíos, la app los estima a partir de la duración."],
  ["5. TIEMPO NORMAL / INTENSIVO y COSTOS se usan en Crashing. Si faltan, se derivan de duración y costo."],
  ["6. En la app: Importar Excel y elige este archivo. El grafo y la ruta crítica se calculan solos."],
  [""],
  ["Este archivo ya trae el proyecto de ejemplo: reconocimiento de lengua de señas (LSC)."],
  ["Fase A–D: datos e IA. Fase E–H: app, integración y despliegue."],
  ["Ruta crítica esperada en CPM: A → B → C → D → E → G → H (22 semanas). F corre en paralelo."],
];

const workbook = XLSX.utils.book_new();
const how = XLSX.utils.aoa_to_sheet(instructions);
how["!cols"] = [{ wch: 110 }];
const sheet = XLSX.utils.aoa_to_sheet([headers, ...activities]);
sheet["!cols"] = headers.map((header) => ({ wch: Math.max(14, header.length + 2) }));
XLSX.utils.book_append_sheet(workbook, how, "Como usar");
XLSX.utils.book_append_sheet(workbook, sheet, "Actividades");

const out = fileURLToPath(new URL("../public/ejemplo-actividades-lsc.xlsx", import.meta.url));
writeFileSync(out, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
console.log("Escrito", out);
