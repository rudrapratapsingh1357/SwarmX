import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cpu, Zap, Compass, AlertCircle } from 'lucide-react';
import * as api from '../api/client';

export default function Landing() {
  const navigate = useNavigate();
  const [name, setName] = useState('Operation Alpha');
  const [agentCount, setAgentCount] = useState(50);
  const [areaSize, setAreaSize] = useState(100);
  const [environment, setEnvironment] = useState('urban_rubble');
  const [pattern, setPattern] = useState('boustrophedon');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const presets = [
    { label: 'DEMO', count: 25 },
    { label: 'STANDARD', count: 50 },
    { label: 'MAX', count: 100 }
  ];

  const handleLaunch = async (e) => {
    e.preventDefault();
    if (agentCount < 10 || agentCount > 500) {
      setError('Agent fleet must be between 10 and 500 agents.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const areaDim = Math.round(Math.sqrt(areaSize));
      const response = await api.createMission({
        name,
        area_width_km: areaDim,
        area_height_km: areaDim,
        agent_count: agentCount,
        objective: 'locate_survivors',
        environment,
        pattern
      });
      
      const { mission_id } = response.data;
      
      // Start simulation loop on backend
      await api.startMission(mission_id);
      
      // Navigate to mission control
      navigate(`/mission/${mission_id}`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to initialize search mission.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050a12] text-white flex flex-col justify-center items-center px-4 py-8 font-grotesk relative overflow-hidden select-none">
      
      {/* Background Decorative Tech Lines */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(0,212,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,212,255,0.02)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      
      <div className="max-w-md w-full space-y-8 z-10">
        
        {/* Header Block */}
        <div className="text-center space-y-2">
          <h1 className="text-5xl font-bold tracking-widest uppercase">
            <span className="text-[#00ff88]">SWARM</span>
            <span className="text-white">-X</span>
          </h1>
          <p className="text-slate-400 text-sm italic">
            "Autonomous search. Zero blind spots. No agent left behind."
          </p>
        </div>

        {/* Center: Animated Radar Sweep Sweep Effect */}
        <div className="flex justify-center my-6">
          <div className="w-56 h-56 rounded-full border border-[#00ff88]/20 bg-slate-900/30 flex items-center justify-center relative overflow-hidden shadow-[0_0_30px_rgba(0,255,136,0.05)]">
            {/* Spinning radar beam */}
            <div className="absolute inset-0 rounded-full radar-sweep-effect opacity-60 bg-[conic-gradient(from_0deg,transparent_40%,rgba(0,255,136,0.3))] pointer-events-none" />
            
            {/* Radar Concentric Rings */}
            <div className="absolute w-40 h-40 rounded-full border border-[#00d4ff]/10" />
            <div className="absolute w-24 h-24 rounded-full border border-[#00d4ff]/10" />
            <div className="absolute w-8 h-8 rounded-full border border-[#00d4ff]/10" />
            
            {/* Blinking Targets */}
            <div className="absolute w-1.5 h-1.5 bg-[#00ff88] rounded-full top-1/4 left-1/3 animate-ping" />
            <div className="absolute w-1.5 h-1.5 bg-[#00d4ff] rounded-full top-2/3 left-1/2 animate-pulse" />
            <div className="absolute w-1.5 h-1.5 bg-[#ff3b3b] rounded-full top-1/2 left-3/4 animate-pulse" />
            
            <Compass size={40} className="text-[#00ff88]/40 animate-pulse" />
          </div>
        </div>

        {/* Form Block */}
        <form onSubmit={handleLaunch} className="bg-[#0a1220] border border-[rgba(0,255,136,0.15)] rounded-lg p-6 space-y-4 shadow-2xl relative">
          
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-[#ff3b3b] text-xs p-3 rounded flex items-center space-x-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Mission Identifier</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full bg-[#0f1a2e] border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff88] font-mono transition-colors"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs uppercase tracking-widest text-slate-500 font-semibold">Agent Count</label>
              <div className="flex space-x-1">
                {presets.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setAgentCount(preset.count)}
                    className={`px-2 py-0.5 rounded text-[9px] font-bold border transition-colors ${
                      agentCount === preset.count
                        ? 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/30'
                        : 'bg-slate-900 text-slate-500 border-slate-800 hover:text-white'
                    }`}
                  >
                    {preset.label} ({preset.count})
                  </button>
                ))}
              </div>
            </div>
            <input 
              type="number" 
              min={10}
              max={500}
              value={agentCount}
              onChange={(e) => setAgentCount(parseInt(e.target.value) || 0)}
              required
              className="w-full bg-[#0f1a2e] border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff88] font-mono transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Area Size (km²)</label>
              <input 
                type="number" 
                min={1}
                max={500}
                value={areaSize}
                onChange={(e) => setAreaSize(parseInt(e.target.value) || 1)}
                required
                className="w-full bg-[#0f1a2e] border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff88] font-mono transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Environment</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full bg-[#0f1a2e] border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff88] font-grotesk transition-colors"
              >
                <option value="urban_rubble">Urban Rubble</option>
                <option value="forest_wilderness">Forest / Wilderness</option>
                <option value="flood_zone">Flood Zone</option>
                <option value="open_desert">Open Desert</option>
                <option value="maritime_coastal">Maritime / Coastal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest text-slate-500 font-semibold mb-1">Search Pattern</label>
            <select
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              className="w-full bg-[#0f1a2e] border border-slate-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff88] font-grotesk transition-colors"
            >
              <option value="boustrophedon">Lawnmower (Grid Grid Search)</option>
              <option value="radial">Radial (Circular Spiral Search)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#00ff88] hover:bg-emerald-400 text-black font-bold uppercase tracking-wider rounded text-sm transition-colors flex items-center justify-center space-x-2"
          >
            {loading ? (
              <span>Deploying Swarm...</span>
            ) : (
              <>
                <Zap size={16} />
                <span>Launch Swarm Mission</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
