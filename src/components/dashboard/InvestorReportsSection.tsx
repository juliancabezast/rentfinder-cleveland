import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Mail, CheckCircle, XCircle, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import type { Json } from "@/integrations/supabase/types";

interface ReportHighlight {
  metric?: string;
  value?: string;
  trend?: string;
  change?: string;
}

interface InvestorReport {
  id: string;
  title: string;
  summary: string;
  sections: Json;
  highlights: Json;
  report_type: string;
  period_start: string;
  period_end: string;
  status: string;
  sent_at: string | null;
  sent_to_email: string | null;
  resend_email_id: string | null;
  created_at: string;
  investor_id: string | null;
  property_id: string | null;
  organization_id: string;
}

export const InvestorReportsSection: React.FC = () => {
  const { userRecord } = useAuth();
  const [reports, setReports] = useState<InvestorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<InvestorReport | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      if (!userRecord?.id) return;

      try {
        const { data, error } = await supabase
          .from("investor_reports")
          .select("*")
          .eq("investor_id", userRecord.id)
          .order("created_at", { ascending: false })
          .limit(12);

        if (error) throw error;
        setReports((data || []) as InvestorReport[]);
      } catch {
        // Error logged server-side
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [userRecord?.id]);

  const getReportPeriod = (report: InvestorReport) => {
    try {
      const start = new Date(report.period_start);
      const end = new Date(report.period_end);
      return `${start.toLocaleString("en", { month: "short" })} - ${end.toLocaleString("en", { month: "short", year: "numeric" })}`;
    } catch {
      return report.report_type;
    }
  };

  const getHighlights = (highlights: Json): ReportHighlight[] => {
    if (Array.isArray(highlights)) {
      return highlights as ReportHighlight[];
    }
    return [];
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-5" />
          <Skeleton className="h-6 w-40" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Monthly Reports</h2>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center">
              No reports available yet.
            </p>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Monthly reports will appear here on the first of each month.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Monthly Reports</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => {
          const highlights = getHighlights(report.highlights);
          return (
            <Card
              key={report.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedReport(report)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {report.title || getReportPeriod(report)}
                  </CardTitle>
                  {report.status === "sent" ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Sent
                    </Badge>
                  ) : report.status === "failed" ? (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                      <XCircle className="h-3 w-3 mr-1" />
                      Failed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      <Mail className="h-3 w-3 mr-1" />
                      Generated
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {highlights.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {highlights.slice(0, 3).map((h, idx) => (
                      <div key={idx}>
                        <div className="text-2xl font-bold text-primary">
                          {h.value || "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">{h.metric}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {report.summary}
                  </p>
                )}
                <Button variant="outline" size="sm" className="w-full">
                  <Eye className="h-4 w-4 mr-2" />
                  View Report
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Report Detail Dialog */}
      <Dialog open={!!selectedReport} onOpenChange={() => setSelectedReport(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedReport?.title || "Report Details"}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-4 pr-4">
              {selectedReport && (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Period: {getReportPeriod(selectedReport)}</span>
                    {selectedReport.sent_at && (
                      <span>
                        • Sent: {format(new Date(selectedReport.sent_at), "PPp")}
                      </span>
                    )}
                    {selectedReport.sent_to_email && (
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        Delivered
                      </Badge>
                    )}
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/50 p-4 rounded-lg">
                      {selectedReport.summary || "No summary available."}
                    </pre>
                  </div>
                  {(() => {
                    const highlights = getHighlights(selectedReport.highlights);
                    if (highlights.length === 0) return null;
                    return (
                      <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                        {highlights.slice(0, 4).map((h, idx) => (
                          <div key={idx} className="text-center">
                            <div className="text-2xl font-bold">{h.value || "—"}</div>
                            <div className="text-xs text-muted-foreground">{h.metric}</div>
                            {h.trend && h.change && (
                              <div className={`text-xs ${h.trend === "up" ? "text-green-600" : h.trend === "down" ? "text-red-600" : "text-muted-foreground"}`}>
                                {h.change}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};