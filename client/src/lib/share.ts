export type ShareResult = "shared" | "copied" | "cancelled";

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed");
}

export async function shareOrCopy(
  data: ShareData,
  copyValue = data.url || data.text || "",
  imageUrl?: string,
): Promise<ShareResult> {
  if (navigator.share) {
    try {
      let shareData = data;
      if (imageUrl && navigator.canShare) {
        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const blob = await response.blob();
            const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
            const file = new File([blob], `raffle.${extension}`, { type: blob.type });
            const dataWithImage = { ...data, files: [file] };
            if (navigator.canShare(dataWithImage)) shareData = dataWithImage;
          }
        } catch {
          // The URL and its social-preview image still share if file attachment fails.
        }
      }
      await navigator.share(shareData);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
      // Some browsers expose Web Share but reject it at runtime. Copy instead.
    }
  }

  await copyTextToClipboard(copyValue);
  return "copied";
}