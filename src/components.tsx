import type { ReactNode } from "react";

/** Знак ILYA: лаймовая плитка с буквой I. */
export const Mark = ({ size = 34 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className="mark" aria-hidden>
    <rect width="64" height="64" rx="14" fill="var(--accent)" />
    <rect x="19" y="13" width="26" height="9" rx="2" fill="var(--ink)" />
    <rect x="27" y="13" width="10" height="38" rx="2" fill="var(--ink)" />
    <rect x="19" y="42" width="26" height="9" rx="2" fill="var(--ink)" />
  </svg>
);

export function Panel(props: {
  title?: string;
  kicker?: string;
  right?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={"panel " + (props.className ?? "")}>
      {(props.title || props.right) && (
        <header className="panel-head">
          <div>
            {props.kicker && <span className="kicker">{props.kicker}</span>}
            {props.title && <h3>{props.title}</h3>}
          </div>
          <div className="panel-right">{props.right}</div>
        </header>
      )}
      {props.children}
    </section>
  );
}

/** Ступенчатый график баланса; без истории — пунктирная заглушка. */
export function StepChart({ points }: { points: number[] }) {
  const W = 600, H = 120, pad = 8;
  const empty = points.length < 2;
  const data = empty ? [1, 1] : points;
  const min = Math.min(...data, 0), max = Math.max(...data);
  const span = max - min || 1;
  const X = (i: number) => (i / (data.length - 1)) * W;
  const Y = (v: number) => H - pad - ((v - min) / span) * (H - pad * 2);
  let d = `M0,${Y(data[0])}`;
  for (let i = 1; i < data.length; i++) d += ` H${X(i)} V${Y(data[i])}`;
  return (
    <svg className={"chart" + (empty ? " is-empty" : "")} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="grid" />
      ))}
      {!empty && <path d={`${d} V${H} H0 Z`} className="area" />}
      <path d={empty ? `M0,${H / 2} H${W}` : d} className="stroke" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const Empty = ({ title, text, action }: { title: string; text: string; action?: ReactNode }) => (
  <div className="empty">
    <b>{title}</b>
    <p>{text}</p>
    {action}
  </div>
);

export const Stat = ({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) => (
  <div className="stat">
    <span>{label}</span>
    <b className={mono ? "mono" : ""}>{value}</b>
  </div>
);
