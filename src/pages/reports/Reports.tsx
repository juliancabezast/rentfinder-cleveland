import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const Reports: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardDescription>Analytics and performance metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Reports dashboard coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
