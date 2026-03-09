import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Building2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const FloatingShape = ({
  className,
  delay = 0,
  duration = 20,
}: {
  className?: string;
  delay?: number;
  duration?: number;
}) => (
  <div
    className={`absolute rounded-full blur-3xl ${className}`}
    style={{ animation: `stark-float ${duration}s ease-in-out ${delay}s infinite` }}
  />
);

const ParticleField = () => {
  const [particles] = useState(() =>
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 5,
      twinkleDur: 3 + Math.random() * 2,
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-primary-foreground"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: 0.16,
            animation: `stark-twinkle ${p.twinkleDur}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
};

function useFadeIn(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );

    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return { ref, visible };
}

const FadeIn = ({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) => {
  const { ref, visible } = useFadeIn();

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

const UrgentStat = ({ value, description }: { value: string; description: string }) => {
  const { ref, visible } = useFadeIn(0.5);
  const [displayValue, setDisplayValue] = useState("0");
  
  useEffect(() => {
    if (!visible) return;
    
    const match = value.match(/^(\d+)(.*)$/);
    if (!match) {
      setDisplayValue(value);
      return;
    }
    
    const target = parseInt(match[1], 10);
    const suffix = match[2];
    const duration = 1500;
    const startTime = performance.now();
    
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
      
      const currentVal = Math.round(easeOutCubic(progress) * target);
      setDisplayValue(`${currentVal}${suffix}`);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };
    
    requestAnimationFrame(animate);
  }, [visible, value]);

  return (
    <div ref={ref} className="flex flex-col items-center gap-3 text-center">
      <span className="text-6xl sm:text-7xl font-bold text-destructive drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]">
        {displayValue}
      </span>
      <p className="text-base sm:text-lg text-muted-foreground/80 leading-snug max-w-[250px] mx-auto">
        {description}
      </p>
    </div>
  );
};

const GRID_ITEMS = [
  { title: "Curious Since Day One", subtitle: "1998, Colombia" },
  { title: "Born to Perform", subtitle: "Always on stage, Bogotá" },
  { title: "2nd Place, Latam Digital Awards", subtitle: "Best Press Media Strategy (2017)" },
  { title: "Speaker & Strategist", subtitle: "Digital marketing conferences, Colombia" },
  { title: "Project Manager — Software Building", subtitle: "Ladrillera 21, Colombia (2017)" },
  { title: "Content Creator", subtitle: "+100K reproductions on YouTube" },
];

const StarktankPage = () => {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  useEffect(() => {
    const handleScroll = () => setShowScrollIndicator(window.scrollY < 100);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="overflow-x-hidden bg-background text-foreground">
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(145deg, hsl(var(--foreground)) 0%, hsl(var(--secondary-foreground)) 45%, hsl(var(--card-foreground)) 100%)",
          }}
        />

        <FloatingShape className="w-[600px] h-[600px] bg-primary/25 -top-40 -left-40" duration={25} />
        <FloatingShape className="w-[500px] h-[500px] bg-accent/20 top-1/3 -right-20" duration={30} delay={2} />
        <FloatingShape className="w-[400px] h-[400px] bg-info/25 bottom-20 left-1/4" duration={22} delay={1} />
        <FloatingShape className="w-[350px] h-[350px] bg-primary/20 top-1/2 left-1/2" duration={28} delay={3} />

        <ParticleField />

        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--primary-foreground) / 0.14) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary-foreground) / 0.14) 1px, transparent 1px)",
            backgroundSize: "52px 52px",
          }}
        />
      </div>

      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20 text-primary-foreground">
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-foreground/10 border border-primary-foreground/20 backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium tracking-widest text-accent uppercase">STARK TANK 2026</span>
          </div>

          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl ring-1 ring-primary-foreground/20 bg-gradient-to-br from-primary to-accent">
              <Building2 className="w-10 h-10 text-primary-foreground" />
            </div>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-primary-foreground via-primary-foreground to-primary-foreground/70 bg-clip-text text-transparent">
              Rent Finder
            </span>
            <br />
            <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">Cleveland</span>
          </h1>

          <p className="text-xl sm:text-2xl md:text-3xl text-primary-foreground/80 font-light max-w-2xl mx-auto leading-relaxed">
            AI-Powered Lead Management for Property Managers
          </p>

          <div className="pt-6 space-y-3">
            <p className="text-lg sm:text-xl text-primary-foreground font-medium">
              Julian Cabezas — Solo Founder, Developer &amp; Operator | Stark State College
            </p>
          </div>

          <p className="text-base sm:text-lg text-primary-foreground/65 italic max-w-xl mx-auto pt-4">
            International Student. Trilingual. Award-winning digital strategist turned tech founder.
          </p>
        </div>

        <div
          className={`absolute bottom-10 left-1/2 -translate-x-1/2 transition-opacity duration-500 ${
            showScrollIndicator ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex flex-col items-center gap-2 text-primary-foreground/65">
            <span className="text-xs uppercase tracking-widest">Scroll</span>
            <ChevronDown className="w-5 h-5 animate-bounce" />
          </div>
        </div>
      </section>

      <section className="relative bg-card text-card-foreground py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 uppercase tracking-widest text-xs">
              Why Me
            </Badge>
            <p className="text-xl sm:text-2xl text-muted-foreground font-light italic max-w-3xl mx-auto leading-relaxed">
              "I've been building, marketing, and shipping products for years. This isn't my first time — it's my biggest bet."
            </p>
          </FadeIn>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-16">
            {GRID_ITEMS.map((item, i) => (
              <FadeIn key={item.title} delay={i * 80}>
                <div className="group flex flex-col gap-3">
                  <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden border border-border shadow-modern-sm bg-muted">
                    <div className="w-full h-full flex items-center justify-center transition-transform duration-500 group-hover:scale-105 bg-gradient-to-br from-muted to-secondary">
                      <span className="text-muted-foreground text-sm font-medium select-none">Photo {i + 1}</span>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-card-foreground leading-tight">{item.title}</h3>
                    <p className="text-muted-foreground text-sm mt-0.5">{item.subtitle}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn>
            <div className="max-w-4xl mx-auto bg-background p-8 sm:p-10 rounded-3xl border border-border shadow-modern-sm">
              <p className="text-lg sm:text-xl leading-relaxed text-muted-foreground">
                I'm originally from Bogotá, Colombia. I speak three languages — Spanish, English, and Portuguese. I started my first business at 22, building over 19 websites during the pandemic. I ran a digital agency, led communications for TEDx Bogotá, won a Latam Digital Award, and created campaigns for brands like Avianca and Motorola reaching over 1.5 million people. Now I'm a student at Stark State College and a member of the Student Government Association, channeling everything I've learned into Rent Finder Cleveland.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      <section className="relative py-20 px-6" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
        <div className="max-w-6xl mx-auto text-center">
          <FadeIn>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-6">
              The Problem: <span className="text-destructive drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]">Leads Are Dying</span>
            </h2>
          </FadeIn>

          <FadeIn delay={200}>
            <p className="text-xl max-w-4xl mx-auto mb-16 leading-relaxed" style={{ color: '#cbd5e1' }}>
              When someone inquires about a rental, most property managers take over 24 hours to respond — if they respond at all. Most small and mid-size managers track leads on spreadsheets, sticky notes, or not at all. By the time they follow up, the prospect is gone.
            </p>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            <FadeIn delay={400}>
              <UrgentStat value="67%" description="of rental inquiries never receive a response within 24 hours" />
            </FadeIn>
            <FadeIn delay={600}>
              <UrgentStat value="7x" description="Leads contacted within 1 hour are 7x more likely to convert" />
            </FadeIn>
            <FadeIn delay={800}>
              <UrgentStat value="100x" description="Agents who reply within 5 minutes are 100x more likely to close" />
            </FadeIn>
          </div>

          <FadeIn delay={1000}>
            <div className="text-sm space-y-1" style={{ color: '#64748b' }}>
              <p>Source: NS Propertese, 'How to Track Rental Leads' (2025)</p>
              <p>Source: RubixOne, 'Real Estate Lead Response Time' (2025)</p>
            </div>
          </FadeIn>
        </div>
      </section>

      <style>{`
        @keyframes stark-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(30px, -30px) scale(1.05); }
          50% { transform: translate(-20px, 20px) scale(0.95); }
          75% { transform: translate(20px, 10px) scale(1.02); }
        }

        @keyframes stark-twinkle {
          0%, 100% { opacity: 0.1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.5); }
        }
      `}</style>
    </div>
  );
};

export default StarktankPage;
