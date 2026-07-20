'use strict';

const {
  MINI_BASE_WIDTH,
  MINI_DEFAULT_HEIGHT,
  MINI_EDGE_PADDING,
  MINI_MAX_WIDTH
} = require('./constants');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function detectReservedScreenEdge(display) {
  const { bounds, workArea } = display;
  const edges = [
    { edge: 'left', thickness: workArea.x - bounds.x },
    { edge: 'top', thickness: workArea.y - bounds.y },
    {
      edge: 'right',
      thickness: (bounds.x + bounds.width) - (workArea.x + workArea.width)
    },
    {
      edge: 'bottom',
      thickness: (bounds.y + bounds.height) - (workArea.y + workArea.height)
    }
  ].filter(item => item.thickness > 0);

  if (edges.length === 0) {
    return { edge: 'bottom', thickness: 48 };
  }

  return edges.sort((left, right) => right.thickness - left.thickness)[0];
}

function clampBoundsToDisplay(bounds, displayBounds, padding = MINI_EDGE_PADDING) {
  const width = Math.min(bounds.width, Math.max(1, displayBounds.width - (padding * 2)));
  const height = Math.min(bounds.height, Math.max(1, displayBounds.height - (padding * 2)));

  return {
    x: clamp(
      Math.round(bounds.x),
      displayBounds.x + padding,
      displayBounds.x + displayBounds.width - width - padding
    ),
    y: clamp(
      Math.round(bounds.y),
      displayBounds.y + padding,
      displayBounds.y + displayBounds.height - height - padding
    ),
    width,
    height
  };
}

function calculateMiniBounds(options) {
  const {
    requestedWidth = MINI_BASE_WIDTH,
    integrationMode,
    miniBar,
    primaryDisplay,
    displayNearestPoint,
    platform,
    trayBounds = null
  } = options;
  const width = clamp(Math.round(requestedWidth), MINI_BASE_WIDTH, MINI_MAX_WIDTH);
  const height = MINI_DEFAULT_HEIGHT;

  if (platform === 'darwin' && integrationMode === 'docked' && trayBounds) {
    const anchor = {
      x: trayBounds.x + Math.round(trayBounds.width / 2),
      y: trayBounds.y + Math.round(trayBounds.height / 2)
    };
    const display = displayNearestPoint(anchor);
    const preferred = {
      x: Math.round(trayBounds.x + (trayBounds.width / 2) - (width / 2)),
      y: Math.round(trayBounds.y + trayBounds.height + 6),
      width,
      height
    };

    if (preferred.y + height > display.workArea.y + display.workArea.height) {
      preferred.y = display.workArea.y + MINI_EDGE_PADDING;
    }

    return clampBoundsToDisplay(preferred, display.workArea);
  }

  if (integrationMode === 'docked' && miniBar.dockedUseCustomPosition && miniBar.dockedPosition) {
    const savedPoint = {
      x: Number(miniBar.dockedPosition.x) || 0,
      y: Number(miniBar.dockedPosition.y) || 0
    };
    const display = displayNearestPoint(savedPoint);

    return clampBoundsToDisplay({
      ...savedPoint,
      width,
      height
    }, display.bounds);
  }

  const { bounds, workArea } = primaryDisplay;

  if (integrationMode === 'docked') {
    const reserved = detectReservedScreenEdge(primaryDisplay);
    const thickness = Math.max(reserved.thickness || height, height);

    if (reserved.edge === 'top') {
      return {
        x: bounds.x + bounds.width - width - MINI_EDGE_PADDING,
        y: bounds.y + Math.round((thickness - height) / 2),
        width,
        height
      };
    }

    if (reserved.edge === 'left') {
      return {
        x: bounds.x,
        y: bounds.y + bounds.height - height - MINI_EDGE_PADDING,
        width,
        height
      };
    }

    if (reserved.edge === 'right') {
      return {
        x: bounds.x + bounds.width - width,
        y: bounds.y + bounds.height - height - MINI_EDGE_PADDING,
        width,
        height
      };
    }

    return {
      x: bounds.x + bounds.width - width - MINI_EDGE_PADDING,
      y: bounds.y + bounds.height - thickness + Math.round((thickness - height) / 2),
      width,
      height
    };
  }

  const saved = miniBar.position;
  const fallback = {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height - height - 6)
  };
  const point = saved || fallback;
  const display = displayNearestPoint(point);

  return clampBoundsToDisplay({
    x: point.x,
    y: point.y,
    width,
    height
  }, display.workArea);
}

function fitWindowToWorkArea(size, workArea, options = {}) {
  const margin = options.margin ?? 16;
  const minWidth = options.minWidth ?? 320;
  const minHeight = options.minHeight ?? 240;
  const width = clamp(size.width, minWidth, Math.max(minWidth, workArea.width - (margin * 2)));
  const height = clamp(size.height, minHeight, Math.max(minHeight, workArea.height - (margin * 2)));

  return {
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2)
  };
}

module.exports = {
  calculateMiniBounds,
  clamp,
  clampBoundsToDisplay,
  detectReservedScreenEdge,
  fitWindowToWorkArea
};
