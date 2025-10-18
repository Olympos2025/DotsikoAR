import './styles/tailwind.css';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import { loadKmlOrKmz } from './geo/kmlLoader';
import { simplifyFeatureCollection } from './geo/geoUtils';
import { ARRenderer } from './ar/arRenderer';
import { availableLocales, getLocale, setLocale, t } from './ui/i18n';
import {
  getDefaultSessionOffsets,
  getState,
  loadSessionOffsets,
  persistSessionOffsets,
  subscribe,
  updateState
} from './state';
import type { LayerStyle, VisibleLayers } from './state';
import {
  requestCamera,
  requestLocation,
  requestOrientationPermission,
  watchLocation
} from './permissions';
import { applyCalibration, createHeadingAdjustment, createNudge } from './calibration';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App container missing');

const renderer = new ARRenderer();
let previewMap: maplibregl.Map | undefined;
let fallbackMap: maplibregl.Map | undefined;
let geoWatchStop: (() => void) | undefined;
let latestPosition: GeolocationPosition | undefined;
let headingWatchActive = false;

const teardownMaps = () => {
  previewMap?.remove();
  previewMap = undefined;
  fallbackMap?.remove();
  fallbackMap = undefined;
};

const renderLayout = () => {
  const state = getState();
  teardownMaps();
  const currentLocale = getLocale();
  const startDisabled = !state.geojson || !state.secureContext || state.fallbackMode;

  app.innerHTML = `
    <div class="flex h-full flex-col">
      <header class="p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <img src="/assets/logo.svg" alt="FieldAR" class="h-10 w-10" />
            <div>
              <h1 class="text-lg font-bold">${t('app.title')}</h1>
              <p class="text-sm opacity-80">${t('app.subtitle')}</p>
            </div>
          </div>
          <select id="locale-select" class="rounded-lg border border-slate-300 bg-transparent px-3 py-2 text-sm dark:border-slate-700">
            ${availableLocales
              .map((locale) => `<option value="${locale}" ${locale === currentLocale ? 'selected' : ''}>${locale.toUpperCase()}</option>`)
              .join('')}
          </select>
        </div>
      </header>
      <main class="flex-1 overflow-y-auto p-4">
        <section class="card space-y-4">
          <p class="text-sm text-slate-600 dark:text-slate-300">${t('disclaimer')}</p>
          <div class="flex flex-col gap-3">
            <label class="btn btn-primary" for="file-input">${t('cta.load')}</label>
            <input id="file-input" type="file" accept=".kml,.kmz" class="hidden" />
            <div class="grid gap-4">
              <div>
                <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide">${t('map.preview')}</h2>
                <div id="map-preview" class="h-64 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"></div>
              </div>
              <div>
                <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide">${t('ui.layerSettings')}</h2>
                <div class="grid grid-cols-2 gap-3 text-sm">
                  <label class="flex flex-col gap-1">Fill
                    <input id="fill-color" type="color" value="${state.layerStyle.fillColor}" class="h-10 w-full rounded" />
                  </label>
                  <label class="flex flex-col gap-1">Outline
                    <input id="outline-color" type="color" value="${state.layerStyle.outlineColor}" class="h-10 w-full rounded" />
                  </label>
                  <label class="flex flex-col gap-1">${t('ui.opacity')}
                    <input id="fill-opacity" type="range" min="0" max="1" step="0.05" value="${state.layerStyle.fillOpacity}" />
                  </label>
                  <label class="flex flex-col gap-1">Line width
                    <input id="line-width" type="range" min="1" max="10" step="1" value="${state.layerStyle.lineWidth}" />
                  </label>
                  <label class="flex flex-col gap-1">Outline width
                    <input id="outline-width" type="range" min="1" max="10" step="1" value="${state.layerStyle.outlineWidth}" />
                  </label>
                  <label class="flex flex-col gap-1">Icon
                    <input id="point-icon" type="text" value="${state.layerStyle.pointIcon}" class="rounded border border-slate-200 px-2 py-1 dark:border-slate-700" />
                  </label>
                  <label class="col-span-2 flex items-center gap-2">
                    <input id="point-label" type="checkbox" ${state.layerStyle.pointLabel ? 'checked' : ''} />
                    <span>${t('list.highlight')}</span>
                  </label>
                </div>
              </div>
            </div>
            <div class="grid gap-4 md:grid-cols-2">
              <label class="flex flex-col gap-1 text-sm">${t('ui.heightOffset')} (m)
                <input id="height-offset" type="range" min="-5" max="10" step="0.1" value="${state.heightOffset}" />
              </label>
              <label class="flex flex-col gap-1 text-sm">${t('ui.simplification')} (m)
                <input id="simplification" type="range" min="1" max="10" step="1" value="${state.simplificationTolerance}" />
              </label>
            </div>
          </div>
          <button id="start-ar" class="btn btn-primary w-full ${startDisabled ? 'opacity-50' : ''}" ${startDisabled ? 'disabled' : ''}>${t('cta.startAr')}</button>
        </section>

        <section class="mt-6 card space-y-4" id="feature-list-section" ${state.geojson ? '' : 'hidden'}>
          <div class="flex items-center justify-between">
            <h2 class="text-base font-semibold">${t('ui.list')}</h2>
            <button id="toggle-layers" class="btn btn-secondary text-sm">${t('ui.layers')}</button>
          </div>
          <div id="layer-panel" class="hidden rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <h3 class="text-xs font-semibold uppercase tracking-wide">${t('ui.layerVisibility')}</h3>
            <div class="mt-2 space-y-2 text-sm">
              <label class="flex items-center gap-2">
                <input type="checkbox" data-layer="polygons" ${state.visibleLayers.polygons ? 'checked' : ''} />
                <span>${t('ui.polygons')}</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" data-layer="lines" ${state.visibleLayers.lines ? 'checked' : ''} />
                <span>${t('ui.lines')}</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" data-layer="points" ${state.visibleLayers.points ? 'checked' : ''} />
                <span>${t('ui.points')}</span>
              </label>
            </div>
          </div>
          <ul id="feature-list" class="space-y-2 text-sm"></ul>
        </section>

        <section class="mt-6 card space-y-3" id="fallback-section" ${state.fallbackMode ? '' : 'hidden'}>
          <h2 class="text-base font-semibold">${t('ui.mapFallback')}</h2>
          <p id="fallback-message" class="text-sm text-slate-600 dark:text-slate-300">
            ${state.secureContext ? t('errors.permissions') : t('errors.https')}
          </p>
          <div id="fallback-map" class="h-64 w-full rounded-xl border border-slate-200 dark:border-slate-700"></div>
        </section>
      </main>

      <footer class="p-4 text-center text-xs opacity-70">
        FieldAR © ${new Date().getFullYear()} — ${t('errors.https')}
      </footer>

      <div id="https-modal" class="modal-backdrop" ${state.secureContext ? 'hidden' : ''}>
        <div class="card w-full max-w-sm text-center">
          <h2 class="mb-3 text-lg font-semibold">FieldAR</h2>
          <p class="mb-4 text-sm">${t('errors.https')}</p>
          <button id="close-https" class="btn btn-primary w-full">OK</button>
        </div>
      </div>

      <div id="ar-overlay" class="pointer-events-none fixed inset-0 z-40 hidden">
        <div class="pointer-events-auto flex h-full flex-col justify-between p-4">
          <div class="flex items-center justify-between rounded-xl bg-black/60 px-3 py-2 text-white">
            <div>
              <div class="text-xs uppercase tracking-wide">GPS</div>
              <div id="gps-accuracy" class="text-lg font-semibold">--</div>
            </div>
            <div class="text-right">
              <div class="text-xs uppercase tracking-wide">${t('ui.heading')}</div>
              <div id="heading-indicator" class="text-lg font-semibold">--</div>
            </div>
          </div>
          <div class="space-y-3">
            <div class="rounded-xl bg-black/60 p-3 text-white">
              <h3 class="text-sm font-semibold">${t('ui.nudge')}</h3>
              <div class="mt-2 grid grid-cols-3 gap-2 text-sm">
                <button data-nudge="N" class="btn btn-secondary">N</button>
                <button data-nudge="E" class="btn btn-secondary">E</button>
                <button data-nudge="S" class="btn btn-secondary">S</button>
                <button data-nudge="W" class="btn btn-secondary col-span-3">W</button>
              </div>
              <div class="mt-2 flex items-center gap-2 text-sm">
                <span>Step</span>
                <input id="nudge-step" type="range" min="0.5" max="2" step="0.5" value="1" />
                <span id="nudge-value">1m</span>
              </div>
            </div>
            <div class="rounded-xl bg-black/60 p-3 text-white">
              <h3 class="text-sm font-semibold">${t('ui.headingAdjust')}</h3>
              <div class="mt-2 grid grid-cols-2 gap-2 text-sm">
                <button data-heading="-5" class="btn btn-secondary">-5°</button>
                <button data-heading="5" class="btn btn-secondary">+5°</button>
                <button data-heading="-1" class="btn btn-secondary">-1°</button>
                <button data-heading="1" class="btn btn-secondary">+1°</button>
              </div>
            </div>
            <button id="exit-ar" class="btn btn-primary w-full">${t('cta.exitAr')}</button>
          </div>
        </div>
      </div>
    </div>
  `;
};

