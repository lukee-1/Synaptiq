import { NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  const client = await serverClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (
    client &&
    tokenHash &&
    (type === "email" || type === "signup" || type === "recovery")
  ) {
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (!error)
      return NextResponse.redirect(
        new URL(type === "recovery" ? "/reset" : "/workspace", origin),
      );
  }
  if (code && client) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/workspace", origin));
  }
  return NextResponse.redirect(new URL("/login?error=callback", origin));
}
