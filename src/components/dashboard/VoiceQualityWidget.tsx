import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Mic, ChevronRight, AlertTriangle } from "lucide-react";
import { subDays } from "date-fns";
import { cn } from "@/lib/utils";

interface QualityDetails {
  greeting_quality?: number;
  information_accuracy?: number;
  question_handling?: number;
  objection_handling?: number;
  closing_quality?: number;
  compliance_adherence?: number;
  issues_found?: string[];
  strengths?: string[];
}

interface CategoryScore {
  name: string;
  key: keyof QualityDetails;
  score: number;
}

export const VoiceQualityWidget: React.FC = () => {
  const { userRecord } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [categoryScores, setCategoryScores] = useState<CategoryScore[]>([]);
  const [topIssues, setTopIssues] = useState<{ issue: string; count: number }[]>([]);
  const [callCount, setCallCount] = useState(0);

  useEffect(() => {
    const fetchQualityData = async () => {
      if (!userRecord?.organization_id) return;

      setLoading(true);
      try {
        const sevenDaysAgo = subDays(new Date(), 7).toISOString();

        const { data: calls, error } = await supabase
          .from("calls")
          .select("agent_quality_score, agent_quality_details")
          .eq("organization_id", userRecord.organization_id)
          .not("agent_quality_score", "is", null)
          .gte("started_at", sevenDaysAgo);

        if (error) throw error;

        if (!calls || calls.length === 0) {
          setOverallScore(null);
          setCallCount(0);
          setCategoryScores([]);
          setTopIssues([]);
          return;
        }

        setCallCount(calls.length);

        // Calculate overall average
        const avgScore = calls.reduce((sum, c) => sum + (c.agent_quality_score || 0), 0) / calls.length;
        setOverallScore(Math.round(avgScore));

        // Calculate category averages
        const categories: { name: string; key: keyof QualityDetails }[] = [
          { name: "Greeting", key: "greeting_quality" },
          { name: "Info Accuracy", key: "information_accuracy" },
          { name: "Question Handling", key: "question_handling" },
          { name: "Objection Handling", key: "objection_handling" },
          { name: "Closing", key: "closing_quality" },
          { name: "Compliance", key: "compliance_adherence" },
        ];

        const categoryTotals: Record<string, { sum: number; count: number }> = {};
        categories.forEach(cat => {
          categoryTotals[cat.key] = { sum: 0, count: 0 };
        });

        // Track all issues
        const issueCounter: Record<string, number> = {};

        calls.forEach((call) => {
          const details = call.agent_quality_details as QualityDetails | null;
          if (!details) return;

          categories.forEach(cat => {
            const value = details[cat.key];
            if (typeof value === "number") {
              categoryTotals[cat.key].sum += value;
              categoryTotals[cat.key].count += 1;
            }
          });

          // Count issues
          if (details.issues_found && Array.isArray(details.issues_found)) {
            details.issues_found.forEach((issue) => {
              issueCounter[issue] = (issueCounter[issue] || 0) + 1;
            });
          }
        });

        const categoryResults = categories.map(cat => ({
          name: cat.name,
          key: cat.key,
          score: categoryTotals[cat.key].count > 0
            ? Math.round(categoryTotals[cat.key].sum / categoryTotals[cat.key].count)
            : 0,
        }));

        setCategoryScores(categoryResults);

        // Get top 3 issues
        const sortedIssues = Object.entries(issueCounter)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([issue, count]) => ({ issue, count }));

        setTopIssues(sortedIssues);
      } catch (error) {
        console.error("Error fetching quality data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchQualityData();
  }, [userRecord?.organization_id]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return "bg-green-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  if (loading) {
    return (
      <Card variant="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-16" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          AI Agent Performance
        </CardTitle>
        <span className="text-sm text-muted-foreground">Last 7d</span>
      </CardHeader>
      <CardContent>
        {overallScore === null ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mic className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No quality scores available yet</p>
            <p className="text-sm mt-1">
              Scores are generated when calls are analyzed by AI
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Overall Score */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-muted-foreground">Overall Score:</span>
                  <span className={cn("text-2xl font-bold", getScoreColor(overallScore))}>
                    {overallScore}/100
                  </span>
                </div>
                <Progress 
                  value={overallScore} 
                  className="h-2 mt-2"
                />
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="space-y-3">
              {categoryScores.map((cat) => (
                <div key={cat.key} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-32 shrink-0">
                    {cat.name}
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all", getProgressColor(cat.score))}
                        style={{ width: `${cat.score}%` }}
                      />
                    </div>
                    <span className={cn("text-sm font-medium w-8", getScoreColor(cat.score))}>
                      {cat.score}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Top Issues */}
            {topIssues.length > 0 && (
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Top Issues This Week
                </p>
                <div className="space-y-2">
                  {topIssues.map((item, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between text-sm bg-muted/50 rounded-lg px-3 py-2"
                    >
                      <span className="text-muted-foreground">{item.issue}</span>
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        {item.count} calls
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* View All Link */}
            <Button 
              variant="ghost" 
              className="w-full" 
              onClick={() => navigate("/calls")}
            >
              View All Call Quality Reports
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

