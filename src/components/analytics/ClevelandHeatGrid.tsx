import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building, Users, DollarSign, TrendingUp, Home, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ZipEntry {
  zip: string;
  name: string;
}

interface ZipStats {
  leadCount: number;
  avgBudget: number;
  voucherPercent: number;
  conversionRate: number;
  topProperties: Array<{ id: string; address: string; count: number }>;
}

interface CityHeatGridProps {
  zips: ZipEntry[];
  zipStats: Record<string, ZipStats>;
  properties: Array<{ id: string; address: string; zip_code: string }>;
}

// === CITY CONFIGURATIONS ===

const CLEVELAND_ZIPS: ZipEntry[] = [
  { zip: '44107', name: 'Lakewood' },
  { zip: '44102', name: 'Detroit Shoreway' },
  { zip: '44114', name: 'Downtown' },
  { zip: '44103', name: 'East Side' },
  { zip: '44106', name: 'University Circle' },
  { zip: '44108', name: 'Hough/Glenville' },
  { zip: '44110', name: 'Collinwood' },
  { zip: '44111', name: 'West Park' },
  { zip: '44113', name: 'Ohio City/Tremont' },
  { zip: '44115', name: 'Central' },
  { zip: '44104', name: 'Kinsman' },
  { zip: '44120', name: 'Shaker Heights' },
  { zip: '44112', name: 'East Cleveland' },
  { zip: '44119', name: 'Euclid' },
  { zip: '44135', name: 'Brookpark/Airport' },
  { zip: '44109', name: 'Brooklyn Centre' },
  { zip: '44127', name: 'Newburgh Heights' },
  { zip: '44105', name: 'Slavic Village' },
  { zip: '44128', name: 'North Randall' },
  { zip: '44121', name: 'South Euclid' },
  { zip: '44143', name: 'Richmond Heights' },
  { zip: '44129', name: 'Parma Heights' },
  { zip: '44134', name: 'Parma' },
  { zip: '44144', name: 'Brooklyn' },
  { zip: '44125', name: 'Garfield Heights' },
];

const MILWAUKEE_ZIPS: ZipEntry[] = [
  { zip: '53202', name: 'East Town/Yankee Hill' },
  { zip: '53203', name: 'Westown/Marquette' },
  { zip: '53204', name: "Walker's Point" },
  { zip: '53205', name: 'Halyard Park' },
  { zip: '53206', name: "Brewers Hill/Harambee" },
  { zip: '53207', name: 'Bay View' },
  { zip: '53208', name: 'Washington Heights' },
  { zip: '53209', name: 'Old North Milwaukee' },
  { zip: '53210', name: 'Washington Park' },
  { zip: '53211', name: 'Shorewood/Murray Hill' },
  { zip: '53212', name: "Riverwest" },
  { zip: '53213', name: 'Wauwatosa East' },
  { zip: '53214', name: 'West Allis' },
  { zip: '53215', name: 'Lincoln Creek' },
  { zip: '53216', name: 'Capitol Heights' },
  { zip: '53217', name: 'Whitefish Bay' },
  { zip: '53218', name: 'Thurston Woods' },
  { zip: '53219', name: 'West Milwaukee' },
  { zip: '53220', name: 'Southgate' },
  { zip: '53221', name: 'St. Francis/Tippecanoe' },
  { zip: '53222', name: 'Menomonee River Hills' },
  { zip: '53223', name: 'Brown Deer' },
  { zip: '53224', name: 'Granville' },
  { zip: '53225', name: 'Timmerman' },
  { zip: '53226', name: 'Wauwatosa West' },
  { zip: '53227', name: 'West Allis South' },
  { zip: '53228', name: 'New Berlin' },
  { zip: '53233', name: 'Near West Side' },
  { zip: '53235', name: 'St. Francis' },
];

export const CITY_CONFIGS = {
  cleveland: { label: 'Cleveland, OH', zips: CLEVELAND_ZIPS },
  milwaukee: { label: 'Milwaukee, WI', zips: MILWAUKEE_ZIPS },
} as const;

export type CityKey = keyof typeof CITY_CONFIGS;

// === HEAT LEVEL HELPERS ===

