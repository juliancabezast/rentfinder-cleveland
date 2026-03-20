import React, { useState, useEffect, useRef } from "react";
import { Download, FileText, MapPin, Calendar, Star, Image, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

interface LeasingReportTabProps {
  leadId: string;
  leadName: string;
}

interface ShowingReport {
  id: string;
  scheduled_at: string;
  status: string;
  agent_report: string | null;
  agent_report_photo_url: string | null;
  prospect_interest_level: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  properties: {
    address: string;
    unit_number: string | null;
    city: string | null;
    rent_price: number | null;
  } | null;
}

const statusBadge: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Scheduled", variant: "default" },
  confirmed: { label: "Confirmed", variant: "default" },
  completed: { label: "Completed", variant: "secondary" },
  no_show: { label: "No Show", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "destructive" },
  rescheduled: { label: "Rescheduled", variant: "outline" },
};

const interestBadge: Record<string, { label: string; color: string }> = {
  high: { label: "High Interest", color: "bg-green-100 text-green-800" },
  medium: { label: "Medium Interest", color: "bg-yellow-100 text-yellow-800" },
  low: { label: "Low Interest", color: "bg-orange-100 text-orange-800" },
  not_interested: { label: "Not Interested", color: "bg-red-100 text-red-800" },
};

export const LeasingReportTab: React.FC<LeasingReportTabProps> = ({ leadId, leadName }) => {
  const [reports, setReports] = useState<ShowingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("showings")
        .select(`
          id, scheduled_at, status, agent_report, agent_report_photo_url,
          prospect_interest_level, completed_at, cancelled_at, cancellation_reason,
          properties(address, unit_number, city, rent_price)
        `)
        .eq("lead_id", leadId)
        .order("scheduled_at", { ascending: false });

      if (!error && data) {
        setReports(data as unknown as ShowingReport[]);
      }
      setLoading(false);
    };

    fetchReports();
  }, [leadId]);

  const handleDownload = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !reportRef.current) return;

    const styles = `
      <style>
        body { font-family: 'Montserrat', -apple-system, sans-serif; padding: 32px; color: #1a1a1a; }
        h1 { font-size: 24px; margin-bottom: 4px; }
        .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
        .report-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
        .report-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
        .property { font-size: 16px; font-weight: 600; }
        .meta { color: #666; font-size: 13px; margin-top: 4px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
        .badge-completed { background: #f3f4f6; color: #374151; }
        .badge-no-show { background: #fee2e2; color: #dc2626; }
        .badge-cancelled { background: #fee2e2; color: #dc2626; }
        .badge-default { background: #dbeafe; color: #1d4ed8; }
        .interest { margin-top: 8px; }
        .interest-high { background: #dcfce7; color: #166534; }
        .interest-not-interested { background: #fee2e2; color: #dc2626; }
        .interest-medium { background: #fef3c7; color: #92400e; }
        .interest-low { background: #ffedd5; color: #c2410c; }
        .report-text { margin-top: 12px; padding: 12px; background: #f9fafb; border-radius: 6px; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
        .photo { max-width: 300px; border-radius: 8px; margin-top: 12px; }
        @media print { body { padding: 16px; } }
      </style>
    `;

    const cards = reports.map((r) => {
      const statusClass = r.status === "completed" ? "completed" : r.status === "no_show" || r.status === "cancelled" ? "no-show" : "default";
      const interestClass = r.prospect_interest_level ? `interest-${r.prospect_interest_level}` : "";
      return `
        <div class="report-card">
          <div class="report-header">
            <div>
              <div class="property">${r.properties?.address || "Unknown Property"}${r.properties?.unit_number ? ` #${r.properties.unit_number}` : ""}${r.properties?.city ? `, ${r.properties.city}` : ""}</div>
              <div class="meta">${format(parseISO(r.scheduled_at), "EEEE, MMMM d, yyyy 'at' h:mm a")}${r.properties?.rent_price ? ` — $${r.properties.rent_price.toLocaleString()}/mo` : ""}</div>
            </div>
            <span class="badge badge-${statusClass}">${statusBadge[r.status]?.label || r.status}</span>
          </div>
          ${r.prospect_interest_level ? `<div class="interest"><span class="badge ${interestClass}">${interestBadge[r.prospect_interest_level]?.label || r.prospect_interest_level}</span></div>` : ""}
          ${r.agent_report ? `<div class="report-text">${r.agent_report}</div>` : ""}
          ${r.agent_report_photo_url ? `<img class="photo" src="${r.agent_report_photo_url}" alt="Showing photo" />` : ""}
        </div>
      `;
    }).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head><title>Leasing Report — ${leadName}</title>${styles}</head>
        <body>
          <h1>Leasing Report</h1>
          <div class="subtitle">${leadName} — Generated ${format(new Date(), "MMMM d, yyyy")}</div>
          ${cards}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return <EmptyState icon={FileText} title="No Showing Reports" description="This lead has no showing history yet." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{reports.length} Showing{reports.length !== 1 ? "s" : ""}</h3>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-1.5" />
          Download Report
        </Button>
      </div>

      <div ref={reportRef} className="space-y-3">
        {reports.map((r) => (
          <Card key={r.id} className="border shadow-sm">
            <CardContent className="p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-medium">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="truncate">
                      {r.properties?.address || "Unknown Property"}
                      {r.properties?.unit_number && ` #${r.properties.unit_number}`}
                      {r.properties?.city && `, ${r.properties.city}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {format(parseISO(r.scheduled_at), "EEE, MMM d, yyyy 'at' h:mm a")}
                    {r.properties?.rent_price && (
                      <span className="ml-2">${r.properties.rent_price.toLocaleString()}/mo</span>
                    )}
                  </div>
                </div>
                <Badge variant={statusBadge[r.status]?.variant || "secondary"}>
                  {statusBadge[r.status]?.label || r.status}
                </Badge>
              </div>

              {/* Interest Level */}
              {r.prospect_interest_level && interestBadge[r.prospect_interest_level] && (
                <div className="flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${interestBadge[r.prospect_interest_level].color}`}>
                    {interestBadge[r.prospect_interest_level].label}
                  </span>
                </div>
              )}

              {/* Agent Report */}
              {r.agent_report && (
                <div className="bg-muted/30 rounded-md p-3">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{r.agent_report}</p>
                </div>
              )}

              {/* Photo */}
              {r.agent_report_photo_url && (
                <div>
                  <button
                    onClick={() => setFullscreenPhoto(r.agent_report_photo_url)}
                    className="relative group"
                  >
                    <img
                      src={r.agent_report_photo_url}
                      alt="Showing report photo"
                      className="h-24 w-auto rounded-lg object-cover border cursor-pointer group-hover:opacity-80 transition"
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <Image className="h-5 w-5 text-white drop-shadow" />
                    </div>
                  </button>
                </div>
              )}

              {/* Cancellation reason */}
              {r.cancellation_reason && (
                <p className="text-xs text-muted-foreground italic">Reason: {r.cancellation_reason}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fullscreen photo overlay */}
      {fullscreenPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setFullscreenPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300"
            onClick={() => setFullscreenPhoto(null)}
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={fullscreenPhoto}
            alt="Showing photo full size"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg"
          />
        </div>
      )}
    </div>
  );
};
