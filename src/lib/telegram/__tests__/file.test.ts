import { describe, expect, it } from "vitest";
import { resolveTelegramImageMetadata } from "../file";

describe("telegram file metadata", () => {
  it("detects JPEG bytes when Telegram returns application/octet-stream", () => {
    const metadata = resolveTelegramImageMetadata({
      bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]),
      headerContentType: "application/octet-stream",
      filePath: "photos/file_12.jpg"
    });

    expect(metadata).toEqual({
      contentType: "image/jpeg",
      extension: "jpg"
    });
  });

  it("rejects unsupported file bytes", () => {
    expect(() =>
      resolveTelegramImageMetadata({
        bytes: Buffer.from("not an image"),
        headerContentType: "application/octet-stream",
        filePath: "documents/file.bin"
      })
    ).toThrow("Unsupported Telegram image type");
  });
});
