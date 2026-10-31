import React from "react";
import { Gauge, Radio, Coffee, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

/**
 * High-precision SVG Speedometer Gauge for CargoMind.
 * Visualizes live vehicle speed, cruising average benchmark, and legal max speed limit.
 * Clearly displays operational transit state and simulated telemetry tag.
 */
export default function SpeedometerGauge({
  currentSpeed = 0,
  avgSpeed = 45,
  maxSpeed = 80,
  state = "in_transit",
  isSimulated = true,
  className = "",
}) {
  const curr = Math.max(0, Number(currentSpeed) || 0);
  const avg = Math.max(10, Number(avgSpeed) || 45);
  const max = Math.max(curr, Math.max(avg, Number(maxSpeed) || 80));

  // Gauge geometry: 180° semi-circular arc
  // Radius = 68, Center = (90, 78)
  const arcLength = Math.PI * 68; // ~213.63
  const speedRatio = Math.min(1, Math.max(0, curr / max));
  const strokeOffset = arcLength * (1 - speedRatio);

  // Position for Average Cruising Speed marker tick
  const avgRatio = Math.min(1, Math.max(0, avg / max));
  const avgAngleRad = Math.PI * (1 - avgRatio); // 180° -> 0°
  const tickRadius = 68;
  const tickX = 90 + tickRadius * Math.cos(avgAngleRad);
  const tickY = 78 - tickRadius * Math.sin(avgAngleRad);

  // State styling & icons
  const stateConfig = {
    in_transit: {
      label: "Moving",
      color: "#34c759",
      bgClass: "bg-[#34c759]/10 text-[#34c759] border-[#34c759]/20 dark:bg-[#30d158]/15 dark:text-[#30d158]",
      icon: Radio,
    },
    moving: {
      label: "Moving",
      color: "#34c759",
      bgClass: "bg-[#34c759]/10 text-[#34c759] border-[#34c759]/20 dark:bg-[#30d158]/15 dark:text-[#30d158]",
      icon: Radio,
    },
    on_break: {
      label: "On Break (Driver Rest)",
      color: "#ff9500",
      bgClass: "bg-[#ff9500]/10 text-[#ff9500] border-[#ff9500]/20 dark:bg-[#ff9f0a]/15 dark:text-[#ff9f0a]",
      icon: Coffee,
    },
    not_started: {
      label: "Not Started",
      color: "#0071e3",
      bgClass: "bg-[#0071e3]/10 text-[#0071e3] border-[#0071e3]/20 dark:bg-[#2997ff]/15 dark:text-[#2997ff]",
      icon: Clock,
    },
    completed: {
      label: "Completed (Arrived)",
      color: "#af52de",
      bgClass: "bg-[#af52de]/10 text-[#af52de] border-[#af52de]/20 dark:bg-[#bf5af2]/15 dark:text-[#bf5af2]",
      icon: CheckCircle2,
    },
    idle: {
      label: "Parked / Idle",
      color: "#86868b",
      bgClass: "bg-black/[0.05] text-[#86868b] border-black/[0.08] dark:bg-white/[0.08] dark:text-[#a1a1a6]",
      icon: Gauge,
    },
  };

  const currentState = stateConfig[state] || stateConfig.in_transit;
  const StateIcon = currentState.icon;

  // Arc color based on state
  let arcColor = "#0071e3";
  if (state === "on_break") arcColor = "#ff9500";
  else if (state === "completed") arcColor = "#af52de";
  else if (state === "not_started" || state === "idle") arcColor = "#86868b";

  return (
    <div
      className={`rounded-2xl border border-black/[0.06] bg-white p-3.5 shadow-sm dark:border-white/[0.08] dark:bg-[#161618] ${className}`}
    >
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#86868b]">
          <Gauge size={12} className="text-[#0071e3] dark:text-[#2997ff]" />
          <span>Vehicle Speedometer</span>
        </div>
        {isSimulated && (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[9px] font-semibold tracking-wide text-[#0071e3] dark:text-[#2997ff]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0071e3] dark:bg-[#2997ff] animate-pulse" />
            Simulated
          </span>
        )}
      </div>

      {/* SVG Semi-Circle Dial */}
      <div className="relative mx-auto mt-1 flex flex-col items-center justify-center">
        <svg viewBox="0 0 180 100" className="w-full max-w-[210px] overflow-visible">
          <defs>
            <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0071e3" />
              <stop offset="70%" stopColor="#2997ff" />
              <stop offset="100%" stopColor="#34c759" />
            </linearGradient>
          </defs>

          {/* Background Track Arc */}
          <path
            d="M 22 78 A 68 68 0 0 1 158 78"
            fill="none"
            stroke="currentColor"
            strokeWidth="9"
            strokeLinecap="round"
            className="text-black/[0.08] dark:text-white/[0.1]"
          />

          {/* Active Speed Arc */}
          <path
            d="M 22 78 A 68 68 0 0 1 158 78"
            fill="none"
            stroke={state === "in_transit" || state === "moving" ? "url(#speedGradient)" : arcColor}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={arcLength}
            strokeDashoffset={strokeOffset}
            className="transition-all duration-700 ease-out"
          />

          {/* Average Cruising Speed Benchmark Indicator (Diamond / Tick) */}
          <circle
            cx={tickX}
            cy={tickY}
            r="4.5"
            fill="#ffffff"
            stroke="#ff9500"
            strokeWidth="2.5"
            className="drop-shadow-sm"
          />

          {/* Speed Number & Unit In Center */}
          <text
            x="90"
            y="64"
            textAnchor="middle"
            className="fill-[#1d1d1f] font-mono font-bold tracking-tight text-[28px] dark:fill-[#f5f5f7]"
          >
            {Math.round(curr)}
          </text>
          <text
            x="90"
            y="78"
            textAnchor="middle"
            className="fill-[#86868b] font-sans font-medium text-[10px] uppercase tracking-wider"
          >
            km / h
          </text>
        </svg>

        {/* State Pill Badge */}
        <div className="mt-1 flex items-center justify-center">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-all ${currentState.bgClass}`}
          >
            <StateIcon size={12} className={state === "in_transit" || state === "moving" ? "animate-spin" : ""} />
            {currentState.label}
          </span>
        </div>

        {/* Benchmark Sub-metrics (Cruising Avg & Max Limit) */}
        <div className="mt-2.5 grid w-full grid-cols-2 gap-2 border-t border-black/[0.05] pt-2 text-[10px] text-[#86868b] dark:border-white/[0.06]">
          <div className="flex flex-col items-start pl-1">
            <span className="text-[9px] uppercase tracking-wider">Cruising Avg</span>
            <span className="font-mono font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ff9500]" />
              {avg} km/h
            </span>
          </div>

          <div className="flex flex-col items-end pr-1">
            <span className="text-[9px] uppercase tracking-wider">Max Limit</span>
            <span className="font-mono font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
              {max} km/h
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
