import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, RefreshCw, MapPin, Eye, MessageSquare, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PropertyMatch {
  property_id: string;
  address: string;
  rent_price: number;
  bedrooms: number;
  zip_code: string;
  match_score: number;
  match_reasons: string[];
}

interface SmartMatchesProps {
  leadId: string;
  leadName: string;
}

const getMatchLevel = (score: number): { label: string; color: string; ringColor: string } => {
  if (score >= 80) return { label: 'Excellent', color: 'text-green-600', ringColor: 'stroke-green-500' };
  if (score >= 60) return { label: 'Good', color: 'text-amber-600', ringColor: 'stroke-amber-500' };
  return { label: 'Partial', color: 'text-muted-foreground', ringColor: 'stroke-muted-foreground' };
};

const CircularProgress: React.FC<{ score: number; size?: number }> = ({ score, size = 48 }) => {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const matchLevel = getMatchLevel(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="transform -rotate-90" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className={matchLevel.ringColor}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('text-xs font-bold', matchLevel.color)}>{score}%</span>
      </div>
    </div>
  );
};

export const SmartMatches: React.FC<SmartMatchesProps> = ({ leadId, leadName }) => {
  const { userRecord } = useAuth();
  const [matches, setMatches] = useState<PropertyMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyMatch | null>(null);
  const [sending, setSending] = useState(false);

  const fetchMatches = async (isRefresh = false) => {
    if (!userRecord?.organization_id) return;

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase.functions.invoke('match-properties', {
        body: {
          organization_id: userRecord.organization_id,
          lead_id: leadId,
        },
      });

      if (error) throw error;

      setMatches(data?.matches || []);
    } catch (error) {
      console.error('Error fetching matches:', error);
      toast.error('Failed to fetch property matches');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [leadId, userRecord?.organization_id]);

  const handleSuggest = (match: PropertyMatch) => {
    setSelectedProperty(match);
    setSuggestDialogOpen(true);
  };

  const handleSendSuggestion = async () => {
    if (!selectedProperty || !userRecord?.organization_id) return;

    setSending(true);
    try {
      const messageBody = `Hi! We found a property that matches what you're looking for:\n\n📍 ${selectedProperty.address}\n🛏️ ${selectedProperty.bedrooms} BR · $${selectedProperty.rent_price.toLocaleString()}/mo\n\nWould you like to schedule a showing? Reply YES or call us anytime!`;

      const { data, error } = await supabase.functions.invoke('send-message', {
        body: {
          lead_id: leadId,
          channel: 'sms',
          body: messageBody,
          organization_id: userRecord.organization_id,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Property suggestion sent to ${leadName}`);
      } else {
        throw new Error(data?.error || 'Failed to send suggestion');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send suggestion';
      toast.error(message);
    } finally {
      setSending(false);
      setSuggestDialogOpen(false);
      setSelectedProperty(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              Smart Property Matches
            </CardTitle>
            <CardDescription>
              Properties that match this lead's preferences
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchMatches(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2 hidden sm:inline">Refresh</span>
          </Button>
        </CardHeader>
        <CardContent>
          {matches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <MapPin className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No matching properties found</p>
              <p className="text-sm mt-1">
                Try updating the lead's preferences or adding more properties
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {matches.map((match) => {
                const matchLevel = getMatchLevel(match.match_score);
                return (
                  <div
                    key={match.property_id}
                    className="flex items-start gap-4 p-4 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <CircularProgress score={match.match_score} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="truncate">{match.address}</span>
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {match.bedrooms}BR · ${match.rent_price.toLocaleString()} · {match.zip_code}
                          </p>
                        </div>
                        <Badge variant="outline" className={matchLevel.color}>
                          {matchLevel.label}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {match.match_reasons.map((reason, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            ✓ {reason}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/properties/${match.property_id}`}>
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSuggest(match)}
                          className="text-accent-foreground"
                        >
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Suggest
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suggest Property Dialog */}
      <Dialog open={suggestDialogOpen} onOpenChange={setSuggestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suggest Property to Lead</DialogTitle>
            <DialogDescription>
              Send an SMS to {leadName} about this property.
            </DialogDescription>
          </DialogHeader>
          {selectedProperty && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="font-medium">{selectedProperty.address}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedProperty.bedrooms}BR · ${selectedProperty.rent_price.toLocaleString()}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                This feature will send an automated SMS with property details and a link to schedule a showing.
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSuggestDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSendSuggestion} disabled={sending}>
                  {sending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <MessageSquare className="h-4 w-4 mr-2" />
                  )}
                  {sending ? 'Sending...' : 'Send Suggestion'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
