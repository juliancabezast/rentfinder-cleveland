import React from "react";
import { Users, DollarSign, Home, TrendingUp } from "lucide-react";

interface ZipStats {
  leadCount: number;
  avgBudget: number;
  voucherPercent: number;
  conversionRate: number;
  topProperties: Array<{ id: string; address: string; count: number }>;
}

interface ZipDetailPopupProps {
  zip: string;
  name: string;
  stats: ZipStats;
  propertyCount: number;
}

export const ZipDetailPopup: React.FC<ZipDetailPopupProps> = ({
  zip,
  name,
  stats,
  propertyCount,
}) => {
  return (
    <div style={{ minWidth: 240, maxWidth: 300, fontFamily: "'Montserrat', sans-serif" }}>
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#4F46E5" }}>{zip}</div>
        <div style={{ fontSize: 12, color: "#666" }}>{name}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
        <StatBox icon={<Users size={14} />} label="Leads" value={String(stats.leadCount)} />
        <StatBox
          icon={<DollarSign size={14} />}
          label="Avg Budget"
          value={stats.avgBudget > 0 ? `$${Math.round(stats.avgBudget)}` : "N/A"}
        />
        <StatBox
          icon={<Home size={14} />}
          label="Section 8"
          value={`${Math.round(stats.voucherPercent)}%`}
        />
        <StatBox
          icon={<TrendingUp size={14} />}
          label="Conversion"
          value={`${Math.round(stats.conversionRate)}%`}
        />
      </div>

      {stats.topProperties.length > 0 && (
        <div style={{ borderTop: "1px solid #e5e5e5", paddingTop: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#4F46E5", marginBottom: 4 }}>
            Top Requested Properties
          </div>
          {stats.topProperties.slice(0, 3).map((p) => (
            <div key={p.id} style={{ fontSize: 11, color: "#444", marginBottom: 2 }}>
              {p.address} ({p.count})
            </div>
          ))}
        </div>
      )}

      {propertyCount === 0 && stats.leadCount > 0 && (
        <div
          style={{
            marginTop: 6,
            padding: "4px 8px",
            background: "#fef3c7",
            borderRadius: 4,
            fontSize: 11,
            color: "#92400e",
          }}
        >
          No available properties in this zip
        </div>
      )}
    </div>
  );
};

function StatBox({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        background: "#eef2ff",
        borderRadius: 6,
        padding: "6px 8px",
        textAlign: "center",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 2 }}>
        <span style={{ color: "#4F46E5" }}>{icon}</span>
        <span style={{ fontSize: 10, color: "#666" }}>{label}</span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#4F46E5" }}>{value}</div>
    </div>
  );
}
