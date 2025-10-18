export interface PermissionStatus {
  camera: boolean;
  location: boolean;
  orientation: boolean;
}

export const requestCamera = async (): Promise<boolean> => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    console.error('Camera permission error', error);
    return false;
  }
};

export const requestLocation = (): Promise<GeolocationPosition> =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000
    });
  });

export const watchLocation = (
  onUpdate: (position: GeolocationPosition) => void,
  onError: (error: GeolocationPositionError) => void
): (() => void) => {
  if (!navigator.geolocation) {
    throw new Error('Geolocation not supported');
  }
  const watchId = navigator.geolocation.watchPosition(onUpdate, onError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000
  });
  return () => navigator.geolocation.clearWatch(watchId);
};

export const requestOrientationPermission = async (): Promise<boolean> => {
  if (typeof DeviceOrientationEvent === 'undefined') return false;
  if ('requestPermission' in DeviceOrientationEvent) {
    try {
      const response = await (DeviceOrientationEvent as any).requestPermission();
      return response === 'granted';
    } catch (error) {
      console.error('Orientation permission error', error);
      return false;
    }
  }
  return true;
};
