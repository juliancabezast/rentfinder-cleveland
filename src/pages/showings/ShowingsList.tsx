import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const ShowingsList: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Showings</CardTitle>
          <CardDescription>Manage property showings and appointments</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Showings calendar coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ShowingsList;
