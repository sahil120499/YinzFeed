"""Data loader for mode 2 sponsor activations."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "sponsors.json"

LEAGUE_ID = "mls"
LEAGUE_NAME = "MLS"


def _slugify(value: str) -> str:
    token = "".join(char.lower() if char.isalnum() else "-" for char in value).strip("-")
    return "-".join(filter(None, token.split("-"))) or "team"


@lru_cache()
def _load_payload() -> Dict:
    if not DATA_PATH.exists():
        return {"clubs": []}
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache()
def build_dataset() -> Dict:
    payload = _load_payload()
    teams: List[Dict[str, object]] = []

    for entry in payload.get("clubs", []):
        team_name = entry.get("team", "Unknown Team")
        team_id = _slugify(team_name)
        activations: List[Dict[str, object]] = []
        for index, activation in enumerate(entry.get("activations", []), start=1):
            activations.append(
                {
                    "id": f"{team_id}-{index}",
                    "sponsor": activation.get("sponsor", "Unknown Sponsor"),
                    "where_how": activation.get("where_how"),
                    "category": activation.get("category"),
                    "notes": activation.get("notes"),
                }
            )
        teams.append(
            {
                "id": team_id,
                "name": team_name,
                "league_id": LEAGUE_ID,
                "league_name": LEAGUE_NAME,
                "activations": activations,
            }
        )

    return {
        "leagues": [{"id": LEAGUE_ID, "name": LEAGUE_NAME}],
        "teams": teams,
    }


def get_leagues() -> List[Dict[str, str]]:
    return build_dataset()["leagues"]


def get_teams(league_id: Optional[str] = None) -> List[Dict[str, object]]:
    teams = build_dataset()["teams"]
    if league_id:
        return [team for team in teams if team["league_id"] == league_id]
    return teams


def get_team(team_id: str) -> Optional[Dict[str, object]]:
    for team in build_dataset()["teams"]:
        if team["id"] == team_id:
            return team
    return None
