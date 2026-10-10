import { describe, expect, it, vi } from 'vitest';
import {
  CONTRIBUTE_FIELDS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  buildRecipeMarkdown,
  createContributionHandler,
  isContributionConfigured,
  parseIngredients,
  parseSteps,
  parseContribution,
  type ContributePayload,
} from './contribution';
import {
  parseCommunityRecipeDetails,
  serializeCommunityRecipeDetails,
} from './communityRecipe';

function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return form;
}

const validFields = {
  title: 'Creamy Tomato Soup!',
  description: 'A cozy weeknight soup.',
  author: 'Alex',
  cookingTime: '35',
  servings: '1',
  ingredients: '2|cups|tomatoes\n1|tbsp|olive oil',
  steps: '## Prep\nChop the tomatoes.\n## Cook\nSimmer until soft.',
  notes: 'Add cream at the end.',
  tags: 'soup, vegetarian',
};

const validPayload: ContributePayload = {
  title: 'Creamy Tomato Soup!',
  description: 'A cozy weeknight soup.',
  author: 'Alex',
  cookingTime: 35,
  servings: 1,
  scalable: true,
  ingredients: '2|cups|tomatoes\n1|tbsp|olive oil',
  steps: '## Prep\nChop the tomatoes.\n## Cook\nSimmer until soft.',
  notes: 'Add cream at the end.',
  tags: 'soup, vegetarian',
  imageUrl: '',
};

describe('CONTRIBUTE_FIELDS', () => {
  it('has unique names and a label on every field', () => {
    const names = CONTRIBUTE_FIELDS.map(field => field.name);
    expect(new Set(names).size).toBe(names.length);
    expect(CONTRIBUTE_FIELDS.every(field => field.label.length > 0)).toBe(true);
  });
});

describe('isContributionConfigured', () => {
  it('needs Supabase always and Turnstile only in production', () => {
    const supabase = { SUPABASE_URL: 'url', SUPABASE_ANON_KEY: 'key' };
    expect(isContributionConfigured({ ...supabase, PROD: false })).toBe(true);
    expect(isContributionConfigured({ ...supabase, PROD: true })).toBe(false);
    expect(
      isContributionConfigured({
        ...supabase,
        PROD: true,
        TURNSTILE_SECRET_KEY: 's',
      })
    ).toBe(true);
    expect(isContributionConfigured({ SUPABASE_URL: 'url', PROD: false })).toBe(
      false
    );
  });
});

describe('parseContribution', () => {
  it('accepts a valid submission', () => {
    const result = parseContribution(formOf(validFields));
    expect(result).toEqual({ ok: true, payload: validPayload });
  });

  it('rejects missing required fields', () => {
    const { title: _, ...withoutTitle } = validFields;
    expect(parseContribution(formOf(withoutTitle))).toEqual({
      ok: false,
      message: 'Dish title is required.',
    });
  });

  it('enforces the field table limits', () => {
    expect(
      parseContribution(formOf({ ...validFields, title: 'x'.repeat(121) }))
    ).toMatchObject({ ok: false, message: /at most 120/ });
    expect(
      parseContribution(formOf({ ...validFields, cookingTime: '1000' }))
    ).toMatchObject({ ok: false, message: /between 1 and 999/ });
    expect(
      parseContribution(formOf({ ...validFields, cookingTime: 'soon' }))
    ).toMatchObject({ ok: false });
  });

  it('accepts valid image URLs and rejects non-image share links', () => {
    expect(
      parseContribution(
        formOf({ ...validFields, imageUrl: 'https://example.com/photo.jpg' })
      )
    ).toMatchObject({ ok: true, payload: { imageUrl: 'https://example.com/photo.jpg' } });

    expect(
      parseContribution(
        formOf({ ...validFields, imageUrl: 'example.com/photo.jpg' })
      )
    ).toMatchObject({ ok: true, payload: { imageUrl: 'https://example.com/photo.jpg' } });

    expect(
      parseContribution(
        formOf({ ...validFields, imageUrl: 'https://drive.google.com/file/d/abc123/view' })
      )
    ).toMatchObject({ ok: true, payload: { imageUrl: 'https://drive.google.com/uc?export=view&id=abc123' } });

    expect(
      parseContribution(
        formOf({ ...validFields, imageUrl: 'https://share.google/cRWEpBrlEII5jRXjw' })
      )
    ).toMatchObject({
      ok: true,
      payload: { imageUrl: 'https://share.google/cRWEpBrlEII5jRXjw' },
    });
  });

  it('models servings and scalability independently', () => {
    expect(
      parseContribution(formOf({ ...validFields, servings: '4' }))
    ).toMatchObject({ ok: true, payload: { servings: 4, scalable: true } });
    expect(
      parseContribution(
        formOf({ ...validFields, servings: '8', fixedServings: 'on' })
      )
    ).toMatchObject({ ok: true, payload: { servings: 8, scalable: false } });
    expect(parseContribution(formOf({ ...validFields, servings: '' }))).toEqual(
      { ok: false, message: 'Servings is required.' }
    );
  });
});

