let shareUrl: string | null = null;

export function configureReceiptShare(value: unknown) {
  shareUrl = null;
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (url.origin !== window.location.origin || !url.pathname.endsWith("/rescue-vend")) return;
    url.search = "";
    url.hash = "";
    shareUrl = url.href;
  } catch { /* No untrusted or payment-session URLs may be shared. */ }
}

/** Called directly from the receipt click to retain Safari's user activation. */
export async function shareReceipt(button: HTMLElement | null) {
  if (!button) return;
  let status = button.parentElement?.querySelector<HTMLElement>("[data-share-status]");
  if (!status) {
    status = document.createElement("div");
    status.dataset.shareStatus = "true";
    status.setAttribute("role", "status");
    status.style.cssText = "margin:12px 0;color:#172033;font-size:16px;overflow-wrap:anywhere";
    button.insertAdjacentElement("afterend", status);
  }
  status.replaceChildren();
  if (!shareUrl) {
    status.textContent = "Sharing is not ready. Please reload the page and try again.";
    return;
  }
  const url = shareUrl;
  if (navigator.share) {
    try {
      await navigator.share({ title: "Rescue Vend", text: "I supported rescue care with a symbolic donation. You can help too!", url });
      status.textContent = "Share menu closed.";
      return;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      // Unsupported/blocked sharing must still offer a usable link.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    status.textContent = "Link copied! Paste it into a message or social post.";
  } catch {
    status.textContent = "Copy this link to share:";
    const input = document.createElement("input");
    input.readOnly = true;
    input.value = url;
    input.setAttribute("aria-label", "Donation page link");
    input.style.cssText = "display:block;width:100%;box-sizing:border-box;font-size:16px;padding:10px;margin-top:8px";
    input.addEventListener("click", () => input.select());
    status.append(input);
  }
}
