import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnvironment } from '@/lib/env';

export async function serverClient() {
  const env = publicEnvironment();
  if (!env.success) return null;
  const store = await cookies();
  return createServerClient(env.data.supabaseUrl, env.data.supabaseKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* Server Components cannot write cookies; proxy refreshes them. */ }
      },
    },
  });
}
