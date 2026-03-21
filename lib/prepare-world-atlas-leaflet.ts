import type { FeatureCollection } from "geojson";
import { geoStitch } from "d3-geo-projection";

/**
 * World-atlas TopoJSON → GeoJSON often includes antimeridian / polar cuts that D3 hides
 * when projecting. Leaflet draws raw lat/lng, producing full-width “stripes” (Russia, Fiji, …).
 * geoStitch normalizes those rings so country fills align with the tile layer.
 */
export function prepareWorldAtlasForLeaflet(fc: FeatureCollection): FeatureCollection {
  const clone = JSON.parse(JSON.stringify(fc)) as FeatureCollection;
  return geoStitch(clone) as FeatureCollection;
}
