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

interface ReportMetrics {
  total_leads?: number;
  showings_completed?: number;
  conversions?: number;
  avg_lead_score?: number;
}

interface InvestorReport {
  id: string;
  period_month: number;
  period_year: number;
  subject: string;
  html_content: string;
  narrative_summary: string | null;
  metrics: Json;
  status: string;
  sent_at: string | null;
  delivered: boolean;
  created_at: string;
}

export const InvestorReportsSection: React.FC = () => {
  const { userRecord } = useAuth();
  const [reports, setReports] = useState<InvestorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<InvestorReport | null>(null);
  const [viewMode, setViewMode] = useState<"summary" | "html">("summary");

  useEffect(() => {
    const fetchReports = async () => {
      if (!userRecord?.id) return;

      try {
        const { data, error } = await supabase
          .from("investor_reports")
          .select("*")
          .eq("investor_id", userRecord.id)
          .order("period_year", { ascending: false })
          .order("period_month", { ascending: false })
          .limit(12);

        if (error) throw error;
        setReports(data || []);
      } catch (error) {
        console.error("Error fetching reports:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [userRecord?.id]);

  const getMonthName = (month: number) => {
    return new Date(2000, month - 1).toLocaleString("en", { month: "long" });
  };

  const getMetrics = (metrics: Json): ReportMetrics => {
    if (typeof metrics === "object" && metrics !== null && !Array.isArray(metrics)) {
      return metrics as ReportMetrics;
    }
    return {};
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
          const metrics = getMetrics(report.metrics);
          return (
            <Card
              key={report.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedReport(report)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {getMonthName(report.period_month)} {report.period_year}
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
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-2xl font-bold text-primary">
                      {metrics.total_leads ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Leads</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {metrics.showings_completed ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Showings</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-purple-600">
                      {metrics.conversions ?? 0}
                    </div>
                    <div className="text-xs text-muted-foreground">Converted</div>
                  </div>
                </div>
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
            <DialogTitle className="flex items-center justify-between">
              <span>
                {selectedReport && `${getMonthName(selectedReport.period_month)} ${selectedReport.period_year} Report`}
              </span>
              <div className="flex gap-2">
                <Button
                  variant={viewMode === "summary" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("summary")}
                >
                  Summary
                </Button>
                <Button
                  variant={viewMode === "html" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setViewMode("html")}
                >
                  Email Preview
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh]">
            {viewMode === "summary" ? (
              <div className="space-y-4 pr-4">
                {selectedReport && (
                  <>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {selectedReport.sent_at && (
                        <span>
                          Sent: {format(new Date(selectedReport.sent_at), "PPp")}
                        </span>
                      )}
                      {selectedReport.delivered && (
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          Delivered
                        </Badge>
                      )}
                    </div>
                    <div className="prose prose-sm max-w-none">
                      <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/50 p-4 rounded-lg">
                        {selectedReport.narrative_summary || "No summary available."}
                      </pre>
                    </div>
                    <div className="grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                      {(() => {
                        const metrics = getMetrics(selectedReport.metrics);
                        return (
                          <>
                            <div className="text-center">
                              <div className="text-2xl font-bold">{metrics.total_leads ?? 0}</div>
                              <div className="text-xs text-muted-foreground">Total Leads</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold">{metrics.showings_completed ?? 0}</div>
                              <div className="text-xs text-muted-foreground">Showings</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold">{metrics.conversions ?? 0}</div>
                              <div className="text-xs text-muted-foreground">Conversions</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold">{metrics.avg_lead_score ?? 0}</div>
                              <div className="text-xs text-muted-foreground">Avg Score</div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                {selectedReport && (
                  <iframe
                    srcDoc={selectedReport.html_content}
                    className="w-full h-[600px] border-0"
                    title="Report Preview"
                  />
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};
