import {
  metricCardLabel,
  metricCardShell,
  metricCardSub,
  metricCardValue,
} from "../tokens";

export interface MetricCardProps {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}

/**
 * MetricCard atom — domain-agnostic metric display.
 * Presentational: shows a label, a prominent value, and an optional sub-line.
 * `accent` colours the value text (e.g. "red" or "#ef4444").
 */
export function MetricCard({ label, value, sub, accent }: MetricCardProps) {
  return (
    <div className={metricCardShell}>
      <p className={metricCardLabel}>{label}</p>
      <p
        className={metricCardValue}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub !== undefined && <p className={metricCardSub}>{sub}</p>}
    </div>
  );
}
