import { useEffect, useState } from "react";
import { ChevronDown, Building2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const FloatingShape = ({ 
  className, 
  delay = 0, 
  duration = 20 
}: { 
  className?: string; 
  delay?: number; 
  duration?: number;
}) => (
  <div
    className={`absolute rounded-full opacity-[0.08] blur-3xl ${className}`}
    style={{
      animation: `float ${duration}s ease-in-out ${delay}s infinite`,
    }}
  />
);

const ParticleField = () => {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; size: number; delay: number }>>([]);

  useEffect(() => {
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 5,
    }));
    setParticles(newParticles);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            opacity: 0.15,
            animation: `twinkle ${3 + Math.random() * 2}s ease-in-out ${particle.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
};

const StarktankPage = () => {
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollIndicator(window.scrollY < 100);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        {/* Gradient orbs */}
        <FloatingShape
          className="w-[600px] h-[600px] bg-indigo-600 -top-40 -left-40"
          duration={25}
          delay={0}
        />
        <FloatingShape
          className="w-[500px] h-[500px] bg-violet-600 top-1/3 -right-20"
          duration={30}
          delay={2}
        />
        <FloatingShape
          className="w-[400px] h-[400px] bg-blue-600 bottom-20 left-1/4"
          duration={22}
          delay={1}
        />
        <FloatingShape
          className="w-[350px] h-[350px] bg-purple-600 top-1/2 left-1/2"
          duration={28}
          delay={3}
        />
        
        {/* Particle field */}
        <ParticleField />
        
        {/* Subtle grid overlay */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
        />
      </div>

      {/* Hero Section */}
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
            <p className="text-lg sm:text-xl text-white/90 font-medium">
              Julian Cabezas
            </p>
            <p className="text-sm sm:text-base text-slate-400 tracking-wide">
              Solo Founder, Developer & Operator
            </p>
            <Badge 
              variant="outline" 
              className="bg-white/5 border-white/20 text-slate-300 px-4 py-1.5 text-sm"
            >
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
            showScrollIndicator ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <span className="text-xs uppercase tracking-widest">Scroll</span>
            <ChevronDown className="w-5 h-5 animate-bounce" />
          </div>
        </div>
      </section>

      {/* CSS Animations */}
      <style>{`
        @keyframes float {
          0%, 100% { 
            transform: translate(0, 0) scale(1); 
          }
          25% { 
            transform: translate(30px, -30px) scale(1.05); 
          }
          50% { 
            transform: translate(-20px, 20px) scale(0.95); 
          }
          75% { 
            transform: translate(20px, 10px) scale(1.02); 
          }
        }
        
        @keyframes twinkle {
          0%, 100% { 
            opacity: 0.1;
            transform: scale(1);
          }
          50% { 
            opacity: 0.4;
            transform: scale(1.5);
          }
        }
      `}</style>
    </div>
  );
};

export default StarktankPage;
