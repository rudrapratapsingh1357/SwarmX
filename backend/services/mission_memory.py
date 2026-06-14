import json
from datetime import datetime
from models.db import get_db_connection, close_db

def save_mission_snapshot(mission_id: str, state: dict):
    """
    Saves current mission state to DB.
    State dict contains:
    - agents: list of agent dicts
    - zones: list of zone dicts
    - targets: list of target dicts
    - events: list of event dicts
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Save agents
        for agent in state.get("agents", []):
            cursor.execute("""
            INSERT OR REPLACE INTO agents (id, mission_id, agent_type, status, battery, pos_x, pos_y, zone_id, tasks_completed, last_seen, failure_reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                agent.get("id"),
                mission_id,
                agent.get("agent_type", "drone"),
                agent.get("status", "active"),
                agent.get("battery", 100.0),
                agent.get("pos_x", 0.0),
                agent.get("pos_y", 0.0),
                agent.get("zone_id"),
                agent.get("tasks_completed", 0),
                datetime.utcnow().isoformat(),
                agent.get("failure_reason")
            ))
            
        # Save zones
        for zone in state.get("zones", []):
            poly_str = json.dumps(zone.get("polygon", []))
            cursor.execute("""
            INSERT OR REPLACE INTO zones (id, mission_id, assigned_agent_id, polygon, coverage_pct, status)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (
                zone.get("zone_id"),
                mission_id,
                zone.get("assigned_agent_id"),
                poly_str,
                zone.get("coverage_pct", 0.0),
                zone.get("status", "unassigned")
            ))
            
        conn.commit()
    except Exception as e:
        print(f"Error saving mission snapshot: {e}")
    finally:
        close_db(conn)

def load_mission_state(mission_id: str) -> dict:
    """
    Reconstructs full mission state from DB.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    state = {"agents": [], "zones": [], "targets": [], "events": []}
    
    try:
        # Load mission info
        cursor.execute("SELECT * FROM missions WHERE id = ?", (mission_id,))
        mission = cursor.fetchone()
        if not mission:
            return state
            
        state["mission"] = dict(mission)
        
        # Load agents
        cursor.execute("SELECT * FROM agents WHERE mission_id = ?", (mission_id,))
        for row in cursor.fetchall():
            state["agents"].append(dict(row))
            
        # Load zones
        cursor.execute("SELECT * FROM zones WHERE mission_id = ?", (mission_id,))
        for row in cursor.fetchall():
            zone_dict = dict(row)
            try:
                zone_dict["polygon"] = json.loads(zone_dict["polygon"])
            except Exception:
                zone_dict["polygon"] = []
            state["zones"].append(zone_dict)
            
        # Load targets
        cursor.execute("SELECT * FROM targets WHERE mission_id = ?", (mission_id,))
        for row in cursor.fetchall():
            state["targets"].append(dict(row))
            
        # Load events
        cursor.execute("SELECT * FROM events WHERE mission_id = ? ORDER BY id DESC", (mission_id,))
        for row in cursor.fetchall():
            state["events"].append(dict(row))
            
    except Exception as e:
        print(f"Error loading mission state: {e}")
    finally:
        close_db(conn)
        
    return state

def get_mission_report(mission_id: str) -> dict:
    """
    Returns:
    {
        "mission_id": str,
        "duration_seconds": int,
        "agents_deployed": int,
        "agents_failed": int,
        "targets_found": int,
        "survivors_found": int,
        "coverage_pct": float,
        "total_failures": int,
        "zones_completed": int,
        "events": [...]
    }
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    report = {}
    
    try:
        cursor.execute("SELECT * FROM missions WHERE id = ?", (mission_id,))
        mission = cursor.fetchone()
        if not mission:
            return {}
            
        m_dict = dict(mission)
        
        # Duration
        start_str = m_dict.get("started_at")
        end_str = m_dict.get("ended_at") or datetime.utcnow().isoformat()
        
        duration = 0
        if start_str:
            try:
                # support simple formats
                start_dt = datetime.fromisoformat(start_str.replace("Z", ""))
                end_dt = datetime.fromisoformat(end_str.replace("Z", ""))
                duration = int((end_dt - start_dt).total_seconds())
            except Exception:
                duration = 300  # fallback mock duration
                
        # Agent count
        cursor.execute("SELECT COUNT(*) FROM agents WHERE mission_id = ?", (mission_id,))
        deployed = cursor.fetchone()[0]
        
        # Failures
        cursor.execute("SELECT COUNT(*) FROM agents WHERE mission_id = ? AND status = 'offline'", (mission_id,))
        failed = cursor.fetchone()[0]
        
        # Targets
        cursor.execute("SELECT COUNT(*) FROM targets WHERE mission_id = ?", (mission_id,))
        targets_cnt = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM targets WHERE mission_id = ? AND target_type = 'survivor'", (mission_id,))
        survivors_cnt = cursor.fetchone()[0]
        
        # Average coverage
        cursor.execute("SELECT AVG(coverage_pct) FROM zones WHERE mission_id = ?", (mission_id,))
        avg_cov_val = cursor.fetchone()[0]
        coverage_pct = round(avg_cov_val, 1) if avg_cov_val is not None else 0.0
        
        # Completed zones (coverage >= 95%)
        cursor.execute("SELECT COUNT(*) FROM zones WHERE mission_id = ? AND coverage_pct >= 95.0", (mission_id,))
        completed_zones = cursor.fetchone()[0]
        
        # Events list
        events = []
        cursor.execute("SELECT * FROM events WHERE mission_id = ? ORDER BY id ASC", (mission_id,))
        for r in cursor.fetchall():
            events.append(dict(r))
            
        report = {
            "mission_id": mission_id,
            "name": m_dict.get("name"),
            "duration_seconds": max(0, duration),
            "agents_deployed": deployed,
            "agents_failed": failed,
            "targets_found": targets_cnt,
            "survivors_found": survivors_cnt,
            "coverage_pct": coverage_pct,
            "total_failures": failed,
            "zones_completed": completed_zones,
            "events": events
        }
    except Exception as e:
        print(f"Error compiling mission report: {e}")
    finally:
        close_db(conn)
        
    return report
