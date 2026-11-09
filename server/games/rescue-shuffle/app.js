// SHELTER_PETS is injected by the authorized server launch, from this rescue's
// public, available animals only. No sample animals or donor credentials.

const GRID_SIZE = 4;
const TOTAL_TILES = GRID_SIZE * GRID_SIZE;
const EMPTY_TILE = 0;

class RescueShuffleGame {
  constructor() {
    this.canvas = document.getElementById('puzzle-canvas');
    this.ctx = this.canvas.getContext('2d');

    // UI Elements
    this.moveCountEl = document.getElementById('move-count');
    this.timerDisplayEl = document.getElementById('timer-display');
    this.petSubtitleEl = document.getElementById('pet-subtitle');
    this.petNameEl = document.getElementById('pet-name');
    this.petBreedEl = document.getElementById('pet-breed');
    this.petPreviewEl = document.getElementById('pet-preview');
    this.nextPetBtn = document.getElementById('next-pet-btn');
    this.playAgainBtn = document.getElementById('play-again-btn');
    this.toggleNumbersBtn = document.getElementById('toggle-numbers-btn');
    this.winOverlay = document.getElementById('win-overlay');
    this.winTitle = document.getElementById('win-title');
    this.winStats = document.getElementById('win-stats');

    // Game State
    this.board = [];
    this.moves = 0;
    this.elapsedSeconds = 0;
    this.timerInterval = null;
    this.timerRunning = false;
    this.isSolved = false;
    this.showNumbers = true;
    this.currentPetIndex = -1;
    this.currentPetImage = null;
    this.imageLoaded = false;
    this.imageRequest = 0;
    this.winTimeout = null;
    this.started = false;

    // Animation state
    this.animatingTile = null; // { value, fromRow, fromCol, toRow, toCol, progress }
    this.lastFrameTime = 0;

    // Pointer / Swipe state
    this.pointerStart = null;

    this.initEvents();
    this.resizeCanvas();
    this.toggleNumbersBtn.classList.add('active');
    this.startNewGame(true);
    window.parent.postMessage({ type: 'rescue-shuffle-ready' }, '*');
  }

