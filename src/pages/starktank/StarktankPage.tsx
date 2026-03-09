import { useEffect, useRef, useState } from "react";
import { ChevronDown, Building2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/* ── helpers ─────────────────────────────────────────────────── */

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
    className={`absolute rounded-full opacity-[0.08] blur-3xl ${className}`}
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
          className="absolute rounded-full bg-white"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: 0.15,
            animation: `stark-twinkle ${p.twinkleDur}s ease-in-out ${p.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
};

/** Fade-in on scroll using IntersectionObserver */
function useFadeIn(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

const FadeIn = ({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) => {
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

/* ── photo grid data ─────────────────────────────────────────── */
const GRID_ITEMS = [
  { title: "Curious Since Day One",              subtitle: "1998, Colombia" },
  { title: "Born to Perform",                    subtitle: "Always on stage, Bogotá" },
  { title: "2nd Place, Latam Digital Awards",    subtitle: "Best Press Media Strategy (2017)" },
  { title: "Speaker & Strategist",               subtitle: "Digital marketing conferences, Colombia" },
  { title: "Project Manager — Software Building",subtitle: "Ladrillera 21, Colombia (2017)" },
  { title: "Content Creator",                    subtitle: "+100K reproductions on YouTube" },
];

/* ── page ────────────────────────────────────────────────────── */
const StarktankPage = () => {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  useEffect(() => {
    const handleScroll = () => setShowScrollIndicator(window.scrollY < 100);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white overflow-x-hidden">

      {/* ── Animated Background (fixed) ──────────────────────── */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <FloatingShape className="w-[600px] h-[600px] bg-indigo-600 -top-40 -left-40"  duration={25} />
        <FloatingShape className="w-[500px] h-[500px] bg-violet-600 top-1/3 -right-20" duration={30} delay={2} />
        <FloatingShape className="w-[400px] h-[400px] bg-blue-600 bottom-20 left-1/4"  duration={22} delay={1} />
        <FloatingShape className="w-[350px] h-[350px] bg-purple-600 top-1/2 left-1/2"  duration={28} delay={3} />
        <ParticleField />
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      {/* ── Hero Section ─────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 py-20">
        <div className="relative z-10 max-w-4xl mx-auto text-center space-y-8">

          {/* Event Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium tracking-widest text-amber-400/90 uppercase">
              Stark Tank 2026
            </span>
          </div>

          {/* Logo Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-2xl shadow-indigo-500/30 ring-1 ring-white/10">
              <Building2 className="w-10 h-10 text-white" />
            </div>
          </div>

          {/* Main Headline */}
          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-white via-white to-slate-300 bg-clip-text text-transparent">
              Rent Finder
            </span>
            <br />
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Cleveland
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl sm:text-2xl md:text-3xl text-slate-300 font-light max-w-2xl mx-auto leading-relaxed">
            AI-Powered Lead Management for Property Managers
          </p>

          {/* Founder Info */}
          <div className="pt-6 space-y-3">
            <p className="text-lg sm:text-xl text-white/90 font-medium">Julian Cabezas</p>
            <p className="text-sm sm:text-base text-slate-400 tracking-wide">
              Solo Founder, Developer &amp; Operator
            </p>
            <Badge variant="outline" className="bg-white/5 border-white/20 text-slate-300 px-4 py-1.5 text-sm">
              Stark State College
            </Badge>
          </div>

          {/* Tagline */}
          <p className="text-base sm:text-lg text-slate-500 italic max-w-xl mx-auto pt-4">
            "International Student. Trilingual. Award-winning digital strategist turned tech founder."
          </p>
        </div>

        {/* Scroll Indicator */}
        <div
          className={`absolute bottom-10 left-1/2 -translate-x-1/2 transition-opacity duration-500 ${
            showScrollIndicator ? "opacity-100" : "opacity-0"
          }`}
        >
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <span className="text-xs uppercase tracking-widest">Scroll</span>
            <ChevronDown className="w-5 h-5 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ── Why Me Section ───────────────────────────────────── */}
      <section className="relative bg-white text-slate-900 py-24 px-6">
        <div className="max-w-6xl mx-auto">

          {/* Section Header */}
          <FadeIn className="text-center mb-16">
            <h2 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-5">
              Why Me
            </h2>
            <p className="text-xl sm:text-2xl text-slate-500 font-light italic max-w-3xl mx-auto leading-relaxed">
              "I've been building, marketing, and shipping products for years.
              This isn't my first time — it's my biggest bet."
            </p>
          </FadeIn>

          {/* Photo Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-16">
            {GRID_ITEMS.map((item, i) => (
              <FadeIn key={i} delay={i * 80}>
                <div className="group flex flex-col gap-3">
                  {/* Image placeholder */}
                  <div className="aspect-[4/3] w-full rounded-2xl overflow-hidden border border-slate-100 shadow-sm bg-slate-100">
                    <div className="w-full h-full flex items-center justify-center transition-transform duration-500 group-hover:scale-105 bg-gradient-to-br from-slate-100 to-slate-200">
                      <span className="text-slate-400 text-sm font-medium select-none">
                        Photo {i + 1}
                      </span>
                    </div>
                  </div>
                  {/* Text */}
                  <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                      {item.title}
                    </h3>
                    <p className="text-slate-500 text-sm mt-0.5">{item.subtitle}</p>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          {/* Bio paragraph */}
          <FadeIn>
            <div className="max-w-4xl mx-auto bg-slate-50 p-8 sm:p-10 rounded-3xl border border-slate-100 shadow-sm">
              <p className="text-lg sm:text-xl leading-relaxed text-slate-700">
                I'm originally from Bogotá, Colombia. I speak three languages — Spanish, English, and
                Portuguese. I started my first business at 22, building over 19 websites during the
                pandemic. I ran a digital agency, led communications for TEDx Bogotá, won a Latam
                Digital Award, and created campaigns for brands like Avianca and Motorola reaching over
                1.5 million people. Now I'm a student at Stark State College and a member of the Student
                Government Association, channeling everything I've learned into Rent Finder Cleveland.
              </p>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── Keyframes ────────────────────────────────────────── */}
      <style>{`
        @keyframes stark-float {
          0%,100% { transform: translate(0,0) scale(1); }
          25%     { transform: translate(30px,-30px) scale(1.05); }
          50%     { transform: translate(-20px,20px) scale(0.95); }
          75%     { transform: translate(20px,10px) scale(1.02); }
        }
        @keyframes stark-twinkle {
          0%,100% { opacity:.10; transform:scale(1); }
          50%     { opacity:.40; transform:scale(1.5); }
        }
      `}</style>
    </div>
  );
};

export default StarktankPage;
