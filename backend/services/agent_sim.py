import os
import math
import random
import asyncio
import json
from datetime import datetime
from dotenv import load_dotenv
from models.db import get_db_connection, close_db
from services.battery_manager import should_return
from services.target_detector import simulate_detection, assign_confidence
from services.recovery import redistribute_zone, recalculate_coverage

load_dotenv()

DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"
DEFAULT_DRAIN = 0.08 if DEMO_MODE else 0.05

class SimulatedAgent:
    def __init__(self, agent_id: str, mission_id: str, zone_id: int, waypoints: list):
        self.id = agent_id
        self.mission_id = mission_id
        self.status = "active"  # active, returning, charging, offline, resuming
        self.battery = 100.0
        
        # Position initialization (starts at base station 0,0)
        self.pos_x = 0.0
        self.pos_y = 0.0
        
        self.zone_id = zone_id
        self.zone_waypoints = waypoints
        self.waypoint_index = 0
        self.tasks_completed = 0
        
        self.speed_kmh = float(os.getenv("DEFAULT_AGENT_SPEED_KMH", "30.0"))
        # Tick interval is 0.5 seconds
        self.battery_drain_rate = float(os.getenv("DEFAULT_BATTERY_DRAIN_RATE", str(DEFAULT_DRAIN)))
        
        self.last_seen = datetime.utcnow()
        self.failure_reason = None
        self.target_count = 0
        self.is_swapping = False
        self.swap_cooldown = 0
        self.swap_cooldown_total = 8
        self.trip_count = 0
        
        # Radial path parameters (set by SwarmSimulation.initialize for radial pattern)
        self.radial_base_phi = None
        self.radial_max_r = 0.0
        self.radial_sector_width = 0.0
        
        # Current navigation target
        if waypoints:
            self.target_x, self.target_y = waypoints[0]
        else:
            self.target_x, self.target_y = 0.0, 0.0

        try:
            idx = int(agent_id.split('_')[-1])
        except Exception:
            idx = 1
        self.release_delay_ticks = (idx - 1) * 8

    def tick(self, delta_seconds: float, environment: str = "urban_rubble") -> dict | None:
        """
        Advances agent state by one simulation step.
        Returns event dict if something notable happened, else None.
        """
        self.last_seen = datetime.utcnow()
        
        if self.status == "offline":
            return None

        if getattr(self, 'release_delay_ticks', 0) > 0:
            if math.hypot(self.pos_x, self.pos_y) > 0.05:
                self.release_delay_ticks = 0
            elif self.status == "active":
                self.release_delay_ticks -= 1
                self.pos_x = 0.0
                self.pos_y = 0.0
                return None
            
        if getattr(self, 'is_swapping', False):
            self.swap_cooldown -= 1
            if self.swap_cooldown <= 0:
                self.is_swapping = False
                self.swap_cooldown = 0
            return None  # Don't move or drain battery during swap tick
            
        # 1. Drain battery
        if self.status != "charging":
            self.battery = max(0.0, self.battery - self.battery_drain_rate)
            
        # 2. Check battery status
        if self.battery <= 0:
            self.status = "offline"
            self.failure_reason = "battery_depleted"
            return {
                "event_type": "agent_failure",
                "agent_id": self.id,
                "message": f"Agent {self.id} battery depleted. Going offline.",
                "severity": "danger"
            }
            
        # 3. Behavior state machine
        if self.status == "charging":
            self.battery = min(100.0, self.battery + 2.0)  # Charge 2% per tick
            if self.battery >= 100.0:
                self.status = "resuming"
                self.trip_count += 1
                
                # If radial mode, shift angle to explore the gap between previous rays
                if self.radial_base_phi is not None:
                    offset = (self.radial_sector_width / 2.0) if (self.trip_count % 2 == 1) else 0.0
                    new_phi = self.radial_base_phi + offset
                    R = self.radial_max_r
                    new_waypoints = []
                    step = 0.3
                    t_val = step
                    while t_val < R:
                        new_waypoints.append((t_val * math.cos(new_phi), t_val * math.sin(new_phi)))
                        t_val += step
                    new_waypoints.append((R * math.cos(new_phi), R * math.sin(new_phi)))
                    self.zone_waypoints = new_waypoints
                    self.waypoint_index = 0
                
                return {
                    "event_type": "agent_recharged",
                    "agent_id": self.id,
                    "message": f"Agent {self.id} fully recharged. Resuming mission.",
                    "severity": "success"
                }
            return None
            
        elif self.status == "returning":
            # Heading back to base (0,0)
            self.target_x, self.target_y = 0.0, 0.0
            self.move_toward_waypoint(delta_seconds)
            if self.pos_x == 0.0 and self.pos_y == 0.0:
                self.status = "charging"
                return {
                    "event_type": "agent_recovered",
                    "agent_id": self.id,
                    "message": f"Agent {self.id} docked at base. Charging started.",
                    "severity": "info"
                }
            return None
            
        elif self.status == "resuming":
            # Navigating back to its zone waypoints
            if self.zone_waypoints:
                self.target_x, self.target_y = self.zone_waypoints[self.waypoint_index % len(self.zone_waypoints)]
                self.move_toward_waypoint(delta_seconds)
                dist_to_target = math.hypot(self.pos_x - self.target_x, self.pos_y - self.target_y)
                if dist_to_target < 0.05:  # Close enough
                    self.status = "active"
                    return {
                        "event_type": "agent_resumed",
                        "agent_id": self.id,
                        "message": f"Agent {self.id} returned to search sector {self.zone_id}.",
                        "severity": "info"
                    }
            else:
                self.status = "active"
            return None
            
        else: # active search mode
            # Battery safety check
            if should_return({"battery": self.battery, "pos_x": self.pos_x, "pos_y": self.pos_y, "speed_kmh": self.speed_kmh, "drain_rate": self.battery_drain_rate}, self.base_position if hasattr(self, 'base_position') else (0.0, 0.0)):
                self.status = "returning"
                return {
                    "event_type": "agent_low_battery",
                    "agent_id": self.id,
                    "message": f"Agent {self.id} low battery ({self.battery:.1f}%). Returning to base.",
                    "severity": "warning"
                }
                
            # Move along path
            if self.zone_waypoints:
                self.target_x, self.target_y = self.zone_waypoints[self.waypoint_index % len(self.zone_waypoints)]
                self.move_toward_waypoint(delta_seconds)
                
                # Check if waypoint reached
                dist_to_target = math.hypot(self.pos_x - self.target_x, self.pos_y - self.target_y)
                if dist_to_target < 0.05:
                    self.tasks_completed += 1
                    self.waypoint_index = (self.waypoint_index + 1) % len(self.zone_waypoints)
            
            # Simulate target detection
            detection = simulate_detection(self.id, self.pos_x, self.pos_y, environment, current_target_count=self.target_count)
            if detection:
                return {
                    "event_type": "target_detected",
                    "agent_id": self.id,
                    "message": f"Agent {self.id} detected a {detection['target_type']} ({int(detection['confidence']*100)}% confidence).",
                    "severity": "info",
                    "payload": detection
                }
                
        return None

    def move_toward_waypoint(self, delta_seconds: float):
        """Moves agent toward current target_x and target_y."""
        speed_kms = (self.speed_kmh / 3600.0)  # km per second
        distance_to_move = speed_kms * delta_seconds
        
        dx = self.target_x - self.pos_x
        dy = self.target_y - self.pos_y
        distance = math.hypot(dx, dy)
        
        if distance <= distance_to_move:
            self.pos_x = self.target_x
            self.pos_y = self.target_y
        else:
            self.pos_x += (dx / distance) * distance_to_move
            self.pos_y += (dy / distance) * distance_to_move

    def get_heading(self) -> float:
        """Returns heading in radians toward current target."""
        dx = self.target_x - self.pos_x
        dy = self.target_y - self.pos_y
        return math.atan2(dy, dx)


