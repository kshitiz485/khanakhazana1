import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_IMAGE, resolveRecipeImage } from './recipeImage';

const cdn = { baseUrl: 'https://cdn.example.com/' };

describe('resolveRecipeImage', () => {
  it('prefixes a filename with the CDN base URL', () => {
    expect(resolveRecipeImage('tomato-soup.avif', cdn)).toEqual({
      src: 'https://cdn.example.com/tomato-soup.avif',
      fallbackSrc: PLACEHOLDER_IMAGE,
      mimeType: 'image/avif',
      isPlaceholder: false,
    });
  });

  it('strips legacy /images/ prefixes and leading slashes', () => {
    expect(resolveRecipeImage('/images/pie.jpg', cdn).src).toBe(
      'https://cdn.example.com/pie.jpg'
    );
    expect(resolveRecipeImage('/pie.webp', cdn).mimeType).toBe('image/webp');
  });

  it('passes full URLs and browser-generated URLs through untouched', () => {
    const external = resolveRecipeImage('https://example.com/a.JPG?x=1', cdn);
    expect(external.src).toBe('https://example.com/a.JPG?x=1');
    expect(external.mimeType).toBe('image/jpeg');

    const blob = resolveRecipeImage('blob:https://example.com/1234', cdn);
    expect(blob.src).toBe('blob:https://example.com/1234');
    expect(blob.isPlaceholder).toBe(false);

    const data = resolveRecipeImage('data:image/png;base64,AAAA', cdn);
    expect(data.src).toBe('data:image/png;base64,AAAA');
    expect(data.mimeType).toBe('image/png');
  });

  it('keeps relative paths valid when a CDN base URL is configured', () => {
    expect(resolveRecipeImage('/images/pie.jpg', cdn).src).toBe(
      'https://cdn.example.com/pie.jpg'
    );
    expect(resolveRecipeImage('uploads/pie.jpg', cdn).src).toBe(
      'https://cdn.example.com/uploads/pie.jpg'
    );
  });

  it('falls back to the placeholder without a value or a base URL', () => {
    for (const resolved of [
      resolveRecipeImage('', cdn),
      resolveRecipeImage(undefined, cdn),
      resolveRecipeImage('tomato-soup.avif', { baseUrl: undefined }),
    ]) {
      expect(resolved.src).toBe(PLACEHOLDER_IMAGE);
      expect(resolved.isPlaceholder).toBe(true);
      expect(resolved.mimeType).toBe('image/png');
    }
  });
});
