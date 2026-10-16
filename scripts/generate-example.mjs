import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const PHASE_DATA = "Fases iniciales y procesamiento de datos";
const PHASE_APP = "Desarrollo frontend, integración y pruebas";

function row(id, name, preds, weeks, cost, phase) {
  const crashTime = Math.max(1, weeks - 1);
  return [id, name, phase, preds, weeks, cost, Math.max(1, weeks - 1), weeks, weeks + 2, weeks, crashTime, cost, Math.round(cost * 1.4)];
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
  row("A", "Requerimientos y Arquitectura", "—", 3, 3500, PHASE_DATA),
  row("B", "Recolección de Corpus LSC", "A", 4, 2000, PHASE_DATA),
  row("C", "Preprocesamiento (Landmarks)", "B", 3, 2500, PHASE_DATA),
  row("D", "Entrenamiento del Modelo de IA", "C", 5, 4000, PHASE_DATA),
  row("E", "Validación y Ajuste IA", "D", 2, 1500, PHASE_APP),
  row("F", "Desarrollo de App Móvil", "A", 6, 5000, PHASE_APP),
  row("G", "Integración IA + App", "E, F", 3, 2500, PHASE_APP),
  row("H", "Pruebas de Campo y Despliegue", "G", 2, 1000, PHASE_APP),
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
