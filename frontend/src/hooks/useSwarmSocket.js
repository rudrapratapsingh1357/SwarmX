import { useEffect, useRef, useState, useCallback } from 'react';

export default function useSwarmSocket(missionId) {
  const [connected, setConnected] = useState(false);
  const [agents, setAgents] = useState([]);
  const [targets, setTargets] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [coverage, setCoverage] = useState(0);
  const [zoneCoverages, setZoneCoverages] = useState({}); // { zone_id: coverage_pct }
  const [missionComplete, setMissionComplete] = useState(false);
  
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);
  const retryCountRef = useRef(0);
  
  const addAlert = useCallback((message, severity = 'info') => {
    const now = new Date();
    const receivedAt = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    setAlerts((prev) => {
      const newAlerts = [{ receivedAt, message, severity }, ...prev];
      if (newAlerts.length > 200) {
        return newAlerts.slice(0, 200);
      }
      return newAlerts;
    });
  }, []);

  const sendCommand = useCallback((type, data = {}) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, data }));
    } else {
      console.warn('WebSocket not connected. Cannot send command:', type);
    }
  }, []);

  // Use a ref-based connect so it's never in useEffect deps
  const connectRef = useRef(null);

  connectRef.current = () => {
    if (!missionId) return;

    // Cancel any pending reconnect from a previous socket's onclose
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clean up existing ping interval
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    // Reset state
    setAgents([]);
    setTargets([]);
    setAlerts([]);
    setCoverage(0);
    setZoneCoverages({});
    setMissionComplete(false);

    // Close existing socket — nulling socketRef first so
    // the old socket's onclose handler won't try to reconnect
    if (socketRef.current) {
      const oldSocket = socketRef.current;
      socketRef.current = null;
      oldSocket.close();
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.DEV ? `${window.location.hostname}:8000` : window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws/${missionId}`;
    
    console.log(`[WebSocket] Connecting to: ${wsUrl}`);
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      // Guard: if this socket was replaced before onopen fired, bail
      if (socketRef.current !== socket) return;

      console.log(`[WebSocket] Connection opened successfully`);
      setConnected(true);
      retryCountRef.current = 0;
      addAlert('Telemetry link established with AI Commander.', 'success');

      // Setup heartbeat ping every 15 seconds
      pingIntervalRef.current = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping', data: {} }));
        }
      }, 15000);
    };

    socket.onmessage = (event) => {
      // Guard: ignore messages from stale sockets
      if (socketRef.current !== socket) return;

      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        switch (type) {
          case 'status':
            addAlert(data.message, data.level || 'info');
            break;
            
          case 'swarm_state':
            setAgents(data.agents || []);
            setCoverage(data.coverage_pct || 0);
            break;

          case 'agent_failure':
            addAlert(`🔴 CRITICAL: Agent ${data.agent_id} offline! Reason: ${data.reason.replace('_', ' ')}.`, 'danger');
            setAgents((prev) =>
              prev.map((a) => (a.id === data.agent_id ? { ...a, status: 'offline', failure_reason: data.reason } : a))
            );
            break;

          case 'agent_low_battery':
            addAlert(`⚠️ WARNING: Agent ${data.agent_id} low battery (${data.battery.toFixed(1)}%). Returning to base.`, 'warning');
            setAgents((prev) =>
              prev.map((a) => (a.id === data.agent_id ? { ...a, status: 'returning', battery: data.battery } : a))
            );
            break;

          case 'agent_recovered':
            addAlert(`ℹ️ INFO: Agent ${data.agent_id} successfully docked at recharge port.`, 'info');
            setAgents((prev) =>
              prev.map((a) => (a.id === data.agent_id ? { ...a, status: 'charging' } : a))
            );
            break;

          case 'agent_recharged':
            addAlert(`🔋 SUCCESS: Agent ${data.agent_id} fully charged. Resuming search mission.`, 'success');
            setAgents((prev) =>
              prev.map((a) => (a.id === data.agent_id ? { ...a, status: 'resuming', battery: 100.0 } : a))
            );
            break;

          case 'zone_reassigned':
            addAlert(`⚡ Swarm Reorganization: Sector ${data.zone_id} reassigned to ${data.new_agents.join(', ')}.`, 'warning');
            break;

          case 'target_detected':
            addAlert(`🎯 TARGET FOUND: Detected potential ${data.target_type} (${(data.confidence * 100).toFixed(0)}% confidence) in sector.`, 'info');
            setTargets((prev) => {
              const exists = prev.some((t) => t.pos_x === data.pos_x && t.pos_y === data.pos_y);
              if (exists) return prev;
              return [data, ...prev];
            });
            break;
            
          case 'target_verified':
            addAlert(`✅ TARGET VERIFIED: Dispatched verification team: ${data.dispatched_agents.join(', ')}.`, 'success');
            setTargets((prev) =>
              prev.map((t) => (t.id === data.target_id ? { ...t, verified: true } : t))
            );
            break;

          case 'coverage_update':
            setCoverage(data.total_coverage_pct || 0);
            // Build a lookup map of zone_id -> coverage_pct
            if (data.zones && Array.isArray(data.zones)) {
              setZoneCoverages(prev => {
                const next = { ...prev };
                data.zones.forEach(z => { next[z.id] = z.coverage_pct; });
                return next;
              });
            }
            break;

          case 'mission_complete':
            addAlert(`🎉 MISSION ACCOMPLISHED: Coverage at ${data.coverage_pct}%. Swarm returning to base.`, 'success');
            setMissionComplete(true);
            break;

          case 'battery_swap':
            setAlerts(prev => [{
              type: 'battery_swap',
              severity: 'battery_swap',
              message: `⚡ BATTERY TRANSFER: Agent ${data.receiver_id.slice(-3)} received charge from ${data.donor_id.slice(-3)}. Both continuing mission. (${data.receiver_battery_after}% / ${data.donor_battery_after}%)`,
              receivedAt: new Date().toLocaleTimeString('en-US', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
              })
            }, ...prev.slice(0, 199)]);
            break;

          case 'alert':
            addAlert(data.message, data.severity || 'info');
            break;

          default:
            break;
        }
      } catch (err) {
        console.error('Error handling WebSocket message:', err);
      }
    };

    socket.onclose = (e) => {
      console.log(`[WebSocket] Closed. Code: ${e.code}, Reason: ${e.reason}, Clean: ${e.wasClean}`);

      // KEY FIX: Only reconnect if this socket is still the active one.
      // If socketRef.current is null (cleanup ran) or points to a different
      // socket (connect() was called again), this is a stale close — ignore it.
      if (socketRef.current !== socket) {
        console.log('[WebSocket] Stale socket closed, ignoring.');
        return;
      }

      setConnected(false);
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      if (retryCountRef.current < 5) {
        const timeout = Math.pow(2, retryCountRef.current) * 1000;
        console.log(`[WebSocket] Reconnecting in ${timeout}ms (attempt ${retryCountRef.current + 1})...`);
        reconnectTimeoutRef.current = setTimeout(() => {
          retryCountRef.current += 1;
          if (connectRef.current) connectRef.current();
        }, timeout);
      } else {
        addAlert('Telemetry link lost permanently. Max retry limit reached.', 'danger');
      }
    };

    socket.onerror = (err) => {
      console.error('[WebSocket] Error encountered:', err);
      socket.close();
    };
  };

  useEffect(() => {
    console.log('[WebSocket] useEffect triggered for mission:', missionId);
    if (connectRef.current) connectRef.current();

    return () => {
      console.log('[WebSocket] useEffect cleanup: closing socket');

      // Cancel any pending reconnect FIRST
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Clean up ping interval
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }

      // Null out socketRef BEFORE closing so that the onclose
      // handler sees socketRef.current !== socket and bails out
      if (socketRef.current) {
        const sock = socketRef.current;
        socketRef.current = null;
        sock.close();
      }
    };
  }, [missionId]);

  return {
    connected,
    agents,
    targets,
    alerts,
    coverage,
    zoneCoverages,
    missionComplete,
    sendCommand,
  };
}
