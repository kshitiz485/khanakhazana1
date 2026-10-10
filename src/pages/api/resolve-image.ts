import type { APIRoute } from 'astro';
import { resolveGoogleImageShareUrl } from '@/lib/googleImageShare';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const sharedUrl = new URL(request.url).searchParams.get('url');
  if (!sharedUrl) {
    return Response.json(
      { ok: false, error: 'An image share URL is required.' },
      { status: 400 }
    );
  }

  try {
    const url = await resolveGoogleImageShareUrl(sharedUrl);
    return Response.json(
      { ok: true, url },
      { headers: { 'Cache-Control': 'public, max-age=3600' } }
    );
  } catch (error) {
    console.error('Failed to resolve Google image share URL:', error);
    return Response.json(
      { ok: false, error: 'Could not resolve this Google image share URL.' },
      { status: 502 }
    );
  }
};
