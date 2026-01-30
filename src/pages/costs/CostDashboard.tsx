import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const CostDashboard: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Cost Dashboard</CardTitle>
          <CardDescription>Track costs per lead, property, and service</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Cost dashboard coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CostDashboard;
