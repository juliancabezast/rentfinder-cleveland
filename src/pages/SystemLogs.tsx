import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SystemLogs: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>System Logs</CardTitle>
          <CardDescription>Review system events and operational alerts.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-8 text-center">
            System logs viewer coming soon...
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemLogs;
