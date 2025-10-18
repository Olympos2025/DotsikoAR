import 'aframe';
import '@ar-js-org/ar.js';
import type { FeatureCollection, Feature, Point, LineString, Polygon, Position } from 'geojson';
import LatLon from 'geodesy/latlon-ellipsoidal-vincenty.js';
import * as THREE from 'three';
import { toLocalENU } from '../geo/geoUtils';
import type { LayerStyle, SessionOffsets, VisibleLayers } from '../state';

declare const AFRAME: any;

export class ARRenderer {
  private scene?: HTMLElement;
  private container?: HTMLElement;
  private featureGroup = new THREE.Group();
  private sessionOffsets: SessionOffsets = {
    positionOffset: { east: 0, north: 0 },
    headingOffset: 0
  };
  private visibleLayers: VisibleLayers = { points: true, lines: true, polygons: true };
  private heightOffset = 0;
  private origin?: any;
  private collection?: FeatureCollection;
  private style?: LayerStyle;
  private highlightId?: string;
  private gpsSamples: any[] = [];
  private readonly smoothingWindow = 5;
  private baseOffset = { east: 0, north: 0 };

  constructor() {
    this.featureGroup.name = 'features';
  }

  initialize(container: HTMLElement) {
    this.container = container;
    if (this.scene) return;
    const sceneEl = document.createElement('a-scene');
    sceneEl.setAttribute('embedded', 'true');
    sceneEl.setAttribute('renderer', 'antialias: true; colorManagement: true');
    sceneEl.setAttribute('vr-mode-ui', 'enabled: false');
    sceneEl.setAttribute('arjs', 'sourceType: webcam; videoTexture: true; debugUIEnabled: false;');

    const camera = document.createElement('a-camera');
    camera.setAttribute('gps-camera', 'minDistance: 0; gpsMinDistance: 0;');
    camera.setAttribute('rotation-reader', '');
    sceneEl.appendChild(camera);

    sceneEl.addEventListener('loaded', () => {
      const threeScene = (sceneEl as any).object3D as THREE.Scene;
      threeScene.add(this.featureGroup);
    });

    sceneEl.addEventListener('gps-camera-update-position', (event: any) => {
      const { position, accuracy } = event.detail;
      const sample = new LatLon(position.latitude, position.longitude);
      this.gpsSamples.push(sample);
      if (this.gpsSamples.length > this.smoothingWindow) {
        this.gpsSamples.shift();
      }

      if (!this.origin) {
        this.origin = sample;
        this.baseOffset = { east: 0, north: 0 };
        this.renderFeatures();
      } else {
        const averaged = this.averageGpsSample();
        if (averaged) {
          this.baseOffset = toLocalENU(this.origin, averaged);
        }
      }
      this.updateGroupTransform();

      const accuracyEvent = new CustomEvent('fieldar-gps-update', { detail: { accuracy } });
      window.dispatchEvent(accuracyEvent);
    });

    this.scene = sceneEl;
    container.appendChild(sceneEl);
  }

  setSessionOffsets(offsets: SessionOffsets) {
    this.sessionOffsets = offsets;
    this.updateGroupTransform();
  }

  setHeightOffset(offset: number) {
    this.heightOffset = offset;
    this.updateGroupTransform();
  }

  setVisibleLayers(layers: VisibleLayers) {
    this.visibleLayers = layers;
    this.renderFeatures();
  }

  dispose() {
    if (this.scene && this.container) {
      this.container.removeChild(this.scene);
      this.scene = undefined;
    }
    this.disposeFeatureObjects();
    this.featureGroup.clear();
    this.origin = undefined;
    this.collection = undefined;
    this.style = undefined;
    this.highlightId = undefined;
    this.gpsSamples = [];
    this.baseOffset = { east: 0, north: 0 };
  }

  loadFeatures(collection: FeatureCollection, style: LayerStyle, layers?: VisibleLayers) {
    this.collection = collection;
    this.style = style;
    if (layers) {
      this.visibleLayers = layers;
    }
    this.renderFeatures();
  }

