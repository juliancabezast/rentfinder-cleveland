import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";

interface AIBriefSectionProps {
  leadId: string;
  aiBrief: string | null;
  aiBriefGeneratedAt: string | null;
  aiBriefGeneratedBy: string | null;
  generatedByName?: string | null;
  onBriefUpdated: () => void;
}

export const AIBriefSection: React.FC<AIBriefSectionProps> = ({
  leadId,
  aiBrief,
  aiBriefGeneratedAt,
  aiBriefGeneratedBy,
  generatedByName,
  onBriefUpdated,
}) => {
  const { userRecord } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGenerateBrief = async () => {
    if (!userRecord?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-lead-brief", {
        body: {
          lead_id: leadId,
          user_id: userRecord.id,
        },
      });

      if (error) throw error;

      if (data?.brief) {
        toast.success("AI Brief generated successfully");
        onBriefUpdated();
      } else {
        throw new Error("No brief returned");
      }
    } catch (error) {
      console.error("Error generating brief:", error);
      toast.error("Failed to generate AI brief");
    } finally {
      setLoading(false);
    }
  };

  const hasBrief = !!aiBrief;

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" />
          AI Lead Brief
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          readOnly
          value={
            aiBrief ||
            "No brief generated yet. Click the button below to generate an AI summary of this lead's journey."
          }
          className={`min-h-[120px] resize-none ${
            !hasBrief ? "text-muted-foreground italic" : ""
          }`}
        />

        {hasBrief && aiBriefGeneratedAt && (
          <p className="text-xs text-muted-foreground">
            Generated {format(new Date(aiBriefGeneratedAt), "MMM d, yyyy 'at' h:mm a")}
            {generatedByName && ` by ${generatedByName}`}
          </p>
        )}

        <Button
          onClick={handleGenerateBrief}
          disabled={loading}
          variant={hasBrief ? "outline" : "default"}
          className={!hasBrief ? "bg-accent hover:bg-accent/90 text-accent-foreground" : ""}
        >
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : hasBrief ? (
            <RefreshCw className="mr-2 h-4 w-4" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {hasBrief ? "Regenerate Brief" : "Generate AI Brief"}
        </Button>
      </CardContent>
    </Card>
  );
};
