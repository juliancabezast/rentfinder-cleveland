import { Rocket } from "lucide-react";

const StarktankPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div className="text-center space-y-6 p-8">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-2xl shadow-amber-500/30">
          <Rocket className="h-10 w-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-white">Starktank</h1>
        <p className="text-slate-400 text-lg">Coming soon...</p>
      </div>
    </div>
  );
};

export default StarktankPage;
