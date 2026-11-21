import { describe, expect, it } from "vitest";
import {
  MRZ_SWEEP_REGIONS,
  MRZ_SWEEP_ROTATIONS,
  sweepMrz,
  type MrzSweepDeps,
} from "@/lib/documents/extraction/mrz-sweep";

/** Faux moteur : l'« image » est une chaîne ; la lecture renvoie un texte selon l'essai. */
function fakeDeps(readings: Record<string, string>, calls: string[] = []): MrzSweepDeps {
  return {
    rotate: async (img, deg) => `${img}@${deg}`,
    crop: async (img, region) => `${img}#${MRZ_SWEEP_REGIONS.indexOf(region)}`,
    recognizeMrz: async (img) => {
      calls.push(img);
      if (readings[img] === "THROW") throw new Error("illisible");
      return readings[img] ?? "";
    },
    score: (text) => (text === "VERIFIED" ? 250 : text === "PARTIAL" ? 50 : text ? 5 : 0),
    verifiedScore: 200,
  };
}

const totalAttempts = MRZ_SWEEP_ROTATIONS.length * MRZ_SWEEP_REGIONS.length;

describe("sweepMrz", () => {
  it("s'arrête dès qu'une lecture vérifiée est trouvée", async () => {
    const calls: string[] = [];
    const result = await sweepMrz("img", fakeDeps({ "img@90#2": "VERIFIED" }, calls));
    expect(result).toEqual({ text: "VERIFIED", score: 250 });
    // 6 zones à 0°, puis 3 zones à 90° (la 3e est la bonne)
    expect(calls).toHaveLength(MRZ_SWEEP_REGIONS.length + 3);
  });

  it("garde la meilleure lecture si rien n'est vérifié", async () => {
    const calls: string[] = [];
    const result = await sweepMrz(
      "img",
      fakeDeps({ "img#0": "NOISE", "img@270#4": "PARTIAL" }, calls)
    );
    expect(result).toEqual({ text: "PARTIAL", score: 50 });
    expect(calls).toHaveLength(totalAttempts);
  });

  it("ignore une zone illisible et continue", async () => {
    const result = await sweepMrz("img", fakeDeps({ "img#0": "THROW", "img#1": "VERIFIED" }));
    expect(result.text).toBe("VERIFIED");
  });

  it("essaie d'abord l'image telle quelle, puis 90°, 270°, 180°", async () => {
    const calls: string[] = [];
    await sweepMrz("img", fakeDeps({}, calls));
    const orientations = [...new Set(calls.map((c) => c.split("#")[0]))];
    expect(orientations).toEqual(["img", "img@90", "img@270", "img@180"]);
  });
});
