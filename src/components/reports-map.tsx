"use client";

import type { ReportWithReporter, Severity } from "@/lib/reports/types";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { MapPreviewCard } from "./map-preview-card";

const severityColors: Record<Severity, string> = {
  low: "#2f8f62",
  medium: "#f3c533",
  high: "#d2672a",
  urgent: "#b94545"
};

function makeIcon(severity: Severity | null) {
  const color = severity ? severityColors[severity] : "#78716c";
  return L.divIcon({
    className: "",
    html: `<div class="severity-pin" style="width:22px;height:22px;background:${color};"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

function MapSelection({ report }: { report: ReportWithReporter | null }) {
  const map = useMap();

  useEffect(() => {
    if (report) {
      map.flyTo([report.latitude, report.longitude], Math.max(map.getZoom(), 13), { duration: 0.6 });
    }
  }, [map, report]);

  return null;
}

export function ReportsMap({ reports }: { reports: ReportWithReporter[] }) {
  const [selectedReport, setSelectedReport] = useState<ReportWithReporter | null>(reports[0] ?? null);
  const center = useMemo<[number, number]>(() => {
    if (selectedReport) {
      return [selectedReport.latitude, selectedReport.longitude];
    }

    return [31.9539, 35.9106];
  }, [selectedReport]);

  return (
    <div className="grid min-h-[calc(100vh-210px)] gap-4 xl:grid-cols-[1fr_340px]">
      <section className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
        <MapContainer center={center} zoom={8} scrollWheelZoom className="h-[620px] min-h-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {reports.map((report) => (
            <Marker
              key={report.id}
              position={[report.latitude, report.longitude]}
              icon={makeIcon(report.ai_severity)}
              eventHandlers={{ click: () => setSelectedReport(report) }}
            >
              <Tooltip direction="top" offset={[0, -12]} opacity={1}>
                {report.ai_category ?? "بلاغ"} - {report.area ?? report.city ?? "موقع"}
              </Tooltip>
            </Marker>
          ))}
          <MapSelection report={selectedReport} />
        </MapContainer>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <h3 className="font-black text-charcoal-950">مفتاح الخطورة</h3>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Legend color={severityColors.low} label="منخفضة" />
            <Legend color={severityColors.medium} label="متوسطة" />
            <Legend color={severityColors.high} label="عالية" />
            <Legend color={severityColors.urgent} label="عاجلة" />
          </div>
        </section>

        {selectedReport ? <MapPreviewCard report={selectedReport} /> : null}
      </aside>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="size-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-bold text-stone-700">{label}</span>
    </div>
  );
}
