import React from 'react';
import { Clock, ShieldAlert, Cpu, Heart, CheckCircle2, Navigation } from 'lucide-react';

export default function StatsRow({ report }) {
  if (!report) return null;

  const formatSeconds = (totalSecs) => {
    const h = String(Math.floor(totalSecs / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0');
    const s = String(totalSecs % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const cards = [
    {
      label: 'Mission Duration',
      value: formatSeconds(report.duration_seconds || 0),
      icon: <Clock size={20} className="text-[#00d4ff]" />,
      color: 'text-[#00d4ff]'
    },
    {
      label: 'Swarm Deployed',
      value: report.agents_deployed || 0,
      icon: <Cpu size={20} className="text-white" />,
      color: 'text-white'
    },
    {
      label: 'Casualties / Failures',
      value: report.agents_failed || 0,
      icon: <ShieldAlert size={20} className="text-[#ff3b3b]" />,
      color: 'text-[#ff3b3b]'
    },
    {
      label: 'Targets Detected',
      value: report.targets_found || 0,
      icon: <CheckCircle2 size={20} className="text-amber-500" />,
      color: 'text-amber-500'
    },
    {
      label: 'Survivors Located',
      value: report.survivors_found || 0,
      icon: <Heart size={20} className="text-[#00ff88]" />,
      color: 'text-[#00ff88]'
    },
    {
      label: 'Global Area Covered',
      value: `${(report.coverage_pct || 0).toFixed(1)}%`,
      icon: <Navigation size={20} className="text-[#00ff88]" />,
      color: 'text-[#00ff88]'
    }
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 font-grotesk">
      {cards.map((card, index) => (
        <div 
          key={index}
          className="bg-[#0f1a2e] border border-slate-800/60 rounded-lg p-4 flex items-center space-x-4 shadow-xl"
        >
          <div className="p-2 bg-slate-900/80 rounded-md border border-slate-800">
            {card.icon}
          </div>
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">{card.label}</div>
            <div className={`text-xl font-bold font-mono ${card.color}`}>{card.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
