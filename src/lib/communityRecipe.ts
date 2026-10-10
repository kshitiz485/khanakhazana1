import type { IngredientGroup, RecipeStep } from './contribution';

export interface CommunityRecipeDetails {
  ingredients: IngredientGroup[];
  steps: RecipeStep[];
  recipeNotes: string[];
}

export function serializeCommunityRecipeDetails(
  details: CommunityRecipeDetails
): string {
  return JSON.stringify(details);
}

export function parseCommunityRecipeDetails(
  content: string
): CommunityRecipeDetails | undefined {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }

  if (!isRecord(value)) return undefined;
  if (
    !Array.isArray(value.ingredients) ||
    !value.ingredients.every(isIngredientGroup) ||
    !Array.isArray(value.steps) ||
    !value.steps.every(isRecipeStep) ||
    !Array.isArray(value.recipeNotes) ||
    !value.recipeNotes.every(note => typeof note === 'string')
  ) {
    return undefined;
  }

  return {
    ingredients: value.ingredients,
    steps: value.steps,
    recipeNotes: value.recipeNotes,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIngredientGroup(value: unknown): value is IngredientGroup {
  return (
    isRecord(value) &&
    (value.title === undefined || typeof value.title === 'string') &&
    Array.isArray(value.items) &&
    value.items.every(
      item =>
        isRecord(item) &&
        typeof item.name === 'string' &&
        (item.quantity === undefined || typeof item.quantity === 'string') &&
        (item.unit === undefined || typeof item.unit === 'string')
    )
  );
}

function isRecipeStep(value: unknown): value is RecipeStep {
  return (
    isRecord(value) &&
    (value.title === undefined || typeof value.title === 'string') &&
    Array.isArray(value.actions) &&
    value.actions.every(action => typeof action === 'string')
  );
}
