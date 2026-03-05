import { normalizeHost, normalizeRootUrl } from '@/lib/storage';

function isIpOrLocalHost(host: string): boolean {
  return host === 'localhost' || host.includes(':') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function toHostCandidates(host: string): string[] {
  if (isIpOrLocalHost(host)) {
    return [host];
  }

  if (host.startsWith('www.')) {
    const withoutWww = host.slice(4);
    return withoutWww ? [host, withoutWww] : [host];
  }

  return [host, `www.${host}`];
}

function toNormalizedRoot(rootUrl: string): URL {
  return new URL(normalizeRootUrl(rootUrl));
}

export function getPermissionOriginsForRootUrl(rootUrl: string): string[] {
  const normalized = toNormalizedRoot(rootUrl);
  const protocol = normalized.protocol;
  const hosts = toHostCandidates(normalizeHost(normalized.hostname));

  return Array.from(new Set(hosts.map((host) => `${protocol}//${host}/*`)));
}

export function getContentScriptMatchesForRootUrl(rootUrl: string): string[] {
  const normalized = toNormalizedRoot(rootUrl);
  const protocol = normalized.protocol;
  const hosts = toHostCandidates(normalizeHost(normalized.hostname));
  const path = normalized.pathname.endsWith('/') ? normalized.pathname : `${normalized.pathname}/`;
  const pathPattern = path === '/' ? '/*' : `${path}*`;

  return Array.from(new Set(hosts.map((host) => `${protocol}//${host}${pathPattern}`)));
}

export async function requestRootUrlPermission(rootUrl: string): Promise<boolean> {
  const origins = getPermissionOriginsForRootUrl(rootUrl);
  return chrome.permissions.request({ origins });
}

export async function hasRootUrlPermission(rootUrl: string): Promise<boolean> {
  const origins = getPermissionOriginsForRootUrl(rootUrl);
  return chrome.permissions.contains({ origins });
}
