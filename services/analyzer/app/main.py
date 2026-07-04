from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Sparta Analyzer", version="0.1.0")


class ReplayImportRequest(BaseModel):
    file_name: str


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "sparta-analyzer"}


@app.post("/replay/import")
def import_replay(payload: ReplayImportRequest) -> dict[str, str]:
    if not payload.file_name.endswith(".rofl"):
        return {"status": "failed", "reason": "Only .rofl files are accepted as replay metadata."}

    return {
        "status": "not_implemented",
        "reason": "Replay parsing is experimental and outside the MVP scope.",
    }
