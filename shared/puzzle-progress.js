// Shared by the page and the opaque game iframe. Never accept saved results.
export function validPuzzleRound(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.keys(value).sort().join(',') !== 'board,moves,seconds') return false;
  const { board, moves, seconds } = value;
  if (!Array.isArray(board) || board.length !== 16 ||
      board.some(n => !Number.isInteger(n) || n < 0 || n > 15) || new Set(board).size !== 16) return false;
  if (!Number.isSafeInteger(moves) || moves < 1 || moves > 100000 ||
      !Number.isSafeInteger(seconds) || seconds < 0 || seconds > 604800) return false;
  if (board.every((n, i) => n === (i + 1) % 16)) return false;
  let inversions = 0;
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) {
    if (board[i] && board[j] && board[i] > board[j]) inversions++;
  }
  return (inversions + 4 - Math.floor(board.indexOf(0) / 4)) % 2 === 1;
}
