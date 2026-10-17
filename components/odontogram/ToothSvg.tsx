"use client";

import type { KeyboardEvent } from "react";
import {
  isAnterior,
  isMolar,
  isUpper,
  mesialIsRight,
  recordColor,
  SURFACE_LABELS,
  type DentalRecord,
  type Phase,
  type Surface,
  type ToothNumber,
} from "@/lib/odontogram";

interface ToothSvgProps {
  tooth: ToothNumber;
  records: DentalRecord[];
  selected: boolean;
  selectedSurfaces: Surface[];
  onSelect: () => void;
  onSurfaceClick: (surface: Surface) => void;
}

function roots(tooth: ToothNumber) {
  const top = isUpper(tooth);
  const yBase = top ? 31 : 67;
  const yTip = top ? 5 : 95;
  if (isMolar(tooth)) {
    return `M 11 ${yBase} L 16 ${yTip} L 28 ${yBase}
            M 24 ${yBase} L 33 ${yTip + (top ? 2 : -2)} L 39 ${yBase}
            M 37 ${yBase} L 49 ${yTip} L 54 ${yBase}`;
  }
  if (!isAnterior(tooth)) {
    return `M 15 ${yBase} L 24 ${yTip} L 33 ${yBase}
            M 31 ${yBase} L 42 ${yTip} L 49 ${yBase}`;
  }
  return `M 19 ${yBase} Q 30 ${yTip + (top ? 5 : -5)} 32 ${yTip}
          Q 38 ${yTip + (top ? 8 : -8)} 46 ${yBase}`;
}

export function ToothSvg({ tooth, records, selected, selectedSurfaces, onSelect, onSurfaceClick }: ToothSvgProps) {
  const center: Surface = isAnterior(tooth) ? "I" : "O";
  const mesialSideRight = mesialIsRight(tooth);
  const pieces: { surface: Surface; points: string }[] = [
    { surface: "V", points: "8,31 56,31 46,43 18,43" },
    { surface: "L", points: "18,55 46,55 56,67 8,67" },
    { surface: mesialSideRight ? "D" : "M", points: "8,31 18,43 18,55 8,67" },
    { surface: mesialSideRight ? "M" : "D", points: "56,31 56,67 46,55 46,43" },
    { surface: center, points: "18,43 46,43 46,55 18,55" },
  ];

  const colors = new Map<Surface, Phase>();
  for (const record of records) {
    for (const surface of record.surfaces) colors.set(surface, record.phase);
  }
  const lastWhole = [...records].reverse().find((record) => record.surfaces.length === 0);
  const marked = lastWhole?.treatment;
  const markColor = lastWhole ? recordColor(lastWhole.phase) : recordColor("current");

  function onKey(e: KeyboardEvent<SVGPolygonElement>, surface: Surface) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSurfaceClick(surface);
    }
  }

  return (
    <svg
      viewBox="0 0 64 118"
      className="h-[130px] w-[75px] shrink-0 overflow-visible"
      aria-label={`Diente ${tooth}. ${records.length} registros`}
      role="group"
    >
      {selected && (
        <rect x="2" y="1" width="60" height="114" rx="7" fill="rgb(var(--dental-tooth-selected))" stroke="rgb(var(--dental-tooth-selection-border))" strokeWidth="1.5" />
      )}
      <text x="32" y={isUpper(tooth) ? "106" : "18"} textAnchor="middle" fontFamily="inherit" fontSize="16" fontWeight="600" fill="rgb(var(--dental-tooth-outline))">
        {tooth[0]}.{tooth[1]}
      </text>
      <path d={roots(tooth)} fill="none" stroke="rgb(var(--dental-tooth-outline))" strokeWidth="2.15" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none" />
      {pieces.map(({ surface, points }) => {
        const phase = colors.get(surface);
        const focused = selected && selectedSurfaces.includes(surface);
        return (
          <polygon
            key={surface}
            points={points}
            fill={phase ? recordColor(phase) : focused ? "rgb(var(--dental-surface-selected))" : "rgb(var(--dental-tooth-surface))"}
            stroke={focused ? "rgb(var(--amber-500))" : "rgb(var(--dental-tooth-outline))"}
            strokeWidth={focused ? 3 : 1.85}
            strokeLinejoin="round"
            tabIndex={0}
            role="button"
            aria-pressed={focused}
            aria-label={`Seleccionar superficie ${SURFACE_LABELS[surface]} del diente ${tooth}`}
            className="cursor-pointer outline-none hover:fill-amber-100 focus-visible:stroke-amber-600 dark:hover:fill-amber-900 dark:focus-visible:stroke-amber-400"
            onClick={(event) => { event.stopPropagation(); onSurfaceClick(surface); }}
            onKeyDown={(event) => onKey(event, surface)}
          />
        );
      })}
      {/* Símbolos clínicos superpuestos, sin bloquear el clic en las superficies. */}
      {marked === "extraction" || marked === "missing" ? (
        <g stroke={markColor} strokeWidth="3.3" strokeLinecap="round" pointerEvents="none">
          <path d="M 9 26 L 55 73 M 55 26 L 9 73" />
        </g>
      ) : null}
      {marked === "crown" ? (
        <rect x="5" y="28" width="54" height="42" rx="3" fill="none" stroke={markColor} strokeWidth="3" pointerEvents="none" />
      ) : null}
      {marked === "root_canal" ? (
        <circle cx="32" cy="49" r="6.5" fill="none" stroke={markColor} strokeWidth="3" pointerEvents="none" />
      ) : null}
      {marked === "implant" ? (
        <g fill="none" stroke={markColor} strokeWidth="2.5" pointerEvents="none">
          <path d="M 24 39 L 40 39 L 38 58 L 26 58 Z M 25 45 L 39 45 M 26 51 L 38 51" />
        </g>
      ) : null}
      {marked === "other" ? (
        <text x="32" y="58" textAnchor="middle" fontFamily="inherit" fontSize="24" fontWeight="700" fill={markColor} pointerEvents="none">!</text>
      ) : null}
      {/* Zona de selección amplia, sólo en la etiqueta de la pieza. */}
      <rect
        x="12" y={isUpper(tooth) ? 92 : 3} width="40" height="19" rx="3" fill="transparent"
        onClick={onSelect} className="cursor-pointer" role="button" tabIndex={0}
        aria-label={`Seleccionar diente ${tooth} completo`}
        aria-pressed={selected && selectedSurfaces.length === 0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); }
        }}
      />
    </svg>
  );
}
