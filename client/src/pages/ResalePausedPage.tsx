import { RESALE_PAUSED_MESSAGE } from "@shared/resale-availability";

export default function ResalePausedPage() {
  return <main className="mx-auto max-w-xl p-8"><h1 className="mb-4 text-2xl font-semibold">Rescue Resale is paused</h1><p>{RESALE_PAUSED_MESSAGE}</p></main>;
}
