import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
const allowedEmail = 'kshitiz6000@gmail.com';

export const DELETE: APIRoute = async ({ params, request }) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return Response.json(
      { ok: false, error: 'Recipe deletion is not configured.' },
      { status: 503 }
    );
  }

  const slug = params.slug;
  if (!slug || slug.length > 120) {
    return Response.json(
      { ok: false, error: 'Invalid recipe.' },
      { status: 400 }
    );
  }

  const authorization = request.headers.get('authorization') || '';
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return Response.json(
      {
        ok: false,
        error: 'Log in with the authorized account to delete recipes.',
      },
      { status: 401 }
    );
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser(accessToken);

  if (authError || !user) {
    return Response.json(
      { ok: false, error: 'Your session is invalid. Please log in again.' },
      { status: 401 }
    );
  }
  if (user.email?.toLowerCase() !== allowedEmail) {
    return Response.json(
      { ok: false, error: 'You are not allowed to delete recipes.' },
      { status: 403 }
    );
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data, error } = await userClient
    .from('recipes')
    .delete()
    .eq('slug', slug)
    .select('slug')
    .maybeSingle();

  if (error) {
    console.error('Could not delete recipe from Supabase:', error);
    return Response.json(
      { ok: false, error: 'Could not delete the recipe. Please try again.' },
      { status: 500 }
    );
  }
  if (!data) {
    return Response.json(
      { ok: false, error: 'Recipe not found or deletion is not permitted.' },
      { status: 404 }
    );
  }

  return Response.json({ ok: true });
};
