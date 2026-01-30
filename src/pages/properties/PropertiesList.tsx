import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const PropertiesList: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Properties</CardTitle>
          <CardDescription>Manage your property listings</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Properties list coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PropertiesList;
