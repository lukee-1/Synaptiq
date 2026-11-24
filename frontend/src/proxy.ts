import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { publicEnvironment } from "@/lib/env";

export async function proxy(request: NextRequest) {
  const env = publicEnvironment();
  if (!env.success)
    return NextResponse.redirect(new URL("/login", request.url));
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    env.data.supabaseUrl,
    env.data.supabaseKey,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values) => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          values.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    const redirect = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}
export const config = { matcher: ["/workspace/:path*"] };
