import React from 'react';
import { User, AlertTriangle, ShieldAlert, Cpu, Heart, CheckCircle2, Navigation, Zap } from 'lucide-react';

export default function SwarmPanel({ 
  agents, 
  targets, 
  coverage, 
  onVerifyTarget 
}) {
  const activeCount = agents.filter(a => a.status === 'active').length;
  const returningCount = agents.filter(a => a.status === 'returning').length;
  const chargingCount = agents.filter(a => a.status === 'charging').length;
  const resumingCount = agents.filter(a => a.status === 'resuming').length;
  const offlineCount = agents.filter(a => a.status === 'offline').length;

  const inFieldCount = activeCount;
  const atBaseCount = returningCount + chargingCount + resumingCount;
  
  const totalBatteryAvg = agents.length > 0 
    ? agents.reduce((acc, a) => acc + a.battery, 0) / agents.length 
    : 0;

  const uniqueAgents = agents.filter(
    (agent, index, self) => index === self.findIndex(a => a.id === agent.id)
  );

  const getTargetIcon = (type) => {
    switch (type) {
      case 'survivor':
        return <Heart className="text-[#00ff88]" size={16} />;
      case 'hazard':
        return <ShieldAlert className="text-red-500" size={16} />;
      default:
        return <AlertTriangle className="text-amber-500" size={16} />;
    }
  };

  return (
    <div className="w-[35%] bg-[#0a1220] flex flex-col border-l border-slate-900 select-none overflow-y-auto shrink-0 font-grotesk max-h-[calc(100vh-196px)]">
      {/* 1. Swarm Overview Statistics Grid */}
      <div className="p-4 border-b border-slate-900">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Swarm Status</h3>
        <div className="grid grid-cols-2 gap-2 text-white">
          <div className="bg-[#0f1a2e] p-3 rounded-md border border-slate-800/40">
            <div className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-[4px]">
              <Navigation size={12} style={{ color: 'var(--accent-primary)' }} />
              <span>IN FIELD</span>
            </div>
            <div className="text-xl font-bold font-mono text-[#00ff88]">
              {inFieldCount}<span className="text-xs text-slate-400 font-normal"> / {agents.length}</span>
            </div>
          </div>
          <div className="bg-[#0f1a2e] p-3 rounded-md border border-slate-800/40">
            <div className="text-[10px] text-slate-500 uppercase font-semibold flex items-center gap-[4px]">
              <Zap size={12} style={{ color: 'var(--accent-secondary)' }} />
              <span>AT BASE</span>
            </div>
            <div className="text-xl font-bold font-mono text-[#ffaa00]">
              {atBaseCount}<span className="text-xs text-slate-400 font-normal"> / {agents.length}</span>
            </div>
          </div>
          <div className="bg-[#0f1a2e] p-3 rounded-md border border-slate-800/40">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Targets Found</div>
            <div className="text-xl font-bold font-mono text-[#00d4ff]">
              {targets.length}
            </div>
          </div>
          <div className="bg-[#0f1a2e] p-3 rounded-md border border-slate-800/40">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Avg Battery</div>
            <div className="text-xl font-bold font-mono text-white">
              {totalBatteryAvg.toFixed(0)}<span className="text-xs text-slate-400 font-normal">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Scrollable Agent Fleet Telemetry */}
      <div className="p-4 border-b border-slate-900 flex-1 min-h-[200px] flex flex-col overflow-hidden">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Swarm Fleet Telemetry</h3>
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-xs max-h-[300px]">
          {uniqueAgents.length === 0 ? (
            <div className="text-slate-600 text-center py-6">Awaiting swarm telemetry...</div>
          ) : (
            uniqueAgents.map((ag) => {
              // Color badges
              let badgeColor = 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/20';
              if (ag.status === 'returning') badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
              else if (ag.status === 'charging') badgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
              else if (ag.status === 'offline') badgeColor = 'bg-red-500/10 text-red-500 border-red-500/20';
              else if (ag.status === 'resuming') badgeColor = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
              
              // Battery meter color
              let barColor = 'bg-[#00ff88]';
              if (ag.battery <= 30.0) barColor = 'bg-rose-500 animate-pulse';
              else if (ag.battery <= 50.0) barColor = 'bg-yellow-500';

              return (
                <div key={ag.id} className={`p-2 rounded bg-[#0f1a2e] border transition-colors flex items-center justify-between ${ag.status === 'offline' ? 'border-red-900/30' : 'border-slate-800/40'}`}>
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-200">{ag.id}</span>
                      <span className="text-[10px] text-slate-500">(Zone {ag.zone_id})</span>
                    </div>
                    {/* Battery Bar */}
                    <div className="w-28 flex items-center space-x-1.5">
                      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: `${ag.battery}%` }}></div>
                      </div>
                      <span className="text-[10px] text-slate-400">{ag.battery.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-semibold uppercase border ${badgeColor}`}>
                      {ag.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. Detected Targets Feed */}
      <div className="p-4 overflow-hidden max-h-[350px]">
        <h3 className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-3">Detected Targets & Anomalies</h3>
        <div className="space-y-2 overflow-y-auto max-h-[260px] pr-1">
          {targets.length === 0 ? (
            <div className="text-slate-600 text-center py-6 text-xs font-mono">No target detections flagged yet.</div>
          ) : (
            targets.map((t, idx) => (
              <div key={idx} className="bg-[#0f1a2e] border border-slate-800/50 rounded-md p-3 text-xs font-mono">
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center space-x-1.5 font-bold uppercase text-slate-200">
                    {getTargetIcon(t.target_type)}
                    <span>{t.target_type}</span>
                  </div>
                  <span className="text-emerald-400">{(t.confidence * 100).toFixed(0)}% conf</span>
                </div>
                <p className="text-slate-400 text-[11px] mb-2 leading-snug">{t.description}</p>
                <div className="flex justify-between items-center text-[10px] text-slate-500 border-t border-slate-800/60 pt-1.5">
                  <span>Sensor: {t.agent_id}</span>
                  {t.verified ? (
                    <span className="flex items-center space-x-1 text-[#00ff88] font-bold">
                      <CheckCircle2 size={12} />
                      <span>VERIFIED</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => onVerifyTarget(t.id)}
                      className="px-2 py-0.5 bg-yellow-500/10 border border-yellow-500/20 hover:bg-yellow-500/20 text-yellow-400 rounded text-[9px] uppercase font-bold"
                    >
                      Verify
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
