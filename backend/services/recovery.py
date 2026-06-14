import math
from datetime import datetime
from shapely.geometry import Polygon

def detect_failure(agent: dict, timeout_seconds: float = 5.0) -> bool:
    """
    Returns True if agent has not sent a heartbeat within timeout_seconds.
    Also returns True if agent battery == 0.
    """
    if agent.get("battery", 100.0) <= 0:
        return True
    
    last_seen = agent.get("last_seen")
    if last_seen:
        if isinstance(last_seen, str):
            try:
                last_seen = datetime.fromisoformat(last_seen)
            except ValueError:
                return False
        delta = (datetime.utcnow() - last_seen).total_seconds()
        if delta > timeout_seconds:
            return True
    return False

def redistribute_zone(
    failed_agent_id: str,
    zone_id: int,
    zones: list[dict],
    active_agents: list[dict]
) -> list[dict]:
    """
    When an agent fails:
    1. Find the unfinished zone (remaining waypoints)
    2. Find the 1-3 nearest active agents with battery > 40%
    3. Split remaining waypoints among them
    4. Return list of reassignment dicts:
       [{ "agent_id": "agent_023", "new_waypoints": [...], "zone_id": 12 }]
    
    Selection priority:
    - Agents within 2km of failed agent's last position
    - Agents with highest remaining battery
    - Agents not currently returning to base
    """
    # Find the failed agent's zone from the zones list
    failed_zone = None
    for z in zones:
        if z.get("id") == zone_id or z.get("zone_id") == zone_id:
            failed_zone = z
            break
            
    if not failed_zone:
        return []
        
    waypoints = failed_zone.get("waypoints", [])
    # Find remaining waypoints
    completed_index = failed_zone.get("waypoint_index", 0)
    remaining_waypoints = waypoints[completed_index:]
    if not remaining_waypoints:
        # If all waypoints were visited, just redistribute the whole set
        remaining_waypoints = waypoints
        
    if not remaining_waypoints:
        return []
        
    # Get failed agent's last position (centroid of the zone as fallback)
    failed_pos = failed_zone.get("centroid", (0.0, 0.0))
    for ag in active_agents:
        if ag.get("id") == failed_agent_id:
            failed_pos = (ag.get("pos_x", failed_pos[0]), ag.get("pos_y", failed_pos[1]))
            break
            
    # Filter candidates: status is 'active', battery > 40%, not returning
    candidates = []
    for ag in active_agents:
        if ag.get("id") == failed_agent_id:
            continue
        if ag.get("status") == "active" and ag.get("battery", 0.0) > 40.0:
            pos_x = ag.get("pos_x", 0.0)
            pos_y = ag.get("pos_y", 0.0)
            dist = math.hypot(pos_x - failed_pos[0], pos_y - failed_pos[1])
            candidates.append((dist, ag))
            
    # Sort candidates:
    # 1. Inside 2km radius first
    # 2. Higher battery
    def sort_key(item):
        dist, ag = item
        in_range = 1 if dist <= 2.0 else 0
        # We want in_range = 1 (comes first, so negate it for ascending sort), then higher battery (negate it)
        return (-in_range, -ag.get("battery", 0.0), dist)
        
    candidates.sort(key=sort_key)
    
    # Pick up to 3 helper agents
    helpers = [item[1] for item in candidates[:3]]
    if not helpers:
        return []
        
    # Split remaining waypoints among helpers
    chunk_size = int(math.ceil(len(remaining_waypoints) / len(helpers)))
    reassignments = []
    
    for i, helper in enumerate(helpers):
        start_idx = i * chunk_size
        end_idx = start_idx + chunk_size
        helper_waypoints = remaining_waypoints[start_idx:end_idx]
        if helper_waypoints:
            reassignments.append({
                "agent_id": helper["id"],
                "new_waypoints": helper_waypoints,
                "zone_id": zone_id
            })
            
    return reassignments

def recalculate_coverage(zones: list[dict]) -> float:
    """
    Returns total coverage percentage across all zones.
    coverage_pct = sum(zone.coverage_pct * zone.area) / total_area
    """
    total_area = 0.0
    weighted_coverage = 0.0
    
    for zone in zones:
        polygon_coords = zone.get("polygon")
        if not polygon_coords:
            continue
            
        try:
            poly = Polygon(polygon_coords)
            area = poly.area
        except Exception:
            area = 1.0  # Fallback to equal weights
            
        coverage = zone.get("coverage_pct", 0.0)
        weighted_coverage += coverage * area
        total_area += area
        
    if total_area <= 0:
        return 0.0
        
    return weighted_coverage / total_area
