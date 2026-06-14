import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft, Filter, AlertTriangle, ShieldAlert, Cpu } from 'lucide-react';
import * as api from '../api/client';
import StatsRow from '../components/StatsRow';

export default function MissionReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const fetchReport = async () => {
      try {
        // Retrieve mission data or final report via API
        const response = await api.getMission(id);
        const missionInfo = response.data.mission;
        
        // Reconstruct report mock/data safely
        const events = response.data.events.reverse() || [];
        const deployed = response.data.agents.length;
        const failed = response.data.agents.filter(a => a.status === 'offline').length;
        const targetsFound = response.data.targets.length;
        const survivorsFound = response.data.targets.filter(t => t.target_type === 'survivor').length;
        
        // Compute duration
        let duration = 120;
        if (missionInfo.started_at) {
          const start = new Date(missionInfo.started_at);
          const end = missionInfo.ended_at ? new Date(missionInfo.ended_at) : new Date();
          duration = Math.max(10, Math.floor((end - start) / 1000));
        }

        const avgCoverage = response.data.zones.reduce((acc, z) => acc + z.coverage_pct, 0) / (response.data.zones.length || 1);

        setReport({
          mission_id: id,
          name: missionInfo.name,
          duration_seconds: duration,
          agents_deployed: deployed,
          agents_failed: failed,
          targets_found: targetsFound,
          survivors_found: survivorsFound,
          coverage_pct: avgCoverage,
          events: response.data.events
        });
      } catch (err) {
        console.error('Error fetching mission report:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050a12] text-slate-400 flex flex-col justify-center items-center font-mono">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00ff88] mb-4"></div>
        <span>Compiling mission logs...</span>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-[#050a12] text-slate-400 flex flex-col justify-center items-center font-grotesk text-center p-6">
        <AlertTriangle size={48} className="text-[#ffaa00] mb-4 animate-bounce" />
        <h2 className="text-xl font-bold mb-2">Report Compilation Interrupted</h2>
        <p className="text-sm max-w-sm text-slate-500 mb-6">We could not reconstruct this mission debrief. Confirm ID exists in system logs.</p>
        <button onClick={() => navigate('/')} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold transition-colors flex items-center space-x-2">
          <ArrowLeft size={16} />
          <span>Launch Pad</span>
        </button>
      </div>
    );
  }

  // 1. Coverage over time line chart points
  const steps = 10;
  const coverageData = [];
  for (let i = 0; i <= steps; i++) {
    const timeLabel = `${Math.round((report.duration_seconds / steps) * i)}s`;
    // Simulated progressive coverage curves
    const progress = (i / steps);
    const value = Math.min(report.coverage_pct, report.coverage_pct * (Math.sin((progress * Math.PI) / 2)));
    coverageData.push({
      time: timeLabel,
      coverage: parseFloat(value.toFixed(1))
    });
  }

  // 2. Failures chart
  const failureTimeline = [
    { name: '0-1m', failures: 0 },
    { name: '1-2m', failures: Math.min(report.agents_failed, 1) },
    { name: '2-3m', failures: Math.max(0, Math.min(report.agents_failed - 1, 2)) },
    { name: '3-4m', failures: Math.max(0, report.agents_failed - 3) },
  ];

  // 3. Filtered events
  const filteredEvents = report.events.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'failures') return e.event_type === 'agent_failure';
    if (filter === 'targets') return e.event_type === 'target_detected' || e.event_type === 'target_verified';
    return e.severity === 'warning' || e.severity === 'danger';
  });

  return (
    <div className="min-h-screen bg-[#050a12] text-white px-8 py-8 font-grotesk overflow-y-auto select-none">
      
      {/* Header section */}
      <div className="flex justify-between items-center mb-8 border-b border-slate-900 pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-widest uppercase">
            Mission Debrief <span className="text-slate-500">—</span> <span className="text-[#00ff88]">{report.name}</span>
          </h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-mono">Mission Code: {report.mission_id}</p>
        </div>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-[#00ff88] hover:bg-[#00ff88]/90 text-black text-xs font-bold uppercase tracking-wider rounded transition-colors"
        >
          Start New Mission
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="mb-8">
        <StatsRow report={report} />
      </div>

      {/* Charts Block */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        
        {/* Coverage plot */}
        <div className="bg-[#0a1220] border border-slate-900 rounded-lg p-6 flex flex-col shadow-2xl h-[340px]">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Area Search Velocity Plot</h3>
          <div className="flex-1 w-full font-mono text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={coverageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="time" stroke="#64748b" />
                <YAxis stroke="#64748b" unit="%" />
                <Tooltip contentStyle={{ backgroundColor: '#0f1a2e', borderColor: 'rgba(0, 255, 136, 0.2)' }} />
                <Line type="monotone" dataKey="coverage" stroke="#00ff88" strokeWidth={2.5} dot={{ fill: '#00ff88' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Failures distribution */}
        <div className="bg-[#0a1220] border border-slate-900 rounded-lg p-6 flex flex-col shadow-2xl h-[340px]">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">Failures Distribution Over Time</h3>
          <div className="flex-1 w-full font-mono text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={failureTimeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip contentStyle={{ backgroundColor: '#0f1a2e', borderColor: 'rgba(255, 59, 59, 0.2)' }} />
                <Bar dataKey="failures" fill="#ff3b3b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Historical Event Logs */}
      <div className="bg-[#0a1220] border border-slate-900 rounded-lg p-6 shadow-2xl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Log Archive Timeline</h3>
          
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs">
            <Filter size={14} className="text-slate-500" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-transparent text-slate-300 focus:outline-none uppercase font-bold text-[10px]"
            >
              <option value="all">All Logs</option>
              <option value="failures">Failures Only</option>
              <option value="targets">Detections Only</option>
              <option value="warnings">Warnings / Danger</option>
            </select>
          </div>
        </div>

        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 font-mono text-xs">
          {filteredEvents.length === 0 ? (
            <div className="text-slate-700 text-center py-8">No matching entries found.</div>
          ) : (
            filteredEvents.map((evt, idx) => (
              <div key={idx} className="flex space-x-2 border-b border-slate-950 pb-2">
                <span className="text-slate-600">[{new Date(evt.created_at || Date.now()).toLocaleTimeString()}]</span>
                <span className={`uppercase text-[10px] px-1 border rounded bg-slate-900/50 ${
                  evt.severity === 'danger' ? 'text-red-500 border-red-500/20' :
                  evt.severity === 'warning' ? 'text-yellow-500 border-yellow-500/20' :
                  evt.severity === 'success' ? 'text-emerald-400 border-emerald-400/20' : 'text-cyan-400 border-cyan-400/20'
                }`}>{evt.severity}</span>
                <span className="text-slate-300">{evt.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