const getHeatLevel = (count: number): { bg: string; text: string; badgeClass: string; label: string; showFire: boolean } => {
  if (count === 0) return { bg: 'bg-muted', text: 'text-muted-foreground', badgeClass: 'border-muted-foreground/30 text-muted-foreground', label: 'No data', showFire: false };
  if (count <= 5) return { bg: 'bg-primary/10', text: 'text-foreground', badgeClass: '', label: 'Low', showFire: false };
  if (count <= 15) return { bg: 'bg-primary/20', text: 'text-foreground', badgeClass: '', label: 'Moderate', showFire: false };
  if (count <= 30) return { bg: 'bg-primary/40', text: 'text-foreground', badgeClass: '', label: 'Active', showFire: false };
  if (count <= 50) return { bg: 'bg-primary/60', text: 'text-white', badgeClass: 'border-white/50 text-white', label: 'Hot', showFire: false };
  return { bg: 'bg-primary/80', text: 'text-white', badgeClass: 'border-white/50 text-white', label: 'Very Hot', showFire: true };
};

// === MAIN COMPONENT (generic) ===

export const CityHeatGrid: React.FC<CityHeatGridProps> = ({ zips, zipStats, properties }) => {
  const [selectedZip, setSelectedZip] = useState<ZipEntry | null>(null);

  const getStatsForZip = (zip: string): ZipStats => {
    return zipStats[zip] || {
      leadCount: 0,
      avgBudget: 0,
      voucherPercent: 0,
      conversionRate: 0,
      topProperties: [],
    };
  };

  const propertiesInZip = (zip: string) => properties.filter(p => p.zip_code === zip);

  return (
    <>
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7">
        {zips.map(zipData => {
          const stats = getStatsForZip(zipData.zip);
          const heat = getHeatLevel(stats.leadCount);

          return (
            <button
              key={zipData.zip}
              type="button"
              className={cn(
                'p-3 rounded-2xl text-left transition-all duration-200',
                'hover:shadow-modern-lg hover:ring-2 hover:ring-primary/20',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                'border border-transparent',
                heat.bg,
                heat.text
              )}
              onClick={() => setSelectedZip(zipData)}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{zipData.zip}</span>
                  {heat.showFire && <Flame className="h-3.5 w-3.5 text-orange-400" aria-label="Very hot area" />}
                </div>
                <p className="text-xs opacity-80 truncate">{zipData.name}</p>
                <div className="pt-2 space-y-0.5">
                  <p className="text-sm font-semibold">{stats.leadCount} leads</p>
                  {stats.avgBudget > 0 && (
                    <p className="text-xs opacity-80">Avg: ${stats.avgBudget.toLocaleString()}</p>
                  )}
                  <Badge variant="outline" className={cn('text-[10px] mt-1', heat.badgeClass)}>
                    {heat.label}
                  </Badge>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!selectedZip} onOpenChange={() => setSelectedZip(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedZip && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  {selectedZip.zip} — {selectedZip.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {(() => {
                  const stats = getStatsForZip(selectedZip.zip);
                  const propsInZip = propertiesInZip(selectedZip.zip);

                  return (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <Users className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-2xl font-bold">{stats.leadCount}</p>
                            <p className="text-xs text-muted-foreground">Total Leads</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <DollarSign className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-2xl font-bold">
                              {stats.avgBudget > 0 ? `$${stats.avgBudget.toLocaleString()}` : '—'}
                            </p>
                            <p className="text-xs text-muted-foreground">Avg Budget</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <Home className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-2xl font-bold">{stats.voucherPercent}%</p>
                            <p className="text-xs text-muted-foreground">Section 8</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <TrendingUp className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-2xl font-bold">{stats.conversionRate}%</p>
                            <p className="text-xs text-muted-foreground">Conversion</p>
                          </div>
                        </div>
                      </div>

                      {stats.topProperties.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2">Top Requested Properties</h4>
                          <div className="space-y-2">
                            {stats.topProperties.slice(0, 3).map((prop) => (
                              <div key={prop.id} className="flex justify-between items-center text-sm p-2 rounded bg-muted/30">
                                <span className="truncate">{prop.address}</span>
                                <Badge variant="secondary">{prop.count} leads</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {propsInZip.length > 0 ? (
                        <div className="text-sm text-muted-foreground">
                          {propsInZip.length} {propsInZip.length === 1 ? 'property' : 'properties'} in this zip code
                        </div>
                      ) : (
                        <div className="text-sm text-amber-600 dark:text-amber-400">
                          No properties listed in this zip — potential opportunity!
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

// Backwards-compatible alias
export const ClevelandHeatGrid = CityHeatGrid;
