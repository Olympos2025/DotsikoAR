import LatLon from 'geodesy/latlon-ellipsoidal-vincenty.js';
import type { Feature, FeatureCollection, Geometry } from 'geojson';

export interface ENUPoint {
  east: number;
  north: number;
  up: number;
}

export interface PositionedFeature extends Feature {
  properties: Feature['properties'] & {
    enu?: ENUPoint[];
    centroid?: ENUPoint;
  };
}

export const toLocalENU = (origin: any, target: any): ENUPoint => {
  const distance = origin.distanceTo(target);
  const initialBearing = origin.initialBearingTo(target);
  const bearingRad = (initialBearing * Math.PI) / 180;
  const east = Math.sin(bearingRad) * distance;
  const north = Math.cos(bearingRad) * distance;
  return { east, north, up: 0 };
};

export const featureToENU = (origin: any, feature: Feature): PositionedFeature => {
  const geometry = feature.geometry;
  const mapCoordinates = (coords: any): ENUPoint[] => {
    if (typeof coords[0] === 'number') {
      const [lon, lat, alt = 0] = coords as [number, number, number?];
      const enu = toLocalENU(origin, new LatLon(lat, lon));
      return [{ ...enu, up: alt }];
    }
    return (coords as any[]).flatMap((c) => mapCoordinates(c));
  };

  const enuPoints = mapCoordinates((geometry as any).coordinates);

  const centroid = enuPoints.reduce(
    (acc, point) => ({ east: acc.east + point.east, north: acc.north + point.north, up: acc.up + point.up }),
    { east: 0, north: 0, up: 0 }
  );
  if (enuPoints.length) {
    centroid.east /= enuPoints.length;
    centroid.north /= enuPoints.length;
    centroid.up /= enuPoints.length;
  }

  return {
    ...feature,
    properties: {
      ...feature.properties,
      enu: enuPoints,
      centroid
    }
  };
};

export const smoothPositions = (values: ENUPoint[], windowSize = 5): ENUPoint[] => {
  if (!values.length) return [];
  const smoothed: ENUPoint[] = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = values.slice(start, i + 1);
    const aggregate = slice.reduce(
      (acc, point) => ({ east: acc.east + point.east, north: acc.north + point.north, up: acc.up + point.up }),
      { east: 0, north: 0, up: 0 }
    );
    smoothed.push({
      east: aggregate.east / slice.length,
      north: aggregate.north / slice.length,
      up: aggregate.up / slice.length
    });
  }
  return smoothed;
};

export const simplifyCoordinates = (coordinates: number[][], tolerance: number): number[][] => {
  if (coordinates.length <= 2) return coordinates;

  const sqTolerance = tolerance * tolerance;

  const simplifyDP = (points: number[][], first: number, last: number, simplified: number[][]) => {
    let maxDist = sqTolerance;
    let index = -1;

    const [x1, y1] = points[first];
    const [x2, y2] = points[last];

    const dx = x2 - x1;
    const dy = y2 - y1;

    const lengthSq = dx * dx + dy * dy || 1;

    for (let i = first + 1; i < last; i++) {
      const [x0, y0] = points[i];
      const t = ((x0 - x1) * dx + (y0 - y1) * dy) / lengthSq;
      const projx = x1 + t * dx;
      const projy = y1 + t * dy;
      const distSq = (projx - x0) ** 2 + (projy - y0) ** 2;
      if (distSq > maxDist) {
        index = i;
        maxDist = distSq;
      }
    }

    if (maxDist > sqTolerance && index !== -1) {
      if (index - first > 1) simplifyDP(points, first, index, simplified);
      simplified.push(points[index]);
      if (last - index > 1) simplifyDP(points, index, last, simplified);
    }
  };

  const simplified = [coordinates[0]];
  simplifyDP(coordinates, 0, coordinates.length - 1, simplified);
  simplified.push(coordinates[coordinates.length - 1]);

  return simplified;
};

export const simplifyFeatureCollection = (collection: FeatureCollection, toleranceMeters: number): FeatureCollection => {
  const simplifyGeometry = (geometry: Geometry): Geometry => {
    const simplifyRecursive = (coords: any): any => {
      if (typeof coords[0] === 'number') return coords;
      if (typeof coords[0][0] === 'number') {
        return simplifyCoordinates(coords as number[][], toleranceMeters);
      }
      return (coords as any[]).map(simplifyRecursive);
    };
    return {
      ...geometry,
      coordinates: simplifyRecursive((geometry as any).coordinates)
    } as Geometry;
  };

  return {
    ...collection,
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: simplifyGeometry(feature.geometry)
    }))
  };
};

export const toFeatureCollectionWithEnu = (origin: any, collection: FeatureCollection): FeatureCollection => ({
  ...collection,
  features: collection.features.map((feature) => featureToENU(origin, feature))
});
