# SWARM-X — AI Swarm Search & Rescue System

## What it does
SWARM-X deploys a fleet of autonomous simulated drones across a search area.
The AI commander assigns zones, monitors battery, detects targets, and
self-heals when any agent fails — no human intervention required.

## Setup

### Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy config variables to `.env`:
   ```bash
   copy .env.example .env
   ```
4. Start the FastAPI server:
   ```bash
   python main.py
   ```

### Frontend
1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Start the Vite server:
   ```bash
   npm run dev
   ```

## Usage
1. Open http://localhost:8000
2. Enter mission name and agent count (try 50 for the demo)
3. Click LAUNCH MISSION
4. Watch agents spread across the search area
5. Click TRIGGER FAILURE to kill an agent — watch the swarm reorganize
6. Click SPAWN TARGET to place a survivor — watch nearby agents converge

## Demo Tips
- Use DEMO preset (25 agents) for fastest wow moment
- Click TRIGGER FAILURE at the 30-second mark for maximum impact
- Keep the AlertFeed in view — the recovery log impresses judges

## Stack
- Backend: FastAPI + asyncio simulation engine + SQLite
- Frontend: React + Canvas rendering + Framer Motion
- Algorithm: Voronoi partitioning + boustrophedon coverage paths

Deployed Link : http://swarmx.onrender.com/
