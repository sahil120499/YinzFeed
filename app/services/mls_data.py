"""Utilities for loading and normalizing MLS sponsorship activation data."""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, List, Literal, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = BASE_DIR / "data" / "mls_sponsorship_activations.json"

LEAGUE_NAME = "MLS"

CATEGORY_NORMALIZATION = {
    "healthcare system": "Healthcare",
    "healthcare": "Healthcare",
    "hospital": "Healthcare",
    "beverage": "Beverage",
    "beverage (beer)": "Beverage",
    "beverage (energy)": "Beverage",
    "beverage (spirits)": "Beverage",
    "automotive": "Automotive",
    "banking": "Finance",
    "payments / fintech": "Finance",
    "insurance": "Insurance",
    "telecom": "Telecom",
    "grocery / retail": "Retail",
    "retail": "Retail",
    "tech": "Technology",
    "aviation": "Travel",
    "travel": "Travel",
    "airline": "Travel",
    "food": "Food & Beverage",
}

CHANNEL_KEYWORDS = [
    ("In-app", ("app", "in-app", "mobile", "push", "digital-only")),
    ("Web/Social", ("social", "instagram", "twitter", "facebook", "web", "website", "online", "youtube", "tiktok")),
    ("Broadcast", ("broadcast", "tv", "telecast", "radio", "stream", "match broadcast")),
    ("In-stadium", ("stadium", "in-stadium", "matchday", "on-site", "in venue", "arena", "arena", "in-venue")),
]

FORMAT_KEYWORDS = [
    ("Content Module", ("series", "show", "episode", "hub", "channel", "module")),
    ("Content Branding", ("presented by", "brought to you", "powered by", "official", "sponsor spotlight")),
    ("Campaign/Event", ("night", "theme", "campaign", "event", "giveaway", "match")),
    ("Membership Benefit", ("membership", "season ticket", "loyalty", "points", "insider")),
    ("In-stadium Interactive", ("interactive", "scan", "qr", "photo booth", "in-seat", "in-bowl")),
    ("Data Sponsorship", ("data", "analytics", "stat", "powered")),
]

INVENTORY_KEYWORDS = [
    ("Front-of-Shirt", ("front-of-jersey", "front of jersey", "front-of-shirt", "primary kit", "jersey front", "kit sponsor")),
    ("Sleeve", ("sleeve", "arm patch")),
    ("Stadium Naming", ("stadium", "arena", "field", "park", "center", "centre")),
    ("Official Partner", ("official partner", "official", "partner")),
    ("Content Sponsor", ("presented by", "powered by", "show", "series", "module")),
    ("Timekeeper", ("timekeeper", "watch")),
    ("POS/Concessions", ("concession", "pos", "point of sale", "food service")),
    ("Theme Night", ("theme night", "night", "match")),
    ("Lounge/Gate naming", ("lounge", "gate", "club")),
]

OPPORTUNITY_KEYWORDS: List[Tuple[str, Tuple[str, ...]]] = [
    ("Loyalty", ("loyalty", "points", "rewards", "membership")),
    ("Gamification", ("game", "quiz", "challenge", "play", "competition")),
    ("Data/Viz", ("data", "analytics", "insight", "stats")),
    ("Venue-link", ("map", "parking", "transit", "wayfinding", "venue")),
    ("Wellness/Health", ("wellness", "health", "fitness", "medical")),
    ("Commerce/Shoppable", ("shop", "store", "commerce", "shoppable", "buy", "merch")),
]

SEVERITY_KEYWORDS = {
    "High": ("no ", "lack", "missing", "urgent", "major"),
    "Medium": ("could", "needs", "should", "opportunity"),
    "Low": ("nice", "future", "long-term"),
}

INTERACTIVITY_KEYWORDS = {
    "High": ("interactive", "game", "challenge", "real-time", "live polls"),
    "Medium": ("quiz", "vote", "prediction", "pick", "bracket"),
}

FEATURE_CATEGORY_LABELS = {
    "ticketing_matchday_access": "Ticketing & Matchday",
    "content_media": "Content & Media",
    "fan_engagement_gamification": "Fan Engagement",
    "supporter_groups_community": "Supporter Groups",
    "loyalty_rewards": "Loyalty & Rewards",
    "sponsorship_commerce": "Sponsorship & Commerce",
    "personalization_notifications": "Personalization",
    "stadium_experience_navigation": "Stadium Experience",
}

