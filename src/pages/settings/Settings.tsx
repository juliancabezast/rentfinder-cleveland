import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OrganizationTab } from '@/components/settings/OrganizationTab';
import { AgentsTab } from '@/components/settings/AgentsTab';
import { LeadCaptureTab } from '@/components/settings/LeadCaptureTab';
import { ScoringTab } from '@/components/settings/ScoringTab';
import { CommunicationsTab } from '@/components/settings/CommunicationsTab';
import { ShowingsTab } from '@/components/settings/ShowingsTab';
import { ComplianceTab } from '@/components/settings/ComplianceTab';
import { IntegrationKeysTab } from '@/components/settings/IntegrationKeysTab';
import { InvestorReportsTab } from '@/components/settings/InvestorReportsTab';
import { DemoDataTab } from '@/components/settings/DemoDataTab';
import { useAuth } from '@/contexts/AuthContext';

const Settings: React.FC = () => {
  const { userRecord } = useAuth();
  const isAdmin = userRecord?.role === 'super_admin' || userRecord?.role === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-muted-foreground">
          Configure your organization preferences
        </p>
      </div>

      <Tabs defaultValue="organization" className="space-y-6">
        <TabsList className="inline-flex flex-wrap h-auto gap-1">
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          <TabsTrigger value="lead-capture">Lead Capture</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="communications">Communications</TabsTrigger>
          <TabsTrigger value="showings">Showings</TabsTrigger>
          <TabsTrigger value="compliance">Compliance</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="investor-reports">Investor Reports</TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="demo-data">Demo Data</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="organization">
          <OrganizationTab />
        </TabsContent>

        <TabsContent value="agents">
          <AgentsTab />
        </TabsContent>

        <TabsContent value="lead-capture">
          <LeadCaptureTab />
        </TabsContent>

        <TabsContent value="scoring">
          <ScoringTab />
        </TabsContent>

        <TabsContent value="communications">
          <CommunicationsTab />
        </TabsContent>

        <TabsContent value="showings">
          <ShowingsTab />
        </TabsContent>

        <TabsContent value="compliance">
          <ComplianceTab />
        </TabsContent>

        <TabsContent value="integrations">
          <IntegrationKeysTab />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="investor-reports">
            <InvestorReportsTab />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="demo-data">
            <DemoDataTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Settings;
