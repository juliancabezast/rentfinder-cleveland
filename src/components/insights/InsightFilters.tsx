import React from "react";
import { format, subDays } from "date-fns";
import { Filter, X, ChevronDown } from "lucide-react";
import { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DateRangePicker } from "@/components/ui/date-range-picker";

const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "engaged", label: "Engaged" },
  { value: "nurturing", label: "Nurturing" },
  { value: "qualified", label: "Qualified" },
  { value: "showing_scheduled", label: "Showing Scheduled" },
  { value: "showed", label: "Showed" },
  { value: "in_application", label: "In Application" },
  { value: "lost", label: "Lost" },
  { value: "converted", label: "Converted" },
];

const LEAD_SOURCES = [
  { value: "inbound_call", label: "Inbound Call" },
  { value: "hemlane_email", label: "Hemlane Email" },
  { value: "website", label: "Website" },
  { value: "referral", label: "Referral" },
  { value: "manual", label: "Manual" },
  { value: "sms", label: "SMS" },
  { value: "campaign", label: "Campaign" },
  { value: "csv_import", label: "CSV Import" },
];

export interface InsightFiltersState {
  dateRange: DateRange | undefined;
  statuses: string[];
  sources: string[];
  scoreMin: string;
  scoreMax: string;
  language: string;
  hasVoucher: string;
  propertyId: string;
  zipCode: string;
  priorityOnly: boolean;
}

interface Property {
  id: string;
  address: string;
}

interface InsightFiltersProps {
  filters: InsightFiltersState;
  onFiltersChange: (filters: InsightFiltersState) => void;
  properties: Property[];
  onApply: () => void;
  onClear: () => void;
  onExport: () => void;
  isExporting: boolean;
}

export const getDefaultFilters = (): InsightFiltersState => ({
  dateRange: {
    from: subDays(new Date(), 30),
    to: new Date(),
  },
  statuses: [],
  sources: [],
  scoreMin: "",
  scoreMax: "",
  language: "all",
  hasVoucher: "all",
  propertyId: "all",
  zipCode: "",
  priorityOnly: false,
});

export const InsightFilters: React.FC<InsightFiltersProps> = ({
  filters,
  onFiltersChange,
  properties,
  onApply,
  onClear,
  onExport,
  isExporting,
}) => {
  const [isOpen, setIsOpen] = React.useState(true);

  const activeFiltersCount = React.useMemo(() => {
    let count = 0;
    if (filters.statuses.length > 0) count++;
    if (filters.sources.length > 0) count++;
    if (filters.scoreMin || filters.scoreMax) count++;
    if (filters.language !== "all") count++;
    if (filters.hasVoucher !== "all") count++;
    if (filters.propertyId !== "all") count++;
    if (filters.zipCode) count++;
    if (filters.priorityOnly) count++;
    return count;
  }, [filters]);

  const updateFilter = <K extends keyof InsightFiltersState>(
    key: K,
    value: InsightFiltersState[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleArrayFilter = (key: "statuses" | "sources", value: string) => {
    const current = filters[key];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateFilter(key, updated);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="glass-card rounded-xl">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors rounded-t-xl">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span className="font-medium">Filters</span>
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {activeFiltersCount} active
                </Badge>
              )}
            </div>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
            />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="p-4 pt-0 space-y-4">
            {/* Filter Grid */}
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {/* Date Range */}
              <div className="space-y-2">
                <Label>Date Range</Label>
                <DateRangePicker
                  date={filters.dateRange}
                  onDateChange={(range) => updateFilter("dateRange", range)}
                  className="w-full"
                />
              </div>

              {/* Score Range */}
              <div className="space-y-2">
                <Label>Score Range</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    min={0}
                    max={100}
                    value={filters.scoreMin}
                    onChange={(e) => updateFilter("scoreMin", e.target.value)}
                    className="w-full"
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    min={0}
                    max={100}
                    value={filters.scoreMax}
                    onChange={(e) => updateFilter("scoreMax", e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Language */}
              <div className="space-y-2">
                <Label>Language</Label>
                <Select
                  value={filters.language}
                  onValueChange={(v) => updateFilter("language", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Languages</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Has Voucher */}
              <div className="space-y-2">
                <Label>Has Voucher</Label>
                <Select
                  value={filters.hasVoucher}
                  onValueChange={(v) => updateFilter("hasVoucher", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Property */}
              <div className="space-y-2">
                <Label>Property</Label>
                <Select
                  value={filters.propertyId}
                  onValueChange={(v) => updateFilter("propertyId", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All Properties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Properties</SelectItem>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.address}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Zip Code */}
              <div className="space-y-2">
                <Label>Zip Code</Label>
                <Input
                  placeholder="Enter zip code"
                  value={filters.zipCode}
                  onChange={(e) => updateFilter("zipCode", e.target.value)}
                />
              </div>
            </div>

            {/* Status Checkboxes */}
            <div className="space-y-2">
              <Label>Lead Status</Label>
              <div className="flex flex-wrap gap-3">
                {LEAD_STATUSES.map((status) => (
                  <label
                    key={status.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={filters.statuses.includes(status.value)}
                      onCheckedChange={() =>
                        toggleArrayFilter("statuses", status.value)
                      }
                    />
                    <span className="text-sm">{status.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Source Checkboxes */}
            <div className="space-y-2">
              <Label>Lead Source</Label>
              <div className="flex flex-wrap gap-3">
                {LEAD_SOURCES.map((source) => (
                  <label
                    key={source.value}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={filters.sources.includes(source.value)}
                      onCheckedChange={() =>
                        toggleArrayFilter("sources", source.value)
                      }
                    />
                    <span className="text-sm">{source.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Priority Toggle */}
            <div className="flex items-center gap-3">
              <Switch
                id="priority-only"
                checked={filters.priorityOnly}
                onCheckedChange={(checked) =>
                  updateFilter("priorityOnly", checked)
                }
              />
              <Label htmlFor="priority-only" className="cursor-pointer">
                Priority Leads Only
              </Label>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={onApply}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold"
              >
                Apply Filters
              </Button>
              <Button variant="ghost" onClick={onClear}>
                <X className="h-4 w-4 mr-1" />
                Clear All
              </Button>
              <Button
                variant="outline"
                onClick={onExport}
                disabled={isExporting}
              >
                {isExporting ? "Exporting..." : "Export CSV"}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};
