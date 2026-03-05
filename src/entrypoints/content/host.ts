export async function getHostForMatching(): Promise<string> {
  const directHost = window.location.hostname;
  if (directHost) {
    return directHost;
  }

  try {
    const topHost = window.top?.location.hostname;
    if (topHost) {
      return topHost;
    }
  } catch {
    // Ignore cross-origin access errors.
  }

  if (document.referrer) {
    try {
      return new URL(document.referrer).hostname;
    } catch {
      return '';
    }
  }

  return '';
}