OpportunityType = Literal[
    "Loyalty",
    "Gamification",
    "Data/Viz",
    "Venue-link",
    "Wellness/Health",
    "Commerce/Shoppable",
    "General",
]


def _slugify(value: str) -> str:
    token = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return token or "team"


def _normalize_category(value: Optional[str]) -> str:
    if not value:
        return "Uncategorized"
    token = value.strip().lower()
    return CATEGORY_NORMALIZATION.get(token, value.split(" (")[0].strip())


def _match_keywords(value: str, keyword_groups: Iterable[Tuple[str, Tuple[str, ...]]], default: str) -> str:
    haystack = value.lower()
    for label, keywords in keyword_groups:
        if any(keyword in haystack for keyword in keywords):
            return label
    return default


def _derive_channel(text: str) -> str:
    channel = _match_keywords(text, CHANNEL_KEYWORDS, "In-stadium")
    return channel


def _derive_format(text: str) -> str:
    return _match_keywords(text, FORMAT_KEYWORDS, "Content Branding")


def _derive_inventory_type(text: str) -> str:
    return _match_keywords(text, INVENTORY_KEYWORDS, "Official Partner")


def _determine_interactivity(text: str) -> str:
    lowered = text.lower()
    for level, keywords in INTERACTIVITY_KEYWORDS.items():
        if any(keyword in lowered for keyword in keywords):
            return level
    return "Static"


def _boolean_flag(text: str, keywords: Iterable[str]) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in keywords)


def _derive_opportunities(team_id: str, team_name: str, mapping: Dict[str, str]) -> List[Dict[str, str]]:
    if not mapping:
        return []

    text = " ".join(filter(None, mapping.values())).lower()
    detected: List[OpportunityType] = []
    for label, keywords in OPPORTUNITY_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            detected.append(label)

    if not detected:
        detected.append("General")

    severity = "Medium"
    for level, keywords in SEVERITY_KEYWORDS.items():
        if any(keyword in text for keyword in keywords):
            severity = level
            break

    summary = mapping.get("missed_opportunity") or mapping.get("current_state") or ""
    recommendation = mapping.get("potential_yinzcam_activation") or ""

    opportunities = []
    for label in detected:
        opportunities.append(
            {
                "team_id": team_id,
                "team_name": team_name,
                "type": label,
                "severity": severity,
                "summary": summary,
                "recommendation": recommendation,
            }
        )
    return opportunities


def _feature_coverage_for_team(
    team: Dict[str, str],
    feature_taxonomy: Dict[str, List[str]],
    has_in_app: bool,
    has_loyalty: bool,
    has_commerce: bool,
) -> List[Dict[str, str]]:
    coverage = []
    for category_key, features in feature_taxonomy.items():
        category_label = FEATURE_CATEGORY_LABELS.get(category_key, category_key.replace("_", " ").title())
        for feature in features:
            status = "unknown"
            normalized = feature.lower()
            if has_in_app and any(token in normalized for token in ("interactive", "content", "fan", "engagement", "app")):
                status = "present"
            if has_loyalty and any(token in normalized for token in ("loyalty", "reward", "membership")):
                status = "present"
            if has_commerce and any(token in normalized for token in ("commerce", "shoppable", "shop", "retail")):
                status = "present"
            coverage.append(
                {
                    "team_id": team["id"],
                    "team_name": team["name"],
                    "category": category_label,
                    "feature": feature,
                    "status": status,
                }
            )
    return coverage


@lru_cache()
def _load_raw_payload() -> Dict:
    with DATA_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@lru_cache()
