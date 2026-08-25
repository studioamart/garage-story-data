# Garage Story schedule data schema

Public reference schedules for Garage Story, delivered over HTTPS through the
digest-verified `vehicle-manifest.json` release.

> Reference only — not professional mechanical advice. Intervals are typical or
> model-specific reference values and may be outdated; defer to the owner's manual.

## Manifest

```json
{
  "schema": 3,
  "version": 7,
  "url": "https://studioamart.github.io/garage-story-data/data/all-vehicles.json",
  "sha256": "<sha256 of the exact payload bytes>",
  "vehicleCount": 1424
}
```

`version` increases for every published payload change. The app verifies the
schema, count, SHA-256 digest, size limits, and every row before activating a
download. RV task templates are currently bundled with the binary and therefore
are deliberately not advertised by this OTA manifest.

## Vehicle payload (schema 3)

```json
{
  "schema": 3,
  "vehicles": [{
    "make": "Toyota",
    "model": "RAV4",
    "years": "2019-2023",
    "generation": "5th Gen (XA50)",
    "vehicleType": "car",
    "scheduleSource": "generic",
    "schedule": [{
      "taskId": "service:oil-change",
      "service": "Oil Change",
      "mileInterval": 5000,
      "monthInterval": 6,
      "estimatedCost": [30, 75],
      "category": "engine",
      "description": "..."
    }]
  }]
}
```

Every schedule row must publish a permanent, namespaced `taskId`. It is identity,
not display copy: after an ID is released, changing `service` must not change the
ID. Schema 3's initial IDs intentionally equal the app's prior deterministic
`service:<normalized-label>` compatibility IDs. That makes the one-time migration
exact; legacy records without IDs still match only when their normalized label is
unique in that vehicle's active schedule.

Task IDs must be unique within each vehicle schedule. The release builder also
enforces row, schedule, string, interval, and payload-size limits.

## Bundled RV task template

`data/rv-tasks.json` remains the reviewed source mirrored into the app bundle.
Its curated source `id` becomes runtime `taskId` `rv:<id>`. Interval dimensions
are literal: `mileInterval` is chassis mileage, `hourInterval` is an equipment
hour meter, and `monthInterval` is calendar time. A missing dimension stays null.

## Release validation

Run:

```sh
node scripts/build-vehicle-manifest.mjs
node scripts/build-vehicle-manifest.mjs --check
```

The first command validates the complete payload and writes the derived digest
and count. `--check` fails when the checked-in manifest differs.
