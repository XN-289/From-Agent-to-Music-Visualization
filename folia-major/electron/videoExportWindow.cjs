const VIDEO_EXPORT_ZOOM_FACTORS = [1, 0.5, 0.25];

function getFirstPositiveInteger(value, fallback = 0) {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}

function getVideoExportWindowPlan(targetSize, options = {}) {
  const bounds = options.bounds || {};
  const contentSize = options.contentSize || [];
  const workArea = options.workArea || {};
  const targetWidth = getFirstPositiveInteger(targetSize?.width);
  const targetHeight = getFirstPositiveInteger(targetSize?.height);
  const workWidth = getFirstPositiveInteger(workArea.width);
  const workHeight = getFirstPositiveInteger(workArea.height);

  if (!targetWidth || !targetHeight || !workWidth || !workHeight) {
    return null;
  }

  const frameWidth = Math.max(
    0,
    getFirstPositiveInteger(bounds.width) - getFirstPositiveInteger(contentSize[0]),
  );
  const frameHeight = Math.max(
    0,
    getFirstPositiveInteger(bounds.height) - getFirstPositiveInteger(contentSize[1]),
  );

  const zoomFactor = VIDEO_EXPORT_ZOOM_FACTORS.find((factor) => {
    const contentWidth = Math.ceil(targetWidth * factor);
    const contentHeight = Math.ceil(targetHeight * factor);
    return (
      contentWidth + frameWidth <= workWidth &&
      contentHeight + frameHeight <= workHeight
    );
  });

  if (!zoomFactor) {
    return null;
  }

  return {
    zoomFactor,
    contentWidth: Math.ceil(targetWidth * zoomFactor),
    contentHeight: Math.ceil(targetHeight * zoomFactor),
  };
}

function matchesVideoExportContent(actualSize, expectedSize) {
  const actualWidth = getFirstPositiveInteger(actualSize?.[0]);
  const actualHeight = getFirstPositiveInteger(actualSize?.[1]);
  const expectedWidth = getFirstPositiveInteger(expectedSize?.width);
  const expectedHeight = getFirstPositiveInteger(expectedSize?.height);

  return actualWidth === expectedWidth && actualHeight === expectedHeight;
}

module.exports = {
  getVideoExportWindowPlan,
  matchesVideoExportContent,
};
