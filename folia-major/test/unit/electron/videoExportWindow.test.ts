import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

// Keeps the logical video canvas intact when a display clamps the physical window.
const require = createRequire(import.meta.url);
const {
  getVideoExportWindowPlan,
  matchesVideoExportContent,
} = require('../../../electron/videoExportWindow.cjs') as {
  getVideoExportWindowPlan: (
    size: { width: number; height: number },
    options?: Record<string, unknown>,
  ) => { zoomFactor: number; contentWidth: number; contentHeight: number } | null;
  matchesVideoExportContent: (
    actual: number[],
    expected: { width: number; height: number },
  ) => boolean;
};

describe('video export window planning', () => {
  it('uses a half-zoom portrait window when full height exceeds the work area', () => {
    expect(getVideoExportWindowPlan(
      { width: 1080, height: 1920 },
      {
        bounds: { width: 1200, height: 800 },
        contentSize: [1200, 800],
        workArea: { width: 2560, height: 1360 },
      },
    )).toEqual({
      zoomFactor: 0.5,
      contentWidth: 540,
      contentHeight: 960,
    });
  });

  it('falls to the minimum zoom before allowing display clamping', () => {
    expect(getVideoExportWindowPlan(
      { width: 1080, height: 1920 },
      {
        bounds: { width: 1200, height: 800 },
        contentSize: [1200, 800],
        workArea: { width: 1280, height: 720 },
      },
    )).toEqual({
      zoomFactor: 0.25,
      contentWidth: 270,
      contentHeight: 480,
    });
  });

  it('rejects targets that cannot fit even at minimum zoom', () => {
    expect(getVideoExportWindowPlan(
      { width: 3840, height: 3840 },
      {
        bounds: { width: 1200, height: 800 },
        contentSize: [1200, 800],
        workArea: { width: 1280, height: 720 },
      },
    )).toBeNull();
  });

  it('detects when Windows clamps the requested content size', () => {
    expect(matchesVideoExportContent([540, 960], { width: 540, height: 960 })).toBe(true);
    expect(matchesVideoExportContent([540, 1360], { width: 540, height: 960 })).toBe(false);
  });
});
