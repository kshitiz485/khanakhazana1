import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import {
  createContributionHandler,
  parseIngredients,
  parseSteps,
  recipeSlug,
} from '@/lib/contribution';
import { serializeCommunityRecipeDetails } from '@/lib/communityRecipe';

export const prerender = false;

const env = {
  SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
  SUPABASE_ANON_KEY: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  TURNSTILE_SECRET_KEY: import.meta.env.TURNSTILE_SECRET_KEY,
  PROD: import.meta.env.PROD,
};

const supabase =
  env.SUPABASE_URL && env.SUPABASE_ANON_KEY
    ? createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
    : null;

/** Turnstile adapter; without a secret (local/dev) everyone is human. */
async function verifyHuman(token: string, ip: string | null): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set('remoteip', ip);

  const res = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    { method: 'POST', body }
  );
  const data = (await res.json()) as { success?: boolean };
  return Boolean(data.success);
}

/** Supabase adapter: new contributions are published immediately. */
async function createSubmission(submission: {
  title: string;
  imageUrl?: string;
  imageAlt?: string;
  author?: string;
  description?: string;
  cookingTime?: number;
  servings?: number;
  scalable?: boolean;
  tags?: string[];
  ingredients?: string;
  steps?: string;
  notes?: string;
}): Promise<void | { failed: true; status: number }> {
  if (!supabase) return { failed: true as const, status: 503 };

  const title = submission.title.trim();
  const slug = recipeSlug(title) || 'community-recipe';
  try {
    const { data: existingRecipe, error: lookupError } = await supabase
      .from('recipes')
      .select('slug')
      .eq('slug', slug)
      .maybeSingle();

    if (lookupError) {
      console.error('Failed to check recipe slug in Supabase:', lookupError);
      return { failed: true as const, status: 502 };
    }

    const { error } = await supabase.from('recipes').insert({
      slug: existingRecipe ? `${slug}-${Date.now()}` : slug,
      title,
      description: submission.description || '',
      author: submission.author || 'anonymous',
      image_url: submission.imageUrl || '',
      image_alt: submission.imageAlt || title,
      cooking_time: submission.cookingTime || 30,
      servings: submission.servings || 1,
      scalable: submission.scalable ?? true,
      tags: submission.tags || [],
      content: serializeCommunityRecipeDetails({
        ingredients: parseIngredients(submission.ingredients || ''),
        steps: parseSteps(submission.steps || ''),
        recipeNotes: (submission.notes || '')
          .split('\n')
          .map(note => note.trim())
          .filter(Boolean),
      }),
      status: 'published',
    });
    if (error) {
      console.error('Failed to publish recipe in Supabase:', error);
      return { failed: true as const, status: 502 };
    }
  } catch (error) {
    console.error('Failed to publish recipe in Supabase:', error);
    return { failed: true as const, status: 502 };
  }

  return;
}

const handleContribution = createContributionHandler({
  verifyHuman,
  createSubmission,
  rateLimitEnabled: env.PROD,
});

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!supabase) {
    return Response.json(
      { ok: false, error: 'Contribution form is not configured.' },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json(
      { ok: false, error: 'Invalid form data.' },
      { status: 400 }
    );
  }

  const result = await handleContribution({
    form,
    ip: clientAddress ?? null,
    contentLength: Number(request.headers.get('content-length') || 0),
  });

  return result.ok
    ? Response.json({ ok: true })
    : Response.json(
        { ok: false, error: result.message },
        { status: result.status }
      );
};
