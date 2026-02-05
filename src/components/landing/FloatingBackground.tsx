import React from "react";

const FloatingBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Existing gradient blobs */}
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute top-1/2 -left-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />

      {/* Floating glass blobs */}
      <div
        className="absolute w-[300px] h-[300px] rounded-full blur-3xl opacity-[0.04]"
        style={{
          background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)",
          top: "10%",
          left: "15%",
          animation: "float1 45s ease-in-out infinite",
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full blur-3xl opacity-[0.05]"
        style={{
          background: "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)",
          top: "50%",
          right: "10%",
          animation: "float2 55s ease-in-out infinite",
        }}
      />
      <div
        className="absolute w-[250px] h-[250px] rounded-full blur-3xl opacity-[0.03]"
        style={{
          background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)",
          bottom: "20%",
          left: "30%",
          animation: "float3 38s ease-in-out infinite",
        }}
      />
      <div
        className="absolute w-[350px] h-[350px] rounded-full blur-3xl opacity-[0.06]"
        style={{
          background: "radial-gradient(circle, hsl(var(--accent)) 0%, transparent 70%)",
          top: "30%",
          left: "60%",
          animation: "float4 50s ease-in-out infinite",
        }}
      />
      <div
        className="absolute w-[200px] h-[200px] rounded-full blur-3xl opacity-[0.04]"
        style={{
          background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)",
          bottom: "10%",
          right: "25%",
          animation: "float5 42s ease-in-out infinite",
        }}
      />

      {/* CSS Keyframes */}
      <style>{`
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(30px, -20px); }
          50% { transform: translate(-20px, 30px); }
          75% { transform: translate(20px, 20px); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-40px, 20px); }
          50% { transform: translate(30px, -30px); }
          75% { transform: translate(-20px, -20px); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(25px, 25px); }
          66% { transform: translate(-30px, -15px); }
        }
        @keyframes float4 {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-25px, 35px); }
          40% { transform: translate(35px, -25px); }
          60% { transform: translate(-15px, -35px); }
          80% { transform: translate(25px, 15px); }
        }
        @keyframes float5 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-20px, -30px); }
        }
      `}</style>
    </div>
  );
};

export default FloatingBackground;