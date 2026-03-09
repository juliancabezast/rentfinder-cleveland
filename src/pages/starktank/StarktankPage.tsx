import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Building2, PhoneIncoming, Bot, BarChart3, CalendarCheck, Home, Users, Landmark, MapPin, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import photo5 from "@/assets/starktank/photo-5.jpeg";
import photo4 from "@/assets/starktank/photo-4.jpg";
import photo1 from "@/assets/starktank/photo-1.png";
import photo2 from "@/assets/starktank/photo-2.png";
import photo6 from "@/assets/starktank/photo-6.jpg";
import photo3 from "@/assets/starktank/photo-3.png";
import dashboardImg from "@/assets/starktank/dashboard-traction.png";
import slide01 from "@/assets/starktank/slides/slide-01.png";
import slide02 from "@/assets/starktank/slides/slide-02.png";
import slide03 from "@/assets/starktank/slides/slide-03.png";
import slide04 from "@/assets/starktank/slides/slide-04.png";
import slide05 from "@/assets/starktank/slides/slide-05.png";
import slide06 from "@/assets/starktank/slides/slide-06.png";
import slide07 from "@/assets/starktank/slides/slide-07.png";
import slide08 from "@/assets/starktank/slides/slide-08.png";
import slide09 from "@/assets/starktank/slides/slide-09.png";
import slide10 from "@/assets/starktank/slides/slide-10.png";

const PITCH_SLIDES = [
  { src: slide01, title: "AI-Powered Lead Management" },
  { src: slide02, title: "Why Me" },
  { src: slide03, title: "The Problem" },
  { src: slide04, title: "A Massive Market" },
  { src: slide05, title: "What We Do" },
  { src: slide06, title: "AI Is Exploding" },
  { src: slide07, title: "Everyone Wins" },
  { src: slide08, title: "Real Traction" },
  { src: slide09, title: "Revenue Model" },
  { src: slide10, title: "Thank You" },
];

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

const MarketBars = () => {
  const { ref, visible } = useFadeIn(0.3);
  const bars = [
    { label: "2025", value: 40.19, max: 88.37, color: "hsl(190,80%,50%)" },
    { label: "2032", value: 88.37, max: 88.37, color: "hsl(170,70%,45%)" },
  ];

  return (
    <div ref={ref} className="flex items-end gap-6 sm:gap-10 h-[220px]">
      {bars.map((bar) => {
        const heightPct = (bar.value / bar.max) * 85;
        return (
          <div key={bar.label} className="flex flex-col items-center gap-2 flex-1">
            <span className="text-xl sm:text-2xl font-bold" style={{ color: bar.color }}>
              ${bar.value}B
            </span>
            <div className="w-full max-w-[80px] rounded-t-xl relative" style={{
              backgroundColor: bar.color,
              height: visible ? `${heightPct}%` : '0%',
              transition: 'height 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
              transitionDelay: bar.label === '2032' ? '0.3s' : '0s',
              boxShadow: `0 0 30px ${bar.color}40`,
            }} />
            <span className="text-sm font-medium" style={{ color: '#94a3b8' }}>{bar.label}</span>
          </div>
        );
      })}
    </div>
  );
};

const GRID_ITEMS = [
  { title: "Curious Since Day One", subtitle: "1998, Colombia", image: photo1 },
  { title: "Born to Perform", subtitle: "Always on stage, Bogotá", image: photo2 },
  { title: "2nd Place, Latam Digital Awards", subtitle: "Best Press Media Strategy (2017)", image: photo3 },
  { title: "Speaker & Strategist", subtitle: "Digital marketing conferences, Colombia", image: photo4 },
  { title: "Project Manager — Software Building", subtitle: "Ladrillera 21, Colombia (2017)", image: photo5 },
  { title: "Content Creator", subtitle: "+100K reproductions on YouTube", image: photo6 },
];

const TractionStat = ({ value, label, sub, prefix = "", suffix = "" }: { value: string; label: string; sub?: string; prefix?: string; suffix?: string }) => {
  const { ref, visible } = useFadeIn(0.3);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!visible) return;
    const target = parseInt(value, 10);
    const duration = 1800;
    const start = performance.now();
    const animate = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setDisplay(`${prefix}${Math.round(ease * target).toLocaleString()}${suffix}`);
      if (p < 1) requestAnimationFrame(animate);
      else setDisplay(`${prefix}${target.toLocaleString()}${suffix}`);
    };
    requestAnimationFrame(animate);
  }, [visible, value, prefix, suffix]);

  return (
    <div ref={ref} className="text-center space-y-1">
      <span className="text-4xl sm:text-5xl md:text-6xl font-bold text-[hsl(160,70%,40%)]">{display}</span>
      <p className="text-sm sm:text-base font-semibold text-foreground">{label}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
};

const CITIES = ["Cleveland", "Akron", "North Canton", "Canton", "Youngstown", "Elyria", "Medina", "Mansfield"];

