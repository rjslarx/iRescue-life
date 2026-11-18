import assert from "node:assert/strict";
import { test } from "node:test";
import { renderPuzzleImage } from "../client/src/components/vip/public-puzzle-export";
import type { PublicPuzzleLaunch } from "../client/src/hooks/use-public-puzzle";

test("keepsake includes the animal name without changing numbered-puzzle fallback", async () => {
  const labels: string[] = [];
  const context = {
    fillRect() {}, drawImage() {},
    fillText(text: string) { labels.push(text); },
  };
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, "Image");
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({
      getContext: () => context,
      toBlob: (callback: (blob: Blob) => void) => callback(new Blob(["image"])),
    }),
  } });
  Object.defineProperty(globalThis, "Image", { configurable: true, value: class {
    naturalWidth = 800;
    naturalHeight = 600;
    onload: (() => void) | null = null;
    set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
  } });
  try {
    const launch = {
      rescueName: "Test Rescue",
      pet: { id: "pet-1", name: "  May  ", breed: "", imageUrl: "data:image/jpeg;base64,AAAA" },
    } as PublicPuzzleLaunch;
    const completion = { petId: "pet-1", moves: 100, seconds: 120 };
    await renderPuzzleImage(launch, completion, new AbortController().signal);
    assert.ok(labels.includes("Featuring May"));
    assert.ok(labels.includes("100 moves  /  2:00"));
    labels.length = 0;
    await renderPuzzleImage({ ...launch, pet: null }, { ...completion, petId: null }, new AbortController().signal);
    assert.ok(labels.includes("Completed numbered puzzle · No animal photo available"));
    assert.ok(!labels.some(label => label.startsWith("Featuring")));
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (originalImage) Object.defineProperty(globalThis, "Image", originalImage);
    else Reflect.deleteProperty(globalThis, "Image");
  }
});
