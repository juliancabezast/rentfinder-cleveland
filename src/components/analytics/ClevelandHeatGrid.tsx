import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Building, Users, DollarSign, TrendingUp, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ZipData {
  zip: string;
  name: string;
  row: number;
  col: number;
}

interface ZipStats {
  leadCount: number;
  avgBudget: number;
  voucherPercent: number;
  conversionRate: number;
  topProperties: Array<{ id: string; address: string; count: number }>;
}

interface ClevelandHeatGridProps {
  zipStats: Record<string, ZipStats>;
  properties: Array<{ id: string; address: string; zip_code: string }>;
}

const CLEVELAND_ZIPS: ZipData[] = [
  { zip: '44102', name: 'Detroit Shoreway', row: 1, col: 2 },
  { zip: '44107', name: 'Lakewood', row: 1, col: 1 },
  { zip: '44113', name: 'Ohio City/Tremont', row: 2, col: 2 },
  { zip: '44109', name: 'Brooklyn Centre', row: 3, col: 2 },
  { zip: '44111', name: 'West Park', row: 2, col: 1 },
  { zip: '44135', name: 'Brookpark/Airport', row: 3, col: 1 },
  { zip: '44114', name: 'Downtown', row: 1, col: 3 },
  { zip: '44115', name: 'Central', row: 2, col: 3 },
  { zip: '44103', name: 'East Side', row: 1, col: 4 },
  { zip: '44104', name: 'Kinsman', row: 2, col: 4 },
  { zip: '44106', name: 'University Circle', row: 1, col: 5 },
  { zip: '44108', name: 'Hough/Glenville', row: 1, col: 6 },
  { zip: '44110', name: 'Collinwood', row: 1, col: 7 },
  { zip: '44112', name: 'East Cleveland', row: 2, col: 6 },
  { zip: '44105', name: 'Slavic Village', row: 3, col: 4 },
  { zip: '44120', name: 'Shaker Heights', row: 2, col: 5 },
  { zip: '44128', name: 'North Randall', row: 3, col: 5 },
  { zip: '44125', name: 'Garfield Heights', row: 4, col: 4 },
  { zip: '44127', name: 'Newburgh Heights', row: 3, col: 3 },
  { zip: '44134', name: 'Parma', row: 4, col: 2 },
  { zip: '44129', name: 'Parma Heights', row: 4, col: 1 },
  { zip: '44144', name: 'Brooklyn', row: 4, col: 3 },
  { zip: '44119', name: 'Euclid', row: 2, col: 7 },
  { zip: '44143', name: 'Richmond Heights', row: 3, col: 7 },
  { zip: '44121', name: 'South Euclid', row: 3, col: 6 },
];

const getHeatLevel = (count: number): { bg: string; text: string; label: string; showFire: boolean } => {
  if (count === 0) return { bg: 'bg-muted', text: 'text-muted-foreground', label: 'No data', showFire: false };
  if (count <= 5) return { bg: 'bg-primary/10', text: 'text-foreground', label: 'Low', showFire: false };
  if (count <= 15) return { bg: 'bg-primary/20', text: 'text-foreground', label: 'Moderate', showFire: false };
  if (count <= 30) return { bg: 'bg-primary/40', text: 'text-foreground', label: 'Active', showFire: false };
  if (count <= 50) return { bg: 'bg-primary/60', text: 'text-white', label: 'Hot', showFire: false };
  return { bg: 'bg-primary/80', text: 'text-white', label: 'Hot', showFire: true };
};

export const ClevelandHeatGrid: React.FC<ClevelandHeatGridProps> = ({ zipStats, properties }) => {
  const [selectedZip, setSelectedZip] = useState<ZipData | null>(null);

  const getStatsForZip = (zip: string): ZipStats => {
    return zipStats[zip] || {
      leadCount: 0,
      avgBudget: 0,
      voucherPercent: 0,
      conversionRate: 0,
      topProperties: [],
    };
  };

  const propertiesInZip = (zip: string) => {
    return properties.filter(p => p.zip_code === zip);
  };

  // Group by rows for grid layout
  const maxRow = Math.max(...CLEVELAND_ZIPS.map(z => z.row));
  const maxCol = Math.max(...CLEVELAND_ZIPS.map(z => z.col));

  return (
    <>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${maxCol}, minmax(0, 1fr))` }}>
        {Array.from({ length: maxRow * maxCol }, (_, index) => {
          const row = Math.floor(index / maxCol) + 1;
          const col = (index % maxCol) + 1;
          const zipData = CLEVELAND_ZIPS.find(z => z.row === row && z.col === col);

          if (!zipData) {
            return <div key={index} className="aspect-square" />;
          }

          const stats = getStatsForZip(zipData.zip);
          const heat = getHeatLevel(stats.leadCount);

          return (
            <Card
              key={zipData.zip}
              className={cn(
                'p-3 cursor-pointer transition-all hover:scale-105 hover:shadow-lg',
                heat.bg,
                heat.text
              )}
              onClick={() => setSelectedZip(zipData)}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm">{zipData.zip}</span>
                  {heat.showFire && <span>🔥</span>}
                </div>
                <p className="text-xs opacity-80 truncate">{zipData.name}</p>
                <div className="pt-2 space-y-0.5">
                  <p className="text-sm font-semibold">{stats.leadCount} leads</p>
                  {stats.avgBudget > 0 && (
                    <p className="text-xs opacity-80">Avg: ${stats.avgBudget.toLocaleString()}</p>
                  )}
                  <Badge variant="outline" className={cn('text-[10px] mt-1', heat.text)}>
                    {heat.label}
                  </Badge>
                </div>
              </div>
            </Card>
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
                          {propsInZip.length} properties available in this zip code
                        </div>
                      ) : (
                        <div className="text-sm text-amber-600 dark:text-amber-400">
                          ⚠️ No properties listed in this zip — potential opportunity!
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

export default ClevelandHeatGrid;
