export type SearchableGuideSection = { heading: string; body: readonly string[] };

function normalize(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function searchGuideSections<T extends SearchableGuideSection>(
  sections: readonly T[],
  query: string,
): T[] {
  const needle = normalize(query);
  if (!needle) return [...sections];
  return sections.filter((section) => (
    normalize(section.heading).includes(needle)
    || section.body.some((paragraph) => normalize(paragraph).includes(needle))
  ));
}
