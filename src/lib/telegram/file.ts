const supportedImageTypes: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};

function extensionFromContentType(contentType: string) {
  if (contentType === "image/jpeg") {
    return "jpg";
  }

  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/webp") {
    return "webp";
  }

  return null;
}

function detectContentTypeFromBytes(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function resolveTelegramImageMetadata({
  bytes,
  headerContentType,
  filePath
}: {
  bytes: Buffer;
  headerContentType: string | null;
  filePath: string;
}) {
  const normalizedHeader = headerContentType?.split(";")[0]?.trim().toLowerCase() ?? null;
  const detectedContentType = detectContentTypeFromBytes(bytes);
  const contentType =
    detectedContentType ??
    (normalizedHeader && supportedImageTypes[extensionFromContentType(normalizedHeader) ?? ""]
      ? normalizedHeader
      : null);

  if (!contentType) {
    throw new Error(`Unsupported Telegram image type: ${normalizedHeader ?? "unknown"}`);
  }

  return {
    contentType,
    extension: extensionFromContentType(contentType) ?? filePath.split(".").pop() ?? "jpg"
  };
}