const RotatingCity = () => {
  const [index, setIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setAnimating(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % CITIES.length);
        setAnimating(false);
      }, 400);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="inline-block relative overflow-hidden" style={{ minWidth: '5ch' }}>
      <span
        className="inline-block text-[#5856e6] transition-all duration-400"
        style={{
          transform: animating ? 'translateY(-100%)' : 'translateY(0)',
          opacity: animating ? 0 : 1,
          transition: 'transform 0.4s ease-in-out, opacity 0.4s ease-in-out',
        }}
      >
        {CITIES[index]}
      </span>
    </span>
  );
};

const PitchDeckCarousel = () => {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(1); // 1 = forward, -1 = back
  const [isFlipping, setIsFlipping] = useState(false);
  const total = PITCH_SLIDES.length;
  const touchStart = useRef(0);
  const autoTimer = useRef<ReturnType<typeof setInterval>>();

  const go = (dir: number) => {
    if (isFlipping) return;
    setDirection(dir);
    setIsFlipping(true);
    setTimeout(() => {
      setCurrent((p) => (p + dir + total) % total);
      setIsFlipping(false);
    }, 500);
  };

  // Auto-advance every 15s
  useEffect(() => {
    autoTimer.current = setInterval(() => go(1), 15000);
    return () => clearInterval(autoTimer.current);
  }, [current, isFlipping]);

  const resetTimer = (dir: number) => {
    clearInterval(autoTimer.current);
    go(dir);
  };

  const onTouchStart = (e: React.TouchEvent) => { touchStart.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) resetTimer(diff > 0 ? 1 : -1);
  };

  // Progress bar
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setProgress(0);
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(elapsed / 15000, 1));
    }, 50);
    return () => clearInterval(tick);
  }, [current]);

  return (
    <div className="relative" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {/* Progress bar */}
      <div className="h-1 rounded-full mb-4 overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: 'hsl(190,80%,55%)',
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* Slide counter */}
      <div className="text-center mb-3">
        <span className="text-xs font-mono tracking-wider" style={{ color: '#64748b' }}>
          {String(current + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </div>

      {/* 3D flip container */}
      <div className="relative aspect-video rounded-2xl overflow-hidden border shadow-2xl" 
        style={{ borderColor: 'rgba(255,255,255,0.1)', perspective: '1800px' }}>
        
        {/* Current slide */}
        <div
          className="absolute inset-0"
          style={{
            transform: isFlipping
              ? `rotateY(${direction > 0 ? '-12deg' : '12deg'}) scale(0.95)`
              : 'rotateY(0deg) scale(1)',
            opacity: isFlipping ? 0 : 1,
            transition: 'transform 0.5s ease-in-out, opacity 0.4s ease-in-out',
            transformOrigin: direction > 0 ? 'right center' : 'left center',
            backfaceVisibility: 'hidden',
          }}
        >
          <img src={PITCH_SLIDES[current].src} alt={PITCH_SLIDES[current].title} className="w-full h-full object-contain bg-white" />
        </div>

        {/* Incoming slide */}
        {isFlipping && (
          <div
            className="absolute inset-0"
            style={{
              transform: `rotateY(${direction > 0 ? '12deg' : '-12deg'}) scale(0.95)`,
              opacity: 0.7,
              animation: 'stark-flip-in 0.5s ease-in-out forwards',
              transformOrigin: direction > 0 ? 'left center' : 'right center',
              backfaceVisibility: 'hidden',
            }}
          >
            <img 
              src={PITCH_SLIDES[(current + direction + total) % total].src} 
              alt={PITCH_SLIDES[(current + direction + total) % total].title} 
              className="w-full h-full object-contain bg-white" 
            />
          </div>
        )}

        {/* Page shadow during flip */}
        {isFlipping && (
          <div className="absolute inset-0 pointer-events-none"
            style={{
              background: direction > 0
                ? 'linear-gradient(to right, rgba(0,0,0,0.15), transparent 30%, transparent 70%, rgba(0,0,0,0.05))'
                : 'linear-gradient(to left, rgba(0,0,0,0.15), transparent 30%, transparent 70%, rgba(0,0,0,0.05))',
              animation: 'stark-shadow-fade 0.5s ease-in-out',
            }}
          />
        )}
      </div>

      <button
        onClick={() => resetTimer(-1)}
        className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#f8fafc', backdropFilter: 'blur(8px)' }}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button
        onClick={() => resetTimer(1)}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#f8fafc', backdropFilter: 'blur(8px)' }}
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      <div className="flex justify-center gap-2 mt-5">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            onClick={() => { clearInterval(autoTimer.current); setDirection(i > current ? 1 : -1); setIsFlipping(true); setTimeout(() => { setCurrent(i); setIsFlipping(false); }, 500); }}
            className="w-2.5 h-2.5 rounded-full transition-all duration-300"
            style={{
              backgroundColor: i === current ? 'hsl(190,80%,55%)' : 'rgba(148,163,184,0.3)',
              transform: i === current ? 'scale(1.3)' : 'scale(1)',
            }}
          />
        ))}
      </div>
    </div>
  );
};

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

      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20 text-white">
        {/* Space-like dark background overlay */}
        <div className="absolute inset-0 z-0" style={{ background: 'linear-gradient(145deg, #05051a 0%, #0a0a2a 40%, #0f0f35 70%, #0a0a1a 100%)' }} />
        
        {/* Animated stars */}
        <ParticleField />
        
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
            <span className="text-sm font-medium tracking-widest uppercase" style={{ color: 'hsl(190,80%,55%)' }}>STARK TANK 2026</span>
          </div>

          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl ring-1 ring-white/20 bg-gradient-to-br from-[#5856e6] to-[#7c7ae6]">
              <Building2 className="w-10 h-10 text-white" />
            </div>
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight">
            <span className="text-white">
              Rent Finder
            </span>
            <br />
            <RotatingCity />
          </h1>

          <p className="text-xl sm:text-2xl md:text-3xl text-white/80 font-light max-w-2xl mx-auto leading-relaxed">
            AI-Powered Lead Management for Property Managers
          </p>

          <div className="pt-6 space-y-3">
            <p className="text-lg sm:text-xl text-white font-medium">
              Julian Cabezas — International Student from Colombia
            </p>
            <p className="text-base sm:text-lg text-white/70">
              Senator &amp; Student | Stark State College
            </p>
          </div>
        </div>

        <div
          className={`absolute bottom-10 left-1/2 -translate-x-1/2 transition-opacity duration-500 z-10 ${
            showScrollIndicator ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex flex-col items-center gap-2 text-white/65">
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
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center transition-transform duration-500 group-hover:scale-105 bg-gradient-to-br from-muted to-secondary">
                        <span className="text-muted-foreground text-sm font-medium select-none">Photo {i + 1}</span>
                      </div>
                    )}
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
            <div className="max-w-5xl mx-auto mt-16 mb-4 relative">
              {/* Cinematic transition section */}
              <div className="relative overflow-hidden rounded-3xl border border-border/50" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)' }}>
                {/* Animated grid background */}
                <div className="absolute inset-0 opacity-10">
                  <div className="absolute inset-0" style={{
                    backgroundImage: 'linear-gradient(hsl(190,80%,55%) 1px, transparent 1px), linear-gradient(90deg, hsl(190,80%,55%) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    animation: 'gridMove 20s linear infinite',
                  }} />
                </div>
                {/* Glowing orbs */}
                <div className="absolute -top-20 -left-20 w-60 h-60 rounded-full blur-3xl" style={{ background: 'hsl(190,80%,55%)', opacity: 0.08, animation: 'pulse 4s ease-in-out infinite' }} />
                <div className="absolute -bottom-20 -right-20 w-60 h-60 rounded-full blur-3xl" style={{ background: 'hsl(170,70%,45%)', opacity: 0.08, animation: 'pulse 4s ease-in-out infinite 2s' }} />
                
                <div className="relative z-10 py-16 px-8 sm:px-12 text-center">
                  {/* Typing line effect */}
                  <div className="flex items-center justify-center gap-3 mb-6">
                    <div className="h-px flex-1 max-w-[80px]" style={{ background: 'linear-gradient(90deg, transparent, hsl(190,80%,55%))' }} />
                    <span className="text-xs uppercase tracking-[0.3em] font-semibold" style={{ color: 'hsl(190,80%,55%)' }}>The Master Plan</span>
                    <div className="h-px flex-1 max-w-[80px]" style={{ background: 'linear-gradient(270deg, transparent, hsl(190,80%,55%))' }} />
                  </div>
                  
                  <h3 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-4" style={{ color: '#f8fafc' }}>
                    That was my story.
                  </h3>
                  <div className="overflow-hidden">
                    <h3 className="text-3xl sm:text-4xl lg:text-5xl font-bold" style={{
                      background: 'linear-gradient(90deg, hsl(190,80%,55%), hsl(170,70%,50%), hsl(190,80%,55%))',
                      backgroundSize: '200% auto',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      animation: 'shimmer 3s linear infinite',
                    }}>
                      Now let me show you what I'm building.
                    </h3>
                  </div>
                  
                  {/* Animated arrow */}
                  <div className="mt-10 flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-full border-2 flex items-center justify-center" style={{
                      borderColor: 'hsl(190,80%,55%)',
                      animation: 'bounceDown 2s ease-in-out infinite',
                    }}>
                      <ChevronDown className="w-5 h-5" style={{ color: 'hsl(190,80%,55%)' }} />
                    </div>
                  </div>
                </div>
              </div>
              
              <style>{`
                @keyframes gridMove {
                  0% { transform: translate(0, 0); }
                  100% { transform: translate(40px, 40px); }
                }
                @keyframes shimmer {
                  0% { background-position: 200% center; }
                  100% { background-position: -200% center; }
                }
                @keyframes bounceDown {
                  0%, 100% { transform: translateY(0); opacity: 1; }
                  50% { transform: translateY(8px); opacity: 0.6; }
                }
              `}</style>
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

      <section className="relative py-24 px-6 bg-background text-foreground">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 uppercase tracking-widest text-xs">
              Market Opportunity
            </Badge>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
              A Massive, <span className="text-[hsl(190,80%,42%)]">Growing Market</span>
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* U.S. Property Management Market */}
            <FadeIn delay={200}>
              <div className="rounded-3xl p-8 h-full flex flex-col justify-between border border-border shadow-modern-sm overflow-hidden"
                style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                <div>
                  <p className="text-sm uppercase tracking-widest mb-4" style={{ color: '#94a3b8' }}>
                    U.S. Property Management Market
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl sm:text-4xl font-bold text-[hsl(190,80%,55%)]">$84.73B</span>
                    <span className="text-lg font-light" style={{ color: '#475569' }}>→</span>
                    <span className="text-3xl sm:text-4xl font-bold text-[hsl(170,70%,45%)]">$102.79B</span>
                  </div>
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-xs" style={{ color: '#94a3b8' }}>2025</span>
                    <span className="text-xs" style={{ color: '#94a3b8' }}>2030</span>
                  </div>
                  {/* Bar chart */}
                  <div className="flex items-end gap-3 mb-4" style={{ height: '160px' }}>
                    {[
                      { year: '2025', val: 84.73, max: 103 },
                      { year: '2026', val: 88.07, max: 103 },
                      { year: '2027', val: 91.54, max: 103 },
                      { year: '2028', val: 95.15, max: 103 },
                      { year: '2029', val: 98.90, max: 103 },
                      { year: '2030', val: 102.79, max: 103 },
                    ].map((d, i) => (
                      <div key={d.year} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        <span className="text-[10px] font-medium" style={{ color: '#94a3b8' }}>
                          ${d.val}B
                        </span>
                        <div
                          className="w-full rounded-t-md"
                          style={{
                            height: `${Math.round((d.val / d.max) * 120)}px`,
                            background: i === 5
                              ? 'linear-gradient(180deg, hsl(170,70%,45%), hsl(190,80%,35%))'
                              : 'linear-gradient(180deg, hsl(190,80%,55%), hsl(190,80%,35%))',
                            opacity: 0.7 + (i * 0.06),
                          }}
                        />
                        <span className="text-[10px]" style={{ color: '#64748b' }}>{d.year}</span>
                      </div>
                    ))}
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(45,212,191,0.12)' }}>
                    <span className="text-sm font-semibold text-[hsl(170,70%,50%)]">CAGR 3.94%</span>
                  </div>
                </div>
                <p className="text-xs mt-6" style={{ color: '#475569' }}>
                  Source: Mordor Intelligence, U.S. Property Management Services Market Report
                </p>
              </div>
            </FadeIn>

            {/* Global PropTech Market */}
            <FadeIn delay={400}>
              <div className="rounded-3xl p-8 h-full flex flex-col justify-between border border-border shadow-modern-sm overflow-hidden"
                style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
                <div>
                  <p className="text-sm uppercase tracking-widest mb-4" style={{ color: '#94a3b8' }}>
                    Global PropTech Market
                  </p>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-3xl sm:text-4xl font-bold text-[hsl(190,80%,55%)]">$40.19B</span>
                    <span className="text-lg font-light" style={{ color: '#475569' }}>→</span>
                    <span className="text-3xl sm:text-4xl font-bold text-[hsl(170,70%,45%)]">$88.37B</span>
                  </div>
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-xs" style={{ color: '#94a3b8' }}>2025</span>
                    <span className="text-xs" style={{ color: '#94a3b8' }}>2032</span>
                  </div>
                  {/* Bar chart */}
                  <div className="flex items-end gap-2 mb-4" style={{ height: '160px' }}>
                    {[
                      { year: '2025', val: 40.19 },
                      { year: '2026', val: 47.08 },
                      { year: '2027', val: 53.97 },
                      { year: '2028', val: 60.86 },
                      { year: '2029', val: 67.75 },
                      { year: '2030', val: 74.64 },
                      { year: '2031', val: 81.53 },
                      { year: '2032', val: 88.37 },
                    ].map((d, i) => (
                      <div key={d.year} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        <span className="text-[9px] font-medium" style={{ color: '#94a3b8' }}>
                          ${d.val.toFixed(0)}B
                        </span>
                        <div
                          className="w-full rounded-t-md"
                          style={{
                            height: `${Math.round((d.val / 89) * 120)}px`,
                            background: i === 7
                              ? 'linear-gradient(180deg, hsl(170,70%,45%), hsl(190,80%,35%))'
                              : 'linear-gradient(180deg, hsl(190,80%,55%), hsl(190,80%,35%))',
                            opacity: 0.65 + (i * 0.05),
                          }}
                        />
                        <span className="text-[9px]" style={{ color: '#64748b' }}>{`'${d.year.slice(2)}`}</span>
                      </div>
                    ))}
                  </div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ backgroundColor: 'rgba(45,212,191,0.12)' }}>
                    <span className="text-sm font-semibold text-[hsl(170,70%,50%)]">CAGR 11.9%</span>
                  </div>
                </div>
                <p className="text-xs mt-6" style={{ color: '#475569' }}>
                  Source: Fortune Business Insights, PropTech Market Report
                </p>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      <section className="relative py-24 px-6 overflow-hidden" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-6">
            <Badge variant="secondary" className="mb-4 uppercase tracking-widest text-xs">
              Our Solution
            </Badge>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
              What <span className="text-[hsl(190,80%,55%)]">Rent Finder Cleveland</span> Does
            </h2>
            <p className="text-lg sm:text-xl max-w-3xl mx-auto italic" style={{ color: '#94a3b8' }}>
              We're not Zillow. We're what happens <strong className="text-[hsl(190,80%,65%)]">AFTER</strong> someone shows interest.
            </p>
          </FadeIn>

          {/* Desktop horizontal pipeline */}
          <FadeIn delay={300} className="hidden md:block mt-16 mb-16">
            <div className="relative flex items-start justify-between">
              {/* Connecting line */}
              <div className="absolute top-10 left-[12%] right-[12%] h-[2px] overflow-hidden">
                <div className="h-full w-full" style={{
                  background: 'linear-gradient(90deg, hsl(190,80%,50%), hsl(170,70%,45%))',
                  opacity: 0.3,
                }} />
                <div className="absolute inset-0 h-full" style={{
                  background: 'linear-gradient(90deg, transparent, hsl(190,80%,55%), transparent)',
                  animation: 'stark-pulse-flow 3s ease-in-out infinite',
                }} />
              </div>

              {[
                { icon: PhoneIncoming, title: "Lead Comes In", desc: "Call, email, SMS, web form", step: 1 },
                { icon: Bot, title: "Instant AI Reply", desc: "24/7, English & Spanish", step: 2 },
                { icon: BarChart3, title: "Auto Qualify & Score", desc: "AI-powered lead scoring", step: 3 },
                { icon: CalendarCheck, title: "Schedule & Follow-Up", desc: "Showings booked, nurture automated", step: 4 },
              ].map((item, i) => (
                <div key={item.step} className="relative flex flex-col items-center text-center flex-1 z-10">
                  <div
                    className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 border"
                    style={{
                      background: 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(56,189,248,0.15))',
                      borderColor: 'rgba(45,212,191,0.3)',
                      boxShadow: '0 0 25px rgba(45,212,191,0.15)',
                      animation: `stark-step-glow 3s ease-in-out ${i * 0.6}s infinite`,
                    }}
                  >
                    <item.icon className="w-8 h-8 text-[hsl(190,80%,55%)]" />
                  </div>
                  <span className="text-xs font-bold uppercase tracking-widest mb-1 text-[hsl(190,80%,55%)]">
                    Step {item.step}
                  </span>
                  <h3 className="text-lg font-bold mb-1">{item.title}</h3>
                  <p className="text-sm" style={{ color: '#94a3b8' }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </FadeIn>

          {/* Mobile vertical pipeline */}
          <FadeIn delay={300} className="md:hidden mt-12 mb-12">
            <div className="relative flex flex-col items-center gap-2">
              {[
                { icon: PhoneIncoming, title: "Lead Comes In", desc: "Call, email, SMS, web form", step: 1 },
                { icon: Bot, title: "Instant AI Reply", desc: "24/7, English & Spanish", step: 2 },
                { icon: BarChart3, title: "Auto Qualify & Score", desc: "AI-powered lead scoring", step: 3 },
                { icon: CalendarCheck, title: "Schedule & Follow-Up", desc: "Showings booked, nurture automated", step: 4 },
              ].map((item, i) => (
                <div key={item.step}>
                  <div className="flex items-center gap-5">
                    <div
                      className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 border"
                      style={{
                        background: 'linear-gradient(135deg, rgba(45,212,191,0.15), rgba(56,189,248,0.15))',
                        borderColor: 'rgba(45,212,191,0.3)',
                        animation: `stark-step-glow 3s ease-in-out ${i * 0.6}s infinite`,
                      }}
                    >
                      <item.icon className="w-7 h-7 text-[hsl(190,80%,55%)]" />
                    </div>
                    <div>
                      <span className="text-xs font-bold uppercase tracking-widest text-[hsl(190,80%,55%)]">Step {item.step}</span>
                      <h3 className="text-base font-bold">{item.title}</h3>
                      <p className="text-sm" style={{ color: '#94a3b8' }}>{item.desc}</p>
                    </div>
                  </div>
                  {i < 3 && (
                    <div className="w-[2px] h-8 mx-auto my-1" style={{ background: 'linear-gradient(180deg, hsl(190,80%,50%,0.4), transparent)' }} />
                  )}
                </div>
              ))}
            </div>
          </FadeIn>

          <FadeIn delay={600} className="text-center">
            <p className="text-base sm:text-lg max-w-3xl mx-auto leading-relaxed" style={{ color: '#cbd5e1' }}>
              A clean, automated workflow that ensures no lead ever falls through the cracks — from first contact to booked showing.
            </p>
          </FadeIn>
        </div>
      </section>

      <section className="relative py-24 px-6 bg-background text-foreground">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-16">
            <Badge variant="secondary" className="mb-4 uppercase tracking-widest text-xs">
              Industry Trends
            </Badge>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold">
              AI in Property Management Is{" "}
              <span className="text-[hsl(160,70%,40%)]">Exploding</span>
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              { value: "21% → 34%", desc: "AI adoption jumped in just one year", source: "AppFolio 2025 Benchmark Report via NAA", color: "hsl(160,70%,40%)" },
              { value: "85%", desc: "of AI adopters report improved lead-to-lease conversion", source: "EliseAI, 2025 State of AI in Multifamily", color: "hsl(175,65%,40%)" },
              { value: "78%", desc: "of operators admit losing business to AI-enabled competitors", source: "EliseAI, 2025 State of AI in Multifamily", color: "hsl(190,80%,42%)" },
              { value: "44.8%", desc: "higher lead-to-lease conversion at properties using AI", source: "Zuma, Multifamily Property Management 2025", color: "hsl(150,65%,38%)" },
            ].map((card, i) => (
              <FadeIn key={i} delay={i * 120}>
                <div
                  className="group rounded-2xl border border-border bg-card p-7 sm:p-8 shadow-modern-sm hover:shadow-modern transition-all duration-300"
                  style={{ borderTopColor: card.color, borderTopWidth: 3 }}
                >
                  <span className="text-4xl sm:text-5xl font-bold" style={{ color: card.color }}>
                    {card.value}
                  </span>
                  <p className="text-base sm:text-lg text-muted-foreground mt-3 leading-snug">{card.desc}</p>
                  <p className="text-xs text-muted-foreground/60 mt-4">Source: {card.source}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-24 px-6 overflow-hidden" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-6">
            <Badge variant="secondary" className="mb-4 uppercase tracking-widest text-xs">
              Impact
            </Badge>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
              Everyone <span className="text-[hsl(160,70%,45%)]">Wins</span>
            </h2>
            <p className="text-lg sm:text-xl max-w-3xl mx-auto" style={{ color: '#94a3b8' }}>
              This isn't just a business tool — it's infrastructure that helps communities.
            </p>
          </FadeIn>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5 mt-14">
            {[
              { icon: Building2, title: "Property Managers", desc: "Automated pipeline, zero leads lost, save hundreds of hours" },
              { icon: Home, title: "Landlords", desc: "Vacancies filled faster, less lost rental income" },
              { icon: Users, title: "Families", desc: "Find homes sooner, bilingual support, faster response" },
              { icon: Landmark, title: "Government Agencies", desc: "Section 8 compliance, efficient housing placement" },
              { icon: MapPin, title: "The City", desc: "Stronger neighborhoods, reduced vacancy blight, economic activity" },
            ].map((card, i) => (
              <FadeIn key={card.title} delay={i * 100}>
                <div className="rounded-2xl p-6 h-full border text-center flex flex-col items-center gap-3"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    backdropFilter: 'blur(12px)',
                    borderColor: 'rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-1"
                    style={{ background: 'rgba(45,212,191,0.12)' }}>
                    <card.icon className="w-6 h-6 text-[hsl(170,70%,50%)]" />
                  </div>
                  <h3 className="text-base font-bold">{card.title}</h3>
                  <p className="text-sm leading-snug" style={{ color: '#94a3b8' }}>{card.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section className="relative py-24 px-6 bg-background text-foreground">
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-14">
            <Badge variant="secondary" className="mb-4 uppercase tracking-widest text-xs">
              Traction
            </Badge>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold">
              Real Traction. <span className="text-[hsl(160,70%,40%)]">Real Results.</span>
            </h2>
          </FadeIn>

          {/* Browser mockup screenshot placeholder */}
          <FadeIn delay={200} className="mb-20">
            <div className="max-w-4xl mx-auto" style={{ perspective: '1200px' }}>
              <div className="rounded-xl overflow-hidden shadow-2xl border border-border"
                style={{ transform: 'rotateX(2deg) rotateY(-1deg)', transformOrigin: 'center center' }}>
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border" style={{ backgroundColor: '#1e293b' }}>
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#eab308' }} />
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                  </div>
                  <div className="flex-1 mx-8">
                    <div className="rounded-md px-3 py-1 text-xs text-center" style={{ backgroundColor: '#0f172a', color: '#64748b' }}>
                      rentfindercleveland.com/dashboard
                    </div>
                  </div>
                </div>
                <img src={dashboardImg} alt="Smart Leasing AI Dashboard showing real traction metrics" className="w-full block" />
              </div>
            </div>
          </FadeIn>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6 sm:gap-8 mb-16">
            {[
              { value: "612", label: "Leads Processed" },
              { value: "328", label: "Hot Leads Identified", sub: "AI Score 80+" },
              { value: "1800", label: "Automated Messages Sent", sub: "SMS + Email", prefix: "+", suffix: "+" },
              { value: "35", label: "Showings Booked", prefix: "+" },
              { value: "56", label: "Doors Managed", sub: "across 45 Properties" },
              { value: "25", label: "Annual Service Agreement", sub: "HomeGuard Property Management — 1-year contract signed", prefix: "$", suffix: "K" },
            ].map((item, i) => (
              <FadeIn key={item.label} delay={i * 100}>
                <TractionStat {...item} />
              </FadeIn>
            ))}
          </div>

          {/* Quote callout */}
          <FadeIn delay={700}>
            <div className="max-w-4xl mx-auto rounded-2xl border border-border bg-card p-8 sm:p-10 shadow-modern-sm text-center">
              <p className="text-lg sm:text-xl leading-relaxed text-muted-foreground italic">
                "Work that would take a human hundreds of hours — responding to 612 leads, sending 1,800 follow-ups, scheduling 35 showings —{" "}
                <strong className="text-foreground not-italic">done automatically by our AI agents.</strong>"
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Revenue Model & Growth Path */}
      <section className="relative py-24 px-6 overflow-hidden" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
        <div className="max-w-6xl mx-auto">
          <FadeIn className="text-center mb-14">
            <Badge variant="secondary" className="mb-4 uppercase tracking-widest text-xs">
              Business Model
            </Badge>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold">
              Revenue Model &amp; <span className="text-[hsl(190,80%,55%)]">Growth Path</span>
            </h2>
          </FadeIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
            <FadeIn delay={200}>
              <div className="rounded-2xl p-8 border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <h3 className="text-xl font-bold mb-4 text-[hsl(190,80%,55%)]">SaaS — Recurring Revenue</h3>
                <p className="text-base leading-relaxed" style={{ color: '#cbd5e1' }}>
                  Monthly subscriptions per organization. Multi-tenant architecture means each new client plugs in without rebuilding.
                </p>
                <p className="text-lg font-semibold mt-4 text-[hsl(170,70%,50%)]">
                  Every new client = recurring revenue at minimal marginal cost.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={400}>
              <div className="space-y-0">
                {[
                  { phase: "NOW", active: true, text: "1 active client (HomeGuard, $25K/yr signed), platform live, trademark Smart Leasing AI® registered" },
                  { phase: "NEXT", active: false, text: "Onboard 5–10 property management companies in Northeast Ohio" },
                  { phase: "SCALE", active: false, text: "Expand statewide, then regionally across the Midwest" },
                ].map((step, i) => (
                  <div key={step.phase} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 border-2"
                        style={{
                          backgroundColor: step.active ? 'hsl(170,70%,45%)' : 'transparent',
                          borderColor: step.active ? 'hsl(170,70%,45%)' : 'rgba(148,163,184,0.3)',
                          color: step.active ? '#0f172a' : '#94a3b8',
                          boxShadow: step.active ? '0 0 20px rgba(45,212,191,0.4)' : 'none',
                        }}
                      >
                        {step.phase === "NOW" ? "✓" : i + 1}
                      </div>
                      {i < 2 && <div className="w-[2px] h-8 my-1" style={{ background: step.active ? 'hsl(170,70%,45%,0.5)' : 'rgba(148,163,184,0.15)' }} />}
                    </div>
                    <div className="pb-6">
                      <span className={`text-sm font-bold uppercase tracking-widest ${step.active ? 'text-[hsl(170,70%,50%)]' : ''}`} style={step.active ? {} : { color: '#64748b' }}>
                        {step.phase}
                      </span>
                      <p className="text-sm mt-1 leading-snug" style={{ color: step.active ? '#e2e8f0' : '#94a3b8' }}>
                        {step.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* The Pitch */}
      <section className="relative py-24 px-6 bg-background text-foreground">
        <div className="max-w-4xl mx-auto text-center">
          <FadeIn>
            <Badge variant="secondary" className="mb-4 uppercase tracking-widest text-xs">
              The Pitch
            </Badge>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-12">
              Watch the <span className="text-[hsl(190,80%,42%)]">90-Second</span> Elevator Pitch
            </h2>
          </FadeIn>

          <FadeIn delay={300}>
            <div className="relative aspect-video rounded-2xl overflow-hidden border border-border shadow-2xl">
              <iframe
                src="https://www.youtube.com/embed/OKEV-Tht7eU?rel=0&autoplay=1&mute=1"
                title="Rent Finder Cleveland — 90-Second Elevator Pitch"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          </FadeIn>

          <FadeIn delay={500}>
            <p className="text-lg text-muted-foreground mt-8 font-medium">
              Stark Tank 2026 — College Edition Pitch Competition
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Pitch Deck */}
      <section className="relative py-24 px-6 overflow-hidden" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>
        <div className="max-w-5xl mx-auto">
          <FadeIn className="text-center mb-6">
            <Badge variant="secondary" className="mb-4 uppercase tracking-widest text-xs">
              Presentation
            </Badge>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-3">
              Pitch <span className="text-[hsl(190,80%,55%)]">Deck</span>
            </h2>
            <p className="text-lg" style={{ color: '#94a3b8' }}>Swipe through the full presentation.</p>
          </FadeIn>

          <FadeIn delay={300}>
            <PitchDeckCarousel />
          </FadeIn>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="relative min-h-[70vh] flex items-center justify-center px-6 py-24 overflow-hidden"
        style={{ background: 'linear-gradient(145deg, #0a0a1a 0%, #0f172a 45%, #1a1a2e 100%)' }}>
        <ParticleField />
        <div className="relative z-10 max-w-3xl mx-auto text-center space-y-8">
          <FadeIn>
            <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight" style={{ color: '#f8fafc' }}>
              The future of rental lead management is{" "}
              <span className="text-[hsl(190,80%,55%)]">NOW.</span>
            </h2>
          </FadeIn>

          <FadeIn delay={200}>
            <p className="text-lg sm:text-xl" style={{ color: '#94a3b8' }}>
              Built by Julian Cabezas — Solo Founder, Developer &amp; Operator
            </p>
          </FadeIn>

          <FadeIn delay={400}>
            <a
              href="mailto:contacto@juliancabezast.com?subject=Stark%20Tank%202026%20-%20Join%20The%20Project"
              className="inline-block px-10 py-4 rounded-xl text-lg font-bold tracking-wide transition-transform duration-300 hover:scale-105"
              style={{
                background: 'linear-gradient(135deg, hsl(190,80%,50%), hsl(170,70%,45%))',
                color: '#0f172a',
                boxShadow: '0 0 40px rgba(45,212,191,0.3)',
                animation: 'stark-cta-pulse 2.5s ease-in-out infinite',
              }}
            >
              JOIN THE PROJECT ✉
            </a>
          </FadeIn>

          <FadeIn delay={600}>
            <p className="text-sm font-medium" style={{ color: '#475569' }}>
              Stark State College | Stark Tank 2026
            </p>
          </FadeIn>
        </div>
      </section>

      {/* Legal Disclaimers */}
      <footer className="px-6 py-12" style={{ backgroundColor: '#070714', color: '#475569' }}>
        <div className="max-w-4xl mx-auto space-y-4 text-center text-xs leading-relaxed">
          <p>© {new Date().getFullYear()} Julian Cabezas. All rights reserved.</p>
          <p>
            <strong style={{ color: '#64748b' }}>Rent Finder Cleveland™</strong> and <strong style={{ color: '#64748b' }}>Smart Leasing AI™</strong> are trademarks owned exclusively by Julian Cabezas. 
            All intellectual property, source code, designs, branding, and proprietary technology presented herein are the sole property of Julian Cabezas and may not be reproduced, distributed, or used without express written permission.
          </p>
          <p>
            This project was developed independently by Julian Cabezas as a student at Stark State College and is presented as part of the Stark Tank 2026 competition. 
            Stark State College is not a co-developer, co-owner, investor, or endorser of this product or business. 
            The college's role is limited to hosting the pitch competition. No partnership, sponsorship, or institutional affiliation beyond the student–institution relationship is implied or intended.
          </p>
          <p>
            The information presented is for demonstration and pitch purposes only. Metrics shown reflect real usage data from a live platform as of the presentation date. 
            Forward-looking statements regarding growth, revenue, and market opportunity are projections and not guarantees of future performance.
          </p>
          <p style={{ color: '#334155' }}>
            contacto@juliancabezast.com · Built with 💜 in Cleveland, Ohio
          </p>
        </div>
      </footer>

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

        @keyframes stark-pulse-flow {
          0%, 100% { transform: translateX(-100%); opacity: 0; }
          50% { transform: translateX(100%); opacity: 1; }
        }

        @keyframes stark-step-glow {
          0%, 100% { box-shadow: 0 0 15px rgba(45,212,191,0.1); }
          50% { box-shadow: 0 0 30px rgba(45,212,191,0.3); }
        }

        @keyframes stark-cta-pulse {
          0%, 100% { box-shadow: 0 0 30px rgba(45,212,191,0.25); }
          50% { box-shadow: 0 0 60px rgba(45,212,191,0.5); }
        }

        @keyframes stark-flip-in {
          0% { transform: rotateY(12deg) scale(0.95); opacity: 0.3; }
          100% { transform: rotateY(0deg) scale(1); opacity: 1; }
        }

        @keyframes stark-shadow-fade {
          0% { opacity: 0; }
          30% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default StarktankPage;
