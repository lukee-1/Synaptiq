import { z } from "zod";

export function publicEnvironment() {
  return z
    .object({
      supabaseUrl: z.url(),
      supabaseKey: z.string().min(1),
      // An empty base uses this deployment's /v1 and /health routes.
      apiUrl: z.union([z.literal(""), z.url({ protocol: /^https?$/ })]),
    })
    .safeParse({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "",
    });
}
