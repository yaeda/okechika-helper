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

export async function requestRootUrlPermission(rootUrl: string): Promise<boolean> {
  const origins = getPermissionOriginsForRootUrl(rootUrl);
  return chrome.permissions.request({ origins });
}

async function getPermittedHostsForRootUrl(rootUrl: string): Promise<Array<{ protocol: string; host: string }>> {
  const normalized = toNormalizedRoot(rootUrl);
  const protocol = normalized.protocol;
  const hosts = toHostCandidates(normalizeHost(normalized.hostname));

  const checks = await Promise.all(
    hosts.map(async (host) => {
      const origin = `${protocol}//${host}/*`;
      const granted = await chrome.permissions.contains({ origins: [origin] });
      return { host, granted };
    })
  );

  return checks
    .filter((item) => item.granted)
    .map((item) => ({ protocol, host: item.host }));
}

export async function hasRootUrlPermission(rootUrl: string): Promise<boolean> {
  const permittedHosts = await getPermittedHostsForRootUrl(rootUrl);
  return permittedHosts.length > 0;
}

export async function getContentScriptMatchesForPermittedOrigins(rootUrl: string): Promise<string[]> {
  const permittedHosts = await getPermittedHostsForRootUrl(rootUrl);

  return Array.from(
    new Set(
      // Register on the permitted host broadly, then gate behavior by root URL in content script.
      permittedHosts.map((item) => `${item.protocol}//${item.host}/*`)
    )
  );
}
