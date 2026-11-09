import { RescueTripleMatchGame } from './game.js';

export { SHELTER_PETS, getActivePetRoster } from './pets.js';
export type { ShelterPet } from './pets.js';
export { RescueTripleMatchGame } from './game.js';
export type { Tile } from './game.js';

declare global {
  interface Window {
    rescueTripleMatchGame?: RescueTripleMatchGame;
  }
}

function initApp(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  const levelEl = document.getElementById('level-indicator');
  const matchesLeftEl = document.getElementById('matches-left');
  const shuffleBtn = document.getElementById('shuffle-btn') as HTMLButtonElement | null;
  const shuffleBadgeEl = document.getElementById('shuffle-count');
  const overlayEl = document.getElementById('status-overlay');
  const overlayBadgeEl = document.getElementById('overlay-badge');
  const overlayTitleEl = document.getElementById('overlay-title');
  const overlayMessageEl = document.getElementById('overlay-message');
  const overlayActionBtn = document.getElementById('overlay-action-btn') as HTMLButtonElement | null;
  const overlayContinueBtn = document.getElementById('overlay-continue-btn') as HTMLButtonElement | null;

  if (!canvas) {
    throw new Error('Missing #game-canvas element.');
  }

  let currentLevel = 1;
  let lastStatus: 'playing' | 'won' | 'lost' = 'playing';
  const headerEl = document.querySelector<HTMLElement>('.game-header');
  const setOverlayVisible = (visible: boolean) => {
    overlayEl?.classList.toggle('hidden', !visible);
    if (overlayEl) overlayEl.inert = !visible;
    if (headerEl) headerEl.inert = visible;
    canvas.inert = visible;
    if (visible) overlayActionBtn?.focus();
    else if (overlayEl?.contains(document.activeElement)) canvas.focus();
  };
  setOverlayVisible(false);
  overlayEl?.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const buttons = [overlayContinueBtn, overlayActionBtn].filter(
      (button): button is HTMLButtonElement => !!button && !button.classList.contains('hidden') && !button.disabled
    );
    if (!buttons.length) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const game = new RescueTripleMatchGame(canvas, {
    onStateChange: (state) => {
      currentLevel = state.level;

      if (levelEl) {
        levelEl.textContent = `Level ${state.level}`;
      }
      if (matchesLeftEl) {
        matchesLeftEl.textContent = String(state.matchesLeft);
      }
      if (shuffleBadgeEl) {
        shuffleBadgeEl.textContent = `${state.shufflesLeft}`;
      }
      if (shuffleBtn) {
        shuffleBtn.disabled = !state.canShuffle;
      }

      if (state.status !== lastStatus) {
        lastStatus = state.status;
        if (state.status === 'won') {
          if (overlayBadgeEl) {
            overlayBadgeEl.textContent = 'Stage Cleared!';
            overlayBadgeEl.className = 'status-badge win';
          }
          if (overlayTitleEl) {
            overlayTitleEl.textContent = 'All 6 Pets Rescued!';
          }
          if (overlayMessageEl) {
            overlayMessageEl.textContent =
              'Score: 1000 • All 36 shelter pet tiles matched!';
          }
          if (overlayActionBtn) {
            overlayActionBtn.textContent = `Play Level ${state.level + 1}`;
          }
          overlayContinueBtn?.classList.add('hidden');
          setOverlayVisible(true);
        } else if (state.status === 'lost') {
          if (overlayBadgeEl) {
            overlayBadgeEl.textContent = 'Dock Full (7/7)';
            overlayBadgeEl.className = 'status-badge lose';
          }
          if (overlayTitleEl) {
            overlayTitleEl.textContent = 'Game Over';
          }
          if (overlayMessageEl) {
            overlayMessageEl.textContent = `7 dock slots filled with ${state.remainingTiles} tiles remaining.`;
          }
          if (overlayActionBtn) {
            overlayActionBtn.textContent = 'Restart Level';
          }
          overlayContinueBtn?.classList.remove('hidden');
          setOverlayVisible(true);
        } else {
          setOverlayVisible(false);
        }
      }
    }
  });

  shuffleBtn?.addEventListener('click', () => {
    game.shuffleBoard();
  });

  overlayActionBtn?.addEventListener('click', () => {
    setOverlayVisible(false);
    if (lastStatus === 'won') {
      lastStatus = 'playing';
      game.startLevel(currentLevel + 1);
    } else {
      lastStatus = 'playing';
      game.startLevel(currentLevel);
    }
  });

  overlayContinueBtn?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('RESUME_AFTER_CONTINUE'));
  });
  window.rescueTripleMatchGame = game;
  window.parent.postMessage({ type: 'rescue-triple-match-ready' }, '*');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
