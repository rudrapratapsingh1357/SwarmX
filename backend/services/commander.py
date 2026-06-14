import math

class SwarmCommander:
    @staticmethod
    def assess_swarm_health(agents: list) -> dict:
        """
        Returns stats summarizing the current status of the swarm:
        """
        total = len(agents)
        if total == 0:
            return {
                "active_count": 0,
                "returning_count": 0,
                "charging_count": 0,
                "offline_count": 0,
                "avg_battery": 0.0,
                "coverage_velocity": 0.0,
                "estimated_completion_minutes": 0.0
            }
            
        active = sum(1 for a in agents if a.get("status") == "active")
        returning = sum(1 for a in agents if a.get("status") == "returning")
        charging = sum(1 for a in agents if a.get("status") == "charging")
        offline = sum(1 for a in agents if a.get("status") == "offline")
        
        avg_battery = sum(a.get("battery", 0.0) for a in agents) / total
        
        # Heuristic calculations for speed of coverage
        coverage_velocity = active * 0.15  # Approx coverage % per minute
        uncovered = 100.0  # Default or dynamically mapped
        estimated_completion_minutes = uncovered / max(0.01, coverage_velocity)
        
        return {
            "active_count": active,
            "returning_count": returning,
            "charging_count": charging,
            "offline_count": offline,
            "avg_battery": round(avg_battery, 1),
            "coverage_velocity": round(coverage_velocity, 2),
            "estimated_completion_minutes": round(estimated_completion_minutes, 1)
        }

    @staticmethod
    def prioritize_targets(targets: list) -> list:
        """
        Sorts targets by: (confidence * type_weight).
        type_weight: survivor=3.0, hazard=2.0, object=1.0
        Returns sorted target list.
        """
        type_weights = {
            "survivor": 3.0,
            "hazard": 2.0,
            "object": 1.0
        }
        
        def score(t):
            t_type = t.get("target_type", "object")
            weight = type_weights.get(t_type, 1.0)
            return t.get("confidence", 0.0) * weight
            
        return sorted(targets, key=score, reverse=True)

    @staticmethod
    def dispatch_verification_team(target: dict, agents: list) -> list:
        """
        Finds 2 nearest available agents (status = 'active').
        Redirects them toward target position.
        Returns list of dispatched agent IDs.
        """
        tx = target.get("pos_x", 0.0)
        ty = target.get("pos_y", 0.0)
        
        candidates = []
        for a in agents:
            if a.get("status") == "active":
                ax = a.get("pos_x", 0.0)
                ay = a.get("pos_y", 0.0)
                dist = math.hypot(ax - tx, ay - ty)
                candidates.append((dist, a))
                
        # Sort by distance
        candidates.sort(key=lambda item: item[0])
        
        dispatched_ids = []
        for dist, agent in candidates[:2]:
            dispatched_ids.append(agent.get("id"))
            # In simulation, we can let them hover near the target or set target coords
            # This will be handled in the WebSocket handler's dispatch sequence
            
        return dispatched_ids

    @staticmethod
    def should_spawn_replacement(agents: list, zones: list) -> bool:
        """
        Returns True if coverage velocity drops below threshold.
        Threshold: if >20% of zones are uncovered and <60% agents active.
        """
        if not agents or not zones:
            return False
            
        uncovered_zones = sum(1 for z in zones if z.get("coverage_pct", 0.0) < 90.0)
        uncovered_ratio = uncovered_zones / len(zones)
        
        active_agents = sum(1 for a in agents if a.get("status") == "active")
        active_ratio = active_agents / len(agents)
        
        if uncovered_ratio > 0.20 and active_ratio < 0.60:
            return True
            
        return False
