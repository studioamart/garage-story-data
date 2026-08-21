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
