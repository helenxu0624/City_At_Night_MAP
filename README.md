# Spring Garden East After Dark

An interactive atlas of lighting observations and business opening hours in Philadelphia.

## Investigations

- **Business Activity:** 71 commercial places with usable opening schedules, seven categories, a full-day time slider, overnight playback, a concentration overlay, an evening comparison and CSV export.
- **Light:** 21 rated building frontages and 100 pole inventory records, with brightness and fixture-record filters.

Automatic map display colors gradually darken from 17:00 to 22:00 and brighten from 05:00 to 08:00. This is a visual cue rather than measured illumination or a seasonal sunrise/sunset calculation.

## Reading the evidence

Business hours show scheduled availability, not visitor counts. Building brightness is an ordinal field rating from 1 to 5, with higher values indicating brighter observations. Survey date and measurement protocol are not supplied. Pole inventory records do not establish working condition, beam coverage or safety. No sampled building has brightness rating 4.

The heat overlay uses equal-weight Gaussian kernels with 90 m standard deviation and a fixed scale. Before 06:00, the evening comparison uses 18:00 on the preceding calendar day.

## Sources and attribution

- Supplied Google Places commercial inventory and opening intervals within Study_Area_Large. Schedule collection date unknown.
- Supplied building_light and LightPole_data shapefiles.
- Street and building reference: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. Local extract downloaded October 19, 2026.

## GitHub Pages

Publish the **main** branch from **/(root)** in Settings → Pages. The root contains index.html and all required assets. No build step or API key is needed.

The packaged vector reference and place records run locally. Optional OpenStreetMap raster tiles and Google Fonts need an internet connection. The atlas has no personal geolocation tracking or analytics.

Prepared October 29, 2026.
