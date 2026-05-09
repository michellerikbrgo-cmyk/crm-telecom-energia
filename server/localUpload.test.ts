import { describe, expect, it } from "vitest";
import { resolveSafeUploadPath } from "./_core/localUpload";

describe("resolveSafeUploadPath", () => {
  const root = "/var/app/uploads";

  it("allows nested keys", () => {
    expect(resolveSafeUploadPath(root, "avatars/1/file.jpg")).toBe("/var/app/uploads/avatars/1/file.jpg");
  });

  it("neutralizes .. segments (keeps path under root)", () => {
    expect(resolveSafeUploadPath(root, "../etc/passwd")).toBe("/var/app/uploads/etc/passwd");
  });

  it("rejects empty key", () => {
    expect(() => resolveSafeUploadPath(root, "")).toThrow();
  });
});
