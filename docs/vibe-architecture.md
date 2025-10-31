# Yinzfeed Demo – Vibe‑Coded Architecture

This document explains how the project is intentionally “vibe‑coded”: minimal ceremony, fast iteration, and pragmatic heuristics over heavy abstractions. It’s written to help teammates quickly understand how things fit together and where to add/extend features.

## Purpose

- Internal research dashboard to benchmark MLS club sponsorships, surface “in‑app” opportunities, and explore vendor and feature ecosystems.
- Server shapes data; client focuses on filtering, rendering, exports, and shareability.

## Stack & Philosophy

- Stack: FastAPI + Jinja2 for a single HTML shell and static assets; one vanilla JS app orchestrates state, rendering, and UX.
- Minimal deps for speed: see `requirements.txt`.
- Philosophy: ship quickly, no build step, heuristics > over‑modeling, lightweight share/export tools, small a11y touches.

## High‑Level Architecture

- Backend
  - One HTML template + static files: `app/templates/index.html`, `app/static/…`
  - JSON APIs for pre‑shaped datasets: `app/main.py`
  - Service modules load JSON, enrich/normalize, and memoize: `app/services/*.py`
- Frontend
  - Single file app: `app/static/js/main.js`
  - Bootstraps by fetching all datasets in parallel; renders client‑side views.
  - Centralized state (plain object + Sets) and “compute then render” pipeline.

## Backend Details (FastAPI)

- App wiring: template + static mount (see `app/main.py`).
- Endpoints expose pre‑shaped sections (meta, summary, teams, sponsors, activations, opportunities, features), plus “Mode 2” datasets (leagues/teams, vendor ecosystem, grouped features).
- Services follow a consistent pattern:
  - `_load_payload()`/`_load_raw_payload()` reads JSON from `app/data/`.
  - `build_dataset()` normalizes and computes derived fields.
  - `@lru_cache()` on loader and builder to avoid per‑request recompute.

### Heuristic Enrichment

- Category normalization via lookup map.
- Keyword‑based derivations for:
  - Channel, format, inventory type.
  - Interactivity level.
  - Boolean flags: in‑app/loyalty/commerce.
  - Opportunity type + severity from team “opportunity_mapping”.
- Feature coverage is inferred ("present" vs "unknown") at team level using substring tokens and team‑level flags (in‑app, loyalty, commerce).

### Server‑Shaped Contracts

- Summary includes counts, in‑app %, top categories, activation score.
- Sponsors shipped as both `by_category` and `details` for quick drawer rendering.
- Opportunities shipped as both `list` and `matrix` keyed by team.
- Features: taxonomy + labels + flattened `coverage` per team keyed by feature string.
- Mode 2 vendor ecosystem: `core`, `ancillary`, `teams`, `team_mappings`, `exec_highlights`.
- Mode 2 features (grouped): `groups` as‑provided + stable `teams` list.

## Frontend Details (Vanilla JS)

- No framework; one file (`main.js`) manages:
  - API routes, app state, in‑memory store, derived indexes.
  - Boot sequence: parallel fetch, index build, filter hydration, URL state load, render, and event binding.
  - Views: Teams, Sponsors, Activations, Opportunities, Feature Coverage, plus Mode 2 panels.

### State & Derived Indexes

- `state`: plain object + Sets (filters, view, mode, compare selection, sidebar, mode2 controls).
- `store`: raw datasets plus `derived` indexes for filter options (sponsor names, categories, inventory types, channels, formats, interactivity, opportunity types/severities, feature categories/subfeatures).
- Derived built once after boot; kept simple for performance and clarity.

### Filtering Model

- Team predicate covers client type, quick filters (non‑YinzCam, in‑app only, etc.), and multi‑facet selections.
- Activation row predicate applies sponsor/category/inventory/channel/format/interactivity toggles and quick filters.
- Feature coverage filtering supports category + subfeature selections with coverage modes: `all` | `has` | `lacks`.

### UX & Shareability

- URL is the source of truth for reproducible state.
  - Serialize/hydrate via `URLSearchParams`; `history.replaceState` on changes.
- Saved Views in `localStorage` with “copy shareable link” to clipboard.
- CSV export helpers for Teams, Activations, Opportunities, Feature Coverage.
- Micro‑UX: filter chips wired via `queueMicrotask`, toasts, accessible roles/aria‑live regions.
- Mobile default collapses sidebar based on media query.

## Styling

- Custom dark theme with CSS variables, soft‑glass panels, independent scroll columns, polished controls.
- No utility framework to keep footprint and complexity low.

## Performance & Robustness

- Backend: cached dataset builders; JSON sources in repo for determinism.
- Frontend: single render pipeline, cheap Set operations, defensive DOM checks, Blob‑based CSV downloads.
- No bundler; one HTML + one JS keeps the path to “done” short.

## Trade‑offs

- Heuristics can misclassify edge cases; tuned for directional insights.
- Single‑file JS is easy to grasp but requires discipline as features grow.
- Client loads all datasets at boot; acceptable for internal dashboard scale.

## How to Extend

- New dataset
  - Add a service with `_load_payload` + `build_dataset` + getters.
  - Wire an endpoint in `app/main.py`, add to `API_ROUTES`, hydrate in `bootstrap`.
- New filter
  - Add to `buildDerivedIndexes`, render via `hydrateFilters`, update predicates, and extend `serializeState`/`loadStateFromURL`.
- New view
  - Add a `view-panel` in template, update `view-switcher` buttons, add a render function.

## Files to Skim First

- Backend entry: `app/main.py`
- Dataset logic: `app/services/mls_data.py`, `app/services/vendor_ecosystem.py`, `app/services/features_grouped.py`
- Frontend app: `app/static/js/main.js`
- HTML shell: `app/templates/index.html`
- Theme/styles: `app/static/css/style.css`