  setHighlight(id?: string) {
    this.highlightId = id;
    this.renderFeatures();
  }

  private averageGpsSample(): any | undefined {
    if (!this.gpsSamples.length) return undefined;
    const sum = this.gpsSamples.reduce(
      (acc, sample) => ({
        lat: acc.lat + (sample as any).lat,
        lon: acc.lon + (sample as any).lon
      }),
      { lat: 0, lon: 0 }
    );
    return new LatLon(sum.lat / this.gpsSamples.length, sum.lon / this.gpsSamples.length);
  }

  private updateGroupTransform() {
    const east = this.baseOffset.east + this.sessionOffsets.positionOffset.east;
    const north = this.baseOffset.north + this.sessionOffsets.positionOffset.north;
    this.featureGroup.position.set(east, this.heightOffset, -north);
    this.featureGroup.rotation.set(0, THREE.MathUtils.degToRad(this.sessionOffsets.headingOffset), 0);
  }

  private disposeFeatureObjects() {
    this.featureGroup.children.forEach((child) => {
      child.traverse((object: any) => {
        if (object.geometry?.dispose) {
          object.geometry.dispose();
        }
        const material = object.material;
        if (Array.isArray(material)) {
          material.forEach((mat) => {
            if (mat.map?.dispose) mat.map.dispose();
            mat.dispose?.();
          });
        } else if (material) {
          if (material.map?.dispose) material.map.dispose();
          material.dispose?.();
        }
      });
    });
  }

  private renderFeatures() {
    if (!this.collection || !this.origin || !this.style) return;
    this.disposeFeatureObjects();
    this.featureGroup.clear();

    this.collection.features.forEach((feature, index) => {
      const id = (feature.id ?? index).toString();
      const type = feature.geometry.type;
      const highlight = id === this.highlightId;

      if (!this.isLayerVisible(type)) {
        return;
      }

      switch (type) {
        case 'Point':
          this.addPointFeature(feature as Feature<Point>, this.style!, id, highlight);
          break;
        case 'LineString':
        case 'MultiLineString':
          this.addLineFeature(feature as Feature<LineString>, this.style!, highlight);
          break;
        case 'Polygon':
        case 'MultiPolygon':
          this.addPolygonFeature(feature as Feature<Polygon>, this.style!, highlight);
          break;
        default:
          console.warn('Unsupported geometry', type);
      }
    });

    this.updateGroupTransform();
  }

  private isLayerVisible(type: string): boolean {
    switch (type) {
      case 'Point':
        return this.visibleLayers.points;
      case 'LineString':
      case 'MultiLineString':
        return this.visibleLayers.lines;
      case 'Polygon':
      case 'MultiPolygon':
        return this.visibleLayers.polygons;
      default:
        return true;
    }
  }

  private toEnu(lon: number, lat: number) {
    if (!this.origin) return { east: 0, north: 0, up: 0 };
    const target = new LatLon(lat, lon);
    return toLocalENU(this.origin, target);
  }

  private addPointFeature(feature: Feature<Point>, style: LayerStyle, id: string, highlight: boolean) {
    const [lon, lat] = feature.geometry.coordinates;
    const enu = this.toEnu(lon, lat);
    const group = this.createBillboard((feature.properties?.name as string) ?? id, style, highlight);
    group.position.set(enu.east, this.heightOffset, -enu.north);
    this.featureGroup.add(group);
  }