const initMap = (containerId: string) =>
  new maplibregl.Map({
    container: containerId,
    style: 'https://demotiles.maplibre.org/style.json',
    center: [22.431, 39.639],
    zoom: 13,
    attributionControl: false
  });

const whenMapReady = (map: maplibregl.Map, callback: () => void) => {
  if (map.isStyleLoaded()) {
    callback();
  } else {
    map.once('load', callback);
  }
};

const applyMapStyling = (map: maplibregl.Map, style: LayerStyle, visible: VisibleLayers) => {
  if (map.getLayer('fieldar-fill')) {
    map.setPaintProperty('fieldar-fill', 'fill-color', style.fillColor);
    map.setPaintProperty('fieldar-fill', 'fill-opacity', style.fillOpacity);
    map.setLayoutProperty('fieldar-fill', 'visibility', visible.polygons ? 'visible' : 'none');
  }
  if (map.getLayer('fieldar-outline')) {
    map.setPaintProperty('fieldar-outline', 'line-color', style.outlineColor);
    map.setPaintProperty('fieldar-outline', 'line-width', style.outlineWidth);
    map.setLayoutProperty('fieldar-outline', 'visibility', visible.lines || visible.polygons ? 'visible' : 'none');
  }
  if (map.getLayer('fieldar-line')) {
    map.setPaintProperty('fieldar-line', 'line-color', style.outlineColor);
    map.setPaintProperty('fieldar-line', 'line-width', style.lineWidth);
    map.setLayoutProperty('fieldar-line', 'visibility', visible.lines ? 'visible' : 'none');
  }
  if (map.getLayer('fieldar-point')) {
    map.setLayoutProperty('fieldar-point', 'visibility', visible.points ? 'visible' : 'none');
  }
};

