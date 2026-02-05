import React, { useState } from "react";
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
  Users,
  Building2,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  PlayCircle,
  Star,
  Zap,
  Loader2,
  HelpCircle,
  Calendar,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DemoRequestDialog } from "@/components/landing/DemoRequestDialog";
import AustinChatWidget from "@/components/landing/AustinChatWidget";
import SocialProofToast from "@/components/landing/SocialProofToast";
import AnimatedStats from "@/components/landing/AnimatedStats";
import RotatingHeroText from "@/components/landing/RotatingHeroText";
import FloatingBackground from "@/components/landing/FloatingBackground";
import HowItWorksSection from "@/components/landing/HowItWorksSection";

const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [showDemoDialog, setShowDemoDialog] = useState(false);

  // Redirect authenticated users to dashboard
  React.useEffect(() => {
    if (session && !loading) {
      navigate("/dashboard");
    }
  }, [session, loading, navigate]);

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
      description: "24/7 intelligent agents that answer calls, qualify leads, and schedule showings automatically.",
    },
    {
      icon: <Phone className="h-6 w-6" />,
      title: "Smart Follow-ups",
      description: "Automated call and SMS sequences that nurture leads through your entire funnel.",
    },
    {
      icon: <BarChart3 className="h-6 w-6" />,
      title: "Lead Scoring",
      description: "AI-powered scoring with explainable reasons so your team knows exactly who to prioritize.",
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
      description: "Specialized handling for voucher holders with verification and housing authority tracking.",
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
      quote: "We went from missing 40% of calls to responding to every lead in under 30 seconds. Our vacancy time dropped by half.",
      author: "Sarah M.",
      role: "Property Manager, 85 units in Cleveland Heights",
      rating: 5,
    },
    {
      quote: "The AI follow-up sequences are incredible. Leads that would have gone cold are now showing up for tours.",
      author: "Marcus T.",
      role: "Portfolio Owner, Lakewood",
      rating: 5,
    },
    {
      quote: "Finally, a system that understands Section 8. Our voucher-holder placements are up 40% and the compliance tracking gives us peace of mind.",
      author: "Linda K.",
      role: "Housing Coordinator, 200+ units",
      rating: 5,
    },
  ];

  const faqItems = [
    {
      question: "What is Rent Finder Cleveland?",
      answer: "Rent Finder Cleveland is an AI leasing assistant that automates lead management for property managers in Cleveland. Our platform handles inbound calls, qualifies leads, schedules showings, and follows up automatically — so you never miss a prospect.",
    },
    {
      question: "How does the AI voice agent work?",
      answer: "When a prospect calls your Twilio number, our AI answers instantly, qualifies them by asking about their timeline, budget, and requirements, captures their information, and schedules a showing — all without human intervention. Works 24/7, including nights and weekends.",
    },
    {
      question: "Is Rent Finder TCPA compliant?",
      answer: "Absolutely. We have built-in consent tracking, recording disclosures at the start of every call, opt-out handling via STOP keywords, working hours enforcement, and a complete audit trail for every communication. Your compliance is our priority.",
    },
    {
      question: "Does it work with Section 8 voucher holders?",
      answer: "Yes! We specialize in Section 8 housing. Our platform tracks voucher amounts, housing authority details, HUD inspection readiness, and voucher expiration dates for every lead so you can match them to the right properties.",
    },
    {
      question: "How much does Rent Finder cost?",
      answer: "We offer a 14-day free trial with no credit card required. After that, plans scale from Starter (up to 10 properties) to Enterprise (unlimited properties with custom integrations). Contact us for detailed pricing.",
    },
    {
      question: "Can I integrate it with my existing tools?",
      answer: "Yes! Rent Finder integrates with Doorloop for property management, Twilio for communications, and offers an API for custom integrations. We're constantly adding new integrations based on customer feedback.",
    },
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
              <span className="font-bold text-xl text-foreground leading-none">Rent Finder Cleveland</span>
            </Link>

            {/* Nav Links - center */}
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
            </div>

            {/* Auth Buttons - right */}
            <div className="flex items-center gap-3">
              <Button variant="ghost" asChild>
                <Link to="/auth/login">Log In</Link>
              </Button>
              <Button className="hidden sm:flex" onClick={() => setShowDemoDialog(true)}>
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main>
        {/* ============ HERO SECTION ============ */}
        <article>
          <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-32 overflow-hidden">
            {/* Floating background with glass elements */}
            <FloatingBackground />

            <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="text-center max-w-4xl mx-auto">
                <Badge variant="secondary" className="mb-6 px-4 py-1.5 text-sm">
                  <Sparkles className="h-4 w-4 mr-2" aria-hidden="true" />
                  AI-Powered Leasing Automation
                </Badge>
                
                {/* H1 with target keyword */}
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground tracking-tight">
                  The{" "}
                  <span className="text-primary bg-gradient-to-r from-primary to-primary/70 bg-clip-text">
                    AI Leasing Assistant
                  </span>
                  {" "}That <RotatingHeroText />
                </h1>
                
                <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
                  Rent Finder Cleveland automates lead qualification, follow-ups, and showing scheduling for property managers. Respond to every lead in under 30 seconds, 24/7.
                </p>

                <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                  <Button size="lg" className="text-base px-8" onClick={() => setShowDemoDialog(true)}>
                    Start Your Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
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
                    <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
                    TCPA Compliant
                  </div>
                </div>
              </div>

              {/* Animated Stats row */}
              <AnimatedStats stats={stats} />
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
                Why Property Managers Choose Rent Finder Cleveland
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                From first call to signed lease, our AI leasing assistant automates your entire rental lead lifecycle so you can fill vacancies faster.
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

        {/* ============ HOW IT WORKS - Interactive ============ */}
        <HowItWorksSection />

        {/* ============ TESTIMONIALS ============ */}
        <section id="testimonials" className="py-20 sm:py-32 bg-muted/30" aria-labelledby="testimonials-heading">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <Badge variant="outline" className="mb-4">
                Testimonials
              </Badge>
              <h2 id="testimonials-heading" className="text-3xl sm:text-4xl font-bold text-foreground">
                Trusted by Cleveland Property Managers
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
                Frequently Asked Questions
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
                  Start Filling Vacancies Faster Today
                </h2>
                <p className="mt-4 text-lg text-muted-foreground">
                  Join property managers across Cleveland who are converting 3x more leads with AI-powered leasing automation.
                </p>
                <div className="mt-8 flex justify-center">
                  <Button size="lg" className="text-base px-8" onClick={() => setShowDemoDialog(true)}>
                    Start Your Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </section>
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="py-12 border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Building2 className="h-4 w-4 text-primary-foreground" aria-hidden="true" />
              </div>
              <span className="font-semibold text-foreground">Rent Finder Cleveland</span>
            </Link>
            
            <nav className="flex items-center gap-6 text-sm" aria-label="Footer navigation">
              <Link to="/p/privacy-policy" className="text-muted-foreground hover:text-foreground transition-colors">
                Privacy Policy
              </Link>
              <Link to="/p/terms-of-service" className="text-muted-foreground hover:text-foreground transition-colors">
                Terms of Service
              </Link>
              <a href="tel:2166308857" className="text-muted-foreground hover:text-foreground transition-colors">
                Contact
              </a>
            </nav>
            
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Rent Finder Cleveland. All rights reserved.
            </p>
          </div>

          {/* SEO Footer Text */}
          <p className="mt-8 text-xs text-muted-foreground/70 text-center max-w-4xl mx-auto leading-relaxed">
            Rent Finder Cleveland is an AI-powered leasing automation platform for property managers in Cleveland, Ohio and across the United States. Automate lead qualification, follow-ups, and showing scheduling with intelligent voice agents and TCPA-compliant communications.
          </p>

          {/* Compliance Text */}
          <p className="mt-4 text-xs text-muted-foreground/50 text-center max-w-4xl mx-auto leading-relaxed">
            Rent Finder Cleveland operates in compliance with federal and state regulations including the Fair Housing Act, TCPA (Telephone Consumer Protection Act), and Ohio Revised Code. All automated communications require prior express consent. Cleveland, Ohio, United States.
          </p>
        </div>
      </footer>

      {/* Demo Request Dialog */}
      <DemoRequestDialog open={showDemoDialog} onOpenChange={setShowDemoDialog} />
 
       {/* Austin Chat Widget */}
       <AustinChatWidget />

      {/* Social Proof Toast */}
      <SocialProofToast />
    </div>
  );
};

export default LandingPage;