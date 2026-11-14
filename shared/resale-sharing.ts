export function resaleListingUrl(origin: string, basePath: string, itemId: string) {
  const url = new URL(`${basePath}/rescue-resale`, origin);
  url.searchParams.set("item", itemId);
  return url.href;
}

export function resaleListingText(item: {
  title: string; description: string; askingCents: number; zip: string; proceedsMode?: string;
}, rescueName: string, url: string) {
  const price = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.askingCents / 100);
  const proceeds = item.proceedsMode === "split_50"
    ? `Half of net proceeds supports ${rescueName}; half goes to the contributor, after platform and processing fees.`
    : `All net proceeds support ${rescueName}, after platform and processing fees.`;
  return `${item.title} — ${price}\n\n${item.description}\n\nLocal pickup · ZIP ${item.zip}\n${proceeds}\n\nView the item, ask questions, and arrange purchase through Rescue Resale:\n${url}`;
}
