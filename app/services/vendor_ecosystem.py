"""Data loader for Mode 2: vendor ecosystem (core, ancillary, team mappings).

Supports multiple leagues by selecting the appropriate JSON payload under
`app/data/*_vendor_ecosystem.json`. Defaults to MLS. If a requested league's
file is missing or invalid, we fall back to MLS and log a warning.
"""
from __future__ import annotations

import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent

# Default to MLS for backward compatibility
DEFAULT_LEAGUE = "mls"


def _data_path_for(league: str) -> Path:
    league_token = (league or DEFAULT_LEAGUE).lower()
    return BASE_DIR / "data" / f"{league_token}_vendor_ecosystem.json"


def _slugify(value: str) -> str:
    token = "".join(ch.lower() if ch.isalnum() else "-" for ch in (value or "")).strip("-")
    return "-".join(filter(None, token.split("-"))) or "team"


@lru_cache()
def _load_payload(league: str = DEFAULT_LEAGUE) -> Dict:
    """Load the vendor ecosystem JSON for the given league.

    Falls back to MLS if the file is missing or corrupt. Always returns a
    dictionary with the expected top-level keys.
    """
    path = _data_path_for(league)

    def _empty() -> Dict:
        return {
            "layer_1A_core": [],
            "layer_1B_ancillary": [],
            "team_mappings": [],
            "executive_highlights": {},
        }

    # Try league file first
    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except Exception as exc:  # JSON errors, IO errors, etc.
            logging.warning("vendor_ecosystem: failed to load '%s' (%s), falling back to MLS", path.name, exc)
            # Intentional fallthrough to MLS
    else:
        if league.lower() != DEFAULT_LEAGUE:
            logging.warning("vendor_ecosystem: league file not found for '%s' (%s); falling back to MLS", league, path)

    # Fallback to MLS
    fallback_path = _data_path_for(DEFAULT_LEAGUE)
    if fallback_path.exists():
        try:
            with fallback_path.open("r", encoding="utf-8") as handle:
                return json.load(handle)
        except Exception as exc:
            logging.warning("vendor_ecosystem: MLS fallback failed to load '%s' (%s); serving empty dataset", fallback_path.name, exc)
            return _empty()
    else:
        logging.warning("vendor_ecosystem: MLS fallback file missing at %s; serving empty dataset", fallback_path)
        return _empty()


@lru_cache()
def build_dataset(league: str = DEFAULT_LEAGUE) -> Dict:
    payload = _load_payload(league)

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


def get_dataset(league: str = DEFAULT_LEAGUE) -> Dict:
    """Get vendor ecosystem dataset for a league (default MLS)."""
    return build_dataset(league)


def get_teams(league: str = DEFAULT_LEAGUE) -> List[Dict[str, str]]:
    return build_dataset(league)["teams"]


def get_team_mapping(team_id: str, league: str = DEFAULT_LEAGUE) -> Optional[List[Dict[str, str]]]:
    return build_dataset(league)["team_mappings"].get(team_id)


def get_exec_highlights(team_id: str, league: str = DEFAULT_LEAGUE) -> Optional[Dict]:
    return build_dataset(league)["exec_highlights"].get(team_id)
