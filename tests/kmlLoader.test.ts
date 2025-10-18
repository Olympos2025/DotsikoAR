import { describe, expect, it } from 'vitest';
import { loadKmlOrKmz } from '../src/geo/kmlLoader';

const sampleKml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test Point</name>
      <Point>
        <coordinates>22.431,39.639,0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`;

describe('KML loader', () => {
  it('parses KML into GeoJSON', async () => {
    const file = new File([sampleKml], 'test.kml', { type: 'application/vnd.google-earth.kml+xml' });
    const geojson = await loadKmlOrKmz(file);
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features.length).toBeGreaterThan(0);
    expect(geojson.features[0].properties?.name).toBe('Test Point');
  });
});
