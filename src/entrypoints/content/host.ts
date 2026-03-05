export async function getPageUrlForMatching(): Promise<string> {
  if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
    return window.location.href;
  }

  try {
    const topUrl = window.top?.location.href;
    if (topUrl && (topUrl.startsWith('http://') || topUrl.startsWith('https://'))) {
      return topUrl;
    }
  } catch {
    // Ignore cross-origin access errors.
  }

  if (document.referrer) {
    if (document.referrer.startsWith('http://') || document.referrer.startsWith('https://')) {
      return document.referrer;
    }
  }

  return '';
}
