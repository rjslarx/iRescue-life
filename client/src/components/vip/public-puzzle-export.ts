import type { PublicPuzzleLaunch } from "@/hooks/use-public-puzzle";

export interface PuzzleCompletion { petId: string | null; moves: number; seconds: number }

export function puzzleTime(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Only the launch's sanitized, inline JPEG may enter this canvas. No remote fetches.
export async function renderPuzzleImage(launch: PublicPuzzleLaunch, completion: PuzzleCompletion, signal: AbortSignal): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image creation is not supported in this browser.");
  const check = () => { if (signal.aborted) throw new DOMException("Cancelled", "AbortError"); };
  check();
  ctx.fillStyle = "#f6f3eb";
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#20394a";
  ctx.font = "bold 35px sans-serif";
  ctx.fillText((launch.rescueName || "Haseyas").slice(0, 90), 65, 85, 950);
  ctx.fillStyle = "#387b8b";
  ctx.font = "20px sans-serif";
  ctx.fillText("THE RESCUE PUZZLE CHALLENGE", 65, 130);
  ctx.fillStyle = "#e4ece8";
  ctx.fillRect(65, 170, 950, 850);
  const uri = launch.pet?.imageUrl;
  if (uri) {
    if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(uri)) throw new Error("The photo could not be safely prepared.");
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      const abort = () => { clean(); img.src = ""; reject(new DOMException("Cancelled", "AbortError")); };
      const clean = () => { signal.removeEventListener("abort", abort); img.onload = null; img.onerror = null; };
      signal.addEventListener("abort", abort, { once: true });
      img.onload = () => { clean(); resolve(img); };
      img.onerror = () => { clean(); reject(new Error("The animal photo could not be prepared. Please try again.")); };
      img.src = uri;
    });
    check();
    const scale = Math.min(950 / image.naturalWidth, 850 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.drawImage(image, 65 + (950 - width) / 2, 170 + (850 - height) / 2, width, height);
  } else {
    for (let i = 0; i < 16; i++) {
      const x = 140 + (i % 4) * 200;
      const y = 195 + Math.floor(i / 4) * 200;
      ctx.fillStyle = i === 15 ? "#d2ded8" : "#387b8b";
      ctx.fillRect(x, y, 190, 190);
      if (i < 15) {
        ctx.fillStyle = "#f6f3eb";
        ctx.font = "bold 78px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), x + 95, y + 120);
      }
    }
    ctx.textAlign = "left";
  }
  ctx.fillStyle = "#20394a";
  ctx.font = "bold 57px sans-serif";
  ctx.fillText("One happy puzzle, solved.", 65, 1110, 950);
  ctx.font = "30px sans-serif";
  ctx.fillText(`${completion.moves} moves  /  ${puzzleTime(completion.seconds)}`, 65, 1170, 950);
  ctx.fillStyle = "#536876";
  ctx.font = "22px sans-serif";
  ctx.fillText(uri ? "Completed animal-photo puzzle" : "Completed numbered puzzle · No animal photo available", 65, 1230, 950);
  ctx.font = "18px sans-serif";
  ctx.fillText("A keepsake of your play. Not an automatic entry or verified result.", 65, 1287, 950);
  check();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Your solved image could not be created.")), "image/png"));
  check();
  return blob;
}
