import { validPuzzleRound } from "../../../shared/puzzle-progress";

export { validPuzzleRound };
export const PUZZLE_SAVE_KEY = "public-puzzle-progress-v1";
export type PuzzleRound = { board: number[]; moves: number; seconds: number };
export type PuzzleSave = { version: 1; tenant: string; savedAt: number; petId: string | null; photoVersion: string | null; round: PuzzleRound };

export function parsePuzzleSave(raw: string | null, tenant: string, now = Date.now()): PuzzleSave | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const data = JSON.parse(raw);
    if (Object.keys(data).sort().join(",") !== "petId,photoVersion,round,savedAt,tenant,version" ||
        data.version !== 1 || !tenant || data.tenant !== tenant ||
        !Number.isSafeInteger(data.savedAt) || data.savedAt > now || now - data.savedAt > 7 * 86400000 ||
        !(data.petId === null && data.photoVersion === null ||
          typeof data.petId === "string" && data.petId.length > 0 && data.petId.length <= 100 &&
          typeof data.photoVersion === "string" && /^[a-f0-9]{64}$/.test(data.photoVersion)) ||
        !validPuzzleRound(data.round)) return null;
    return data;
  } catch { return null; }
}
