import { DOMParser } from '@xmldom/xmldom';
import { kml as kmlToGeoJSON } from '@tmcw/togeojson';
import type { FeatureCollection } from 'geojson';
import JSZip from 'jszip';

const parser = new DOMParser();

const parseKmlString = (kmlText: string): FeatureCollection => {
  const dom = parser.parseFromString(kmlText, 'text/xml');
  return kmlToGeoJSON(dom) as FeatureCollection;
};

const getFirstKmlFromKmz = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const kmlFile = Object.keys(zip.files).find((key) => key.toLowerCase().endsWith('.kml'));
  if (!kmlFile) {
    throw new Error('No KML file found in KMZ');
  }
  return zip.file(kmlFile)!.async('string');
};

export const loadKmlOrKmz = async (file: File): Promise<FeatureCollection> => {
  const getText = () => {
    if (typeof (file as any).text === 'function') {
      return (file as Blob).text();
    }
    return new Response(file).text();
  };

  const extension = file.name.toLowerCase();
  if (extension.endsWith('.kmz')) {
    const contents = await file.arrayBuffer();
    const kmlText = await getFirstKmlFromKmz(contents);
    return parseKmlString(kmlText);
  }
  const text = await getText();
  return parseKmlString(text);
};
