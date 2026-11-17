import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { parsePuzzleSave, validPuzzleRound } from '../client/src/lib/puzzle-progress';

const round = { board: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15], moves: 12, seconds: 31 };
const saved = { version: 1, tenant: 'haseyas', savedAt: 1000, petId: 'pet', photoVersion: 'a'.repeat(64), round };

test('bounded local save survives interruption only for the same tenant and seven days', () => {
  assert.deepEqual(parsePuzzleSave(JSON.stringify(saved), 'haseyas', 2000), saved);
  assert.equal(parsePuzzleSave(JSON.stringify(saved), 'other', 2000), null);
  assert.equal(parsePuzzleSave(JSON.stringify(saved), '', 2000), null);
  assert.equal(parsePuzzleSave(JSON.stringify(saved), 'haseyas', 999), null);
  assert.equal(parsePuzzleSave(JSON.stringify(saved), 'haseyas', 1000 + 7 * 86400000 + 1), null);
  for (const raw of ['{', 'null', 'x'.repeat(2049), JSON.stringify({ ...saved, donor: 'never stored' }),
    JSON.stringify({ ...saved, photoVersion: 'https://old-photo' }), JSON.stringify({ ...saved, version: 2 })]) {
    assert.equal(parsePuzzleSave(raw, 'haseyas', 2000), null);
  }
});

test('rejects tampered permutations, impossible parity, solved results and counter overflow', () => {
  assert.equal(validPuzzleRound(round), true);
  for (const board of [
    [...round.board.slice(0, 15)], Array(16).fill(0),
    [2, 1, ...round.board.slice(2)],
    [...Array.from({ length: 15 }, (_, i) => i + 1), 0],
    [...round.board.slice(0, 15), 16],
  ]) assert.equal(validPuzzleRound({ ...round, board }), false);
  for (const moves of [-1, 0, 0.5, 100001, Infinity]) assert.equal(validPuzzleRound({ ...round, moves }), false);
  for (const seconds of [-1, 0.5, 604801, Infinity]) assert.equal(validPuzzleRound({ ...round, seconds }), false);
  assert.equal(validPuzzleRound({ ...round, isSolved: true }), false);
});

test('engine restores only from parent, waits for photo, resets transient state, and clears on restart', async () => {
  const script = await readFile('server/games/rescue-shuffle/app.js', 'utf8');
  const messages: any[] = [];
  const events: Record<string, Function> = {};
  const documentEvents: Record<string, Function> = {};
  const parent = { postMessage: (message: unknown) => messages.push(message) };
  const context = vm.createContext({
    PUBLIC_CHALLENGE: true, SHELTER_PETS: [{ id: 'pet', name: 'Friend', imageUrl: 'photo' }],
    validPuzzleRound, window: { parent, addEventListener: (type: string, cb: Function) => { events[type] = cb; } },
    document: { visibilityState: 'hidden', addEventListener: (type: string, cb: Function) => { documentEvents[type] = cb; } },
    clearTimeout() {},
  });
  vm.runInContext(`${script};globalThis.Game=RescueShuffleGame`, context);
  const game = Object.create(context.Game.prototype);
  const button = { addEventListener() {} };
  Object.assign(game, {
    board: [], awaitingResume: true, imageLoaded: false, moves: 0,
    nextPetBtn: button, playAgainBtn: button, toggleNumbersBtn: button, canvas: button,
    winOverlay: { classList: { add() {} }, inert: false }, timerRunning: true,
    stopTimer() { this.timerRunning = false; }, updateStatsUI() {}, render() {},
    petSubtitleEl: {}, petNameEl: {}, petBreedEl: {}, petPreviewEl: {},
    loadPetImage() {}, shuffleBoard() {}, currentPetIndex: 0,
  });
  game.initEvents();
  events.message({ source: {}, data: { type: 'rescue-shuffle-restore', round } });
  assert.equal(game.pendingResume, undefined);
  events.message({ source: parent, data: { type: 'rescue-shuffle-restore', round: { ...round, board: Array(16).fill(0) } } });
  assert.equal(game.pendingResume, undefined);
  events.message({ source: parent, data: { type: 'rescue-shuffle-restore', round } });
  assert.equal(game.awaitingResume, true);
  assert.equal(game.board.length, 0);
  game.imageLoaded = true;
  game.finishRestore();
  assert.deepEqual([...game.board], round.board);
  assert.equal(game.moves, 12);
  assert.equal(game.elapsedSeconds, 31);
  assert.equal(game.timerRunning, false);
  assert.equal(game.isSolved, false);
  assert.equal(game.winOverlay.inert, true);
  assert.equal(messages.at(-1).type, 'rescue-shuffle-progress');
  game.timerRunning = true;
  documentEvents.visibilitychange();
  assert.equal(game.timerRunning, false);
  game.startNewGame(false);
  assert.equal(messages.at(-1).type, 'rescue-shuffle-reset');
  assert.equal(game.moves, 0);
  assert.equal(game.elapsedSeconds, 0);
  assert.equal(game.pendingResume, null);
});
