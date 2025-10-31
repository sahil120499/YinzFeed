"""Data loader for Mode 2: MLS app features grouped by category/sub-feature.

Loads app/data/mls_app_features_grouped.json and exposes a normalized dataset
for client consumption. The dataset includes a deduplicated team list (with
stable ids) and the original grouped structure.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "mls_app_features_grouped.json"


def _slugify(value: str) -> str:
    token = "".join(ch.lower() if ch.isalnum() else "-" for ch in (value or "")).strip("-")
    return "-".join(filter(None, token.split("-"))) or "team"


@lru_cache()
def _load_payload() -> List[Dict]:
    if not DATA_PATH.exists():
        return []
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache()
def build_dataset() -> Dict:
    payload = _load_payload() or []

    # The source file is an array with one sheet that holds "groups".
    groups: List[Dict] = []
    if payload:
        groups = payload[0].get("groups", []) or []

    # Build a deduped, stable list of teams from all club keys found
    teams_index: Dict[str, Dict[str, str]] = {}
    for group in groups:
        for sub in group.get("sub_features", []) or []:
            clubs = (sub.get("clubs") or {})
            for club_name in clubs.keys():
                slug = _slugify(club_name)
                if slug not in teams_index:
                    teams_index[slug] = {
                        "id": slug,
                        "name": club_name,
                        "league_id": "mls",
                        "league_name": "MLS",
                    }

    teams = sorted(teams_index.values(), key=lambda t: t["name"].lower())

    return {
        "teams": teams,
        "groups": groups,
    }


def get_dataset() -> Dict:
    return build_dataset()

