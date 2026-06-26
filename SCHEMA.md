# Vehicle Story data schema

Public reference data for the native **Vehicle Story** app. One repo, four vehicle types,
served via GitHub Pages. The app fetches `manifest.json`, then the per-type file for the
vehicle the user selected.

> Reference only — not professional mechanical advice. Intervals are typical/generic and
> can be outdated; always defer to the owner's manual.

## manifest.json

```json
{
  "schema": 1,
  "version": 1,
  "vehicleTypes": [
    { "type": "car", "dataModel": "vehicleDB", "url": ".../data/car.json", "vehicleCount": 1004 },
    { "type": "motorcycle", "dataModel": "vehicleDB", "url": ".../data/motorcycle.json", "vehicleCount": 111 },
    { "type": "rv", "dataModel": "taskTemplate", "url": ".../data/rv.json", "taskCount": 40 },
    { "type": "bicycle", "dataModel": "taskTemplate", "url": ".../data/bicycle.json", "taskCount": 30 }
  ]
}
```

`version` bumps on any data change (the app caches by version, like the other Story datasets).

## Two data models

The app branches on `dataModel`:

### 1. `vehicleDB` — make/model/year → OEM-style schedule (car, motorcycle)
```json
{ "vehicles": [ {
  "make": "Toyota", "model": "RAV4", "years": "2019-2023", "generation": "5th Gen (XA50)",
  "scheduleSource": "generic",
  "schedule": [ {
    "service": "Oil Change", "mileInterval": 5000, "monthInterval": 6,
    "estimatedCost": [30, 75], "category": "engine", "description": "..."
  } ]
} ] }
```
App flow: user picks make/model/year → look up the vehicle → render its `schedule`, driving
reminders off `mileInterval` (odometer) and `monthInterval` (calendar).

### 2. `taskTemplate` — generic tasks by sub-type (rv, bicycle)
```json
{ "schema": 1, "version": 1, "tasks": [ {
  "id": "chain-lube", "task": "Chain Clean & Lube", "system": "drivetrain",
  "hourInterval": null, "monthInterval": 1, "season": null,
  "estimatedCost": [3, 15], "diy": true,
  "appliesTo": ["road", "mountain", "hybrid", "ebike", "kids"],
  "description": "..."
} ] }
```
App flow: user picks a sub-type (e.g. RV class A/B/C, bike road/mountain/ebike) → filter
`tasks` by `appliesTo` → render. RV uses `hourInterval` (engine/generator hours) where present.

## Provenance

Merged from the per-vertical datasets behind the former standalone apps (carstory-data,
motostory-data, rvstory-data, bikestory-data). Those repos remain; this is the consolidated
source for Vehicle Story (Team AM Story consolidation, 2026-06-23).

## Hosting

Enable GitHub Pages (branch `main`, root) so the `https://support-teamam.github.io/vehiclestory-data/`
URLs in `manifest.json` resolve.
