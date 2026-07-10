import React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MapPin, X } from "lucide-react";
import { LeadTag, formatTagAddress, tagCities } from "@/lib/leadTags";

interface LeadTagChipsProps {
  tags: LeadTag[];
  /** Cap visible property chips; the rest collapse into a "+N" chip. */
  max?: number;
  /** Render derived city chips after the property chips. */
  showCities?: boolean;
  /** When provided, property chips get an X to remove the tag. */
  onRemove?: (propertyId: string) => void;
  className?: string;
}

/**
 * Property-interest tag chips + derived city chips for a lead.
 * Properties render as neutral chips (most recent first); cities as
 * indigo-tinted outline chips — the "extra city tag" of the tag model.
 */
export const LeadTagChips = ({ tags, max, showCities = false, onRemove, className }: LeadTagChipsProps) => {
  if (!tags.length) return null;

  const visible = typeof max === "number" ? tags.slice(0, max) : tags;
  const hidden = typeof max === "number" ? tags.slice(max) : [];
  const cities = showCities ? tagCities(tags) : [];

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className || ""}`}>
      {visible.map((tag) => (
        <Badge
          key={tag.property_id}
          variant="secondary"
          className="max-w-[220px] gap-1 pr-1.5 text-xs font-medium"
        >
          <span className="truncate">{formatTagAddress(tag)}</span>
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${formatTagAddress(tag)}`}
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted-foreground/20 hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(tag.property_id);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}

      {hidden.length > 0 && (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="secondary" className="cursor-default text-xs font-medium">
                +{hidden.length}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[280px]">
              <div className="space-y-0.5">
                {hidden.map((tag) => (
                  <p key={tag.property_id} className="text-xs">{formatTagAddress(tag)}</p>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {cities.map((city) => (
        <Badge
          key={city}
          variant="outline"
          className="gap-1 border-[#4F46E5]/30 bg-[#4F46E5]/5 text-xs font-medium text-[#4F46E5]"
        >
          <MapPin className="h-3 w-3" />
          {city}
        </Badge>
      ))}
    </div>
  );
};
