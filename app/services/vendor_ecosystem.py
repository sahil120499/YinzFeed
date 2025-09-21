"""Data loader for Mode 2: MLS vendor ecosystem (core, ancillary, team mappings)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "mls_vendor_ecosystem.json"


def _slugify(value: str) -> str:
    token = "".join(ch.lower() if ch.isalnum() else "-" for ch in (value or "")).strip("-")
    return "-".join(filter(None, token.split("-"))) or "team"


@lru_cache()
def _load_payload() -> Dict:
    if not DATA_PATH.exists():
        return {
            "layer_1A_core": [],
            "layer_1B_ancillary": [],
            "team_mappings": [],
            "executive_highlights": {},
        }
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache()
def build_dataset() -> Dict:
    payload = _load_payload()

    core = payload.get("layer_1A_core", []) or []
    ancillary = payload.get("layer_1B_ancillary", []) or []

    teams: List[Dict[str, str]] = []
    team_mappings_index: Dict[str, List[Dict[str, str]]] = {}

    for entry in payload.get("team_mappings", []) or []:
        club = entry.get("club") or "Unknown Club"
        slug = _slugify(club)
        teams.append({"id": slug, "name": club})
        team_mappings_index[slug] = entry.get("vendor_mapping", []) or []

    # Normalize executive highlights to slug keys
    exec_highlights: Dict[str, Dict] = {}
    raw_highlights: Dict[str, Dict] = payload.get("executive_highlights", {}) or {}
    for club_name, obj in raw_highlights.items():
        exec_highlights[_slugify(club_name)] = obj

    return {
        "core": core,
        "ancillary": ancillary,
        "teams": teams,
        "team_mappings": team_mappings_index,
        "exec_highlights": exec_highlights,
    }


def get_dataset() -> Dict:
    return build_dataset()


def get_teams() -> List[Dict[str, str]]:
    return build_dataset()["teams"]


def get_team_mapping(team_id: str) -> Optional[List[Dict[str, str]]]:
    return build_dataset()["team_mappings"].get(team_id)


def get_exec_highlights(team_id: str) -> Optional[Dict]:
    return build_dataset()["exec_highlights"].get(team_id)

