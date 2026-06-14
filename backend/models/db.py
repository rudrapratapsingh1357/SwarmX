import os
import sqlite3
from dotenv import load_dotenv

load_dotenv()

DATABASE_PATH = os.getenv("DATABASE_PATH", "./swarmx.db")

def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def close_db(conn):
    if conn:
        conn.close()

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. missions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        area_width_km REAL NOT NULL,
        area_height_km REAL NOT NULL,
        agent_count INTEGER NOT NULL,
        objective TEXT NOT NULL,
        environment TEXT NOT NULL,
        pattern TEXT DEFAULT 'boustrophedon',
        status TEXT DEFAULT 'pending',
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    
    # 2. agents table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        agent_type TEXT DEFAULT 'drone',
        status TEXT DEFAULT 'active',
        battery REAL DEFAULT 100.0,
        pos_x REAL DEFAULT 0.0,
        pos_y REAL DEFAULT 0.0,
        zone_id INTEGER,
        tasks_completed INTEGER DEFAULT 0,
        last_seen TIMESTAMP,
        failure_reason TEXT,
        FOREIGN KEY (mission_id) REFERENCES missions(id)
    );
    """)
    
    # 3. targets table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS targets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        target_type TEXT NOT NULL,
        confidence REAL NOT NULL,
        pos_x REAL NOT NULL,
        pos_y REAL NOT NULL,
        description TEXT,
        verified INTEGER DEFAULT 0,
        detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mission_id) REFERENCES missions(id)
    );
    """)
    
    # 4. events table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        agent_id TEXT,
        message TEXT NOT NULL,
        severity TEXT DEFAULT 'info',
        payload TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (mission_id) REFERENCES missions(id)
    );
    """)
    
    # 5. zones table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS zones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mission_id TEXT NOT NULL,
        assigned_agent_id TEXT,
        polygon TEXT NOT NULL,
        coverage_pct REAL DEFAULT 0.0,
        status TEXT DEFAULT 'unassigned',
        FOREIGN KEY (mission_id) REFERENCES missions(id)
    );
    """)
    
    conn.commit()
    close_db(conn)
