'use client';
import { createBrowserClient } from '@supabase/ssr';
import { publicEnvironment } from '@/lib/env';

export function browserClient() {
  const env = publicEnvironment();
  if (!env.success) throw new Error('Sign-in is not configured yet. Please use the preview workspace.');
  return createBrowserClient(env.data.supabaseUrl, env.data.supabaseKey);
}
