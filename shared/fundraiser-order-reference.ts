export function fundraiserOrderReference(number: number): string {
  return `F-${number}`;
}

export function matchesFundraiserOrder(
  order: { orderNumber?: number | null; customerName: string; customerEmail: string },
  search: string,
): boolean {
  const query = search.trim().replace(/^#/, "").toLowerCase();
  return !query || [
    order.orderNumber == null ? "" : fundraiserOrderReference(order.orderNumber),
    order.customerName,
    order.customerEmail,
  ].some(value => value.toLowerCase().includes(query));
}
