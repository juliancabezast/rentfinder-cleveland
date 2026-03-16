import React, { useState } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Property {
  id: string;
  address: string;
  unit_number?: string | null;
  city: string;
  rent_price: number;
  bedrooms: number;
  status: string;
}

interface AlternativePropertiesSelectorProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  availableProperties: Property[];
  excludePropertyId?: string;
  isLoading?: boolean;
  compact?: boolean;
}

export const AlternativePropertiesSelector: React.FC<AlternativePropertiesSelectorProps> = ({
  selectedIds,
  onChange,
  availableProperties,
  excludePropertyId,
  isLoading = false,
  compact = false,
}) => {
  const [open, setOpen] = useState(false);

  const filteredProperties = availableProperties.filter(
    (p) =>
      p.id !== excludePropertyId &&
      ['available', 'coming_soon'].includes(p.status)
  );

  // Show badges for ALL selected properties (even if status changed to rented/in_leasing)
  const selectedProperties = availableProperties.filter(
    (p) => p.id !== excludePropertyId && selectedIds.includes(p.id)
  );

  const toggleProperty = (propertyId: string) => {
    if (selectedIds.includes(propertyId)) {
      onChange(selectedIds.filter((id) => id !== propertyId));
    } else {
      onChange([...selectedIds, propertyId]);
    }
  };

  const removeProperty = (propertyId: string) => {
    onChange(selectedIds.filter((id) => id !== propertyId));
  };

  const getPropertyLabel = (property: Property) => {
    const address = property.unit_number
      ? `${property.address}, Unit ${property.unit_number}`
      : property.address;
    return `${address} - ${property.bedrooms}bd - $${property.rent_price.toLocaleString()}/mo`;
  };

  const buttonLabel = () => {
    if (selectedIds.length === 0) {
      return compact ? 'Select redirects...' : 'Select alternative properties...';
    }
    if (compact && selectedProperties.length > 0) {
      const first = selectedProperties[0];
      const name = first.unit_number
        ? `${first.address} #${first.unit_number}`
        : first.address;
      if (selectedProperties.length === 1) return name;
      return `${name} +${selectedProperties.length - 1}`;
    }
    return selectedIds.length === 1
      ? '1 property selected'
      : `${selectedIds.length} properties selected`;
  };

  return (
    <div className={compact ? "" : "space-y-2"}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between",
              compact && "h-8 text-xs",
              compact && selectedIds.length > 0 && "border-[#4F46E5]/30"
            )}
            disabled={isLoading}
          >
            <span className="truncate">{buttonLabel()}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full max-w-[calc(100vw-2rem)] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search properties..." />
            <CommandList className="max-h-[40vh] sm:max-h-[300px]">
              <CommandEmpty>No properties found.</CommandEmpty>
              <CommandGroup>
                {filteredProperties.map((property) => (
                  <CommandItem
                    key={property.id}
                    value={getPropertyLabel(property)}
                    onSelect={() => toggleProperty(property.id)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        selectedIds.includes(property.id)
                          ? 'opacity-100'
                          : 'opacity-0'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {property.address}
                        {property.unit_number && `, Unit ${property.unit_number}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {property.bedrooms}bd · ${property.rent_price.toLocaleString()}/mo · {property.city}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'ml-2 text-[10px]',
                        property.status === 'coming_soon' && 'bg-warning/20 text-warning-foreground'
                      )}
                    >
                      {property.status === 'coming_soon' ? 'Coming Soon' : 'Available'}
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Selected Properties — hidden in compact mode */}
      {!compact && selectedProperties.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedProperties.map((property) => (
            <Badge
              key={property.id}
              variant="secondary"
              className="flex items-center gap-1 pr-1"
            >
              <span className="truncate max-w-[200px]">
                {property.address}
                {property.unit_number && ` #${property.unit_number}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 hover:bg-transparent"
                onClick={() => removeProperty(property.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};
