import clevelandGeo from "./cleveland-zips.json";
import milwaukeeGeo from "./milwaukee-zips.json";
import type { FeatureCollection } from "geojson";

export const CITY_GEO: Record<string, FeatureCollection> = {
  cleveland: clevelandGeo as unknown as FeatureCollection,
  milwaukee: milwaukeeGeo as unknown as FeatureCollection,
};
