export interface SearchablePageFields {
  title: string;
  decodedTitle?: string | null;
  url: string;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

export function createPageSearchMatcher(
  query: string
): (page: SearchablePageFields) => boolean {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return () => true;
  }

  return (page) =>
    [page.title, page.decodedTitle ?? '', page.url].some((value) =>
      normalizeSearchText(value).includes(normalizedQuery)
    );
}

export function matchesPageSearchQuery(
  page: SearchablePageFields,
  query: string
): boolean {
  return createPageSearchMatcher(query)(page);
}
