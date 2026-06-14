import uuid
import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from models.db import get_db_connection, close_db
from services.partitioner import partition_area
from services.mission_memory import get_mission_report

router = APIRouter()

class CreateMissionRequest(BaseModel):
    name: str = Field(..., example="Operation Alpha")
    area_width_km: float = Field(..., gt=0, example=10.0)
    area_height_km: float = Field(..., gt=0, example=10.0)
    agent_count: int = Field(..., example=50)
    objective: str = Field(..., example="locate_survivors")
    environment: str = Field(..., example="urban_rubble")
    pattern: str = Field("boustrophedon", example="boustrophedon")

@router.post("/missions/create")
def create_mission(req: CreateMissionRequest):
    if req.agent_count <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="agent_count must be greater than 0"
        )
        
    mission_id = str(uuid.uuid4())
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        # Create mission entry
        cursor.execute("""
        INSERT INTO missions (id, name, area_width_km, area_height_km, agent_count, objective, environment, pattern, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        """, (
            mission_id,
            req.name,
            req.area_width_km,
            req.area_height_km,
            req.agent_count,
            req.objective,
            req.environment,
            req.pattern,
            datetime.utcnow().isoformat()
        ))
        
        # Partition area into zones
        partitioned_zones = partition_area(req.area_width_km, req.area_height_km, req.agent_count, req.pattern)
        
        response_zones = []
        response_agents = []
        
        # Save zones and initialize agents in DB
        for i, zone in enumerate(partitioned_zones):
            local_idx = i + 1
            agent_id = f"agt_{mission_id[:6]}_{local_idx:03d}"
            poly_str = json.dumps(zone["polygon"])
            
            # Insert Zone (letting SQLite auto-generate id)
            cursor.execute("""
            INSERT INTO zones (mission_id, assigned_agent_id, polygon, coverage_pct, status)
            VALUES (?, ?, ?, 0.0, 'assigned')
            """, (
                mission_id,
                agent_id,
                poly_str
            ))
            
            real_zone_id = cursor.lastrowid
            
            # Insert Agent
            cursor.execute("""
            INSERT INTO agents (id, mission_id, agent_type, status, battery, pos_x, pos_y, zone_id, tasks_completed, last_seen)
            VALUES (?, ?, 'drone', 'active', 100.0, 0.0, 0.0, ?, 0, ?)
            """, (
                agent_id,
                mission_id,
                real_zone_id,
                datetime.utcnow().isoformat()
            ))
            
            response_zones.append({
                "id": real_zone_id,
                "polygon": zone["polygon"],
                "assigned_agent_id": agent_id
            })
            response_agents.append({
                "id": agent_id,
                "pos_x": 0.0,
                "pos_y": 0.0,
                "battery": 100.0
            })
            
        conn.commit()
        
        return {
            "mission_id": mission_id,
            "zones": response_zones,
            "agents": response_agents,
            "message": f"Mission created. {req.agent_count} agents assigned to {req.agent_count} zones."
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database error: {e}"
        )
    finally:
        close_db(conn)

@router.post("/missions/{mission_id}/start")
def start_mission(mission_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT status FROM missions WHERE id = ?", (mission_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mission not found")
            
        started_at = datetime.utcnow().isoformat()
        cursor.execute(
            "UPDATE missions SET status = 'running', started_at = ? WHERE id = ?",
            (started_at, mission_id)
        )
        
        # Log event
        cursor.execute("""
        INSERT INTO events (mission_id, event_type, message, severity, created_at)
        VALUES (?, 'mission_started', 'Mission simulation started.', 'info', ?)
        """, (mission_id, started_at))
        
        conn.commit()
        return {"status": "running", "started_at": started_at}
    finally:
        close_db(conn)

@router.post("/missions/{mission_id}/pause")
def pause_mission(mission_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT status FROM missions WHERE id = ?", (mission_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mission not found")
            
        cursor.execute("UPDATE missions SET status = 'paused' WHERE id = ?", (mission_id,))
        conn.commit()
        return {"status": "paused"}
    finally:
        close_db(conn)

@router.post("/missions/{mission_id}/end")
def end_mission(mission_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT status FROM missions WHERE id = ?", (mission_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Mission not found")
            
        ended_at = datetime.utcnow().isoformat()
        cursor.execute(
            "UPDATE missions SET status = 'completed', ended_at = ? WHERE id = ?",
            (ended_at, mission_id)
        )
        
        # Log event
        cursor.execute("""
        INSERT INTO events (mission_id, event_type, message, severity, created_at)
        VALUES (?, 'mission_completed', 'Mission simulation ended.', 'info', ?)
        """, (mission_id, ended_at))
        
        conn.commit()
        
        # Get final report summary
        report = get_mission_report(mission_id)
        return {"status": "completed", "ended_at": ended_at, "report": report}
    finally:
        close_db(conn)

@router.get("/missions")
def get_missions():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM missions ORDER BY created_at DESC")
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    finally:
        close_db(conn)

@router.get("/missions/{mission_id}")
def get_mission(mission_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM missions WHERE id = ?", (mission_id,))
        mission_row = cursor.fetchone()
        if not mission_row:
            raise HTTPException(status_code=404, detail="Mission not found")
            
        mission_dict = dict(mission_row)
        
        # Load agents
        cursor.execute("SELECT * FROM agents WHERE mission_id = ?", (mission_id,))
        agents = [dict(r) for r in cursor.fetchall()]
        
        # Load zones
        cursor.execute("SELECT * FROM zones WHERE mission_id = ?", (mission_id,))
        zones = []
        for r in cursor.fetchall():
            zd = dict(r)
            try:
                zd["polygon"] = json.loads(zd["polygon"])
            except Exception:
                zd["polygon"] = []
            zones.append(zd)
            
        # Load targets
        cursor.execute("SELECT * FROM targets WHERE mission_id = ?", (mission_id,))
        targets = [dict(r) for r in cursor.fetchall()]
        
        # Load events
        cursor.execute("SELECT * FROM events WHERE mission_id = ? ORDER BY id DESC LIMIT 50", (mission_id,))
        events = [dict(r) for r in cursor.fetchall()]
        
        return {
            "mission": mission_dict,
            "agents": agents,
            "zones": zones,
            "targets": targets,
            "events": events
        }
    finally:
        close_db(conn)
