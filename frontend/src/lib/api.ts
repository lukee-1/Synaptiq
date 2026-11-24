import { z } from "zod";
import { browserClient } from "@/lib/supabase/client";
import { publicEnvironment } from "@/lib/env";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = "ApiError"; }
}

export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const env = publicEnvironment();
  if (!env.success) throw new Error("Workspace connection is not configured");
  const { data, error } = await browserClient().auth.getSession();
  if (error || !data.session)
    throw new Error("Your session has expired. Sign in again.");
  const response = await fetch(`${env.data.apiUrl}/v1${path}`, {
    method: options.method ?? "GET",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const parsed = z
      .object({
        detail: z.union([
          z.string(),
          z.array(
            z.object({
              msg: z.string(),
              loc: z.array(z.union([z.string(), z.number()])),
            }),
          ),
        ]),
      })
      .safeParse(body);
    throw new ApiError(
      parsed.success
        ? typeof parsed.data.detail === "string"
          ? parsed.data.detail
          : parsed.data.detail
              .map((issue) => `${issue.loc.slice(1).join(".")}: ${issue.msg}`)
              .join("; ")
        : `Request failed (${response.status})`,
      response.status,
    );
  }
  return schema.parse(body);
}
