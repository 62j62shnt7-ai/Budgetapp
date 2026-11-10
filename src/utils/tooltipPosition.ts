export interface TooltipPoint {
  x: number;
  y: number;
}

export interface TooltipSize {
  width: number;
  height: number;
}

export interface TooltipPosition {
  left: number;
  top: number;
}

export function positionFloatingTooltip(
  anchor: TooltipPoint,
  tooltip: TooltipSize,
  viewport: TooltipSize,
  preferBelow: boolean
): TooltipPosition {
  const margin = 8;
  const gap = 14;
  const belowOffset = 16;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  const maxLeft = Math.max(margin, viewport.width - tooltip.width - margin);
  const left = clamp(anchor.x - tooltip.width / 2, margin, maxLeft);

  let top = preferBelow ? anchor.y + belowOffset : anchor.y - tooltip.height - gap;
  if (preferBelow && top + tooltip.height > viewport.height - margin) {
    top = anchor.y - tooltip.height - gap;
  } else if (!preferBelow && top < margin) {
    top = anchor.y + belowOffset;
  }
  const maxTop = Math.max(margin, viewport.height - tooltip.height - margin);

  return { left, top: clamp(top, margin, maxTop) };
}
