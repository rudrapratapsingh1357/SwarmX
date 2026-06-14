from fastapi import APIRouter, HTTPException
from models.db import get_db_connection, close_db

router = APIRouter()

@router.get("/missions/{mission_id}/targets")
def get_targets(mission_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM targets WHERE mission_id = ? ORDER BY detected_at DESC", (mission_id,))
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        close_db(conn)

@router.post("/missions/{mission_id}/targets/{target_id}/verify")
def verify_target(mission_id: str, target_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM targets WHERE mission_id = ? AND id = ?", (mission_id, target_id))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Target not found")
            
        cursor.execute("UPDATE targets SET verified = 1 WHERE mission_id = ? AND id = ?", (mission_id, target_id))
        
        # Log event in DB
        cursor.execute("""
        INSERT INTO events (mission_id, event_type, message, severity)
        VALUES (?, 'target_verified', ?, 'success')
        """, (
            mission_id,
            f"Target ID {target_id} has been verified."
        ))
        
        conn.commit()
        
        # Dispatch verification team using commander
        from routes.websocket import active_simulations
        dispatched_agents = []
        if mission_id in active_simulations:
            sim = active_simulations[mission_id]
            target_data = dict(row)
            # Find nearest agents
            agents_list = [a.__dict__ for a in sim.agents.values()]
            from services.commander import SwarmCommander
            dispatched_agents = SwarmCommander.dispatch_verification_team(target_data, agents_list)
            
            # Send message to active simulation to notify verification dispatch
            sim.enqueue_event({
                "type": "target_verified",
                "data": {
                    "target_id": target_id,
                    "dispatched_agents": dispatched_agents
                }
            })
            
        return {
            "target_id": target_id,
            "verified": True,
            "dispatched_agents": dispatched_agents,
            "message": f"Target verified. Team {dispatched_agents} dispatched."
        }
    finally:
        close_db(conn)
