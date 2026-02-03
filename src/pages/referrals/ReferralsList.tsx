import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Gift,
  Users,
  Clock,
  CheckCircle,
  DollarSign,
  Search,
  Copy,
  RefreshCw,
  ExternalLink,
  Phone,
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Referral {
  id: string;
  referrer_lead_id: string;
  referrer_name: string | null;
  referrer_phone: string | null;
  referred_lead_id: string | null;
  referred_name: string | null;
  referred_phone: string;
  referred_email: string | null;
  referral_code: string;
  status: string;
  reward_type: string | null;
  reward_amount: number | null;
  reward_paid_at: string | null;
  referral_message_sent_at: string | null;
  referral_channel: string | null;
  created_at: string;
  expires_at: string;
}

interface ReferralStats {
  total: number;
  pending: number;
  converted: number;
  totalRewardsPaid: number;
}

const getStatusConfig = (status: string) => {
  switch (status) {
    case "pending":
      return { color: "bg-amber-500", label: "Pending" };
    case "contacted":
      return { color: "bg-blue-500", label: "Contacted" };
    case "converted":
      return { color: "bg-green-500", label: "Converted" };
    case "rewarded":
      return { color: "bg-purple-500", label: "Rewarded" };
    case "expired":
      return { color: "bg-muted-foreground", label: "Expired" };
    default:
      return { color: "bg-muted-foreground", label: status };
  }
};

const ReferralsList: React.FC = () => {
  const navigate = useNavigate();
  const { userRecord } = useAuth();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReferralStats>({
    total: 0,
    pending: 0,
    converted: 0,
    totalRewardsPaid: 0,
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const fetchReferrals = async () => {
    if (!userRecord?.organization_id) return;

    setLoading(true);
    try {
      let query = supabase
        .from("referrals")
        .select("*")
        .eq("organization_id", userRecord.organization_id)
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (searchQuery) {
        query = query.or(
          `referrer_name.ilike.%${searchQuery}%,referred_name.ilike.%${searchQuery}%,referral_code.ilike.%${searchQuery}%,referred_phone.ilike.%${searchQuery}%`
        );
      }

      const { data, error } = await query;

      if (error) throw error;

      setReferrals(data || []);

      // Calculate stats
      const allReferrals = data || [];
      setStats({
        total: allReferrals.length,
        pending: allReferrals.filter((r) => r.status === "pending").length,
        converted: allReferrals.filter((r) => r.status === "converted" || r.status === "rewarded").length,
        totalRewardsPaid: allReferrals
          .filter((r) => r.status === "rewarded")
          .reduce((sum, r) => sum + (r.reward_amount || 0), 0),
      });
    } catch (error) {
      console.error("Error fetching referrals:", error);
      toast.error("Failed to load referrals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferrals();
  }, [userRecord?.organization_id, statusFilter, searchQuery]);

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Referral code copied!");
  };

  const handleResendInvite = async (referral: Referral) => {
    // TODO: Implement resend via Twilio when connected
    toast.info("Resend functionality will be available when messaging is connected");
  };

  const handleMarkRewardPaid = async (referralId: string) => {
    try {
      const { error } = await supabase
        .from("referrals")
        .update({
          status: "rewarded",
          reward_paid_at: new Date().toISOString(),
        })
        .eq("id", referralId);

      if (error) throw error;

      toast.success("Reward marked as paid");
      fetchReferrals();
    } catch (error) {
      console.error("Error marking reward paid:", error);
      toast.error("Failed to update reward status");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Gift className="h-6 w-6" />
            Referral Program
          </h1>
          <p className="text-muted-foreground">
            Track referrals and manage rewards
          </p>
        </div>
        <Button onClick={fetchReferrals} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Referrals</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-500/10">
                <Clock className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-green-500/10">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Converted</p>
                <p className="text-2xl font-bold">{stats.converted}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-500/10">
                <DollarSign className="h-6 w-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rewards Paid</p>
                <p className="text-2xl font-bold">
                  ${stats.totalRewardsPaid.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="rewarded">Rewarded</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Referrals Table */}
      <Card>
        <CardHeader>
          <CardTitle>Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referrer</TableHead>
                  <TableHead>Referred</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Reward</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : referrals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Gift className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                      <p className="text-muted-foreground">No referrals found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  referrals.map((referral) => {
                    const statusConfig = getStatusConfig(referral.status);
                    return (
                      <TableRow key={referral.id}>
                        <TableCell>
                          <button
                            onClick={() => navigate(`/leads/${referral.referrer_lead_id}`)}
                            className="text-left hover:underline"
                          >
                            <p className="font-medium">{referral.referrer_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {referral.referrer_phone}
                            </p>
                          </button>
                        </TableCell>
                        <TableCell>
                          {referral.referred_lead_id ? (
                            <button
                              onClick={() => navigate(`/leads/${referral.referred_lead_id}`)}
                              className="text-left hover:underline"
                            >
                              <p className="font-medium">{referral.referred_name || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {referral.referred_phone}
                              </p>
                            </button>
                          ) : (
                            <div>
                              <p className="text-muted-foreground">
                                {referral.referred_name || "Not yet"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {referral.referred_phone}
                              </p>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                              {referral.referral_code}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleCopyCode(referral.referral_code)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${statusConfig.color} text-white`}>
                            {statusConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(referral.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(referral.expires_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            ${referral.reward_amount?.toFixed(2) || "100.00"}
                            {referral.status === "rewarded" ? (
                              <Badge variant="outline" className="ml-2 text-green-600">
                                Paid
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground ml-1">
                                ({referral.reward_type || "cash"})
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {referral.status === "pending" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResendInvite(referral)}
                              >
                                Resend
                              </Button>
                            )}
                            {referral.status === "converted" && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleMarkRewardPaid(referral.id)}
                              >
                                Mark Paid
                              </Button>
                            )}
                            {referral.referred_lead_id && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => navigate(`/leads/${referral.referred_lead_id}`)}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

export default ReferralsList;
