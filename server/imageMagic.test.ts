import { describe, expect, it } from "vitest";
import { detectImageMimeFromBuffer } from "./_core/imageMagic";

describe("detectImageMimeFromBuffer", () => {
  it("detects JPEG", () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectImageMimeFromBuffer(buf)).toBe("image/jpeg");
  });

  it("detects PNG", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(detectImageMimeFromBuffer(buf)).toBe("image/png");
  });

  it("detects WebP", () => {
    const header = Buffer.alloc(12);
    header.write("RIFF", 0);
    header.writeUInt32LE(0, 4);
    header.write("WEBP", 8);
    expect(detectImageMimeFromBuffer(header)).toBe("image/webp");
  });

  it("returns null for garbage", () => {
    expect(detectImageMimeFromBuffer(Buffer.from([0, 1, 2, 3]))).toBeNull();
  });
});
