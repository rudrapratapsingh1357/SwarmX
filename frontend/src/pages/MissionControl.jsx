import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useSwarmSocket from '../hooks/useSwarmSocket';
import useMission from '../hooks/useMission';
import CommandBar from '../components/CommandBar';
import MissionMap from '../components/MissionMap';
import SwarmPanel from '../components/SwarmPanel';
import AlertFeed from '../components/AlertFeed';
import * as api from '../api/client';

export default function MissionControl() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { mission, fetchMission, endCurrentMission } = useMission();
  const [isRunning, setIsRunning] = useState(true);

  // Expose socket states
  const {
    connected,
    agents,
    targets,
    alerts,
    coverage,
    zoneCoverages,
    missionComplete,
    sendCommand
  } = useSwarmSocket(id);

  // Merge static zone polygons with live coverage percentages from WebSocket
  const liveZones = React.useMemo(() => {
    const staticZones = mission?.zones || [];
    return staticZones.map(z => ({
      ...z,
      coverage_pct: zoneCoverages[z.id] ?? z.coverage_pct ?? 0
    }));
  }, [mission?.zones, zoneCoverages]);

  useEffect(() => {
    fetchMission(id).catch(() => {
      navigate('/');
    });
  }, [id, fetchMission, navigate]);

  // Handle mission completion event from socket
  useEffect(() => {
    if (missionComplete) {
      setIsRunning(false);
      // Automatically redirect to debrief after 3.5 seconds
      const timeout = setTimeout(() => {
        navigate(`/report/${id}`);
      }, 3500);
      return () => clearTimeout(timeout);
    }
  }, [missionComplete, id, navigate]);

  const handleTogglePlay = async () => {
    if (isRunning) {
      await api.pauseMission(id);
      sendCommand('pause_simulation');
      setIsRunning(false);
    } else {
      await api.startMission(id);
      setIsRunning(true);
    }
  };

  const handleTriggerFailure = async (agentId) => {
    try {
      await api.triggerFailure(id, agentId);
      sendCommand('trigger_failure', { agent_id: agentId });
    } catch (err) {
      console.error('Failed to trigger agent failure:', err);
    }
  };

  const handleSpawnTarget = () => {
    // Generate random coordinates inside boundaries
    const px = Math.random() * (mission?.mission?.area_width_km || 10);
    const py = Math.random() * (mission?.mission?.area_height_km || 10);
    sendCommand('spawn_target', {
      target_type: 'survivor',
      pos_x: px,
      pos_y: py
    });
  };

  const handleVerifyTarget = async (targetId) => {
    try {
      await api.verifyTarget(id, targetId);
    } catch (err) {
      console.error('Failed to verify target:', err);
    }
  };

  const handleEndMission = async () => {
    try {
      await endCurrentMission(id);
      navigate(`/report/${id}`);
    } catch (err) {
      console.error('Failed to end mission:', err);
    }
  };

  if (!mission) {
    return (
      <div className="min-h-screen bg-[#050a12] text-slate-400 flex flex-col justify-center items-center font-mono">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00ff88] mb-4"></div>
        <span>Syncing telemetry systems...</span>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#050a12] flex flex-col overflow-hidden text-white">
      {/* 1. Top Command control bar */}
      <CommandBar
        missionId={id}
        missionName={mission.mission?.name || 'Search Mission'}
        coverage={coverage}
        agents={agents}
        isRunning={isRunning}
        onTogglePlay={handleTogglePlay}
        onTriggerFailure={handleTriggerFailure}
        onSpawnTarget={handleSpawnTarget}
        onEndMission={handleEndMission}
      />

      {/* Reconnecting overlay Banner if connection fails */}
      {!connected && (
        <div className="bg-[#ff3b3b]/20 border-b border-[#ff3b3b]/30 py-2 text-center text-xs font-mono text-[#ff3b3b] tracking-wider animate-pulse">
          ⚠️ TELEMETRY SIGNAL LOST — Re-establishing link with Commander...
        </div>
      )}

      {/* 2. Middle display block split: Map vs. SwarmPanel */}
      <div className="flex-1 flex overflow-hidden">
        <MissionMap
          agents={agents}
          zones={liveZones}
          targets={targets}
          areaWidth={mission.mission?.area_width_km || 10}
          areaHeight={mission.mission?.area_height_km || 10}
          environment={mission.mission?.environment}
        />
        <SwarmPanel
          agents={agents}
          targets={targets}
          coverage={coverage}
          onVerifyTarget={handleVerifyTarget}
        />
      </div>

      {/* 3. Bottom live Alert event feed */}
      <AlertFeed alerts={alerts} />
    </div>
  );
}
