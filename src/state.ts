import type { FeatureCollection } from 'geojson';

export type LayerStyle = {
  fillColor: string;
  fillOpacity: number;
  outlineColor: string;
  outlineWidth: number;
  lineWidth: number;
  pointIcon: string;
  pointLabel: boolean;
};

export type SessionOffsets = {
  positionOffset: { east: number; north: number };
  headingOffset: number;
};

export type VisibleLayers = {
  points: boolean;
  lines: boolean;
  polygons: boolean;
};

export interface AppState {
  geojson?: FeatureCollection;
  originalGeojson?: FeatureCollection;
  fileName?: string;
  layerStyle: LayerStyle;
  heightOffset: number;
  simplificationTolerance: number;
  isArActive: boolean;
  highlightedFeatureId?: string;
  permissions: {
    camera: boolean;
    location: boolean;
    orientation: boolean;
  };
  gpsAccuracy?: number;
  heading?: number;
  secureContext: boolean;
  fallbackMode: boolean;
  sessionOffsets: SessionOffsets;
  visibleLayers: VisibleLayers;
}

const defaultStyle: LayerStyle = {
  fillColor: '#1f6feb',
  fillOpacity: 0.45,
  outlineColor: '#1f6feb',
  outlineWidth: 2,
  lineWidth: 3,
  pointIcon: '📍',
  pointLabel: true
};

const defaultLayerVisibility: VisibleLayers = {
  points: true,
  lines: true,
  polygons: true
};

const createDefaultSessionOffsets = (): SessionOffsets => ({
  positionOffset: { east: 0, north: 0 },
  headingOffset: 0
});

const defaultState: AppState = {
  layerStyle: { ...defaultStyle },
  heightOffset: 0,
  simplificationTolerance: 2,
  isArActive: false,
  permissions: {
    camera: false,
    location: false,
    orientation: false
  },
  secureContext: window.isSecureContext,
  fallbackMode: !window.isSecureContext,
  sessionOffsets: createDefaultSessionOffsets(),
  visibleLayers: { ...defaultLayerVisibility }
};

let state: AppState = { ...defaultState };

const listeners = new Set<(state: AppState) => void>();

export const getState = () => state;

export const resetState = () => {
  state = {
    ...defaultState,
    layerStyle: { ...defaultStyle },
    sessionOffsets: createDefaultSessionOffsets(),
    visibleLayers: { ...defaultLayerVisibility }
  };
  notify();
};

export const updateState = (patch: Partial<AppState>) => {
  state = { ...state, ...patch };
  notify();
};

export const subscribe = (listener: (state: AppState) => void) => {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
};

const notify = () => listeners.forEach((listener) => listener(state));

export const persistSessionOffsets = (fileKey: string, offsets: SessionOffsets) => {
  sessionStorage.setItem(`fieldar-offset-${fileKey}`, JSON.stringify(offsets));
};

export const loadSessionOffsets = (fileKey: string): SessionOffsets | null => {
  const raw = sessionStorage.getItem(`fieldar-offset-${fileKey}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionOffsets;
  } catch (error) {
    console.warn('Failed to parse session offsets', error);
    return null;
  }
};

export const getDefaultSessionOffsets = (): SessionOffsets => createDefaultSessionOffsets();

export const getDefaultLayerVisibility = (): VisibleLayers => ({ ...defaultLayerVisibility });
