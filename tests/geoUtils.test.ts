import { describe, expect, it } from 'vitest';
import LatLon from 'geodesy/latlon-ellipsoidal-vincenty.js';
import { simplifyFeatureCollection, toLocalENU } from '../src/geo/geoUtils';

import type { FeatureCollection } from 'geojson';

describe('geoUtils', () => {
  it('computes ENU distances with expected accuracy', () => {
    const origin = new LatLon(39.639, 22.431);
    const target = new LatLon(39.64, 22.432);
    const enu = toLocalENU(origin, target);
    expect(Math.round(enu.north)).toBeCloseTo(111, -1);
    expect(Math.round(enu.east)).toBeCloseTo(84, -1);
  });

  it('simplifies feature collection', () => {
    const collection: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: [
              [0, 0],
              [0.0001, 0.0001],
              [0.0002, 0.0002],
              [0.001, 0.001]
            ]
          }
        }
      ]
    };
    const simplified = simplifyFeatureCollection(collection, 10);
    const coords = (simplified.features[0].geometry as any).coordinates;
    expect(coords.length).toBeLessThan(collection.features[0].geometry.coordinates.length);
  });
});