const updatePreviewMap = (collection: FeatureCollection) => {
  if (!previewMap) return;
  whenMapReady(previewMap, () => {
    if (!previewMap) return;
    const map = previewMap;
    const sourceId = 'fieldar-data';
    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(collection);
    } else {
      map.addSource(sourceId, {
        type: 'geojson',
        data: collection
      });
      map.addLayer({
        id: 'fieldar-fill',
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': getState().layerStyle.fillColor,
          'fill-opacity': getState().layerStyle.fillOpacity
        },
        filter: ['==', '$type', 'Polygon']
      });
      map.addLayer({
        id: 'fieldar-outline',
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': getState().layerStyle.outlineColor,
          'line-width': getState().layerStyle.outlineWidth
        },
        filter: ['all', ['!=', '$type', 'Point']]
      });
      map.addLayer({
        id: 'fieldar-line',
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': getState().layerStyle.outlineColor,
          'line-width': getState().layerStyle.lineWidth
        },
        filter: ['==', '$type', 'LineString']
      });
      map.addLayer({
        id: 'fieldar-point',
        type: 'symbol',
        source: sourceId,
        layout: {
          'icon-image': 'marker-15',
          'icon-size': 1.2,
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-offset': [0, 1.2]
        },
        paint: {
          'text-color': '#111827'
        },
        filter: ['==', '$type', 'Point']
      });
    }

    applyMapStyling(map, getState().layerStyle, getState().visibleLayers);

    const bounds = new maplibregl.LngLatBounds();
    collection.features.forEach((feature) => {
      const coords = (feature.geometry as any).coordinates;
      const addCoords = (coord: any) => {
        if (typeof coord[0] === 'number') {
          bounds.extend(coord as [number, number]);
        } else {
          coord.forEach(addCoords);
        }
      };
      addCoords(coords);
    });
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 20, maxZoom: 18 });
    }
  });
};

