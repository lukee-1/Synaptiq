import { afterEach, expect, it, vi } from "vitest";
import { publicEnvironment } from "./env";

afterEach(() => vi.unstubAllEnvs());

it.each([undefined, "", "http://127.0.0.1:8000", "https://api.example.com"])(
  "accepts same-origin or HTTP API configuration %s",
  (base) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-fixture");
    vi.stubEnv("NEXT_PUBLIC_API_URL", base);
    const result = publicEnvironment();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.apiUrl).toBe(base ?? "");
  },
);

it.each(["//other.example.com", "javascript:alert(1)", "ftp://example.com"])(
  "rejects invalid API base %s",
  (base) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-fixture");
    vi.stubEnv("NEXT_PUBLIC_API_URL", base);
    expect(publicEnvironment().success).toBe(false);
  },
);