describe('buildRecipeMarkdown', () => {
  const today = new Date('2026-09-14T12:00:00Z');

  it('builds slug and frontmatter from a valid payload', () => {
    const { slug, markdown } = buildRecipeMarkdown(validPayload, today);

    expect(slug).toBe('creamy-tomato-soup');
    expect(markdown).toContain('title: "Creamy Tomato Soup!"');
    expect(markdown).toContain("author: 'Alex'");
    expect(markdown).toContain('pubDate: 2026-09-14');
    expect(markdown).toContain('cookingTime: 35');
    expect(markdown).not.toContain('servings:');
    expect(markdown).not.toContain('scalable:');
    expect(markdown).toContain("quantity: '2'");
    expect(markdown).toContain("name: 'tomatoes'");
    expect(markdown).toContain("title: 'Prep'");
    expect(markdown).toContain("tags: ['soup', 'vegetarian']");
    expect(markdown).toContain("recipeNotes:\n  - 'Add cream at the end.'");
  });

  it('writes servings when they matter and scalable: false when fixed', () => {
    const scalable = buildRecipeMarkdown(
      { ...validPayload, servings: 4 },
      today
    ).markdown;
    expect(scalable).toContain('cookingTime: 35\nservings: 4\n');
    expect(scalable).not.toContain('scalable:');

    const fixed = buildRecipeMarkdown(
      { ...validPayload, servings: 8, scalable: false },
      today
    ).markdown;
    expect(fixed).toContain('cookingTime: 35\nservings: 8\nscalable: false\n');
  });

  it('supports ingredient groups and two-part lines', () => {
    const { markdown } = buildRecipeMarkdown(
      {
        ...validPayload,
        ingredients: '## Crust\n2 | eggs\nsalt\n## Filling\n1/2|cup|sugar',
      },
      today
    );
    expect(markdown).toContain(
      "ingredients:\n  - title: 'Crust'\n    items:\n      - quantity: '2'\n        unit: ''\n        name: 'eggs'\n      - quantity: ''\n        unit: ''\n        name: 'salt'\n  - title: 'Filling'\n    items:\n      - quantity: '1/2'\n        unit: 'cup'\n        name: 'sugar'\n"
    );
  });

  it('defaults anonymous author and limits tags to three', () => {
    const { markdown } = buildRecipeMarkdown(
      {
        ...validPayload,
        author: '  ',
        tags: 'a, b, c, d, e',
        imageUrl: 'https://example.com/photo.jpg',
      },
      today
    );
    expect(markdown).toContain("author: 'anonymous'");
    expect(markdown).toContain("tags: ['a', 'b', 'c']");
    expect(markdown).toContain('image: "https://example.com/photo.jpg"');
  });

  it('escapes YAML-sensitive strings with JSON.stringify', () => {
    const { markdown } = buildRecipeMarkdown(
      {
        ...validPayload,
        title: "Chef's Special: Soup",
        description: 'Line one: two',
      },
      today
    );
    expect(markdown).toContain('"Chef\'s Special: Soup"');
    expect(markdown).toContain('"Line one: two"');
  });
});

describe('parse recipe steps and ingredients', () => {
  it('preserves ingredient groups, quantities, and sectioned steps', () => {
    expect(
      parseIngredients('## Dressing\n1/2 | cup | olive oil\nSalt')
    ).toEqual([
      {
        title: 'Dressing',
        items: [
          { quantity: '1/2', unit: 'cup', name: 'olive oil' },
          { name: 'Salt' },
        ],
      },
    ]);
    expect(parseSteps('## Prep\nChop onions.\n## Cook\nSimmer.')).toEqual([
      { title: 'Prep', actions: ['Chop onions.'] },
      { title: 'Cook', actions: ['Simmer.'] },
    ]);
  });

  describe('community recipe content', () => {
    it('round-trips structured ingredients, steps, and notes through content', () => {
      const details = {
        ingredients: parseIngredients('## Dressing\n1/2 | cup | olive oil'),
        steps: parseSteps('## Prep\nChop onions.\n## Cook\nSimmer.'),
        recipeNotes: ['Add salt to taste.'],
      };

      expect(
        parseCommunityRecipeDetails(serializeCommunityRecipeDetails(details))
      ).toEqual(details);
    });

    it('treats legacy plain-text content as unstructured', () => {
      expect(
        parseCommunityRecipeDetails('Legacy recipe content')
      ).toBeUndefined();
    });
  });
});