const ensureFallbackMap = () => {
  if (fallbackMap) return;
  fallbackMap = initMap('fallback-map');
  whenMapReady(fallbackMap, () => {
    const state = getState();
    if (state.geojson) {
      updateFallbackMap(state.geojson);
    }
    if (latestPosition) {
      updateFallbackUserLocation(latestPosition);
    }
  });
};

const updateFallbackMap = (collection: FeatureCollection) => {
  if (!fallbackMap) return;
  whenMapReady(fallbackMap, () => {
    if (!fallbackMap) return;
    const map = fallbackMap;
    const sourceId = 'fieldar-data';
    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(collection);
    } else {
      map.addSource(sourceId, {
        type: 'geojson',
        data: collection
      });
      map.addLayer({
        id: 'fieldar-fill',
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': getState().layerStyle.fillColor,
          'fill-opacity': getState().layerStyle.fillOpacity
        },
        filter: ['==', '$type', 'Polygon']
      });
      map.addLayer({
        id: 'fieldar-outline',
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': getState().layerStyle.outlineColor,
          'line-width': getState().layerStyle.outlineWidth
        },
        filter: ['==', '$type', 'Polygon']
      });
      map.addLayer({
        id: 'fieldar-line',
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': getState().layerStyle.outlineColor,
          'line-width': getState().layerStyle.lineWidth
        },
        filter: ['==', '$type', 'LineString']
      });
      map.addLayer({
        id: 'fieldar-point',
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': 6,
          'circle-color': '#ef4444',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        },
        filter: ['==', '$type', 'Point']
      });
    }
    applyMapStyling(map, getState().layerStyle, getState().visibleLayers);
  });
};

const updateFallbackUserLocation = (position: GeolocationPosition) => {
  if (!fallbackMap) return;
  const sourceId = 'fieldar-user';
  const featureCollection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Point',
          coordinates: [position.coords.longitude, position.coords.latitude]
        }
      }
    ]
  };
  whenMapReady(fallbackMap, () => {
    if (!fallbackMap) return;
    const map = fallbackMap;
    if (map.getSource(sourceId)) {
      (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData(featureCollection);
    } else {
      map.addSource(sourceId, {
        type: 'geojson',
        data: featureCollection
      });
      map.addLayer({
        id: 'fieldar-user',
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-radius': 5,
          'circle-color': '#2563eb',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2
        }
      });
    }
  });
};

const updateFeatureList = (collection?: FeatureCollection) => {
  const section = document.querySelector<HTMLElement>('#feature-list-section');
  const list = document.querySelector<HTMLUListElement>('#feature-list');
  if (!section || !list) return;
  if (!collection || !collection.features.length) {
    section.hidden = true;
    list.innerHTML = '';
    return;
  }
  section.hidden = false;
  list.innerHTML = '';
  const highlighted = getState().highlightedFeatureId;
  collection.features.forEach((feature, index) => {
    const id = (feature.id ?? index).toString();
    const item = document.createElement('li');
    item.className = 'rounded-xl border border-slate-200 px-3 py-2 transition dark:border-slate-700';
    item.dataset.featureId = id;
    item.innerHTML = `<div class="font-semibold">${feature.properties?.name ?? 'Feature ' + id}</div>
      <div class="text-xs opacity-70">${feature.geometry.type}</div>`;
    item.addEventListener('click', () => {
      updateState({ highlightedFeatureId: id });
      renderer.setHighlight(id);
      document.querySelectorAll('#feature-list li').forEach((el) => el.classList.remove('border-accent'));
      item.classList.add('border-accent');
    });
    if (highlighted && highlighted === id) {
      item.classList.add('border-accent');
    }
    list.appendChild(item);
  });
};

