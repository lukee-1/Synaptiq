import { z } from "zod";

export function publicEnvironment() {
  return z
    .object({
      supabaseUrl: z.url(),
      supabaseKey: z.string().min(1),
      apiUrl: z.url(),
    })
    .safeParse({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000",
    });
}
