import { z } from "zod";
import data from "@/data/catalog.json";
import type { Challenge } from "./contracts";
import { challengeSchema } from "./contracts";

export const catalog = z.array(challengeSchema).parse(data);
if (!catalog.length) throw new Error("Challenge catalog is empty");
export const firstChallenge = catalog[0] as Challenge;
export const concepts = [...new Set(catalog.map((row) => row.family))].map(
  (family) => ({
    family,
    scenarios: catalog.filter((row) => row.family === family) as [Challenge, ...Challenge[]],
  }),
);
export const tracks = [...new Set(catalog.map((row) => row.topic))];
export const scenarioName = (name: string) => name.split(" · ")[1] ?? name;
