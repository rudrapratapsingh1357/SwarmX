import React from 'react';

export default function CoverageHeatmap({ zones }) {
  if (!zones || zones.length === 0) return null;

  return (
    <div className="bg-[#0f1a2e] border border-slate-800/60 rounded-lg p-4 font-grotesk text-white shadow-xl">
      <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Sector Search Coverage Array</h3>
      
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 max-h-[140px] overflow-y-auto pr-1">
        {zones.map((zone) => {
          const pct = zone.coverage_pct || 0;
          let color = 'bg-slate-900 text-slate-600 border-slate-950';
          if (pct >= 95) color = 'bg-[#00ff88]/30 text-[#00ff88] border-[#00ff88]/40';
          else if (pct >= 60) color = 'bg-[#00ff88]/15 text-[#00ff88]/80 border-[#00ff88]/20';
          else if (pct >= 20) color = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
          else if (pct > 0) color = 'bg-amber-500/5 text-amber-500/70 border-amber-500/10';

          return (
            <div 
              key={zone.id} 
              className={`border rounded py-1 text-center font-mono text-[9px] transition-colors flex flex-col items-center justify-center ${color}`}
              title={`Sector ${zone.id}: ${pct.toFixed(1)}%`}
            >
              <span className="font-bold">S{zone.id}</span>
              <span>{pct.toFixed(0)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
