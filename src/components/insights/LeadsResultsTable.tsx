import React from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Users } from "lucide-react";

export interface LeadResult {
  id: string;
  full_name: string | null;
  phone: string;
  source: string;
  status: string;
  lead_score: number | null;
  interested_property_id: string | null;
  property_address?: string;
  has_voucher: boolean | null;
  preferred_language: string | null;
  created_at: string;
  last_contact_at: string | null;
}

type SortField = "full_name" | "lead_score" | "created_at" | "last_contact_at";
type SortDirection = "asc" | "desc";

interface LeadsResultsTableProps {
  leads: LeadResult[];
  loading: boolean;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
}

const SOURCE_LABELS: Record<string, string> = {
  inbound_call: "Inbound Call",
  hemlane_email: "Hemlane",
  website: "Website",
  referral: "Referral",
  manual: "Manual",
  sms: "SMS",
  campaign: "Campaign",
  csv_import: "CSV Import",
};

export const LeadsResultsTable: React.FC<LeadsResultsTableProps> = ({
  leads,
  loading,
  totalCount,
  currentPage,
  pageSize,
  onPageChange,
  sortField,
  sortDirection,
  onSort,
}) => {
  const navigate = useNavigate();
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  const SortableHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <TableHead
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={`h-3 w-3 ${sortField === field ? "text-foreground" : "text-muted-foreground"}`}
        />
      </div>
    </TableHead>
  );

  if (loading) {
    return (
      <Card variant="glass">
        <CardContent className="p-6 space-y-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (leads.length === 0) {
    return (
      <Card variant="glass">
        <EmptyState
          icon={Users}
          title="No leads found"
          description="Try adjusting your filters to find matching leads."
        />
      </Card>
    );
  }

  return (
    <Card variant="glass">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table className="modern-table">
            <TableHeader>
              <TableRow>
                <SortableHeader field="full_name">Name</SortableHeader>
                <TableHead>Phone</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <SortableHeader field="lead_score">Score</SortableHeader>
                <TableHead>Property</TableHead>
                <TableHead>Voucher</TableHead>
                <TableHead>Language</TableHead>
                <SortableHeader field="created_at">Created</SortableHeader>
                <SortableHeader field="last_contact_at">Last Contact</SortableHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow
                  key={lead.id}
                  className="cursor-pointer hover:bg-accent/5 transition-colors"
                  onClick={() => navigate(`/leads/${lead.id}`)}
                >
                  <TableCell className="font-medium">
                    {lead.full_name || "Unknown"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {lead.phone}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {SOURCE_LABELS[lead.source] || lead.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={lead.status} type="lead" />
                  </TableCell>
                  <TableCell>
                    {lead.lead_score !== null ? (
                      <span
                        className={`font-medium ${
                          lead.lead_score >= 70
                            ? "text-emerald-600"
                            : lead.lead_score >= 40
                              ? "text-amber-600"
                              : "text-rose-600"
                        }`}
                      >
                        {lead.lead_score}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {lead.property_address || (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {lead.has_voucher === true ? (
                      <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                        Yes
                      </Badge>
                    ) : lead.has_voucher === false ? (
                      <Badge variant="outline" className="text-xs">
                        No
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {lead.preferred_language === "es"
                      ? "Spanish"
                      : lead.preferred_language === "en"
                        ? "English"
                        : lead.preferred_language || "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(lead.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.last_contact_at
                      ? format(new Date(lead.last_contact_at), "MMM d, yyyy")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between p-4 border-t">
          <p className="text-sm text-muted-foreground">
            Showing {startItem} to {endItem} of {totalCount} leads
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="flex items-center px-3 text-sm">
              Page {currentPage} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
