import type { CostPoint } from "../lib/compress";

export default function CostCurve({ points }: { points: CostPoint[] }) {
  if (points.length === 0) return null;
  const width = 560;
  const height = 210;
  const pad = 42;
  const durations = points.map((point) => point.duration);
  const costs = points.map((point) => point.cost);
  const minDuration = Math.min(...durations);
  const maxDuration = Math.max(...durations);
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const spanDuration = Math.max(maxDuration - minDuration, 1);
  const spanCost = Math.max(maxCost - minCost, 1);
  const xOf = (duration: number) => pad + ((duration - minDuration) / spanDuration) * (width - pad * 2);
  const yOf = (cost: number) => height - pad - ((cost - minCost) / spanCost) * (height - pad * 2);
  const line = points.map((point) => `${xOf(point.duration)},${yOf(point.cost)}`).join(" ");

  return (
    <svg className="cost-curve" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Curva de costo contra duración">
      <text x={pad} y="18" className="curve-title">
        Costo contra duración
      </text>
      <line x1={pad} y1={height - pad} x2={width - 16} y2={height - pad} className="curve-axis" />
      <line x1={pad} y1="28" x2={pad} y2={height - pad} className="curve-axis" />
      <text x={width / 2} y={height - 8} textAnchor="middle" className="curve-label">
        Semanas
      </text>
      <text x="14" y={height / 2} textAnchor="middle" className="curve-label" transform={`rotate(-90 14 ${height / 2})`}>
        USD
      </text>
      <polyline points={line} className="curve-line" />
      {points.map((point) => (
        <g key={`${point.label}-${point.duration}`}>
          <circle cx={xOf(point.duration)} cy={yOf(point.cost)} r="4.5" className="curve-dot" />
          <text x={xOf(point.duration) + 6} y={yOf(point.cost) - 8} className="curve-label">
            {point.label} · {point.duration.toLocaleString("es-ES", { maximumFractionDigits: 1 })} sem.
          </text>
        </g>
      ))}
    </svg>
  );
}
