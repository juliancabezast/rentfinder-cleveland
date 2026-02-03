import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import OrganizationTab from '@/components/settings/OrganizationTab';
import AgentsTab from '@/components/settings/AgentsTab';
import LeadCaptureTab from '@/components/settings/LeadCaptureTab';
import ScoringTab from '@/components/settings/ScoringTab';
import CommunicationsTab from '@/components/settings/CommunicationsTab';
import ShowingsTab from '@/components/settings/ShowingsTab';
import ComplianceTab from '@/components/settings/ComplianceTab';
import IntegrationKeysTab from '@/components/settings/IntegrationKeysTab';
import InvestorReportsTab from '@/components/settings/InvestorReportsTab';
import DemoDataTab from '@/components/settings/DemoDataTab';
import { useAuth } from '@/contexts/AuthContext';

const Settings: React.FC = () => {
  const { userRecord } = useAuth();
  const isAdmin = userRecord?.role === 'super_admin' || userRecord?.role === 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          Settings
        </h1>
        <p className="text-muted-foreground">
          Configure organization settings and preferences
        </p>
      </div>

      <Tabs defaultValue="organization" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0">
          <TabsTrigger
            value="organization"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Organization
          </TabsTrigger>
          <TabsTrigger
            value="agents"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Agents
          </TabsTrigger>
          <TabsTrigger
            value="lead-capture"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Lead Capture
          </TabsTrigger>
          <TabsTrigger
            value="scoring"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Scoring
          </TabsTrigger>
          <TabsTrigger
            value="communications"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Communications
          </TabsTrigger>
          <TabsTrigger
            value="showings"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Showings
          </TabsTrigger>
          <TabsTrigger
            value="compliance"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Compliance
          </TabsTrigger>
          <TabsTrigger
            value="integrations"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            Integrations
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              value="investor-reports"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Investor Reports
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger
              value="demo-data"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Demo Data
            </TabsTrigger>
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