describe('createContributionHandler', () => {
  function setup(
    overrides: Partial<Parameters<typeof createContributionHandler>[0]> = {}
  ) {
    let time = 1_000_000;
    const createSubmission = vi.fn(async () => undefined);
    const verifyHuman = vi.fn(async () => true);
    const handle = createContributionHandler({
      verifyHuman,
      createSubmission,
      now: () => time,
      ...overrides,
    });
    const submit = (
      fields: Record<string, string> = validFields,
      ip = '1.1.1.1'
    ) => handle({ form: formOf(fields), ip, contentLength: 1000 });
    return {
      submit,
      createSubmission,
      verifyHuman,
      advance: (ms: number) => (time += ms),
    };
  }

  it('saves a review submission for a valid recipe', async () => {
    const { submit, createSubmission } = setup();
    await expect(submit()).resolves.toEqual({
      ok: true,
      status: 200,
    });
    expect(createSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Creamy Tomato Soup!',
        author: 'Alex',
        description: 'A cozy weeknight soup.',
        cookingTime: 35,
        servings: 1,
        scalable: true,
        imageUrl: '',
        imageAlt: 'Creamy Tomato Soup!',
        ingredients: '2|cups|tomatoes\n1|tbsp|olive oil',
        steps: '## Prep\nChop the tomatoes.\n## Cook\nSimmer until soft.',
        notes: 'Add cream at the end.',
        tags: ['soup', 'vegetarian'],
      })
    );
  });

  it('silently accepts honeypot submissions without creating an issue', async () => {
    const { submit, createSubmission, verifyHuman } = setup();
    await expect(submit({ ...validFields, website: 'spam' })).resolves.toEqual({
      ok: true,
      status: 200,
    });
    expect(verifyHuman).not.toHaveBeenCalled();
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it('refuses when the human check fails', async () => {
    const { submit, createSubmission } = setup({
      verifyHuman: async () => false,
    });
    await expect(submit()).resolves.toMatchObject({ ok: false, status: 400 });
    expect(createSubmission).not.toHaveBeenCalled();
  });

  it('returns the field error for an invalid submission', async () => {
    const { submit } = setup();
    await expect(submit({ ...validFields, steps: '' })).resolves.toEqual({
      ok: false,
      status: 400,
      message: 'Steps is required.',
    });
  });

  it('rejects oversized bodies', async () => {
    const { createSubmission } = setup();
    const handle = createContributionHandler({
      verifyHuman: async () => true,
      createSubmission,
    });
    await expect(
      handle({ form: formOf(validFields), ip: null, contentLength: 200_000 })
    ).resolves.toMatchObject({ ok: false, status: 413 });
  });

  it('rate limits per ip and resets after the window', async () => {
    const { submit, advance } = setup();
    for (let i = 0; i < RATE_LIMIT_MAX; i++) {
      await expect(submit()).resolves.toMatchObject({ ok: true });
    }
    await expect(submit()).resolves.toMatchObject({ ok: false, status: 429 });
    await expect(submit(validFields, '2.2.2.2')).resolves.toMatchObject({
      ok: true,
    });
    advance(RATE_LIMIT_WINDOW_MS + 1);
    await expect(submit()).resolves.toMatchObject({ ok: true });
  });

  it('does not rate limit when disabled for local development', async () => {
    const { submit } = setup({ rateLimitEnabled: false });
    for (let i = 0; i < RATE_LIMIT_MAX + 2; i++) {
      await expect(submit()).resolves.toMatchObject({ ok: true });
    }
  });

  it('maps submission failures to a 502', async () => {
    const auth = setup({
      createSubmission: async () => ({ failed: true, status: 401 }),
    });
    await expect(auth.submit()).resolves.toEqual({
      ok: false,
      status: 502,
      message: 'Could not save your recipe submission.',
    });
    const other = setup({
      createSubmission: async () => ({ failed: true, status: 500 }),
    });
    await expect(other.submit()).resolves.toMatchObject({
      status: 502,
      message: /try again later/,
    });
  });
});
