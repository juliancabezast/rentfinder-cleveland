import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Mic, 
  CheckCircle2, 
  AlertTriangle, 
  Lightbulb,
  ThumbsUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QualityDetails {
  greeting_quality?: number;
  information_accuracy?: number;
  question_handling?: number;
  objection_handling?: number;
  closing_quality?: number;
  compliance_adherence?: number;
  silence_seconds?: number;
  issues_found?: string[];
  strengths?: string[];
  improvement_suggestions?: string[];
}

interface CallQualityScoreProps {
  score: number | null;
  details: QualityDetails | null;
}

export const CallQualityScore: React.FC<CallQualityScoreProps> = ({ score, details }) => {
  if (score === null) {
    return (
      <Card variant="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Agent Quality Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Quality score will be generated once AI analysis is complete
          </p>
        </CardContent>
      </Card>
    );
  }

  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-600";
    if (s >= 60) return "text-amber-600";
    return "text-red-600";
  };

  const getScoreBg = (s: number) => {
    if (s >= 80) return "bg-green-100 dark:bg-green-900/30";
    if (s >= 60) return "bg-amber-100 dark:bg-amber-900/30";
    return "bg-red-100 dark:bg-red-900/30";
  };

  const getProgressColor = (s: number) => {
    if (s >= 80) return "bg-green-500";
    if (s >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  const categories = [
    { name: "Greeting", key: "greeting_quality" as keyof QualityDetails },
    { name: "Info Accuracy", key: "information_accuracy" as keyof QualityDetails },
    { name: "Question Handling", key: "question_handling" as keyof QualityDetails },
    { name: "Objection Handling", key: "objection_handling" as keyof QualityDetails },
    { name: "Closing", key: "closing_quality" as keyof QualityDetails },
    { name: "Compliance", key: "compliance_adherence" as keyof QualityDetails },
  ];

  const issuesFound = details?.issues_found || [];
  const strengths = details?.strengths || [];
  const suggestions = details?.improvement_suggestions || [];

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5" />
          Agent Quality Score
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Score */}
        <div className={cn("p-4 rounded-xl text-center", getScoreBg(score))}>
          <p className="text-sm text-muted-foreground mb-1">Overall Score</p>
          <p className={cn("text-4xl font-bold", getScoreColor(score))}>
            {score}<span className="text-lg">/100</span>
          </p>
          <Badge 
            variant="outline" 
            className={cn("mt-2", getScoreColor(score))}
          >
            {score >= 80 ? "Excellent" : score >= 60 ? "Good" : "Needs Improvement"}
          </Badge>
        </div>

        {/* Category Breakdown */}
        {details && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Category Breakdown</p>
            {categories.map((cat) => {
              const value = details[cat.key] as number | undefined;
              if (value === undefined) return null;
              return (
                <div key={cat.key} className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground w-32 shrink-0">
                    {cat.name}
                  </span>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all", getProgressColor(value))}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <span className={cn("text-sm font-medium w-8", getScoreColor(value))}>
                      {value}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Strengths */}
        {strengths.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <ThumbsUp className="h-4 w-4 text-green-600" />
              Strengths
            </p>
            <div className="space-y-2">
              {strengths.map((s, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-2 text-sm bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2"
                >
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Issues Found */}
        {issuesFound.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Issues Found
            </p>
            <div className="space-y-2">
              {issuesFound.map((issue, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-2 text-sm bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2"
                >
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>{issue}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Improvement Suggestions */}
        {suggestions.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-600" />
              Improvement Suggestions
            </p>
            <div className="space-y-2">
              {suggestions.map((sug, idx) => (
                <div 
                  key={idx}
                  className="flex items-start gap-2 text-sm bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2"
                >
                  <Lightbulb className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                  <span>{sug}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Silence Detection */}
        {details?.silence_seconds !== undefined && details.silence_seconds > 0 && (
          <div className="text-sm text-muted-foreground">
            ⏱️ {details.silence_seconds} seconds of silence detected
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CallQualityScore;