const setupFileLoader = () => {
  const fileInput = document.querySelector<HTMLInputElement>('#file-input');
  if (!fileInput) return;
  fileInput.addEventListener('change', async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const baseState = getState();
    const geojson = await loadKmlOrKmz(file);
    const simplified = simplifyFeatureCollection(geojson, baseState.simplificationTolerance);
    const storedOffsets = loadSessionOffsets(file.name) ?? getDefaultSessionOffsets();
    updateState({
      fileName: file.name,
      geojson: simplified,
      originalGeojson: geojson,
      sessionOffsets: storedOffsets
    });
    renderer.setSessionOffsets(storedOffsets);
    renderer.loadFeatures(simplified, baseState.layerStyle, baseState.visibleLayers);
    updatePreviewMap(simplified);
    if (getState().fallbackMode) {
      ensureFallbackMap();
      updateFallbackMap(simplified);
    }
    updateFeatureList(simplified);
  });
};

const bindStyleControls = () => {
  const fillColor = document.querySelector<HTMLInputElement>('#fill-color');
  const outlineColor = document.querySelector<HTMLInputElement>('#outline-color');
  const fillOpacity = document.querySelector<HTMLInputElement>('#fill-opacity');
  const lineWidth = document.querySelector<HTMLInputElement>('#line-width');
  const outlineWidth = document.querySelector<HTMLInputElement>('#outline-width');
  const pointIcon = document.querySelector<HTMLInputElement>('#point-icon');
  const pointLabel = document.querySelector<HTMLInputElement>('#point-label');
  [fillColor, outlineColor, fillOpacity, lineWidth, outlineWidth, pointIcon, pointLabel].forEach((input) => {
    input?.addEventListener('input', () => {
      const state = getState();
      const style: LayerStyle = {
        ...state.layerStyle,
        fillColor: fillColor?.value ?? state.layerStyle.fillColor,
        outlineColor: outlineColor?.value ?? state.layerStyle.outlineColor,
        fillOpacity: Number(fillOpacity?.value ?? state.layerStyle.fillOpacity),
        lineWidth: Number(lineWidth?.value ?? state.layerStyle.lineWidth),
        outlineWidth: Number(outlineWidth?.value ?? state.layerStyle.outlineWidth),
        pointIcon: pointIcon?.value || state.layerStyle.pointIcon,
        pointLabel: pointLabel?.checked ?? state.layerStyle.pointLabel
      };
      updateState({ layerStyle: style });
    });
  });
};

const bindSliders = () => {
  const heightOffset = document.querySelector<HTMLInputElement>('#height-offset');
  const simplification = document.querySelector<HTMLInputElement>('#simplification');
  heightOffset?.addEventListener('input', () => {
    const value = Number(heightOffset.value);
    updateState({ heightOffset: value });
    renderer.setHeightOffset(value);
  });
  simplification?.addEventListener('change', () => {
    const tolerance = Number(simplification.value);
    const state = getState();
    if (state.originalGeojson) {
      const simplified = simplifyFeatureCollection(state.originalGeojson, tolerance);
      updateState({ simplificationTolerance: tolerance, geojson: simplified });
      updatePreviewMap(simplified);
      if (state.fallbackMode) {
        ensureFallbackMap();
        updateFallbackMap(simplified);
      }
      renderer.loadFeatures(simplified, state.layerStyle, state.visibleLayers);
      updateFeatureList(simplified);
    }
  });
};

const bindLayerControls = () => {
  const toggleButton = document.querySelector<HTMLButtonElement>('#toggle-layers');
  const panel = document.querySelector<HTMLDivElement>('#layer-panel');
  if (!toggleButton || !panel) return;
  toggleButton.addEventListener('click', () => {
    panel.classList.toggle('hidden');
  });
  const checkboxes = panel.querySelectorAll<HTMLInputElement>('input[data-layer]');
  const sync = () => {
    const visible = getState().visibleLayers;
    checkboxes.forEach((checkbox) => {
      const layer = checkbox.dataset.layer as keyof VisibleLayers;
      checkbox.checked = visible[layer];
    });
  };
  sync();
  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const layer = checkbox.dataset.layer as keyof VisibleLayers;
      const updated = { ...getState().visibleLayers, [layer]: checkbox.checked };
      updateState({ visibleLayers: updated });
    });
  });
};

