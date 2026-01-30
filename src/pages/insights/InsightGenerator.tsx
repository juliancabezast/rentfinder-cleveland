import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const InsightGenerator: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Insight Generator</CardTitle>
          <CardDescription>AI-powered property and market insights</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Insight generator coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default InsightGenerator;