  private createBillboard(text: string, style: LayerStyle, highlight: boolean) {
    const group = new THREE.Group();
    const icon = document.createElement('canvas');
    icon.width = 128;
    icon.height = 128;
    const ctx = icon.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(64, 48, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.font = '48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(style.pointIcon, 64, 64);
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(64, 96);
      ctx.lineTo(48, 120);
      ctx.lineTo(80, 120);
      ctx.closePath();
      ctx.fill();
    }
    const texture = new THREE.CanvasTexture(icon);
    texture.encoding = THREE.sRGBEncoding;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(highlight ? 4 : 3, highlight ? 4 : 3, 1);
    group.add(sprite);

    if (style.pointLabel && text) {
      const textCanvas = document.createElement('canvas');
      textCanvas.width = 512;
      textCanvas.height = 128;
      const tctx = textCanvas.getContext('2d');
      if (tctx) {
        tctx.fillStyle = 'rgba(15,23,42,0.8)';
        tctx.fillRect(0, 0, textCanvas.width, textCanvas.height);
        tctx.fillStyle = '#f8fafc';
        tctx.font = '48px sans-serif';
        tctx.textAlign = 'center';
        tctx.textBaseline = 'middle';
        tctx.fillText(text, 256, 64);
      }
      const textTexture = new THREE.CanvasTexture(textCanvas);
      textTexture.encoding = THREE.sRGBEncoding;
      const textMaterial = new THREE.SpriteMaterial({
        map: textTexture,
        depthTest: true,
        color: highlight ? new THREE.Color('#f97316') : new THREE.Color('#ffffff')
      });
      const textSprite = new THREE.Sprite(textMaterial);
      textSprite.position.set(0, 3, 0);
      textSprite.scale.set(highlight ? 7 : 6, highlight ? 1.8 : 1.5, 1);
      group.add(textSprite);
    }
    return group;
  }

  private addLineFeature(feature: Feature<LineString>, style: LayerStyle, highlight: boolean) {
    const coordinates = feature.geometry.type === 'LineString'
      ? [feature.geometry.coordinates]
      : (feature.geometry as any).coordinates;

    coordinates.forEach((line: Position[]) => {
      const points = line.map(([lon, lat]) => this.toEnu(lon, lat));
      const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.east, 0, -p.north)));
      const material = new THREE.LineBasicMaterial({
        color: highlight ? '#f97316' : style.outlineColor,
        linewidth: highlight ? style.lineWidth * 1.5 : style.lineWidth
      });
      const mesh = new THREE.Line(geometry, material);
      mesh.position.y = this.heightOffset;
      this.featureGroup.add(mesh);
    });
  }

  private addPolygonFeature(feature: Feature<Polygon>, style: LayerStyle, highlight: boolean) {
    const polygons = feature.geometry.type === 'Polygon'
      ? [feature.geometry.coordinates]
      : (feature.geometry as any).coordinates;

    polygons.forEach((polygon: Position[][]) => {
      if (!polygon.length) return;

      const outer = polygon[0].map(([lon, lat]) => this.toEnu(lon, lat));
      const shape = new THREE.Shape(outer.map((p) => new THREE.Vector2(p.east, -p.north)));

      for (let i = 1; i < polygon.length; i++) {
        const holeVertices = polygon[i].map(([lon, lat]) => this.toEnu(lon, lat));
        const holePath = new THREE.Path(holeVertices.map((p) => new THREE.Vector2(p.east, -p.north)));
        shape.holes.push(holePath);
        const holeOutline = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(holeVertices.map((p) => new THREE.Vector3(p.east, 0, -p.north))),
          new THREE.LineBasicMaterial({
            color: highlight ? '#f97316' : style.outlineColor,
            linewidth: highlight ? style.outlineWidth * 1.5 : style.outlineWidth
          })
        );
        holeOutline.position.y = this.heightOffset + 0.01;
        this.featureGroup.add(holeOutline);
      }

      const geometry = new THREE.ShapeGeometry(shape);
      const material = new THREE.MeshBasicMaterial({
        color: highlight ? '#fb923c' : style.fillColor,
        transparent: true,
        opacity: highlight ? Math.min(1, style.fillOpacity + 0.2) : style.fillOpacity,
        side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = this.heightOffset;
      this.featureGroup.add(mesh);

      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(outer.map((p) => new THREE.Vector3(p.east, 0, -p.north))),
        new THREE.LineBasicMaterial({
          color: highlight ? '#f97316' : style.outlineColor,
          linewidth: highlight ? style.outlineWidth * 1.5 : style.outlineWidth
        })
      );
      outline.position.y = this.heightOffset + 0.01;
      this.featureGroup.add(outline);
    });
  }
}