  initEvents() {
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.render();
    });

    this.nextPetBtn.addEventListener('click', () => this.startNewGame(true));
    this.playAgainBtn.addEventListener('click', () => this.startNewGame(true));

    this.toggleNumbersBtn.addEventListener('click', () => {
      if (!this.imageLoaded) return;
      this.showNumbers = !this.showNumbers;
      this.toggleNumbersBtn.classList.toggle('active', this.showNumbers);
      this.toggleNumbersBtn.setAttribute('aria-pressed', String(this.showNumbers));
      this.render();
    });

    // Unified Pointer Events for Touch & Mouse (with CSS touch-action: none)
    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointercancel', () => {
      this.pointerStart = null;
    });

    // Keyboard accessibility (Arrow keys)
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.logicalSize = rect.width;
  }

  pickNextPet() {
    if (!SHELTER_PETS.length) return { name: 'Number puzzle', breed: '', imageUrl: null };
    if (SHELTER_PETS.length <= 1) {
      this.currentPetIndex = 0;
      return SHELTER_PETS[0];
    }
    let nextIndex;
    do {
      nextIndex = Math.floor(Math.random() * SHELTER_PETS.length);
    } while (nextIndex === this.currentPetIndex);
    this.currentPetIndex = nextIndex;
    return SHELTER_PETS[this.currentPetIndex];
  }

  startNewGame(changePet = true) {
    clearTimeout(this.winTimeout);
    this.stopTimer();
    this.started = false;
    this.moves = 0;
    this.elapsedSeconds = 0;
    this.isSolved = false;
    this.animatingTile = null;
    this.updateStatsUI();
    this.winOverlay.classList.add('hidden');
    this.winOverlay.inert = true;

    const pet = changePet || this.currentPetIndex === -1
      ? this.pickNextPet()
      : SHELTER_PETS[this.currentPetIndex];

    this.petSubtitleEl.textContent = `${pet.name} • ${pet.breed}`;
    this.petNameEl.textContent = pet.name;
    this.petBreedEl.textContent = pet.breed;
    if (pet.imageUrl) this.petPreviewEl.src = pet.imageUrl;
    else this.petPreviewEl.removeAttribute('src');
    this.petPreviewEl.hidden = !pet.imageUrl;
    this.petPreviewEl.alt = pet.imageUrl ? `Reference photo of ${pet.name}` : '';

    this.createSolvedBoard();
    this.shuffleBoard(120);

    this.loadPetImage(pet.imageUrl);
  }

  loadPetImage(url) {
    const request = ++this.imageRequest;
    this.imageLoaded = false;
    this.currentPetImage = null;
    this.showNumbers = true;
    this.toggleNumbersBtn.disabled = true;
    this.toggleNumbersBtn.classList.add('active');
    this.toggleNumbersBtn.setAttribute('aria-pressed', 'true');
    const status = document.getElementById('image-status');
    status.textContent = url ? 'Loading this animal’s photo…' : 'No available-animal photos yet. Enjoy the numbered puzzle.';
    this.render();
    if (!url) return;
    const img = new Image();
    // Public images are drawn only; no pixel export/readback is needed. Avoid
    // requiring third-party image hosts to allow CORS from an opaque sandbox.
    img.referrerPolicy = 'no-referrer';
    img.onload = () => {
      if (request !== this.imageRequest) return;
      this.currentPetImage = img;
      this.imageLoaded = true;
      this.toggleNumbersBtn.disabled = false;
      status.textContent = 'Arrange tiles 1–15, leaving the empty space at the bottom right.';
      this.render();
    };
    img.onerror = () => {
      if (request !== this.imageRequest) return;
      this.imageLoaded = false;
      this.petPreviewEl.hidden = true;
      status.textContent = 'This photo could not load. Play with numbers or try Next Pet.';
      this.render();
    };
    img.src = url;
  }

  createSolvedBoard() {
    // 1..15 followed by 0 (empty)
    this.board = Array.from({ length: TOTAL_TILES }, (_, i) =>
      i === TOTAL_TILES - 1 ? EMPTY_TILE : i + 1
    );
  }

  shuffleBoard(steps = 120) {
    // Shuffle by performing valid moves from the solved state.
    // This guarantees 100% mathematical solvability without impossible parity states.
    let previousEmptyIndex = -1;
    for (let i = 0; i < steps; i++) {
      const emptyIndex = this.board.indexOf(EMPTY_TILE);
      const neighbors = this.getAdjacentIndices(emptyIndex).filter(
        (idx) => idx !== previousEmptyIndex
      );
      const randomNeighbor = neighbors[Math.floor(Math.random() * neighbors.length)];
      this.swapTiles(emptyIndex, randomNeighbor);
      previousEmptyIndex = emptyIndex;
    }

    // Ensure the shuffled board isn't accidentally already solved
    if (this.checkSolved()) {
      const emptyIndex = this.board.indexOf(EMPTY_TILE);
      const neighbors = this.getAdjacentIndices(emptyIndex);
      this.swapTiles(emptyIndex, neighbors[0]);
    }
  }

  getAdjacentIndices(index) {
    const row = Math.floor(index / GRID_SIZE);
    const col = index % GRID_SIZE;
    const neighbors = [];

    if (row > 0) neighbors.push((row - 1) * GRID_SIZE + col);
    if (row < GRID_SIZE - 1) neighbors.push((row + 1) * GRID_SIZE + col);
    if (col > 0) neighbors.push(row * GRID_SIZE + (col - 1));
    if (col < GRID_SIZE - 1) neighbors.push(row * GRID_SIZE + (col + 1));

    return neighbors;
  }

  swapTiles(idxA, idxB) {
    const temp = this.board[idxA];
    this.board[idxA] = this.board[idxB];
    this.board[idxB] = temp;
  }

  handlePointerDown(e) {
    if (this.isSolved) return;
    this.canvas.setPointerCapture(e.pointerId);
    const rect = this.canvas.getBoundingClientRect();
    this.pointerStart = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  handlePointerUp(e) {
    if (!this.pointerStart || this.isSolved) return;

    const rect = this.canvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const dx = endX - this.pointerStart.x;
    const dy = endY - this.pointerStart.y;
    const dist = Math.hypot(dx, dy);

    const tileSize = this.logicalSize / GRID_SIZE;
    const startCol = Math.floor(this.pointerStart.x / tileSize);
    const startRow = Math.floor(this.pointerStart.y / tileSize);

    this.pointerStart = null;

    if (startRow < 0 || startRow >= GRID_SIZE || startCol < 0 || startCol >= GRID_SIZE) {
      return;
    }

    const startIndex = startRow * GRID_SIZE + startCol;
    const emptyIndex = this.board.indexOf(EMPTY_TILE);
    const emptyRow = Math.floor(emptyIndex / GRID_SIZE);
    const emptyCol = emptyIndex % GRID_SIZE;

    // Swipe gesture threshold
    if (dist > 22) {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      let targetRow = emptyRow;
      let targetCol = emptyCol;

      // Determine which tile is swiped into the empty space
      if (absX > absY) {
        // Horizontal swipe: swiping right moves the tile to the left of empty space
        targetCol = dx > 0 ? emptyCol - 1 : emptyCol + 1;
      } else {
        // Vertical swipe: swiping down moves the tile above the empty space
        targetRow = dy > 0 ? emptyRow - 1 : emptyRow + 1;
      }

      if (
        targetRow >= 0 &&
        targetRow < GRID_SIZE &&
        targetCol >= 0 &&
        targetCol < GRID_SIZE
      ) {
        this.tryMoveTile(targetRow * GRID_SIZE + targetCol);
      }
      return;
    }

    // Tap gesture on an adjacent tile
    this.tryMoveTile(startIndex);
  }

  handleKeyDown(e) {
    if (this.isSolved) return;
    const emptyIndex = this.board.indexOf(EMPTY_TILE);
    const emptyRow = Math.floor(emptyIndex / GRID_SIZE);
    const emptyCol = emptyIndex % GRID_SIZE;

    let tileRow = emptyRow;
    let tileCol = emptyCol;

    if (e.key === 'ArrowUp') tileRow = emptyRow + 1;
    else if (e.key === 'ArrowDown') tileRow = emptyRow - 1;
    else if (e.key === 'ArrowLeft') tileCol = emptyCol + 1;
    else if (e.key === 'ArrowRight') tileCol = emptyCol - 1;
    else return;

    e.preventDefault();
    if (tileRow >= 0 && tileRow < GRID_SIZE && tileCol >= 0 && tileCol < GRID_SIZE) {
      this.tryMoveTile(tileRow * GRID_SIZE + tileCol);
    }
  }

  tryMoveTile(tileIndex) {
    if (this.isSolved || this.animatingTile) return;
    const emptyIndex = this.board.indexOf(EMPTY_TILE);
    const adjacent = this.getAdjacentIndices(emptyIndex);

    if (!adjacent.includes(tileIndex)) return;
    if (!this.started) {
      this.started = true;
      window.parent.postMessage({ type: 'rescue-shuffle-start' }, '*');
    }

    if (!this.timerRunning) {
      this.startTimer();
    }

    const tileValue = this.board[tileIndex];
    const fromRow = Math.floor(tileIndex / GRID_SIZE);
    const fromCol = tileIndex % GRID_SIZE;
    const toRow = Math.floor(emptyIndex / GRID_SIZE);
    const toCol = emptyIndex % GRID_SIZE;

    this.swapTiles(tileIndex, emptyIndex);
    this.moves += 1;
    this.updateStatsUI();

    this.animatingTile = {
      value: tileValue,
      fromRow,
      fromCol,
      toRow,
      toCol,
      startTime: performance.now(),
      duration: 110
    };

    requestAnimationFrame((ts) => this.animateStep(ts));

    if (this.checkSolved()) {
      this.handleWin();
    }
  }

  animateStep(timestamp) {
    if (!this.animatingTile) {
      this.render();
      return;
    }

    const elapsed = timestamp - this.animatingTile.startTime;
    const progress = Math.min(1, elapsed / this.animatingTile.duration);
    this.animatingTile.progress = 1 - Math.pow(1 - progress, 3); // Ease-out cubic

    this.render();

    if (progress < 1) {
      requestAnimationFrame((ts) => this.animateStep(ts));
    } else {
      this.animatingTile = null;
      this.render();
    }
  }

  checkSolved() {
    for (let i = 0; i < TOTAL_TILES - 1; i++) {
      if (this.board[i] !== i + 1) return false;
    }
    return this.board[TOTAL_TILES - 1] === EMPTY_TILE;
  }

  handleWin() {
    this.isSolved = true;
    this.stopTimer();
    const pet = SHELTER_PETS[this.currentPetIndex];
    this.winTitle.textContent = pet ? `You revealed ${pet.name}!` : 'Puzzle complete!';
    this.winStats.textContent = `Solved in ${this.moves} moves (${this.formatTime(
      this.elapsedSeconds
    )})`;
    this.winTimeout = setTimeout(() => {
      this.winOverlay.classList.remove('hidden');
      this.winOverlay.inert = false;
      this.render();
    }, 150);
  }

  startTimer() {
    if (this.timerRunning) return;
    this.timerRunning = true;
    this.timerInterval = setInterval(() => {
      this.elapsedSeconds += 1;
      this.updateStatsUI();
    }, 1000);
  }

  stopTimer() {
    this.timerRunning = false;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  formatTime(totalSeconds) {
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  updateStatsUI() {
    this.moveCountEl.textContent = String(this.moves);
    this.timerDisplayEl.textContent = this.formatTime(this.elapsedSeconds);
  }

  render() {
    const ctx = this.ctx;
    const size = this.logicalSize;
    if (!size) return;

    ctx.clearRect(0, 0, size, size);

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);

    const gap = 6;
    const tileSize = (size - gap * (GRID_SIZE + 1)) / GRID_SIZE;

    for (let i = 0; i < TOTAL_TILES; i++) {
      const value = this.board[i];
      if (value === EMPTY_TILE && !this.isSolved) continue;

      const gridRow = Math.floor(i / GRID_SIZE);
      const gridCol = i % GRID_SIZE;

      let drawRow = gridRow;
      let drawCol = gridCol;

      if (this.animatingTile && this.animatingTile.value === value) {
        const p = this.animatingTile.progress ?? 1;
        drawRow = this.animatingTile.fromRow + (this.animatingTile.toRow - this.animatingTile.fromRow) * p;
        drawCol = this.animatingTile.fromCol + (this.animatingTile.toCol - this.animatingTile.fromCol) * p;
      }

      const x = gap + drawCol * (tileSize + gap);
      const y = gap + drawRow * (tileSize + gap);

      const targetIndex = value === EMPTY_TILE ? TOTAL_TILES - 1 : value - 1;
      const srcRow = Math.floor(targetIndex / GRID_SIZE);
      const srcCol = targetIndex % GRID_SIZE;

      this.drawTile(ctx, x, y, tileSize, srcRow, srcCol, value);
    }
  }

  drawTile(ctx, x, y, tileSize, srcRow, srcCol, value) {
    const radius = 10;

    ctx.save();
    this.roundRectPath(ctx, x, y, tileSize, tileSize, radius);
    ctx.clip();

    if (this.imageLoaded && this.currentPetImage) {
      const img = this.currentPetImage;
      // Center-crop square source region from the pet photo
      const minSide = Math.min(img.width, img.height);
      const offsetX = (img.width - minSide) / 2;
      const offsetY = (img.height - minSide) / 2;
      const sliceSize = minSide / GRID_SIZE;

      ctx.drawImage(
        img,
        offsetX + srcCol * sliceSize,
        offsetY + srcRow * sliceSize,
        sliceSize,
        sliceSize,
        x,
        y,
        tileSize,
        tileSize
      );
    } else {
      // Fallback tile gradient while image loads
      const grad = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize);
      grad.addColorStop(0, '#334155');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, tileSize, tileSize);
    }

    // Subtle inner border for crisp separation
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 2;
    this.roundRectPath(ctx, x + 1, y + 1, tileSize - 2, tileSize - 2, radius - 1);
    ctx.stroke();

    // Optional number badge in top-left corner
    if (this.showNumbers && value !== EMPTY_TILE && !this.isSolved) {
      const badgeSize = Math.max(22, tileSize * 0.26);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      this.roundRectPath(ctx, x + 6, y + 6, badgeSize, badgeSize, 6);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.font = `700 ${Math.round(badgeSize * 0.56)}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(value), x + 6 + badgeSize / 2, y + 6 + badgeSize / 2 + 1);
    }

    ctx.restore();
  }

  roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.rescueShuffleGame = new RescueShuffleGame();
});
