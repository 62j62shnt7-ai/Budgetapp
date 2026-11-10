import assert from 'node:assert/strict';
import { positionFloatingTooltip } from '../src/utils/tooltipPosition.ts';

assert.deepEqual(
  positionFloatingTooltip({ x: 610, y: 200 }, { width: 240, height: 180 }, { width: 637, height: 868 }, false),
  { left: 389, top: 216 },
  'right-edge tooltip stays fully inside the viewport and above its anchor'
);
assert.deepEqual(
  positionFloatingTooltip({ x: 10, y: 200 }, { width: 240, height: 180 }, { width: 637, height: 868 }, false),
  { left: 8, top: 216 },
  'left-edge tooltip stays inside the viewport'
);
assert.deepEqual(
  positionFloatingTooltip({ x: 320, y: 470 }, { width: 240, height: 180 }, { width: 637, height: 500 }, true),
  { left: 200, top: 276 },
  'tooltip flips above when it would extend below the viewport'
);

console.log('Tooltip viewport positioning tests passed.');
