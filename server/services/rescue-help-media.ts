export const MAX_HELP_IMAGE_BYTES = 8 * 1024 * 1024;
export function helpImageType(type: string) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type.toLowerCase());
}

/** Only Twilio-controlled redirects; credentials are never forwarded to a CDN. */
export async function fetchHelpImage(url: string, authorization: string) {
  let response = await fetch(url, { headers: { Authorization: authorization }, redirect: "manual", signal: AbortSignal.timeout(15000) });
  for (let redirects = 0; response.status >= 300 && response.status < 400 && redirects < 3; redirects++) {
    const next = new URL(response.headers.get("location") || "", url);
    if (next.protocol !== "https:" || next.username || next.password ||
        !(next.hostname === "api.twilio.com" || next.hostname.endsWith(".twiliocdn.com"))) throw new Error("Unsupported media redirect");
    await response.body?.cancel();
    url = next.href;
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  }
  const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!response.ok || !helpImageType(type) || Number(response.headers.get("content-length")) > MAX_HELP_IMAGE_BYTES) {
    await response.body?.cancel();
    throw new Error("Image unavailable or unsupported");
  }
  if (!response.body) throw new Error("Empty media response");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_HELP_IMAGE_BYTES) throw new Error("Image too large");
      parts.push(value);
    }
  } finally { await reader.cancel(); }
  return { type, bytes: Buffer.concat(parts) };
}