class SwarmSimulation:
    def __init__(self, mission_id: str):
        self.mission_id = mission_id
        self.agents = {}
        self.zones = []
        self.targets = []
        self.events_queue = []
        self.running = False
        self.tick_count = 0
        self.base_position = (0.0, 0.0)
        self.environment = "urban_rubble"
        self.speed_multiplier = 2.0 # Default 2x

    def initialize(self, agents_data: list, zones_data: list, environment: str = "urban_rubble", pattern: str = "boustrophedon"):
        self.environment = environment
        self.pattern = pattern
        self.zones = []
        for z in zones_data:
            polygon = z.get("polygon", [])
            # Pre-calculate centroids
            if polygon:
                xs = [pt[0] for pt in polygon]
                ys = [pt[1] for pt in polygon]
                centroid = (sum(xs)/len(xs), sum(ys)/len(ys))
            else:
                centroid = (0.0, 0.0)
                
            # Waypoints generation based on selected pattern
            if pattern == "radial":
                if polygon:
                    phi = math.atan2(centroid[1], centroid[0])
                    max_r = max(math.hypot(pt[0], pt[1]) for pt in polygon)
                else:
                    phi = 0.0
                    max_r = 0.0
                
                waypoints = []
                step = 0.3
                t_val = step
                while t_val < max_r:
                    waypoints.append((t_val * math.cos(phi), t_val * math.sin(phi)))
                    t_val += step
            else:
                from services.partitioner import generate_boustrophedon_path
                waypoints = generate_boustrophedon_path(polygon)
            
            self.zones.append({
                "zone_id": z.get("id"),
                "polygon": polygon,
                "centroid": centroid,
                "waypoints": waypoints,
                "waypoint_index": 0,
                "coverage_pct": z.get("coverage_pct", 0.0),
                "assigned_agent_id": z.get("assigned_agent_id"),
                "status": z.get("status", "assigned")
            })
            
        self.agents = {}
        # Match zone waypoints to agents
        for ag in agents_data:
            zone_id = ag.get("zone_id")
            zone_waypoints = []
            for z in self.zones:
                if z["zone_id"] == zone_id:
                    zone_waypoints = z["waypoints"]
                    break
                    
            agent_obj = SimulatedAgent(
                agent_id=ag.get("id"),
                mission_id=self.mission_id,
                zone_id=zone_id,
                waypoints=zone_waypoints
            )
            if self.pattern == "radial":
                for z in self.zones:
                    if z["zone_id"] == zone_id:
                        polygon = z.get("polygon", [])
                        centroid = z.get("centroid", (0.0, 0.0))
                        if polygon:
                            agent_obj.radial_base_phi = math.atan2(centroid[1], centroid[0])
                            agent_obj.radial_max_r = max(math.hypot(pt[0], pt[1]) for pt in polygon)
                            agent_obj.radial_sector_width = (2.0 * math.pi) / max(1, len(self.zones))
                        break
            agent_obj.status = ag.get("status", "active")
            agent_obj.battery = ag.get("battery", 100.0)
            agent_obj.pos_x = ag.get("pos_x", 0.0)
            agent_obj.pos_y = ag.get("pos_y", 0.0)
            agent_obj.tasks_completed = ag.get("tasks_completed", 0)
            self.agents[agent_obj.id] = agent_obj

    def enqueue_event(self, event: dict):
        self.events_queue.append(event)

    def handle_failure(self, agent_id: str, reason: str):
        if agent_id in self.agents:
            agent = self.agents[agent_id]
            if agent.status == "offline":
                return
            agent.status = "offline"
            agent.failure_reason = reason
            
            # Save failure event
            self.save_event_to_db("agent_failure", agent_id, f"Agent {agent_id} failed: {reason}", "danger")
            
            # Redistribute unfinished zone
            active_agents_list = []
            for a_id, a_obj in self.agents.items():
                active_agents_list.append({
                    "id": a_id,
                    "status": a_obj.status,
                    "battery": a_obj.battery,
                    "pos_x": a_obj.pos_x,
                    "pos_y": a_obj.pos_y
                })
                
            reassignments = redistribute_zone(agent_id, agent.zone_id, self.zones, active_agents_list)
            
            new_agents_names = [r["agent_id"] for r in reassignments]
            self.save_event_to_db("zone_reassigned", agent_id, f"Zone {agent.zone_id} reassigned to {', '.join(new_agents_names)}", "warning")
            
            # Apply reassignments in simulation
            for r in reassignments:
                target_agent = self.agents.get(r["agent_id"])
                if target_agent:
                    target_agent.zone_waypoints.extend(r["new_waypoints"])
                    
            # Notify WS clients
            self.enqueue_event({
                "type": "agent_failure",
                "data": {"agent_id": agent_id, "reason": reason, "zone_id": agent.zone_id}
            })
            self.enqueue_event({
                "type": "zone_reassigned",
                "data": {"zone_id": agent.zone_id, "old_agent": agent_id, "new_agents": new_agents_names}
            })

    def spawn_target(self, target_type: str, pos_x: float, pos_y: float):
        confidence = assign_confidence(target_type)
        descriptions = {
            "survivor": "Adult human detected at coordinate",
            "hazard": "Potential gas/smoke detected",
            "object": "Scattered equipment debris"
        }
        desc = descriptions.get(target_type, "Unknown object")
        
        # Save to DB
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        INSERT INTO targets (mission_id, agent_id, target_type, confidence, pos_x, pos_y, description)
        VALUES (?, 'manual_spawn', ?, ?, ?, ?, ?)
        """, (self.mission_id, target_type, confidence, pos_x, pos_y, desc))
        conn.commit()
        close_db(conn)
        
        # Notify
        self.enqueue_event({
            "type": "target_detected",
            "data": {
                "agent_id": "manual_spawn",
                "target_type": target_type,
                "confidence": confidence,
                "pos_x": pos_x,
                "pos_y": pos_y,
                "description": desc
            }
        })

    def save_event_to_db(self, event_type: str, agent_id: str, message: str, severity: str = "info"):
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("""
            INSERT INTO events (mission_id, event_type, agent_id, message, severity)
            VALUES (?, ?, ?, ?, ?)
            """, (self.mission_id, event_type, agent_id, message, severity))
            conn.commit()
        except Exception as e:
            print(f"Failed to log event: {e}")
        finally:
            close_db(conn)
