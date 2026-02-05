import React, { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Send,
  RefreshCw,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  Play,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationSettings } from "@/hooks/useOrganizationSettings";
import { toast } from "sonner";
import { format } from "date-fns";
import type { Json } from "@/integrations/supabase/types";

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
  users?: { full_name: string | null; email: string | null };
}

interface Investor {
  id: string;
  full_name: string | null;
  email: string | null;
}

const InvestorReportsTab: React.FC = () => {
  const { userRecord } = useAuth();
  const { getSetting, updateMultipleSettings, loading: settingsLoading } = useOrganizationSettings();
  
  const [reports, setReports] = useState<InvestorReport[]>([]);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [resending, setResending] = useState<string | null>(null);
  const [previewReport, setPreviewReport] = useState<InvestorReport | null>(null);
  
  // Generate dialog state
  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() || 12);
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getMonth() === 0 ? new Date().getFullYear() - 1 : new Date().getFullYear()
  );
  
  // Settings
  const [reportsEnabled, setReportsEnabled] = useState(true);
  const [sendDay, setSendDay] = useState(1);
  const [footerText, setFooterText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      if (!userRecord?.organization_id) return;

      try {
        // Fetch reports
        const { data: reportsData } = await supabase
          .from("investor_reports")
          .select(`
            *,
            users:investor_id (full_name, email)
          `)
          .eq("organization_id", userRecord.organization_id)
          .order("created_at", { ascending: false })
          .limit(50);

        setReports((reportsData || []) as InvestorReport[]);

        // Fetch investors with property access
        const { data: accessData } = await supabase
          .from("investor_property_access")
          .select("investor_id")
          .eq("organization_id", userRecord.organization_id);

        const investorIds = [...new Set((accessData || []).map((a) => a.investor_id))];

        if (investorIds.length > 0) {
          const { data: investorsData } = await supabase
            .from("users")
            .select("id, full_name, email")
            .in("id", investorIds);

          setInvestors(investorsData || []);
        }

        // Load settings
        setReportsEnabled(getSetting("investor_reports_enabled", true));
        setSendDay(getSetting("investor_reports_send_day", 1));
        setFooterText(getSetting("investor_reports_footer", ""));
      } catch {
        // Error logged server-side
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userRecord?.organization_id, getSetting]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await updateMultipleSettings([
        { key: "investor_reports_enabled", value: reportsEnabled, category: "investor_reports" },
        { key: "investor_reports_send_day", value: sendDay, category: "investor_reports" },
        { key: "investor_reports_footer", value: footerText, category: "investor_reports" },
      ]);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateReports = async () => {
    if (!userRecord?.organization_id) return;

    setGenerating(true);
    try {
      if (selectedInvestor === "all") {
        // Generate for all investors
        const { data, error } = await supabase.functions.invoke("generate-all-investor-reports", {
          body: {
            organization_id: userRecord.organization_id,
            month: selectedMonth,
            year: selectedYear,
          },
        });

        if (error) throw error;

        toast.success(
          `Generated ${data.total_generated} reports${data.total_errors > 0 ? ` (${data.total_errors} errors)` : ""}`
        );
      } else {
        // Generate for specific investor
        const { data, error } = await supabase.functions.invoke("generate-investor-report", {
          body: {
            organization_id: userRecord.organization_id,
            investor_id: selectedInvestor,
            month: selectedMonth,
            year: selectedYear,
            send_email: true,
          },
        });

        if (error) throw error;

        if (data.success) {
          toast.success("Report generated and sent");
        } else {
          toast.error(data.error || "Failed to generate report");
        }
      }

      setGenerateOpen(false);

      // Refresh reports list
      const { data: reportsData } = await supabase
        .from("investor_reports")
        .select(`*, users:investor_id (full_name, email)`)
        .eq("organization_id", userRecord.organization_id)
        .order("created_at", { ascending: false })
        .limit(50);

      setReports((reportsData || []) as InvestorReport[]);
    } catch {
      toast.error("Failed to generate reports");
    } finally {
      setGenerating(false);
    }
  };

  const handleResendReport = async (report: InvestorReport) => {
    if (!userRecord?.organization_id || !report.investor_id) return;

    setResending(report.id);
    try {
      const periodStart = new Date(report.period_start);
      const { data, error } = await supabase.functions.invoke("generate-investor-report", {
        body: {
          organization_id: userRecord.organization_id,
          investor_id: report.investor_id,
          month: periodStart.getMonth() + 1,
          year: periodStart.getFullYear(),
          send_email: true,
        },
      });

      if (error) throw error;

      if (data.email_sent) {
        toast.success("Report resent successfully");
        
        // Update local state
        setReports((prev) =>
          prev.map((r) =>
            r.id === report.id ? { ...r, status: "sent", sent_at: new Date().toISOString() } : r
          )
        );
      } else {
        toast.error(data.email_error || "Failed to send email");
      }
    } catch {
      toast.error("Failed to resend report");
    } finally {
      setResending(null);
    }
  };

  const getReportPeriod = (report: InvestorReport) => {
    try {
      const start = new Date(report.period_start);
      const end = new Date(report.period_end);
      return `${start.toLocaleString("en", { month: "short" })} - ${end.toLocaleString("en", { month: "short", year: "numeric" })}`;
    } catch {
      return report.report_type;
    }
  };

  const months = Array.from({ length: 12 }, (_, i) => ({
    value: i + 1,
    label: new Date(2000, i).toLocaleString("en", { month: "long" }),
  }));

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  if (loading || settingsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-40" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Investor Report Settings
          </CardTitle>
          <CardDescription>
            Configure automatic monthly reports for investors
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable Monthly Reports</Label>
              <p className="text-sm text-muted-foreground">
                Automatically generate and send reports on the 1st of each month
              </p>
            </div>
            <Switch
              checked={reportsEnabled}
              onCheckedChange={setReportsEnabled}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sendDay">Day of Month to Send</Label>
              <Input
                id="sendDay"
                type="number"
                min={1}
                max={28}
                value={sendDay}
                onChange={(e) => setSendDay(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="footer">Custom Footer Text</Label>
            <Textarea
              id="footer"
              placeholder="Optional footer text for report emails..."
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              rows={2}
            />
          </div>

          <Button onClick={handleSaveSettings} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Generate Reports Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Generate Reports</CardTitle>
              <CardDescription>
                Manually generate reports for investors
              </CardDescription>
            </div>
            <Button onClick={() => setGenerateOpen(true)}>
              <Play className="h-4 w-4 mr-2" />
              Generate Report
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No reports generated yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Investor</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{report.users?.full_name || "Unknown"}</div>
                        <div className="text-sm text-muted-foreground">{report.users?.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getReportPeriod(report)}
                    </TableCell>
                    <TableCell>
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
                          <Clock className="h-3 w-3 mr-1" />
                          Generated
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {report.sent_at ? format(new Date(report.sent_at), "MMM d, h:mm a") : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewReport(report)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResendReport(report)}
                          disabled={resending === report.id}
                        >
                          {resending === report.id ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Generate Dialog */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Investor Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Investor</Label>
              <Select value={selectedInvestor} onValueChange={setSelectedInvestor}>
                <SelectTrigger>
                  <SelectValue placeholder="Select investor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Investors</SelectItem>
                  {investors.map((inv) => (
                    <SelectItem key={inv.id} value={inv.id}>
                      {inv.full_name || inv.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Month</Label>
                <Select
                  value={String(selectedMonth)}
                  onValueChange={(v) => setSelectedMonth(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m.value} value={String(m.value)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Select
                  value={String(selectedYear)}
                  onValueChange={(v) => setSelectedYear(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateReports} disabled={generating}>
              {generating ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Generate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewReport} onOpenChange={() => setPreviewReport(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewReport?.title || "Report Preview"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            {previewReport && (
              <div className="space-y-4 pr-4">
                <div className="text-sm text-muted-foreground">
                  Period: {getReportPeriod(previewReport)}
                  {previewReport.sent_at && ` • Sent: ${format(new Date(previewReport.sent_at), "PPp")}`}
                </div>
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap font-sans text-sm bg-muted/50 p-4 rounded-lg">
                    {previewReport.summary}
                  </pre>
                </div>
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InvestorReportsTab;