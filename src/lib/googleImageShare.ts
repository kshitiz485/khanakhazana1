const GOOGLE_HOSTS = new Set([
  'google.com',
  'www.google.com',
  'share.google',
]);

export async function resolveGoogleImageShareUrl(sharedUrl: string): Promise<string> {
  let current: URL;

  try {
    current = new URL(sharedUrl);
  } catch {
    throw new Error('Invalid Google image share URL.');
  }

  if (
    current.protocol !== 'https:' ||
    current.hostname.toLowerCase() !== 'share.google'
  ) {
    throw new Error('Only HTTPS share.google URLs can be resolved.');
  }

  for (let redirectCount = 0; redirectCount < 5; redirectCount += 1) {
    const response = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { range: 'bytes=0-0' },
    });
    const location = response.headers.get('location');
    await response.body?.cancel();

    if (!location || response.status < 300 || response.status >= 400) {
      throw new Error('Google did not redirect this link to an image result.');
    }

    current = new URL(location, current);
    if (
      current.protocol !== 'https:' ||
      !GOOGLE_HOSTS.has(current.hostname.toLowerCase())
    ) {
      throw new Error('Google share link redirected to an unexpected host.');
    }

    if (
      current.hostname.toLowerCase() === 'www.google.com' &&
      current.pathname === '/imgres'
    ) {
      const imageUrl = current.searchParams.get('imgurl');
      if (!imageUrl) {
        throw new Error('Google image result did not include an image URL.');
      }

      const image = new URL(imageUrl);
      if (image.protocol !== 'https:' || image.username || image.password) {
        throw new Error('Google image result did not contain a safe HTTPS URL.');
      }
      return image.href;
    }
  }

  throw new Error('Google image share link exceeded the redirect limit.');
}
