import random
from fastapi import APIRouter, HTTPException
from models.db import get_db_connection, close_db

router = APIRouter()

@router.get("/missions/{mission_id}/agents")
def get_agents(mission_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM agents WHERE mission_id = ?", (mission_id,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        close_db(conn)

@router.get("/missions/{mission_id}/agents/{agent_id}")
def get_agent_detail(mission_id: str, agent_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM agents WHERE mission_id = ? AND id = ?", (mission_id, agent_id))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
        return dict(row)
    finally:
        close_db(conn)

@router.post("/missions/{mission_id}/agents/{agent_id}/fail")
def trigger_agent_failure(mission_id: str, agent_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Check if agent exists
        cursor.execute("SELECT * FROM agents WHERE mission_id = ? AND id = ?", (mission_id, agent_id))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Agent not found")
            
        # Update agent status to offline in DB
        cursor.execute(
            "UPDATE agents SET status = 'offline', failure_reason = 'manual_trigger' WHERE mission_id = ? AND id = ?",
            (mission_id, agent_id)
        )
        
        # Log event in DB
        cursor.execute("""
        INSERT INTO events (mission_id, event_type, agent_id, message, severity)
        VALUES (?, 'agent_failure', ?, ?, 'danger')
        """, (
            mission_id,
            agent_id,
            f"Manual failure triggered on agent {agent_id}."
        ))
        
        conn.commit()
        
        # Check if there is an active simulation loop, and signal it via a flag or global registry
        from routes.websocket import active_simulations
        if mission_id in active_simulations:
            sim = active_simulations[mission_id]
            sim.handle_failure(agent_id, "manual_trigger")
            
        return {
            "agent_id": agent_id,
            "message": "Agent failed. Recovery in progress."
        }
    finally:
        close_db(conn)

@router.post("/missions/{mission_id}/agents/mass-failure")
def mass_failure(mission_id: str, body: dict = {}):
    percentage = body.get("percentage", 0.3)
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Get all active agents
        cursor.execute(
            "SELECT id FROM agents WHERE mission_id = ? AND status = 'active'",
            (mission_id,)
        )
        active_agents = cursor.fetchall()
        
        if not active_agents:
            return {"message": "No active agents to fail"}
        
        # Calculate how many to fail (minimum 2, maximum 10)
        fail_count = max(2, min(10, int(len(active_agents) * percentage)))
        agents_to_fail = random.sample([a['id'] for a in active_agents], min(fail_count, len(active_agents)))
        
        # Mark them offline
        for agent_id in agents_to_fail:
            cursor.execute(
                "UPDATE agents SET status = 'offline', failure_reason = 'mass_failure_event' WHERE id = ?",
                (agent_id,)
            )
        conn.commit()
        
        # Trigger recovery for each failed agent via the simulation
        from routes.websocket import active_simulations
        if mission_id in active_simulations:
            sim = active_simulations[mission_id]
            for agent_id in agents_to_fail:
                sim.handle_failure(agent_id, "mass_failure_event")
        
        return {
            "failed_agents": agents_to_fail,
            "count": len(agents_to_fail),
            "message": f"{len(agents_to_fail)} agents taken offline. Swarm reorganizing."
        }
    finally:
        close_db(conn)
