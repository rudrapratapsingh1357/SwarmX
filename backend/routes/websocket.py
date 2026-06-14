import json
import asyncio
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from models.db import get_db_connection, close_db
from services.agent_sim import SwarmSimulation
from services.mission_memory import save_mission_snapshot, get_mission_report
from services.recovery import recalculate_coverage

router = APIRouter()

# Global registry of active simulations to allow route integration
active_simulations = {}

@router.websocket("/ws/{mission_id}")
async def websocket_endpoint(websocket: WebSocket, mission_id: str):
    await websocket.accept()
    
    # 1. Send status
    await websocket.send_json({"type": "status", "data": {"message": "SWARM-X Online. Mission loaded.", "level": "info"}})
    
    # 2. Load mission & agents from DB
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM missions WHERE id = ?", (mission_id,))
    mission_row = cursor.fetchone()
    
    if not mission_row:
        await websocket.send_json({"type": "status", "data": {"message": "Mission not found", "level": "error"}})
        await websocket.close()
        return
        
    mission_dict = dict(mission_row)
    environment = mission_dict.get("environment", "urban_rubble")
    
    # Load agents
    cursor.execute("SELECT * FROM agents WHERE mission_id = ?", (mission_id,))
    agents_data = [dict(r) for r in cursor.fetchall()]
    
    # Load zones
    cursor.execute("SELECT * FROM zones WHERE mission_id = ?", (mission_id,))
    zones_data = []
    for r in cursor.fetchall():
        zd = dict(r)
        try:
            zd["polygon"] = json.loads(zd["polygon"])
        except Exception:
            zd["polygon"] = []
        zones_data.append(zd)
        
    close_db(conn)
    
    # 3. Initialize SwarmSimulation with loaded state
    if mission_id not in active_simulations:
        sim = SwarmSimulation(mission_id)
        pattern = mission_dict.get("pattern", "boustrophedon")
        sim.initialize(agents_data, zones_data, environment, pattern)
        active_simulations[mission_id] = sim
    else:
        sim = active_simulations[mission_id]
        
    sim.running = True
    
    # Background task for sending simulation updates
    async def simulation_loop():
        try:
            # First tick logic (choreography details)
            target_choreographed = False
            
            while sim.running:
                # Simulation speed adjustments
                interval = 0.5 / sim.speed_multiplier
                await asyncio.sleep(interval)
                
                sim.tick_count += 1
                delta_seconds = 0.5
                
                # Update loop for agents
                events = []
                active_agents_list = list(sim.agents.values())
                
                # Choreographed target detection at tick 60 if none detected
                if sim.tick_count == 60 and not target_choreographed:
                    targets_found = len(sim.targets)
                    if targets_found == 0:
                        # Guarantee first detection
                        sim.spawn_target("survivor", 3.0, 4.0)
                        target_choreographed = True
                
                from services.battery_manager import find_swap_candidate, execute_battery_swap

                for agent in active_agents_list:
                    if agent.status == "offline":
                        continue
                    
                    # Battery swap check — only triggers at 28-32% range
                    # Below 20% it's too late to swap, just return to base
                    if agent.status == 'active' and not getattr(agent, 'is_swapping', False) and (20.0 < agent.battery <= 32.0):
                        all_agent_dicts = [a.__dict__ for a in active_agents_list]
                        donor = find_swap_candidate(agent.__dict__, all_agent_dicts)
                        
                        if donor:
                            donor_agent = sim.agents[donor['id']]
                            
                            # Execute swap on both agents
                            updated_receiver, updated_donor = execute_battery_swap(
                                agent.__dict__, donor_agent.__dict__
                            )
                            
                            # Apply updates back to agent objects
                            agent.battery = updated_receiver['battery']
                            agent.is_swapping = True
                            agent.swap_cooldown = updated_receiver.get('swap_cooldown', 8)
                            
                            donor_agent.battery = updated_donor['battery']
                            donor_agent.is_swapping = True
                            donor_agent.swap_cooldown = updated_donor.get('swap_cooldown', 8)
                            
                            # Send WebSocket event
                            swap_event = {
                                "type": "battery_swap",
                                "data": {
                                    "receiver_id": agent.id,
                                    "donor_id": donor_agent.id,
                                    "receiver_battery_after": round(agent.battery, 1),
                                    "donor_battery_after": round(donor_agent.battery, 1),
                                    "pos_x": agent.pos_x,
                                    "pos_y": agent.pos_y
                                }
                            }
                            await websocket.send_json(swap_event)
                            
                    agent.target_count = len(sim.targets)
                    event = agent.tick(delta_seconds, sim.environment)
                    if event:
                        events.append(event)
                        
                # Update zone coverages based on agent positions
                for zone in sim.zones:
                    assigned_agent = sim.agents.get(zone["assigned_agent_id"])
                    if assigned_agent:
                        completion_ratio = min(1.0, assigned_agent.tasks_completed / max(1, len(assigned_agent.zone_waypoints)))
                        zone["coverage_pct"] = round(completion_ratio * 100, 1)
                            
                # Recalculate global coverage
                total_coverage = recalculate_coverage(sim.zones)
                
                # Check for mission completion
                if total_coverage >= 98.0:
                    sim.running = False
                    # Update status in db
                    conn = get_db_connection()
                    cursor = conn.cursor()
                    cursor.execute("UPDATE missions SET status = 'completed', ended_at = ? WHERE id = ?", (datetime.utcnow().isoformat(), mission_id))
                    conn.commit()
                    close_db(conn)
                    await websocket.send_json({
                        "type": "mission_complete",
                        "data": {
                            "coverage_pct": round(total_coverage, 1),
                            "targets_found": len(sim.targets),
                            "elapsed_seconds": int(sim.tick_count * 0.5)
                        }
                    })
                    break
                    
                # Save events & push to WebSocket
                for event in events:
                    event_type = event["event_type"]
                    agent_id = event["agent_id"]
                    msg = event["message"]
                    severity = event.get("severity", "info")
                    payload = event.get("payload")
                    
                    # Store target detections in DB
                    if event_type == "target_detected" and payload:
                        conn = get_db_connection()
                        cursor = conn.cursor()
                        cursor.execute("""
                        INSERT INTO targets (mission_id, agent_id, target_type, confidence, pos_x, pos_y, description)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """, (mission_id, agent_id, payload["target_type"], payload["confidence"], payload["pos_x"], payload["pos_y"], payload["description"]))
                        target_id = cursor.lastrowid
                        conn.commit()
                        close_db(conn)
                        payload["id"] = target_id
                        sim.targets.append(payload)
                        
                    sim.save_event_to_db(event_type, agent_id, msg, severity)
                    
                    # Push WS notification
                    await websocket.send_json({
                        "type": event_type,
                        "data": payload or {"agent_id": agent_id, "message": msg, "battery": sim.agents[agent_id].battery if agent_id in sim.agents else 100.0}
                    })
                    
                # Periodic state broadcast every 5 ticks (2.5 seconds)
                if sim.tick_count % 5 == 0:
                    agents_state = []
                    for ag in sim.agents.values():
                        agents_state.append({
                            "id": ag.id,
                            "status": ag.status,
                            "battery": round(ag.battery, 1),
                            "pos_x": round(ag.pos_x, 3),
                            "pos_y": round(ag.pos_y, 3),
                            "zone_id": ag.zone_id,
                            "tasks_completed": ag.tasks_completed,
                            "heading": ag.get_heading(),
                            "failure_reason": ag.failure_reason,
                            "is_swapping": getattr(ag, "is_swapping", False)
                        })
                        
                    await websocket.send_json({
                        "type": "swarm_state",
                        "data": {
                            "agents": agents_state,
                            "coverage_pct": round(total_coverage, 1),
                            "tick": sim.tick_count
                        }
                    })
                    
                    # Send coverage updates specifically
                    await websocket.send_json({
                        "type": "coverage_update",
                        "data": {
                            "zones": [{"id": z["zone_id"], "coverage_pct": z["coverage_pct"]} for z in sim.zones],
                            "total_coverage_pct": round(total_coverage, 1)
                        }
                    })
                    
                # Send queued events
                while sim.events_queue:
                    queued = sim.events_queue.pop(0)
                    await websocket.send_json(queued)
                    
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Exception in simulation loop: {e}")
            
    # Helper math distance
    def math_dist(p1, p2):
        return math.hypot(p1[0] - p2[0], p1[1] - p2[1])

    import math

    sim_task = asyncio.create_task(simulation_loop())
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            msg_type = message.get("type")
            msg_data = message.get("data", {})
            
            if msg_type == "trigger_failure":
                agent_id = msg_data.get("agent_id")
                sim.handle_failure(agent_id, "manual_trigger")
                
            elif msg_type == "spawn_target":
                t_type = msg_data.get("target_type", "survivor")
                px = msg_data.get("pos_x", 5.0)
                py = msg_data.get("pos_y", 5.0)
                sim.spawn_target(t_type, px, py)
                
            elif msg_type == "pause_simulation":
                sim.running = False
                
            elif msg_type == "ping":
                await websocket.send_json({"type": "pong", "data": {}})
                
    except WebSocketDisconnect:
        # Pause loop, save current snapshot to DB
        sim.running = False
        sim_task.cancel()
        
        # Save snapshot
        agents_list = []
        for ag in sim.agents.values():
            agents_list.append({
                "id": ag.id,
                "agent_type": "drone",
                "status": ag.status,
                "battery": ag.battery,
                "pos_x": ag.pos_x,
                "pos_y": ag.pos_y,
                "zone_id": ag.zone_id,
                "tasks_completed": ag.tasks_completed,
                "failure_reason": ag.failure_reason
            })
            
        zones_list = []
        for z in sim.zones:
            zones_list.append({
                "zone_id": z["zone_id"],
                "polygon": z["polygon"],
                "assigned_agent_id": z["assigned_agent_id"],
                "coverage_pct": z["coverage_pct"],
                "status": z["status"]
            })
            
        save_mission_snapshot(mission_id, {"agents": agents_list, "zones": zones_list})
        
        if mission_id in active_simulations:
            del active_simulations[mission_id]
            
        print(f"WS Client disconnected for mission: {mission_id}")
