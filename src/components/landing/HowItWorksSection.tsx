import React from "react";
import { Badge } from "@/components/ui/badge";
import { Phone, MessageSquare, Calendar, CheckCircle2 } from "lucide-react";

const STEPS = [
  {
    step: "1",
    icon: <Phone className="h-6 w-6" />,
    title: "Lead Calls In",
    desc: "Your AI agent answers 24/7, qualifies the prospect, and captures their needs",
  },
  {
    step: "2",
    icon: <MessageSquare className="h-6 w-6" />,
    title: "Smart Nurturing",
    desc: "Automated follow-ups via call and SMS keep leads warm until they're ready",
  },
  {
    step: "3",
    icon: <Calendar className="h-6 w-6" />,
    title: "Showing Booked",
    desc: "AI schedules, confirms, and sends reminders automatically",
  },
  {
    step: "4",
    icon: <CheckCircle2 className="h-6 w-6" />,
    title: "Lease Signed",
    desc: "Track the full journey from first call to signed lease in your dashboard",
  },
];

const HowItWorksSection: React.FC = () => {
  return (
    <section
      id="how-it-works"
      className="py-20 sm:py-32"
      aria-labelledby="how-it-works-heading"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <Badge variant="outline" className="mb-4">
            How It Works
          </Badge>
          <h2
            id="how-it-works-heading"
            className="text-3xl sm:text-4xl font-bold text-foreground"
          >
            From Lead to Lease in 4 Simple Steps
          </h2>
        </div>

        {/* ─── DESKTOP PIPELINE (md+) ─── */}
        <div className="hidden md:block relative">
          {/* ── Pipeline track ── */}
          <div
            className="absolute left-[12.5%] right-[12.5%] top-[40px] h-2 rounded-full"
            style={{
              background: "linear-gradient(90deg, #370d4b 0%, #5a1d7a 50%, #370d4b 100%)",
            }}
          />

          {/* Track glow layer */}
          <div
            className="absolute left-[12.5%] right-[12.5%] top-[38px] h-3 rounded-full opacity-30 blur-sm"
            style={{
              background: "linear-gradient(90deg, #EF4444, #F59E0B, #ffb22c, #22C55E)",
            }}
          />

          {/* Particle container with overflow hidden */}
          <div className="absolute left-[12.5%] right-[12.5%] top-[36px] h-4 overflow-hidden">
            {[0].map((delay, idx) => (
              <div
                key={idx}
                className="absolute top-1/2 -translate-y-1/2 w-20 h-5 rounded-full pointer-events-none"
                style={{
                  animation: `pipeFlow 3.5s linear infinite`,
                  animationDelay: `${delay}s`,
                }}
              >
                {/* Inner glow that shifts color via separate animation */}
                <div
                  className="w-full h-full rounded-full"
                  style={{
                    animation: `colorShift 3.5s linear infinite`,
                    animationDelay: `${delay}s`,
                  }}
                />
              </div>
            ))}
          </div>

          {/* ── Step connector nodes on track ── */}
          {[
            { color: "#EF4444", glow: "rgba(239,68,68,0.4)" },
            { color: "#F59E0B", glow: "rgba(245,158,11,0.4)" },
            { color: "#ffb22c", glow: "rgba(255,178,44,0.4)" },
            { color: "#22C55E", glow: "rgba(34,197,94,0.4)" },
          ].map((node, i) => (
            <div
              key={i}
              className="absolute w-4 h-4 rounded-full z-10"
              style={{
                left: `calc(12.5% + ${(i / 3) * 75}%)`,
                top: "38px",
                transform: "translateX(-50%)",
                background: node.color,
                boxShadow: `0 0 8px ${node.glow}`,
                animation: `nodePulse 2s ease-in-out infinite`,
                animationDelay: `${i * 0.5}s`,
              }}
            />
          ))}

          {/* ── Steps grid ── */}
          <div className="relative grid grid-cols-4 gap-6 pt-16">
            {STEPS.map((item, index) => (
              <div key={index} className="relative text-center group">
                {/* Icon */}
                <div className="relative inline-flex mb-4">
                  <div
                    className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary transition-transform duration-300 group-hover:scale-105"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {item.step}
                  </span>
                </div>

                {/* Arrow between cards */}
                {index < 3 && (
                  <div
                    className="absolute top-8 -right-3 text-muted-foreground/50"
                    style={{ animation: "arrowPush 2s ease-in-out infinite", animationDelay: `${index * 0.3}s` }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                )}

                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ─── MOBILE PIPELINE (< md) ─── */}
        <div className="md:hidden relative">
          {/* Vertical pipeline track */}
          <div className="absolute left-8 top-0 bottom-0 w-1.5 overflow-hidden">
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: "linear-gradient(180deg, #370d4b, #5a1d7a)" }}
            />
            <div className="pipeline-particle-v pipeline-particle-v-1" />
            <div className="pipeline-particle-v pipeline-particle-v-2" />
          </div>

          {/* Steps */}
          <div className="relative space-y-10 pl-20">
            {STEPS.map((item, index) => (
              <div key={index} className="relative">
                {/* Icon on the pipeline */}
                <div className="absolute -left-[52px] top-0">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                    {item.icon}
                  </div>
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
                    {item.step}
                  </span>
                </div>

                {/* Text */}
                <div className="pt-1">
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pipeFlow {
          0%   { left: 0; opacity: 0; }
          3%   { opacity: 1; }
          85%  { opacity: 1; }
          95%  { left: 100%; opacity: 0; }
          100% { left: 100%; opacity: 0; }
        }

        @keyframes colorShift {
          0%, 28%  { background: radial-gradient(ellipse at center, #EF4444 0%, rgba(239,68,68,0.4) 40%, transparent 70%); box-shadow: 0 0 14px rgba(239,68,68,0.6); }
          33%, 55% { background: radial-gradient(ellipse at center, #F59E0B 0%, rgba(245,158,11,0.4) 40%, transparent 70%); box-shadow: 0 0 14px rgba(245,158,11,0.6); }
          60%, 95% { background: radial-gradient(ellipse at center, #22C55E 0%, rgba(34,197,94,0.4) 40%, transparent 70%); box-shadow: 0 0 14px rgba(34,197,94,0.6); }
        }

        @keyframes nodePulse {
          0%, 100% { transform: translateX(-50%) scale(1); filter: brightness(1); }
          50%      { transform: translateX(-50%) scale(1.18); filter: brightness(1.2); }
        }

        @keyframes arrowPush {
          0%, 100% { opacity: 0.35; transform: translateX(0); }
          50%      { opacity: 1; transform: translateX(3px); }
        }

        /* ── Mobile vertical particles ── */
        .pipeline-particle-v {
          position: absolute;
          left: -3px;
          width: 12px;
          height: 32px;
          border-radius: 6px;
          animation: flowDown 3.5s linear infinite;
        }
        .pipeline-particle-v-1 { animation-delay: 0s; }
        .pipeline-particle-v-2 { animation-delay: -1.75s; }

        @keyframes flowDown {
          0%   { top: -32px; opacity: 0; background: linear-gradient(180deg, transparent, #EF4444, #EF4444, transparent); box-shadow: 0 0 10px rgba(239,68,68,0.5); }
          5%   { opacity: 0.85; }
          33%  { background: linear-gradient(180deg, transparent, #F59E0B, #F59E0B, transparent); box-shadow: 0 0 10px rgba(245,158,11,0.5); }
          66%  { background: linear-gradient(180deg, transparent, #ffb22c, #ffb22c, transparent); box-shadow: 0 0 10px rgba(255,178,44,0.5); }
          80%  { opacity: 0.85; background: linear-gradient(180deg, transparent, #22C55E, #22C55E, transparent); box-shadow: 0 0 10px rgba(34,197,94,0.5); }
          95%  { opacity: 0.2; }
          100% { top: calc(100% - 32px); opacity: 0; }
        }
      `}</style>
    </section>
  );
};

export default HowItWorksSection;
