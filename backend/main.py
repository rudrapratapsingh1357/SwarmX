import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from models.db import init_db
from routes import mission, agents, targets, websocket

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB tables
    init_db()
    yield

app = FastAPI(title="SWARM-X API", lifespan=lifespan)

# Add CORS Middleware to enable development access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(mission.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(targets.router, prefix="/api")
app.include_router(websocket.router)

@app.get("/health")
def health():
    return {"status": "ok", "system": "SWARM-X"}

# Serve built frontend assets
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

backend_dir = os.path.dirname(os.path.abspath(__file__))
frontend_dist_path = os.path.join(os.path.dirname(backend_dir), "frontend", "dist")

if os.path.exists(frontend_dist_path):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist_path, "assets")), name="assets")
    
    @app.get("/{catchall:path}")
    def serve_frontend(catchall: str):
        if catchall.startswith("api") or catchall.startswith("ws") or catchall.startswith("health"):
            return None
        index_file = os.path.join(frontend_dist_path, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"error": "Frontend build files not found. Please run 'npm run build' in the frontend directory."}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "main:app", 
        host="0.0.0.0", 
        port=port, 
        reload=True, 
        reload_excludes=["*.db", "*.db-journal", "*.db-wal"]
    )