const bindLocaleSwitcher = () => {
  const select = document.querySelector<HTMLSelectElement>('#locale-select');
  if (!select) return;
  select.addEventListener('change', (event) => {
    setLocale((event.target as HTMLSelectElement).value as any);
    renderLayout();
    setupInteractions();
    const state = getState();
    if (state.geojson) {
      updatePreviewMap(state.geojson);
      if (state.fallbackMode) {
        ensureFallbackMap();
        updateFallbackMap(state.geojson);
      }
      updateFeatureList(state.geojson);
    }
  });
};

const handleOrientation = (event: DeviceOrientationEvent) => {
  if (event.alpha === null || event.alpha === undefined) return;
  const heading = 360 - event.alpha;
  updateState({ heading });
  const headingIndicator = document.querySelector<HTMLDivElement>('#heading-indicator');
  if (headingIndicator) {
    headingIndicator.textContent = `${heading.toFixed(0)}°`;
  }
};

const startARSession = async () => {
  const state = getState();
  if (!state.geojson || !state.secureContext || state.fallbackMode) return;

  const cameraGranted = await requestCamera();
  if (!cameraGranted) {
    updateState({ permissions: { ...state.permissions, camera: false }, fallbackMode: true });
    ensureFallbackMap();
    if (state.geojson) updateFallbackMap(state.geojson);
    return;
  }
  updateState({ permissions: { ...getState().permissions, camera: true } });

  let locationPermission: GeolocationPosition | undefined;
  try {
    locationPermission = await requestLocation();
  } catch (error) {
    locationPermission = undefined;
  }
  if (!locationPermission) {
    updateState({ permissions: { ...getState().permissions, location: false }, fallbackMode: true });
    ensureFallbackMap();
    if (state.geojson) updateFallbackMap(state.geojson);
    return;
  }
  updateState({ permissions: { ...getState().permissions, location: true } });
  latestPosition = locationPermission;
  updateFallbackUserLocation(locationPermission);

  const orientationGranted = await requestOrientationPermission();
  updateState({ permissions: { ...getState().permissions, orientation: orientationGranted } });

  const arOverlay = document.querySelector<HTMLDivElement>('#ar-overlay');
  arOverlay?.classList.remove('hidden');
  updateState({ isArActive: true, fallbackMode: false });

  renderer.initialize(arOverlay!);
  renderer.setHeightOffset(state.heightOffset);
  renderer.setSessionOffsets(state.sessionOffsets);
  renderer.loadFeatures(state.geojson, state.layerStyle, state.visibleLayers);

  const accuracyElement = document.querySelector<HTMLDivElement>('#gps-accuracy');
  accuracyElement!.textContent = `${Math.round(locationPermission.coords.accuracy)} m`;

  if (!geoWatchStop) {
    geoWatchStop = watchLocation(
      (position) => {
        latestPosition = position;
        const accuracy = Math.round(position.coords.accuracy);
        const accuracyElementInner = document.querySelector<HTMLDivElement>('#gps-accuracy');
        if (accuracyElementInner) accuracyElementInner.textContent = `${accuracy} m`;
        if (getState().fallbackMode) {
          updateFallbackUserLocation(position);
        }
      },
      (error) => console.error('Geolocation error', error)
    );
  }

  if (!headingWatchActive) {
    window.addEventListener('deviceorientation', handleOrientation, true);
    headingWatchActive = true;
  }
};

const stopARSession = () => {
  updateState({ isArActive: false });
  renderer.dispose();
  const arOverlay = document.querySelector<HTMLDivElement>('#ar-overlay');
  arOverlay?.classList.add('hidden');
  geoWatchStop?.();
  geoWatchStop = undefined;
  if (headingWatchActive) {
    window.removeEventListener('deviceorientation', handleOrientation, true);
    headingWatchActive = false;
  }
};

