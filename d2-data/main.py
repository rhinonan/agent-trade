"""AgentTrade Data Service — FastAPI application."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AgentTrade Data Service",
    version="0.1.0",
    description="Market data microservice for the AgentTrade analysis framework",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "agenttrade-data", "version": "0.1.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=9500, reload=True)