def build_dataset() -> Dict:
    payload = _load_raw_payload()
    teams_meta = payload.get("teams_meta", {})
    yinzcam_clients = set(teams_meta.get("yinzcam_clients", []))
    non_yinzcam = set(teams_meta.get("non_yinzcam", []))

    teams_data = []
    sponsor_rows = []
    opportunities: List[Dict[str, str]] = []
    coverage_rows: List[Dict[str, str]] = []
    categories_counter: Counter[str] = Counter()
    distinct_sponsors: set[str] = set()
    total_in_app = 0

    for team_entry in payload.get("teams", []):
        team_name = team_entry.get("team", "Unknown Team")
        team_id = _slugify(team_name)
        sponsors = []
        category_mix_counter: Counter[str] = Counter()
        team_in_app = 0

        for idx, sponsor_entry in enumerate(team_entry.get("sponsors", []), start=1):
            sponsor_name = sponsor_entry.get("sponsor", "Unknown Sponsor")
            where_how = sponsor_entry.get("where_how", "")
            notes = sponsor_entry.get("notes", "")
            category = sponsor_entry.get("category")
            normalized_category = _normalize_category(category)
            combined_text = f"{where_how} {notes}".strip()
            channel = _derive_channel(combined_text)
            derived_format = _derive_format(combined_text)
            inventory_type = _derive_inventory_type(combined_text)
            interactivity = _determine_interactivity(combined_text)
            has_in_app = channel == "In-app" or _boolean_flag(combined_text, ("app", "digital"))
            has_loyalty = _boolean_flag(combined_text, ("loyalty", "reward", "points", "membership"))
            has_commerce = _boolean_flag(combined_text, ("shop", "store", "commerce", "retail", "purchase", "shoppable"))

            if has_in_app:
                team_in_app += 1
                total_in_app += 1

            categories_counter[normalized_category] += 1
            category_mix_counter[normalized_category] += 1
            distinct_sponsors.add(sponsor_name)

            sponsor_record = {
                "team_id": team_id,
                "team_name": team_name,
                "sponsor": sponsor_name,
                "category": normalized_category,
                "original_category": category,
                "where_how": where_how,
                "notes": notes,
                "channel": channel,
                "format": derived_format,
                "inventory_type": inventory_type,
                "interactivity_level": interactivity,
                "has_in_app": has_in_app,
                "has_loyalty": has_loyalty,
                "has_commerce": has_commerce,
                "row_id": f"{team_id}-{idx}",
            }
            sponsors.append(sponsor_record)
            sponsor_rows.append(sponsor_record)

        team_opportunities = _derive_opportunities(team_id, team_name, team_entry.get("opportunity_mapping", {}))
        opportunities.extend(team_opportunities)

        coverage_rows.extend(
            _feature_coverage_for_team(
                {"id": team_id, "name": team_name},
                payload.get("feature_taxonomy", {}),
                has_in_app=team_in_app > 0,
                has_loyalty=any(row["has_loyalty"] for row in sponsors),
                has_commerce=any(row["has_commerce"] for row in sponsors),
            )
        )

        team_record = {
            "id": team_id,
            "name": team_name,
            "is_yinzcam": team_name in yinzcam_clients,
            "client_type": "YinzCam" if team_name in yinzcam_clients else "Non-YinzCam",
            "sponsors": sponsors,
            "observed_activations": team_entry.get("observed_activations", []),
            "opportunities": team_opportunities,
            "totals": {
                "sponsors": len(sponsors),
                "in_app_activations": team_in_app,
                "activation_score": (team_in_app / len(sponsors)) if sponsors else 0.0,
                "opportunities": len(team_opportunities),
            },
            "category_mix": [
                {"category": category, "count": count}
                for category, count in category_mix_counter.most_common()
            ],
        }
        teams_data.append(team_record)

    total_sponsor_rows = len(sponsor_rows)
    activation_score = (total_in_app / total_sponsor_rows) if total_sponsor_rows else 0.0
    top_categories = [
        {"category": category, "count": count}
        for category, count in categories_counter.most_common(3)
    ]

    opportunity_matrix: Dict[str, Dict[str, str]] = defaultdict(lambda: defaultdict(lambda: "None"))
    for opportunity in opportunities:
        team_id = opportunity["team_id"]
        opportunity_matrix[team_id][opportunity["type"]] = opportunity["severity"]

    sponsor_by_category: Dict[str, Dict[str, object]] = {}
    sponsor_index: Dict[str, Dict[str, object]] = {}

    for row in sponsor_rows:
        category = row["category"]
        sponsor_name = row["sponsor"]
        sponsor_key = sponsor_name.lower()
        team_name = row["team_name"]
        team_id = row["team_id"]
        has_in_app = row["has_in_app"]

        if category not in sponsor_by_category:
            sponsor_by_category[category] = {
                "category": category,
                "sponsors": {},
            }
        category_bucket = sponsor_by_category[category]["sponsors"]
        if sponsor_key not in category_bucket:
            category_bucket[sponsor_key] = {
                "name": sponsor_name,
                "teams": set(),
                "team_ids": set(),
                "in_app": 0,
                "total": 0,
            }
        sponsor_bucket = category_bucket[sponsor_key]
        sponsor_bucket["teams"].add(team_name)
        sponsor_bucket["team_ids"].add(team_id)
        sponsor_bucket["total"] += 1
        if has_in_app:
            sponsor_bucket["in_app"] += 1

        if sponsor_key not in sponsor_index:
            sponsor_index[sponsor_key] = {
                "name": sponsor_name,
                "category": category,
                "teams": set(),
                "team_ids": set(),
                "rows": [],
            }
        sponsor_index[sponsor_key]["teams"].add(team_name)
        sponsor_index[sponsor_key]["team_ids"].add(team_id)
        sponsor_index[sponsor_key]["rows"].append(row)

    sponsors_by_category_serialized = []
    for category, bucket in sponsor_by_category.items():
        sponsors_serialized = []
        for sponsor_data in bucket["sponsors"].values():
            sponsors_serialized.append(
                {
                    "name": sponsor_data["name"],
                    "team_count": len(sponsor_data["teams"]),
                    "teams": sorted(sponsor_data["teams"]),
                    "team_ids": sorted(sponsor_data["team_ids"]),
                    "in_app_activations": sponsor_data["in_app"],
                    "total_activations": sponsor_data["total"],
                }
            )
        sponsors_by_category_serialized.append(
            {
                "category": category,
                "sponsors": sorted(sponsors_serialized, key=lambda item: item["name"].lower()),
            }
        )

    sponsor_details = []
    for sponsor_data in sponsor_index.values():
        sponsor_details.append(
            {
                "name": sponsor_data["name"],
                "category": sponsor_data["category"],
                "teams": sorted(sponsor_data["teams"]),
                "team_ids": sorted(sponsor_data["team_ids"]),
                "rows": sponsor_data["rows"],
            }
        )

    # Flatten feature coverage per team for easier client consumption
    coverage_by_team: Dict[str, Dict[str, Dict[str, str]]] = defaultdict(lambda: defaultdict(lambda: "unknown"))
    for entry in coverage_rows:
        coverage_by_team[entry["team_id"]][entry["feature"]] = entry["status"]

    coverage_by_team_serialized = {team_id: dict(features) for team_id, features in coverage_by_team.items()}

    return {
        "meta": {
            "league": LEAGUE_NAME,
            "team_count": len(teams_data),
            "yinzcam_count": len(yinzcam_clients),
            "non_yinzcam_count": len(non_yinzcam),
            "generated_at": payload.get("generated_at"),
        },
        "summary": {
            "total_sponsors": len(distinct_sponsors),
            "total_sponsor_rows": total_sponsor_rows,
            "in_app_activations": total_in_app,
            "in_app_percentage": (total_in_app / total_sponsor_rows * 100) if total_sponsor_rows else 0.0,
            "activation_score": activation_score,
            "top_categories": top_categories,
            "avg_opportunities_per_team": (len(opportunities) / len(teams_data)) if teams_data else 0.0,
        },
        "teams": teams_data,
        "sponsors": {
            "by_category": sorted(sponsors_by_category_serialized, key=lambda item: item["category"].lower()),
            "details": sorted(sponsor_details, key=lambda item: item["name"].lower()),
        },
        "activations": sponsor_rows,
        "opportunities": {
            "list": opportunities,
            "matrix": opportunity_matrix,
        },
        "features": {
            "taxonomy": payload.get("feature_taxonomy", {}),
            "labels": FEATURE_CATEGORY_LABELS,
            "coverage": coverage_by_team_serialized,
        },
    }


def get_summary() -> Dict:
    return build_dataset()["summary"]


def get_meta() -> Dict:
    return build_dataset()["meta"]


def get_teams() -> List[Dict]:
    return build_dataset()["teams"]


def get_sponsors() -> Dict:
    return build_dataset()["sponsors"]


def get_activations() -> List[Dict]:
    return build_dataset()["activations"]


def get_opportunities() -> Dict:
    return build_dataset()["opportunities"]


def get_features() -> Dict:
    return build_dataset()["features"]
