from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from .services import mls_data, sponsors_data, vendor_ecosystem, features_grouped

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="Yinzfeed Demo", version="0.3.0")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.get("/")
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/health")
async def health_check() -> JSONResponse:
    return JSONResponse({"status": "ok", "service": "yinzfeed", "version": app.version})


@app.get("/api/mls/meta")
async def meta() -> JSONResponse:
    return JSONResponse(mls_data.get_meta())


@app.get("/api/mls/summary")
async def summary() -> JSONResponse:
    return JSONResponse(mls_data.get_summary())


@app.get("/api/mls/teams")
async def teams() -> JSONResponse:
    return JSONResponse({"teams": mls_data.get_teams()})


@app.get("/api/mls/teams/{team_id}")
async def team_detail(team_id: str) -> JSONResponse:
    for team in mls_data.get_teams():
        if team["id"] == team_id:
            return JSONResponse(team)
    raise HTTPException(status_code=404, detail="Team not found")


@app.get("/api/mls/sponsors")
async def sponsors() -> JSONResponse:
    return JSONResponse(mls_data.get_sponsors())


@app.get("/api/mls/activations")
async def activations() -> JSONResponse:
    return JSONResponse({"activations": mls_data.get_activations()})


@app.get("/api/mls/opportunities")
async def opportunities() -> JSONResponse:
    return JSONResponse(mls_data.get_opportunities())


@app.get("/api/mls/features")
async def features() -> JSONResponse:
    return JSONResponse(mls_data.get_features())


@app.get("/api/mode2/leagues")
async def mode2_leagues() -> JSONResponse:
    return JSONResponse({"leagues": sponsors_data.get_leagues()})


@app.get("/api/mode2/teams")
async def mode2_teams(league_id: str | None = None) -> JSONResponse:
    return JSONResponse({"teams": sponsors_data.get_teams(league_id)})


@app.get("/api/mode2/teams/{team_id}")
async def mode2_team_detail(team_id: str) -> JSONResponse:
    team = sponsors_data.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return JSONResponse(team)


@app.get("/api/mode2/vendor_ecosystem")
async def mode2_vendor_ecosystem(league: str | None = None) -> JSONResponse:
    # Default to MLS; only allow known leagues
    league_token = (league or "mls").lower()
    if league_token not in {"mls", "nba"}:
        league_token = "mls"
    return JSONResponse(vendor_ecosystem.get_dataset(league_token))


@app.get("/api/mode2/features_grouped")
async def mode2_features_grouped() -> JSONResponse:
    return JSONResponse(features_grouped.get_dataset())
