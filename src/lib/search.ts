import { isOkckHost } from '@/lib/storage';

export function getSearchUrl(rootUrl: string, query: string): string {
  const destinationUrl = new URL(rootUrl);
  destinationUrl.searchParams.set('s', query);
  return destinationUrl.toString();
}

export function shouldUsePostSearch(
  rootUrl: string,
  enableOkck24HourMode: boolean
): boolean {
  if (!enableOkck24HourMode) {
    return false;
  }

  try {
    return isOkckHost(new URL(rootUrl).hostname);
  } catch {
    return false;
  }
}

export function openSearchPage(options: {
  rootUrl: string;
  query: string;
  openInNewTab: boolean;
  usePost: boolean;
}): void {
  const { rootUrl, query, openInNewTab, usePost } = options;

  if (!usePost) {
    const destination = getSearchUrl(rootUrl, query);
    if (openInNewTab) {
      window.open(destination, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      if (window.top && window.top !== window) {
        window.top.location.href = destination;
        return;
      }
    } catch {
      // Ignore cross-origin access errors and fallback to current frame.
    }

    window.location.assign(destination);
    return;
  }

  const form = document.createElement('form');
  form.method = 'post';
  form.action = rootUrl;
  form.target = openInNewTab ? '_blank' : '_top';
  form.style.display = 'none';

  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = 's';
  input.value = query;

  form.append(input);
  (document.body ?? document.documentElement).append(form);
  form.submit();
  form.remove();
}
