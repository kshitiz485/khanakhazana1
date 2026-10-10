import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveGoogleImageShareUrl } from './googleImageShare';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveGoogleImageShareUrl', () => {
  it('follows a Google Images share link to its HTTPS image URL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://www.google.com/share.google?q=abc',
          },
        })
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            location:
              'https://www.google.com/imgres?imgurl=https://cdn.example.com/photo.jpg',
          },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      resolveGoogleImageShareUrl('https://share.google/abc')
    ).resolves.toBe('https://cdn.example.com/photo.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects links that redirect away from Google hosts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'https://attacker.example/photo.jpg' },
        })
      )
    );

    await expect(
      resolveGoogleImageShareUrl('https://share.google/abc')
    ).rejects.toThrow('unexpected host');
  });
});
