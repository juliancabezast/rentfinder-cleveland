import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Phone,
  Bot,
  BarChart3,
  Shield,
  Clock,
  Users,
  Building2,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  PlayCircle,
  Star,
  Zap,
  MessageSquare,
  Calendar,
  Globe,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();

  // Si el usuario YA está autenticado, redirigir al dashboard automáticamente
  React.useEffect(() => {
    if (session && !loading) {
      navigate("/dashboard");
    }
  }, [session, loading, navigate]);

  // Si está cargando, mostrar loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const features = [
    {
      icon: <Bot className="h-6 w-6" />,
      title: "AI Voice Agents",
      description: "24/7 intelligent agents that answer calls, qualify leads, and schedule showings in English and Spanish.",
    },
    {
      icon: <Phone className="h-6 w-6" />,
      title: "Smart Follow-ups",
      description: "Automated call and SMS sequences that nurture leads until they're ready to tour.",
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "Lead Scoring",
      description: "AI-powered scoring with explainable reasons so you know exactly who to prioritize.",
    },
    {
      icon: <Calendar className="h-6 w-6" />,
      title: "Showing Management",
      description: "Automated confirmations, reminders, and no-show follow-ups for every appointment.",
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: "Compliance Built-in",
      description: "TCPA-compliant consent tracking, recording disclosures, and complete audit trails.",
    },
    {
      icon: <Users className="h-6 w-6" />,
      title: "Section 8 Ready",
      description: "Specialized handling for voucher holders with verification and inspection tracking.",
    },
  ];

  const stats = [
    { value: "85%", label: "Faster Response Time" },
    { value: "3x", label: "More Showings Booked" },
    { value: "60%", label: "Reduction in No-Shows" },
    { value: "24/7", label: "Lead Coverage" },
  ];

  const testimonials = [
    {
      quote: "We went from missing calls to never missing a lead. Our showing rate doubled in the first month.",
      author: "Sarah M.",
      role: "Property Manager, Cleveland Heights",
      rating: 5,
    },
    {
      quote: "The AI handles Spanish-speaking callers perfectly. We've expanded our reach significantly.",
      author: "Marcus T.",
      role: "Portfolio Owner, Lakewood",
      rating: 5,
    },
    {
      quote: "Finally, a system that understands Section 8. Our voucher-holder placements are up 40%.",
      author: "Linda K.",
      role: "Housing Coordinator",
      rating: 5,
    },
  ];

  const faqItems = [
    {
      question: "How does Rent Finder Cleveland work?",
      answer: "Rent Finder Cleveland uses AI voice agents to answer calls 24/7 in English and Spanish, qualify rental leads automatically, schedule property showings, and follow up with prospects until they're ready to sign a lease. Property managers can track everything from a real-time dashboard — from lead scoring to showing reports to cost analytics.",
    },
    {
      question: "Does Rent Finder Cleveland accept Section 8 vouchers?",
      answer: "Yes! Rent Finder Cleveland specializes in Section 8 housing in Cleveland, Ohio. Our platform tracks voucher amounts, housing authority details (including CMHA), HUD inspection readiness, and voucher expiration dates for every property. We help connect voucher holders with approved rentals across Greater Cleveland.",
    },
    {
      question: "What areas in Cleveland does Rent Finder serve?",
      answer: "Rent Finder Cleveland serves the entire Greater Cleveland metropolitan area including downtown Cleveland, Ohio City, Tremont, Detroit Shoreway, Lakewood, Cleveland Heights, Parma, Brooklyn, Euclid, East Cleveland, Shaker Heights, Garfield Heights, and all surrounding neighborhoods. We cover Cleveland zip codes from 44101 through 44144.",
    },
    {
      question: "Is Rent Finder Cleveland available in Spanish?",
      answer: "¡Sí! Rent Finder Cleveland provides full bilingual support in English and Spanish. Our AI voice agents detect the caller's language automatically and handle the entire conversation — from property questions to showing scheduling — in their preferred language.",
    },
    {
      question: "How much does Rent Finder Cleveland cost for property managers?",
      answer: "Rent Finder Cleveland offers a 14-day free trial with no credit card required. Our plans scale from Starter (up to 10 properties) to Enterprise (unlimited properties with custom integrations). Every plan includes AI voice agents, lead scoring, showing management, and real-time analytics. Contact us for custom pricing.",
    },
    {
      question: "Can I find pet friendly apartments in Cleveland on Rent Finder?",
      answer: "Yes! Every property listing on Rent Finder Cleveland includes detailed pet policy information. You can find pet friendly apartments in Cleveland with specific details about pet deposits, breed restrictions, and weight limits. Our AI agents can also answer pet-related questions during calls.",
    },
  ];

  const neighborhoods = [
    'Ohio City', 'Tremont', 'Lakewood', 'Cleveland Heights', 'Parma',
    'Downtown Cleveland', 'Detroit Shoreway', 'Brooklyn', 'Euclid', 'Shaker Heights'
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ============ NAVIGATION ============ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo - left */}
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary-foreground" aria-hidden="true" />
              </div>
              <span className="font-bold text-xl text-foreground leading-none">Rent Finder</span>
            </Link>

            {/* Nav Links - center - MUST have items-center and h-full */}
            <div className="hidden md:flex items-center gap-8 h-full">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center h-full">
                Features
              </a>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center h-full">
                How It Works
              </a>
              <a href="#testimonials" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center h-full">
                Testimonials
              </a>
              <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center h-full">
                FAQ
              </a>
              <Link to="/p/properties" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center h-full">
                Browse Listings
              </Link>
            </div>

            {/* Auth Buttons - right */}
            <div className="flex items-center gap-3">
              <Button variant="ghost" asChild>
                <Link to="/auth/login">Log In</Link>
              </Button>
              <Button asChild className="hidden sm:flex">
                <Link to="/auth/login">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main>
        {/* ============ HERO SECTION ============ */}
        <article>
          <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-32 overflow-hidden">
            {/* Background blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
              <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
              <div className="absolute top-1/2 -left-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
            </div>

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-4xl mx-auto">
                <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm">
                  <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
                  AI-Powered Lead Management
                </Badge>
                
                {/* H1 with primary keyword */}
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight">
                  <span className="text-primary bg-gradient-to-r from-primary to-primary/70 bg-clip-text">
                    Rent Finder Cleveland
                  </span>
                  {" "}— Find Your Next Home, Faster
                </h1>
                
                <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
                  The smartest way to find apartments for rent in Cleveland, Ohio. 
                  AI-powered search, instant showings, Section 8 approved properties, 
                  and 24/7 bilingual support. Built for Cleveland renters and property managers.
                </p>

                <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" asChild className="text-base px-8">
                    <Link to="/auth/login">
                      Start Free Trial
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="text-base px-8">
                    <PlayCircle className="mr-2 h-5 w-5" />
                    Watch Demo
                  </Button>
                </div>

                {/* Trust badges */}
                <div className="mt-12 flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
                    No credit card required
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
                    14-day free trial
                  </div>
                  <div className="flex items-center gap-2">
                    <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
                    English & Spanish
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
                {stats.map((stat, index) => (
                  <div key={index} className="text-center">
                    <p className="text-3xl sm:text-4xl font-bold text-primary">{stat.value}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </article>

        {/* ============ FEATURES SECTION ============ */}
        <section id="features" className="py-20 sm:py-32 bg-muted/30" aria-labelledby="features-heading">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <Badge variant="outline" className="mb-4">
                Features
              </Badge>
              <h2 id="features-heading" className="text-3xl sm:text-4xl font-bold text-foreground">
                Why Cleveland Property Managers Choose Rent Finder
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                From first call to signed lease, Rent Finder Cleveland automates your entire rental lead lifecycle so you can fill vacancies faster across Cleveland, Ohio.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <Card key={index} variant="glass" className="p-6 hover:shadow-lg transition-all duration-300">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-4" aria-hidden="true">
                    {feature.icon}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ============ HOW IT WORKS ============ */}
        <section id="how-it-works" className="py-20 sm:py-32" aria-labelledby="how-it-works-heading">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <Badge variant="outline" className="mb-4">
                How It Works
              </Badge>
              <h2 id="how-it-works-heading" className="text-3xl sm:text-4xl font-bold text-foreground">
                How Rent Finder Cleveland Works — From Lead to Lease
              </h2>
            </div>

            <div className="grid md:grid-cols-4 gap-8">
              {[
                { step: "1", icon: <Phone className="h-6 w-6" />, title: "Lead Calls In", desc: "AI answers 24/7, qualifies the prospect, and captures their needs" },
                { step: "2", icon: <MessageSquare className="h-6 w-6" />, title: "Smart Nurturing", desc: "Automated follow-ups via call and SMS until they're ready to tour" },
                { step: "3", icon: <Calendar className="h-6 w-6" />, title: "Showing Booked", desc: "AI schedules, confirms, and sends reminders with directions" },
                { step: "4", icon: <CheckCircle2 className="h-6 w-6" />, title: "Lease Signed", desc: "Track the full journey from first call to move-in day" },
              ].map((item, index) => (
                <div key={index} className="relative">
                  <div className="text-center">
                    <div className="relative inline-flex">
                      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto" aria-hidden="true">
                        {item.icon}
                      </div>
                      <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                        {item.step}
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-foreground">{item.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{item.desc}</p>
                  </div>

                  {index < 3 && (
                    <div className="hidden md:block absolute top-8 left-[60%] w-[80%] border-t-2 border-dashed border-border" aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============ TESTIMONIALS ============ */}
        <section id="testimonials" className="py-20 sm:py-32 bg-muted/30" aria-labelledby="testimonials-heading">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <Badge variant="outline" className="mb-4">
                Testimonials
              </Badge>
              <h2 id="testimonials-heading" className="text-3xl sm:text-4xl font-bold text-foreground">
                Trusted by Cleveland Property Managers and Landlords
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <Card key={index} variant="glass" className="p-6">
                  <div className="flex gap-1 mb-4" aria-label={`${testimonial.rating} out of 5 stars`}>
                    {Array.from({ length: testimonial.rating }).map((_, i) => (
                      <Star key={i} className="h-5 w-5 fill-accent text-accent" aria-hidden="true" />
                    ))}
                  </div>
                  <blockquote>
                    <p className="text-foreground italic mb-6">"{testimonial.quote}"</p>
                    <footer>
                      <p className="font-semibold text-foreground">{testimonial.author}</p>
                      <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                    </footer>
                  </blockquote>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ============ FAQ SECTION ============ */}
        <section id="faq" className="py-20 sm:py-32" aria-labelledby="faq-heading">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <Badge variant="outline" className="mb-4">
                <HelpCircle className="h-4 w-4 mr-2" aria-hidden="true" />
                FAQ
              </Badge>
              <h2 id="faq-heading" className="text-3xl sm:text-4xl font-bold text-foreground">
                Frequently Asked Questions About Rent Finder Cleveland
              </h2>
            </div>

            <Accordion type="single" collapsible className="w-full space-y-4">
              {faqItems.map((item, index) => (
                <AccordionItem 
                  key={index} 
                  value={`item-${index}`}
                  className="bg-card rounded-lg border px-6"
                >
                  <AccordionTrigger className="text-left font-medium hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ============ CTA SECTION ============ */}
        <section className="py-20 sm:py-32" aria-labelledby="cta-heading">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <Card variant="gradient" className="relative overflow-hidden p-8 sm:p-12 lg:p-16">
              {/* Background pattern */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div className="absolute -top-20 -right-20 w-60 h-60 bg-primary/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-accent/20 rounded-full blur-3xl" />
              </div>
              
              <div className="relative text-center max-w-2xl mx-auto">
                <Zap className="h-12 w-12 text-primary mx-auto mb-6" aria-hidden="true" />
                <h2 id="cta-heading" className="text-3xl sm:text-4xl font-bold text-foreground">
                  Start Finding Renters in Cleveland Today
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  Join property managers across Cleveland, Ohio who are filling vacancies 3x faster with Rent Finder Cleveland's AI-powered platform.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" asChild className="text-base px-8">
                    <Link to="/auth/login">
                      Start Your Free Trial
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="text-base px-8">
                    Schedule a Demo
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="py-8 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Neighborhood Links for Local SEO */}
          <div className="mb-8 pb-8 border-b border-border">
            <p className="text-sm font-medium text-foreground mb-4">
              Find apartments in popular Cleveland neighborhoods:
            </p>
            <div className="flex flex-wrap gap-2">
              {neighborhoods.map((neighborhood) => (
                <Link
                  key={neighborhood}
                  to={`/p/properties?area=${encodeURIComponent(neighborhood)}`}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-muted text-sm text-muted-foreground hover:text-primary hover:bg-muted/80 transition-colors leading-none"
                >
                  Apartments in {neighborhood}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-6 min-h-[48px]">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Building2 className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
              </div>
              <span className="font-semibold text-foreground">Rent Finder Cleveland</span>
            </Link>
            
            <nav className="flex items-center gap-6 text-sm text-muted-foreground" aria-label="Footer navigation">
              <Link to="/p/privacy-policy" className="hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <span className="cursor-pointer hover:text-foreground transition-colors">Terms of Service</span>
              <span className="cursor-pointer hover:text-foreground transition-colors">Contact</span>
            </nav>
            
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Rent Finder Cleveland. All rights reserved.
            </p>
          </div>

          {/* SEO Footer Text */}
          <p className="mt-8 text-xs text-muted-foreground/70 text-center max-w-4xl mx-auto leading-relaxed">
            Rent Finder Cleveland is Cleveland, Ohio's leading AI-powered apartment finder and 
            rental property management platform. Find apartments for rent in Cleveland including 
            Section 8 approved rentals, pet friendly apartments, and HUD housing. Serving Ohio City, 
            Tremont, Lakewood, Cleveland Heights, Parma, Downtown Cleveland, Detroit Shoreway, 
            Euclid, Shaker Heights, and all Greater Cleveland neighborhoods. 
            Available in English and Spanish.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;