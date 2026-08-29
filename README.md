# vehiclestory-data

Public dataset for the **Vehicle Story** app — multi-vehicle maintenance schedules & task
templates (car, motorcycle, RV, bike), manifest + JSON via GitHub Pages. Reference only; not
professional mechanical advice.

## Why the download URL still says `support-teamam`

`data/manifest.json` points at `https://support-teamam.github.io/...`. That host
is the endpoint the **already-shipped** app builds fetch from, and it is still
live. Renaming it silently breaks data downloads for every installed copy, so it
stays until a released app version points somewhere else. Everything
brand-facing here is Studio AM; this one string is plumbing.

## Vehicle database release integrity

`vehicle-manifest.json` publishes the Garage Story OTA vehicle database in
`data/all-vehicles.json`. Before publishing a data change, bump the manifest version, update its
SHA-256 for the exact payload bytes, and run:

```sh
node scripts/verify-vehicle-release.mjs
node --test scripts/verify-vehicle-release.test.mjs
```

The verifier checks the manifest/payload schema and count, the byte-level SHA-256, and the
permanent unique task IDs required by schema 3. `releases/vehicle-release-history.json` is an
append-only record: published version/digest pairs must never be edited or removed, and each new
pair—along with its contract, predecessor link, and transition hashes—is frozen in the verifier
in the same reviewed change.

Each release also keeps a deterministic contract under `releases/contracts/`. Adjacent releases
must preserve existing task IDs, their service/category meaning, and each vehicle's
generic/curated provenance. An intentional removal or semantic/provenance correction must be
listed with exact before/after values and a reason in the corresponding
`releases/transitions/` file. The v6-to-v7 bridge additionally proves that every permanent v7 task
ID matches the stable ID generated for its legacy v6 service label.