const bindARControls = () => {
  const startButton = document.querySelector<HTMLButtonElement>('#start-ar');
  const exitButton = document.querySelector<HTMLButtonElement>('#exit-ar');
  const nudgeButtons = document.querySelectorAll<HTMLButtonElement>('[data-nudge]');
  const headingButtons = document.querySelectorAll<HTMLButtonElement>('[data-heading]');
  const nudgeStep = document.querySelector<HTMLInputElement>('#nudge-step');
  const nudgeValue = document.querySelector<HTMLSpanElement>('#nudge-value');

  startButton?.addEventListener('click', async () => {
    await startARSession();
  });

  exitButton?.addEventListener('click', () => {
    stopARSession();
  });

  nudgeStep?.addEventListener('input', () => {
    if (nudgeValue && nudgeStep) {
      nudgeValue.textContent = `${nudgeStep.value}m`;
    }
  });

  nudgeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const step = Number(nudgeStep?.value ?? 1);
      const adjustment = createNudge(step, button.dataset.nudge as any);
      const newOffsets = applyCalibration(getState().sessionOffsets, adjustment);
      updateState({ sessionOffsets: newOffsets });
      renderer.setSessionOffsets(newOffsets);
      if (getState().fileName) {
        persistSessionOffsets(getState().fileName!, newOffsets);
      }
    });
  });

  headingButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const adjustment = createHeadingAdjustment(Number(button.dataset.heading));
      const newOffsets = applyCalibration(getState().sessionOffsets, adjustment);
      updateState({ sessionOffsets: newOffsets });
      renderer.setSessionOffsets(newOffsets);
      if (getState().fileName) {
        persistSessionOffsets(getState().fileName!, newOffsets);
      }
    });
  });
};

const setupHttpsModal = () => {
  const httpsModal = document.querySelector<HTMLDivElement>('#https-modal');
  const closeButton = document.querySelector<HTMLButtonElement>('#close-https');
  if (!httpsModal || !closeButton) return;
  if (!getState().secureContext) {
    httpsModal.removeAttribute('hidden');
  }
  closeButton.addEventListener('click', () => {
    httpsModal.setAttribute('hidden', '');
  });
};

const setupInteractions = () => {
  previewMap = initMap('map-preview');
  whenMapReady(previewMap, () => {
    const state = getState();
    if (state.geojson) {
      updatePreviewMap(state.geojson);
    }
  });
  bindLocaleSwitcher();
  setupFileLoader();
  bindStyleControls();
  bindSliders();
  bindLayerControls();
  bindARControls();
  setupHttpsModal();
};

renderLayout();
setupInteractions();

subscribe((state) => {
  const startButton = document.querySelector<HTMLButtonElement>('#start-ar');
  if (startButton) {
    const disabled = !state.geojson || !state.secureContext || state.fallbackMode;
    startButton.toggleAttribute('disabled', disabled);
    startButton.classList.toggle('opacity-50', disabled);
  }

  if (state.geojson) {
    renderer.loadFeatures(state.geojson, state.layerStyle, state.visibleLayers);
    updatePreviewMap(state.geojson);
    if (state.fallbackMode) {
      ensureFallbackMap();
      updateFallbackMap(state.geojson);
      if (latestPosition) {
        updateFallbackUserLocation(latestPosition);
      }
    }
    updateFeatureList(state.geojson);
  } else {
    updateFeatureList(undefined);
  }

  const fallbackSection = document.querySelector<HTMLElement>('#fallback-section');
  if (fallbackSection) {
    fallbackSection.hidden = !state.fallbackMode;
  }
  if (state.fallbackMode && !fallbackMap) {
    ensureFallbackMap();
  }
  if (!state.fallbackMode && fallbackMap) {
    fallbackMap.remove();
    fallbackMap = undefined;
  }

  const fallbackMessage = document.querySelector<HTMLParagraphElement>('#fallback-message');
  if (fallbackMessage) {
    fallbackMessage.textContent = state.secureContext ? t('errors.permissions') : t('errors.https');
  }

  if (previewMap) {
    applyMapStyling(previewMap, state.layerStyle, state.visibleLayers);
  }
  if (fallbackMap) {
    applyMapStyling(fallbackMap, state.layerStyle, state.visibleLayers);
  }

  const layerPanel = document.querySelector<HTMLDivElement>('#layer-panel');
  if (layerPanel) {
    layerPanel.querySelectorAll<HTMLInputElement>('input[data-layer]').forEach((input) => {
      const key = input.dataset.layer as keyof VisibleLayers;
      input.checked = state.visibleLayers[key];
    });
  }
});

window.addEventListener('fieldar-gps-update', (event: Event) => {
  const detail = (event as CustomEvent).detail as { accuracy: number };
  const accuracyElement = document.querySelector<HTMLDivElement>('#gps-accuracy');
  if (accuracyElement) {
    accuracyElement.textContent = `${Math.round(detail.accuracy)} m`;
  }
});
