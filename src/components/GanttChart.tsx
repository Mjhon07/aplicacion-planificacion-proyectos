import type { ComputedActivity } from "../lib/types";

function pct(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.max(0, Math.min(100, (value / total) * 100))}%`;
}

export default function GanttChart({ activities, projectDuration }: { activities: ComputedActivity[]; projectDuration: number }) {
  const total = Math.max(projectDuration, 0.01);
  const ticks = Math.min(12, Math.max(2, Math.ceil(total)));
  const marks = Array.from({ length: ticks + 1 }, (_, index) => (total * index) / ticks);

  return (
    <div className="gantt">
      <div className="gantt-row gantt-scale">
        <span>Actividad</span>
        <div className="gantt-track">
          {marks.map((mark) => (
            <i key={mark} style={{ left: pct(mark, total) }}>
              {mark.toLocaleString("es-ES", { maximumFractionDigits: 1 })}
            </i>
          ))}
        </div>
      </div>
      {activities.map((activity) => (
        <div className="gantt-row" key={activity.id} title={`${activity.name}: ${activity.es} → ${activity.ef}, holgura ${activity.slack}`}>
          <span>
            <b className={activity.critical ? "gantt-id critical" : "gantt-id"}>{activity.id}</b>
            {activity.name}
          </span>
          <div className="gantt-track">
            {activity.slack > 0 && <div className="gantt-slack" style={{ left: pct(activity.ef, total), width: pct(activity.slack, total) }} />}
            <div
              className={activity.critical ? "gantt-bar critical" : "gantt-bar"}
              style={{ left: pct(activity.es, total), width: pct(Math.max(activity.duration, 0.15), total) }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
