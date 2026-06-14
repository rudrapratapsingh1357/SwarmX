import React, { useState, useEffect } from 'react';
import { Play, Pause, AlertTriangle, ShieldAlert, RotateCcw, Zap } from 'lucide-react';
import { triggerMassFailure } from '../api/client';

function estimateETA(coveragePct, elapsedSeconds) {
  if (coveragePct <= 0 || elapsedSeconds <= 0) return null;
  const velocityPerSecond = coveragePct / elapsedSeconds;
  if (velocityPerSecond <= 0) return null;
  const remainingPct = 100 - coveragePct;
  const secondsRemaining = remainingPct / velocityPerSecond;
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = Math.floor(secondsRemaining % 60);
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

export default function CommandBar({ 
  missionId,
  missionName, 
  coverage, 
  agents, 
  isRunning, 
  onTogglePlay, 
  onTriggerFailure, 
  onSpawnTarget,
  onEndMission
}) {
  const [elapsed, setElapsed] = useState(0);
  const [showFailDropdown, setShowFailDropdown] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isRunning) {
      interval = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (secs) => {
    const h = String(Math.floor(secs / 3600)).padStart(2, '0');
    const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
    const s = String(secs % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const activeAgents = agents.filter(a => a.status === 'active');
  const onlineAgentsCount = agents.filter(a => a.status !== 'offline').length;
  const eta = estimateETA(coverage, elapsed);

  const handleMassFailure = async () => {
    try {
      const res = await triggerMassFailure(missionId);
      console.log('Mass failure triggered:', res.data);
    } catch (err) {
      console.error('Mass failure trigger failed:', err);
    }
  };

  return (
    <div className="h-14 bg-[#0a1220] border-b border-[rgba(0,255,136,0.2)] px-6 flex items-center justify-between text-white select-none shrink-0 font-grotesk">
      {/* Left: Swarm-X status and Timer */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-3 w-3">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isRunning ? 'bg-[#00ff88]' : 'bg-yellow-500'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isRunning ? 'bg-[#00ff88]' : 'bg-yellow-500'}`}></span>
          </span>
          <span className="font-bold tracking-widest text-[#00ff88] text-lg">SWARM-X</span>
        </div>
        <div className="h-4 w-px bg-slate-800"></div>
        <div className="text-sm">
          <span className="text-slate-500 mr-2 uppercase tracking-wider text-xs">Sector:</span>
          <span className="font-semibold text-slate-200">{missionName}</span>
        </div>
        <div className="h-4 w-px bg-slate-800"></div>
        <div className="flex items-center font-mono text-sm space-x-2">
          <span className="text-slate-500 uppercase tracking-wider text-xs">Elapsed:</span>
          <span className="text-[#00d4ff] font-semibold">{formatTime(elapsed)}</span>
          {eta && (
            <>
              <span className="text-slate-600">|</span>
              <span style={{ color: '#94a3b8', fontSize: '11px', fontFamily: '"JetBrains Mono", monospace' }}>
                ETA: <span style={{ color: '#00ff88' }}>{eta}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Center: Mission Operations Controls */}
      <div className="flex items-center space-x-3 relative">
        <button
          onClick={onTogglePlay}
          className={`flex items-center space-x-2 px-4 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-colors ${
            isRunning 
              ? 'bg-[#152038] hover:bg-slate-700 text-yellow-400 border border-yellow-500/30' 
              : 'bg-[#00ff88] hover:bg-emerald-400 text-black'
          }`}
        >
          {isRunning ? <Pause size={14} /> : <Play size={14} />}
          <span>{isRunning ? 'Pause' : 'Resume'}</span>
        </button>

        {/* Trigger Failure Dropdown Toggle */}
        <div className="relative">
          <button
            onClick={() => setShowFailDropdown(!showFailDropdown)}
            className="flex items-center space-x-2 px-4 py-1.5 rounded text-xs font-semibold uppercase tracking-wider bg-red-600/20 border border-red-500/30 text-[#ff3b3b] hover:bg-red-600/30 transition-colors"
          >
            <ShieldAlert size={14} />
            <span>Trigger Failure</span>
          </button>
          
          {showFailDropdown && (
            <div className="absolute top-10 left-0 w-48 max-h-60 overflow-y-auto bg-[#0f1a2e] border border-red-500/40 rounded shadow-2xl z-50 py-1 font-mono text-xs">
              <div className="px-3 py-1.5 text-slate-500 uppercase font-grotesk font-semibold text-[10px] tracking-wider border-b border-slate-800">
                Select Offline Target
              </div>
              {agents.filter(a => a.status !== 'offline').length === 0 ? (
                <div className="px-3 py-2 text-slate-600">No active agents</div>
              ) : (
                agents.filter(a => a.status !== 'offline').map((ag) => (
                  <button
                    key={ag.id}
                    onClick={() => {
                      onTriggerFailure(ag.id);
                      setShowFailDropdown(false);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-red-600/20 hover:text-white text-slate-300 transition-colors flex justify-between items-center"
                  >
                    <span>{ag.id}</span>
                    <span className="text-[10px] text-slate-500">{ag.battery.toFixed(0)}%</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Mass Failure Button */}
        <button
          onClick={handleMassFailure}
          className="flex items-center space-x-2 px-4 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-colors"
          style={{
            background: 'rgba(255, 100, 0, 0.15)',
            border: '1px solid rgba(255, 100, 0, 0.5)',
            color: '#ff6400',
          }}
        >
          <Zap size={14} />
          <span>Mass Failure (30%)</span>
        </button>

        <button
          onClick={onSpawnTarget}
          className="flex items-center space-x-2 px-4 py-1.5 rounded text-xs font-semibold uppercase tracking-wider bg-yellow-500/20 border border-yellow-500/30 text-[#ffaa00] hover:bg-yellow-500/30 transition-colors"
        >
          <AlertTriangle size={14} />
          <span>Spawn Target</span>
        </button>

        <button
          onClick={onEndMission}
          className="flex items-center space-x-2 px-4 py-1.5 rounded text-xs font-semibold uppercase tracking-wider bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
        >
          <RotateCcw size={14} />
          <span>End Mission</span>
        </button>
      </div>

      {/* Right: Coverage and Fleet KPIs */}
      <div className="flex items-center space-x-6">
        <div className="text-right">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Live Coverage</div>
          <div className="text-xl font-bold font-mono text-white">
            {coverage.toFixed(1)}<span className="text-[#00ff88] text-sm font-semibold">%</span>
          </div>
        </div>
        <div className="h-6 w-px bg-slate-800"></div>
        <div className="text-right">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Active Fleet</div>
          <div className="text-xl font-bold font-mono text-[#00d4ff]">
            {onlineAgentsCount}<span className="text-slate-500 text-xs font-normal"> / {agents.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
