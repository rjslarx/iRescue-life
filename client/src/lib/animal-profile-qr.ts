import QRCode from "qrcode";

/** Use the record UUID, never the human-readable animalId. */
export function getAnimalProfileUrl(
  basePath: string,
  animalUuid: string,
  origin: string = window.location.origin,
): string {
  const tenantPath = basePath.replace(/^\/+|\/+$/g, "");
  return `${origin.replace(/\/+$/g, "")}${tenantPath ? `/${tenantPath}` : ""}/animal/${encodeURIComponent(animalUuid)}`;
}

export function getAnimalProfileQrFilename(name: string, animalUuid: string): string {
  const safePart = (value: string) => value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${safePart(name) || "animal"}-${safePart(animalUuid) || "profile"}-profile-qr.png`;
}

export function generateAnimalProfileQr(basePath: string, animalUuid: string): Promise<string> {
  return QRCode.toDataURL(getAnimalProfileUrl(basePath, animalUuid), {
    type: "image/png",
    width: 1024,
    margin: 4,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

export async function downloadAnimalProfileQr(basePath: string, animalUuid: string, name: string): Promise<void> {
  const dataUrl = await generateAnimalProfileQr(basePath, animalUuid);
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = getAnimalProfileQrFilename(name, animalUuid);
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
}
