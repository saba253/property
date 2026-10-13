/**
 * Map background tiles. Only one provider is configured, in this one place.
 *
 * DEVELOPMENT / DEMO USE ONLY. These are the OpenStreetMap Foundation's standard tiles
 * (tile.openstreetmap.org). They are free, need no key or account, and may be used for light,
 * non-bulk use with visible attribution, under the OSMF Tile Usage Policy
 * (https://operations.osmfoundation.org/policies/tiles/). They are NOT an unlimited production
 * service: there is no SLA, heavy use is not allowed, and access can be blocked. Before a public
 * launch, a tile provider must be chosen and approved (it may cost money); change only this file.
 *
 * Map data © OpenStreetMap contributors (ODbL); the attribution must stay visible on the map.
 */
export const MAP_TILES = {
  url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-ის ავტორები',
  maxZoom: 19,
} as const;

/** Zoom used when the map shows a single area, and the most the map zooms in automatically. */
export const AREA_ZOOM = 13;
