import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_ART_IDS, LANDS } from "../src/lib/art";

const dir = join(__dirname, "../public/art/default");

describe("bundled default art (W-62, I-40, I-41)", () => {
  it("has art_crop and normal for every land, the manifest matches the id table, and stays below 2 MB", () => {
    const manifest = JSON.parse(readFileSync(join(dir, "default-art.json"), "utf8"));
    let total = 0;
    for (const land of LANDS) {
      expect(manifest[land].id).toBe(DEFAULT_ART_IDS[land]);
      for (const v of ["art_crop", "normal"]) {
        const f = join(dir, `${land}.${v}.jpg`);
        expect(existsSync(f)).toBe(true);
        total += statSync(f).size;
      }
    }
    expect(readdirSync(dir)).toHaveLength(11);
    expect(total).toBeLessThan(2 * 1024 * 1024);
  });

  it.runIf(existsSync(join(__dirname, "../dist/sw.js")))("is precached by the built service worker", () => {
    const sw = readFileSync(join(__dirname, "../dist/sw.js"), "utf8");
    for (const land of LANDS) expect(sw).toContain(`art/default/${land}.art_crop.jpg`);
    expect(sw).toContain("art/default/default-art.json");
  });
});
