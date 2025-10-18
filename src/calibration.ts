import type { SessionOffsets } from './state';

export interface CalibrationAdjustments {
  east: number;
  north: number;
  heading: number;
}

export const applyCalibration = (offsets: SessionOffsets, adjustments: CalibrationAdjustments): SessionOffsets => ({
  positionOffset: {
    east: offsets.positionOffset.east + adjustments.east,
    north: offsets.positionOffset.north + adjustments.north
  },
  headingOffset: offsets.headingOffset + adjustments.heading
});

export const createNudge = (distance: number, direction: 'N' | 'S' | 'E' | 'W'): CalibrationAdjustments => {
  switch (direction) {
    case 'N':
      return { east: 0, north: distance, heading: 0 };
    case 'S':
      return { east: 0, north: -distance, heading: 0 };
    case 'E':
      return { east: distance, north: 0, heading: 0 };
    case 'W':
      return { east: -distance, north: 0, heading: 0 };
  }
};

export const createHeadingAdjustment = (degrees: number): CalibrationAdjustments => ({
  east: 0,
  north: 0,
  heading: degrees
});
