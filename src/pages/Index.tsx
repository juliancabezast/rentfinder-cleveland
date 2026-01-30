import { Building2, Phone, Users, BarChart3, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold text-primary">Rent Finder Cleveland</span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Features
            </a>
            <a href="#about" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              About
            </a>
            <Button variant="outline" size="sm">
              Sign In
            </Button>
            <Button size="sm">
              Get Started
            </Button>
          </nav>
          <Button variant="outline" size="sm" className="md:hidden">
            Menu
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
            AI-Powered Lead Management for{" "}
            <span className="text-primary">Property Management</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Automate your entire lead lifecycle from initial contact through showing completion. 
            Intelligent voice agents, automated follow-ups, and real-time analytics.
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" className="w-full sm:w-auto">
              Start Free Trial
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              <Phone className="mr-2 h-4 w-4" />
              Schedule Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
            Everything You Need to Convert Leads
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            From the first call to lease signing, our platform handles it all.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="shadow-card transition-shadow hover:shadow-card-hover">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Phone className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="mt-4">AI Voice Agents</CardTitle>
              <CardDescription>
                Bilingual AI agents handle inbound calls 24/7, answering questions and capturing leads.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="shadow-card transition-shadow hover:shadow-card-hover">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/20">
                <Zap className="h-6 w-6 text-accent" />
              </div>
              <CardTitle className="mt-4">Automated Follow-ups</CardTitle>
              <CardDescription>
                Smart recapture sequences that re-engage leads at the perfect time with personalized outreach.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="shadow-card transition-shadow hover:shadow-card-hover">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
                <Users className="h-6 w-6 text-success" />
              </div>
              <CardTitle className="mt-4">Lead Scoring</CardTitle>
              <CardDescription>
                AI-powered scoring identifies your hottest leads so you can prioritize high-value prospects.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="shadow-card transition-shadow hover:shadow-card-hover">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
                <Building2 className="h-6 w-6 text-warning" />
              </div>
              <CardTitle className="mt-4">Showing Management</CardTitle>
              <CardDescription>
                Schedule, confirm, and track property showings with automated reminders and no-show follow-ups.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="shadow-card transition-shadow hover:shadow-card-hover">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="mt-4">Real-time Analytics</CardTitle>
              <CardDescription>
                Track conversion rates, cost per lead, and gain insights into what's working across your portfolio.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="shadow-card transition-shadow hover:shadow-card-hover">
            <CardHeader>
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="mt-4">Compliance Built-in</CardTitle>
              <CardDescription>
                TCPA-compliant communications, consent tracking, and Fair Housing Act compliant scoring.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-primary py-16">
        <div className="container mx-auto px-4">
          <div className="grid gap-8 text-center sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-4xl font-bold text-primary-foreground">24/7</div>
              <div className="mt-2 text-primary-foreground/80">AI Agent Availability</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-accent">85%</div>
              <div className="mt-2 text-primary-foreground/80">Lead Response Rate</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-primary-foreground">3x</div>
              <div className="mt-2 text-primary-foreground/80">Faster Follow-ups</div>
            </div>
            <div>
              <div className="text-4xl font-bold text-accent">50%</div>
              <div className="mt-2 text-primary-foreground/80">More Showings</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16">
        <Card className="mx-auto max-w-2xl bg-card text-center shadow-card">
          <CardContent className="py-12">
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl">
              Ready to Transform Your Lead Management?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Join property managers who are converting more leads with less effort.
            </p>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button size="lg">
                Start Your Free Trial
              </Button>
              <Button size="lg" variant="outline">
                Contact Sales
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t bg-card py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              <span className="text-lg font-semibold text-foreground">Rent Finder Cleveland</span>
            </div>
            <nav className="flex flex-wrap justify-center gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Terms of Service
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Contact
              </a>
            </nav>
            <div className="text-sm text-muted-foreground">
              © 2025 Rent Finder Cleveland. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
