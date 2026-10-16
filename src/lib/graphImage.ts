import { START_NODE_ID, edgePath } from "./pertCpm";
import type { ComputedActivity, GraphEdge, GraphNodeLayout } from "./types";

const NODE_W = 120;
const NODE_H = 80;

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function num(value: number): string {
  return value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildNetworkSvg(activities: ComputedActivity[], edges: GraphEdge[], layout: GraphNodeLayout[], width: number, height: number): string {
  const byId = new Map(layout.map((node) => [node.id, node]));
  const paths = edges
    .map((edge) => {
      const from = byId.get(edge.from);
      const to = byId.get(edge.to);
      if (!from || !to) return "";
      const color = edge.critical ? "#d94a42" : "#2a2a32";
      return `<path d="${edgePath(from, to)}" fill="none" stroke="${color}" stroke-width="${edge.critical ? 2.2 : 1.6}" marker-end="url(#arrow)"/>`;
    })
    .join("");

  const nodes = activities
    .map((activity) => {
      const pos = byId.get(activity.id);
      if (!pos) return "";
      const critical = activity.critical;
      const isStart = activity.isStart || activity.id === START_NODE_ID;
      const stroke = critical ? "#d94a42" : isStart ? "#5b4fe8" : "#9aa0ad";
      const titleFill = critical ? "#ffe8e6" : isStart ? "#efedff" : "#f3f4f7";
      const label = isStart ? "Inicio" : activity.id;
      const x = pos.x - NODE_W / 2;
      const y = pos.y - NODE_H / 2;
      const cols = [36, 48, 36];
      const values = [num(activity.es), label, num(activity.ef), num(activity.ls), num(activity.duration), num(activity.lf)];
      let cells = "";
      values.forEach((value, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const cx = x + cols.slice(0, col).reduce((sum, width) => sum + width, 0);
        const cy = y + row * (NODE_H / 2);
        const cw = cols[col];
        const fill = index === 1 ? titleFill : "#ffffff";
        const weight = index === 1 ? 700 : 600;
        const size = index === 1 ? 13 : 11;
        cells += `<rect x="${cx}" y="${cy}" width="${cw}" height="${NODE_H / 2}" fill="${fill}" stroke="#cfd0d8"/>`;
        cells += `<text x="${cx + cw / 2}" y="${cy + 24}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${size}" font-weight="${weight}" fill="#20202a">${esc(value)}</text>`;
      });
      return `<g>${cells}<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" fill="none" stroke="${stroke}" stroke-width="${critical ? 2 : 1.5}"/></g>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f7f7f9"/>
  <defs>
    <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill="#2a2a32"/>
    </marker>
  </defs>
  ${paths}
  ${nodes}
</svg>`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadSvgFile(svg: string, filename: string) {
  saveBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }), filename);
}

export function downloadPngFile(svg: string, filename: string, width: number, height: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo crear la imagen."));
        return;
      }
      context.fillStyle = "#f7f7f9";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((png) => {
        URL.revokeObjectURL(url);
        if (!png) {
          reject(new Error("No se pudo exportar el PNG."));
          return;
        }
        saveBlob(png, filename);
        resolve();
      }, "image/png");
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer el diagrama."));
    };
    image.src = url;
  });
}
