"use client";

import { memo } from "react";
import type { Earthquake } from "@/lib/types";
import { timeAgo } from "@/lib/format";
import { magnitudeSeverity, severityMeta } from "@/lib/severity";

export interface EarthquakeCardProps {
  quake: Earthquake;
  now: number;
}

function localTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("es", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function EarthquakeCardImpl({ quake, now }: EarthquakeCardProps) {
  const sev = severityMeta(magnitudeSeverity(quake.magnitude));
  const mag = quake.magnitude === null ? "—" : quake.magnitude.toFixed(1);

  return (
    <li className="e-m-quake-card" style={{ borderLeftColor: sev.color }}>
      <div className="e-m-quake-card__body">
        <p className="e-m-quake-card__place">
          {sev.emoji} {quake.place}
        </p>
        <div className="e-m-quake-card__meta">
          <span title={new Date(quake.occurredAt).toLocaleString("es")}>
            {timeAgo(quake.occurredAt, now)}
          </span>
          <span aria-hidden>·</span>
          <span>{localTime(quake.occurredAt)}</span>
          {quake.depthKm !== null && (
            <>
              <span aria-hidden>·</span>
              <span>{Math.round(quake.depthKm)} km prof.</span>
            </>
          )}
          {quake.tsunami && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700">
              Tsunami
            </span>
          )}
        </div>
      </div>
      <div className="e-m-quake-card__mag" style={{ color: sev.text }} aria-label={`Magnitud ${mag}`}>
        {mag}
      </div>
    </li>
  );
}

export const EarthquakeCard = memo(EarthquakeCardImpl);
