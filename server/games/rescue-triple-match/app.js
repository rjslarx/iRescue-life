"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // server/games/rescue-triple-match/src/pets.ts
  var DEFAULT_ACCENTS = ["#f59e0b", "#38bdf8", "#a855f7", "#34d399", "#fb7185", "#fbbf24"];
  var SHELTER_PETS = DEFAULT_ACCENTS.map((accentColor, index) => ({
    id: `fallback-tile-${index + 1}`,
    name: `Tile ${index + 1}`,
    imageUrl: "",
    accentColor,
    fallbackNumber: index + 1
  }));
  function resolvePetImageUrl(rawUrl) {
    const trimmed = rawUrl.trim();
    return /^(https?:\/\/|\/(?!\/))/i.test(trimmed) ? trimmed : "";
  }
  function getActivePetRoster() {
    const roster = [];
    const seen = /* @__PURE__ */ new Set();
    const injected = typeof window !== "undefined" && Array.isArray(window.INITIAL_PETS) ? window.INITIAL_PETS.slice(0, 100) : [];
    for (const item of injected) {
      if (!item || typeof item.id !== "string" || !item.id.trim() || typeof item.name !== "string" || !item.name.trim() || seen.has(item.id)) continue;
      seen.add(item.id);
      roster.push({
        id: item.id,
        name: item.name.trim(),
        imageUrl: typeof item.imageUrl === "string" ? resolvePetImageUrl(item.imageUrl) : "",
        accentColor: DEFAULT_ACCENTS[roster.length]
      });
      if (roster.length === 6) break;
    }
    for (const fallback of SHELTER_PETS) {
      if (roster.length === 6) break;
      let id = fallback.id;
      while (seen.has(id)) id = `_${id}`;
      roster.push({ ...fallback, id });
      seen.add(id);
    }
    return roster;
  }
  function updatePetNotice(roster, failedImages) {
    const notice = document.getElementById("pet-notice");
    if (!notice) return;
    const fallbackCount = roster.filter((pet) => pet.fallbackNumber !== void 0).length;
    const missingPhotos = roster.some((pet) => pet.fallbackNumber === void 0 && (!pet.imageUrl || failedImages.has(pet.id)));
    const messages = [];
    if (fallbackCount) messages.push(`${fallbackCount} numbered fallback ${fallbackCount === 1 ? "tile is" : "tiles are"} used because fewer than 6 rescue pets are available.`);
    if (missingPhotos) messages.push("Unavailable photos use named tiles.");
    notice.textContent = messages.join(" ");
    notice.hidden = messages.length === 0;
  }

  // server/games/rescue-triple-match/src/audio.ts
  var SoundEffects = class {
    constructor() {
      __publicField(this, "ctx", null);
      __publicField(this, "muted", false);
    }
    ensureContext() {
      if (this.muted) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {
        });
      }
      return this.ctx;
    }
    /**
     * Card tap / slide: Gentle wooden click sound
     */
    playWoodClick() {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(240, now + 0.045);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(1e-3, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.055);
    }
    /**
     * 3-Match clear: Harmonious 3-note upward celebration chime
     */
    playMatchChime() {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, idx) => {
        const start = now + idx * 0.075;
        const duration = 0.28;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(1e-3, start);
        gain.gain.linearRampToValueAtTime(0.22, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(1e-3, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      });
    }
    /**
     * Game Over: Low buzz sound
     */
    playGameOverBuzz() {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const tones = [
        { freq: 155, offset: 0, dur: 0.22 },
        { freq: 116.5, offset: 0.2, dur: 0.42 }
      ];
      for (const t of tones) {
        const start = now + t.offset;
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(t.freq, start);
        osc.frequency.linearRampToValueAtTime(t.freq * 0.88, start + t.dur);
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(420, start);
        gain.gain.setValueAtTime(0.18, start);
        gain.gain.exponentialRampToValueAtTime(1e-3, start + t.dur);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + t.dur + 0.02);
      }
    }
    /**
     * Level Win: Upbeat retro fanfare
     */
    playVictoryFanfare() {
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const sequence = [
        { freq: 523.25, delay: 0, dur: 0.11 },
        { freq: 659.25, delay: 0.11, dur: 0.11 },
        { freq: 783.99, delay: 0.22, dur: 0.11 },
        { freq: 1046.5, delay: 0.33, dur: 0.18 },
        { freq: 783.99, delay: 0.53, dur: 0.12 },
        { freq: 1046.5, delay: 0.67, dur: 0.48 }
      ];
      for (const note of sequence) {
        const start = now + note.delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(note.freq, start);
        gain.gain.setValueAtTime(1e-3, start);
        gain.gain.linearRampToValueAtTime(0.24, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(1e-3, start + note.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + note.dur + 0.02);
      }
    }
  };

  // server/games/rescue-triple-match/src/game.ts
  var _RescueTripleMatchGame = class _RescueTripleMatchGame {
    constructor(canvas, hooks) {
      __publicField(this, "canvas");
      __publicField(this, "ctx");
      __publicField(this, "hooks");
      __publicField(this, "audio");
      __publicField(this, "roster", []);
      __publicField(this, "tiles", []);
      __publicField(this, "dock", []);
      __publicField(this, "particles", []);
      __publicField(this, "petImages", /* @__PURE__ */ new Map());
      __publicField(this, "petImagesLoaded", /* @__PURE__ */ new Set());
      __publicField(this, "failedImages", /* @__PURE__ */ new Set());
      __publicField(this, "levelStarted", false);
      __publicField(this, "level", 1);
      __publicField(this, "matchesLeft", 12);
      __publicField(this, "shufflesLeft", 1);
      __publicField(this, "status", "playing");
      __publicField(this, "logicalWidth", 420);
      __publicField(this, "logicalHeight", 620);
      __publicField(this, "dpr", 1);
      __publicField(this, "tileWidth", _RescueTripleMatchGame.BASE_TILE_WIDTH);
      __publicField(this, "tileHeight", _RescueTripleMatchGame.BASE_TILE_HEIGHT);
      __publicField(this, "boardCenterX", 210);
      __publicField(this, "boardCenterY", 240);
      __publicField(this, "dockRect", { x: 12, y: 500, w: 396, h: 92 });
      __publicField(this, "dockSlotW", 48);
      __publicField(this, "dockSlotH", 60);
      __publicField(this, "dockSlotsX", []);
      __publicField(this, "dockSlotsY", 516);
      __publicField(this, "lastTimestamp", 0);
      __publicField(this, "hoveredTileId", null);
      __publicField(this, "pressedTileId", null);
      __publicField(this, "dockShakeTimer", 0);
      this.canvas = canvas;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Could not initialize 2D context on canvas.");
      }
      this.ctx = context;
      this.hooks = hooks;
      this.audio = new SoundEffects();
      this.refreshRosterAndImages();
      this.bindEvents();
      this.handleResize();
      this.startLevel(1);
      requestAnimationFrame((ts) => this.loop(ts));
    }
    /**
     * Loads six distinct pets/numbered fallback tiles from the injected rescue roster.
     */
    refreshRosterAndImages() {
      this.roster = getActivePetRoster();
      updatePetNotice(this.roster, this.failedImages);
      for (const pet of this.roster) {
        if (!pet.imageUrl || this.petImages.has(pet.id)) continue;
        const img = new Image();
        img.referrerPolicy = "no-referrer";
        img.onload = () => {
          this.petImagesLoaded.add(pet.id);
        };
        img.onerror = () => {
          this.petImagesLoaded.delete(pet.id);
          this.failedImages.add(pet.id);
          updatePetNotice(this.roster, this.failedImages);
        };
        img.src = resolvePetImageUrl(pet.imageUrl);
        this.petImages.set(pet.id, img);
      }
    }
    bindEvents() {
      window.addEventListener("resize", () => this.handleResize());
      window.addEventListener("RESUME_AFTER_CONTINUE", () => {
        this.resumeAfterContinue();
      });
      this.canvas.addEventListener("pointerdown", (e) => {
        if (!e.isPrimary || e.button !== 0) return;
        const pt = this.getCanvasPoint(e);
        const hit = this.getTopUnblockedTileAt(pt.x, pt.y);
        this.pressedTileId = hit ? hit.id : null;
      });
      this.canvas.addEventListener("pointermove", (e) => {
        const pt = this.getCanvasPoint(e);
        const hit = this.getTopUnblockedTileAt(pt.x, pt.y);
        this.hoveredTileId = hit ? hit.id : null;
        this.canvas.style.cursor = hit ? "pointer" : "default";
      });
      this.canvas.addEventListener("pointerup", (e) => {
        const pt = this.getCanvasPoint(e);
        const hit = this.getTopUnblockedTileAt(pt.x, pt.y);
        if (e.isPrimary && hit && this.pressedTileId === hit.id) {
          this.selectBoardTile(hit);
        }
        this.pressedTileId = null;
      });
      this.canvas.addEventListener("pointercancel", () => {
        this.pressedTileId = null;
        this.hoveredTileId = null;
      });
    }
    getCanvasPoint(e) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.logicalWidth / Math.max(1, rect.width);
      const scaleY = this.logicalHeight / Math.max(1, rect.height);
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
    handleResize() {
      const parent = this.canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : this.canvas.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 3);
      this.logicalWidth = Math.max(1, Math.floor(rect.width || 380));
      this.logicalHeight = Math.max(1, Math.floor(rect.height || 580));
      this.canvas.width = Math.floor(this.logicalWidth * this.dpr);
      this.canvas.height = Math.floor(this.logicalHeight * this.dpr);
      this.computeLayoutMetrics();
      this.syncTilePositions();
    }
    computeLayoutMetrics() {
      const preferredScale = 1.1 * Math.min(1, (this.logicalWidth - 24) / 380);
      const padX = 10;
      const dockMarginBottom = 10;
      const dockWidth = this.logicalWidth - padX * 2;
      const innerPad = 8;
      const gap = Math.max(4, Math.floor(dockWidth * 0.012));
      const maxSlotW = Math.floor(
        (dockWidth - innerPad * 2 - gap * (_RescueTripleMatchGame.MAX_DOCK_SLOTS - 1)) / _RescueTripleMatchGame.MAX_DOCK_SLOTS
      );
      this.dockSlotW = Math.min(_RescueTripleMatchGame.BASE_TILE_WIDTH * 1.1, maxSlotW);
      this.dockSlotH = Math.round(this.dockSlotW * (70 / 56));
      const dockHeight = this.dockSlotH + 26;
      const dockY = this.logicalHeight - dockHeight - dockMarginBottom;
      this.dockRect = {
        x: padX,
        y: dockY,
        w: dockWidth,
        h: dockHeight
      };
      const totalSlotsW = _RescueTripleMatchGame.MAX_DOCK_SLOTS * this.dockSlotW + (_RescueTripleMatchGame.MAX_DOCK_SLOTS - 1) * gap;
      const startSlotX = padX + Math.floor((dockWidth - totalSlotsW) / 2);
      this.dockSlotsX = [];
      for (let i = 0; i < _RescueTripleMatchGame.MAX_DOCK_SLOTS; i++) {
        this.dockSlotsX.push(startSlotX + i * (this.dockSlotW + gap));
      }
      this.dockSlotsY = dockY + Math.floor((dockHeight - this.dockSlotH) / 2) + 4;
      const playfieldTop = 12;
      const playfieldBottom = dockY - 12;
      const playfieldH = Math.max(1, playfieldBottom - playfieldTop);
      const scale = Math.max(0, Math.min(
        preferredScale,
        (this.logicalWidth - 26) / (6.34 * _RescueTripleMatchGame.BASE_TILE_WIDTH),
        (playfieldH - 2) / (3.7 * _RescueTripleMatchGame.BASE_TILE_HEIGHT)
      ));
      this.tileWidth = _RescueTripleMatchGame.BASE_TILE_WIDTH * scale;
      this.tileHeight = _RescueTripleMatchGame.BASE_TILE_HEIGHT * scale;
      this.boardCenterX = Math.floor(this.logicalWidth / 2);
      this.boardCenterY = Math.floor(playfieldTop + playfieldH * 0.5);
    }
    syncTilePositions() {
      for (const tile of this.tiles) {
        tile.width = this.tileWidth;
        tile.height = this.tileHeight;
        tile.x = Math.round(this.boardCenterX + tile.offsetX * this.tileWidth - this.tileWidth / 2);
        tile.y = Math.round(this.boardCenterY + tile.offsetY * this.tileHeight - this.tileHeight / 2);
        if (!tile.inDock && tile.phase === "board") {
          tile.renderX = tile.x;
          tile.renderY = tile.y;
          tile.renderW = tile.width;
          tile.renderH = tile.height;
        }
      }
      this.updateDockSlotTargets(true);
      this.evaluateBlockedStates();
    }
    /**
     * Section 3: Board Generation & Solvability
     * - Selects 6 unique pets from SHELTER_PETS (or override roster)
     * - Generates 36 total tiles (6 pets x 6 tiles each)
     * - Distributes across 3 discrete layers:
     *   - Layer 0 (Base): 18 tiles
     *   - Layer 1 (Mid): 12 tiles
     *   - Layer 2 (Top): 6 tiles
     * - Offsets positions in a staggered, semi-random grid pattern within playfield bounds
     */
    startLevel(levelNumber) {
      this.refreshRosterAndImages();
      this.level = Math.max(1, levelNumber);
      this.levelStarted = false;
      this.status = "playing";
      this.shufflesLeft = 1;
      this.matchesLeft = _RescueTripleMatchGame.TOTAL_TILES / 3;
      this.dock = [];
      this.particles = [];
      this.hoveredTileId = null;
      this.pressedTileId = null;
      const selectedPets = this.roster.slice(0, 6);
      const petPool = [];
      for (const pet of selectedPets) {
        for (let count = 0; count < 6; count++) {
          petPool.push(pet);
        }
      }
      for (let i = petPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [petPool[i], petPool[j]] = [petPool[j], petPool[i]];
      }
      const layerPlacements = this.generateProceduralLayerOffsets();
      this.tiles = layerPlacements.map((slot, index) => {
        const pet = petPool[index];
        const x = Math.round(this.boardCenterX + slot.offsetX * this.tileWidth - this.tileWidth / 2);
        const y = Math.round(this.boardCenterY + slot.offsetY * this.tileHeight - this.tileHeight / 2);
        return {
          id: `tile-${this.level}-${index + 1}`,
          petId: pet.id,
          pet,
          layer: slot.layer,
          x,
          y,
          width: this.tileWidth,
          height: this.tileHeight,
          inDock: false,
          offsetX: slot.offsetX,
          offsetY: slot.offsetY,
          renderX: x,
          renderY: y,
          renderW: this.tileWidth,
          renderH: this.tileHeight,
          startX: x,
          startY: y,
          targetX: x,
          targetY: y,
          scale: 1,
          alpha: 1,
          blocked: false,
          phase: "board",
          flightProgress: 0,
          matchTimer: 0,
          shuffleFlip: 0
        };
      });
      this.sortBoardTiles();
      this.syncTilePositions();
      this.notifyUI();
    }
    sortBoardTiles() {
      this.tiles.sort((a, b) => {
        if (a.layer !== b.layer) return a.layer - b.layer;
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
      });
    }
    /**
     * Generates exactly 36 staggered, semi-random grid positions across 3 layers:
     * - Layer 0 (Base): 18 tiles (6 columns x 3 rows with subtle organic jitter)
     * - Layer 1 (Mid): 12 tiles (4 columns x 3 rows staggered by half-tile offsets)
     * - Layer 2 (Top): 6 tiles (3 columns x 2 rows staggered over Layer 1)
     */
    generateProceduralLayerOffsets() {
      const placements = [];
      const jitter = () => (Math.random() - 0.5) * 0.14;
      const l0Cols = [-2.6, -1.56, -0.52, 0.52, 1.56, 2.6];
      const l0Rows = [-1.15, 0, 1.15];
      for (const r of l0Rows) {
        for (const c of l0Cols) {
          placements.push({
            layer: 0,
            offsetX: c + jitter(),
            offsetY: r + jitter()
          });
        }
      }
      const l1Cols = [-1.62, -0.54, 0.54, 1.62];
      const l1Rows = [-0.95, 0, 0.95];
      for (const r of l1Rows) {
        for (const c of l1Cols) {
          placements.push({
            layer: 1,
            offsetX: c + jitter(),
            offsetY: r + jitter()
          });
        }
      }
      const l2Cols = [-1.05, 0, 1.05];
      const l2Rows = [-0.52, 0.52];
      for (const r of l2Rows) {
        for (const c of l2Cols) {
          placements.push({
            layer: 2,
            offsetX: c + jitter(),
            offsetY: r + jitter()
          });
        }
      }
      return placements;
    }
    /**
     * Section 4: Overlap & Block Detection Algorithm
     * A tile is BLOCKED if any active board tile on a higher layer (candidate.layer > target.layer)
     * overlaps more than 15% of the target's bounding box area.
     */
    static isTileBlockedByHigherLayer(target, allTiles) {
      if (target.inDock) return false;
      for (const candidate of allTiles) {
        if (candidate.inDock || candidate.id === target.id) continue;
        if (candidate.layer <= target.layer) continue;
        const a = target;
        const b = candidate;
        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        const overlapRatio = overlapX * overlapY / (target.width * target.height);
        if (overlapRatio > 0.15) {
          return true;
        }
      }
      return false;
    }
    evaluateBlockedStates() {
      const activeBoardTiles = this.tiles.filter((t) => !t.inDock && t.phase === "board");
      for (const tile of activeBoardTiles) {
        tile.blocked = _RescueTripleMatchGame.isTileBlockedByHigherLayer(tile, activeBoardTiles);
      }
    }
    getTopUnblockedTileAt(px, py) {
      if (this.status !== "playing") return null;
      const activeDockCount = this.dock.filter((t) => t.phase !== "matching").length;
      if (activeDockCount >= _RescueTripleMatchGame.MAX_DOCK_SLOTS) {
        return null;
      }
      for (let i = this.tiles.length - 1; i >= 0; i--) {
        const tile = this.tiles[i];
        if (tile.inDock || tile.phase !== "board" || tile.blocked) continue;
        if (px >= tile.renderX && px <= tile.renderX + tile.renderW && py >= tile.renderY && py <= tile.renderY + tile.renderH) {
          return tile;
        }
      }
      return null;
    }
    /**
     * Section 5: Tapping an unblocked board tile
     * - Remove it from the board and flag inDock = true
     * - Smoothly animate the tile moving into the dock
     * - Re-evaluate and unblock newly revealed board tiles
     * - Auto-grouping: Insert the new tile adjacent to any existing tiles of the same petId
     */
    selectBoardTile(tile) {
      if (this.status !== "playing" || tile.inDock || tile.blocked || tile.phase !== "board") {
        return;
      }
      const activeDockTiles = this.dock.filter((t) => t.phase !== "matching");
      if (activeDockTiles.length >= _RescueTripleMatchGame.MAX_DOCK_SLOTS) {
        this.dockShakeTimer = 0.35;
        return;
      }
      if (!this.levelStarted) {
        this.levelStarted = true;
        window.parent.postMessage({ type: "rescue-triple-match-start", level: this.level }, "*");
      }
      this.audio.playWoodClick();
      tile.inDock = true;
      tile.phase = "flying";
      tile.flightProgress = 0;
      tile.startX = tile.renderX;
      tile.startY = tile.renderY;
      this.hoveredTileId = null;
      let insertIndex = this.dock.length;
      for (let i = this.dock.length - 1; i >= 0; i--) {
        if (this.dock[i].petId === tile.petId && this.dock[i].phase !== "matching") {
          insertIndex = i + 1;
          break;
        }
      }
      this.dock.splice(insertIndex, 0, tile);
      this.evaluateBlockedStates();
      this.updateDockSlotTargets(false);
      this.notifyUI();
    }
    updateDockSlotTargets(snapImmediately) {
      for (let i = 0; i < this.dock.length; i++) {
        const tile = this.dock[i];
        const slotX = this.dockSlotsX[Math.min(i, _RescueTripleMatchGame.MAX_DOCK_SLOTS - 1)] ?? this.dockRect.x + 12;
        const slotY = this.dockSlotsY;
        tile.targetX = slotX;
        tile.targetY = slotY;
        if (snapImmediately && tile.phase === "dock") {
          tile.renderX = slotX;
          tile.renderY = slotY;
          tile.renderW = this.dockSlotW;
          tile.renderH = this.dockSlotH;
        }
      }
    }
    /**
     * Allows 1 shuffle per game: shuffles the pet assignments of remaining board tiles.
     */
    shuffleBoard() {
      if (this.status !== "playing" || this.shufflesLeft <= 0) {
        return false;
      }
      const boardTiles = this.tiles.filter((t) => !t.inDock && t.phase === "board");
      if (boardTiles.length <= 1) {
        return false;
      }
      this.shufflesLeft -= 1;
      this.audio.playWoodClick();
      const pets = boardTiles.map((t) => t.pet);
      for (let i = pets.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pets[i], pets[j]] = [pets[j], pets[i]];
      }
      boardTiles.forEach((tile, idx) => {
        tile.pet = pets[idx];
        tile.petId = pets[idx].id;
        tile.shuffleFlip = 1;
      });
      this.spawnParticles(this.boardCenterX, this.boardCenterY, "#34d399", 16);
      this.notifyUI();
      return true;
    }
    /**
     * Section 7: Handles `RESUME_AFTER_CONTINUE` custom event by removing the last 2 tiles
     * from the dock (returning them to accessible top-layer spots on the board so all triplets remain solvable)
     * and allowing play to continue.
     */
    resumeAfterContinue() {
      const removableDockTiles = this.dock.filter(
        (t) => t.phase === "dock" || t.phase === "flying"
      );
      if (removableDockTiles.length === 0) return;
      const toReturn = removableDockTiles.slice(-2);
      toReturn.forEach((tile, idx) => {
        const dockIdx = this.dock.indexOf(tile);
        if (dockIdx !== -1) {
          this.dock.splice(dockIdx, 1);
        }
        tile.inDock = false;
        tile.phase = "board";
        tile.layer = 3;
        tile.offsetX = idx === 0 ? -0.9 : 0.9;
        tile.offsetY = -1.35;
        tile.scale = 1;
        tile.alpha = 1;
        tile.shuffleFlip = 0.8;
      });
      this.status = "playing";
      this.sortBoardTiles();
      this.syncTilePositions();
      this.updateDockSlotTargets(false);
      this.audio.playWoodClick();
      this.notifyUI();
    }
    /**
     * Section 5 & 7: Evaluates 3-of-a-kind matches in the dock, Victory, and Game Over states.
     */
    resolveDockMatchesAndOutcome() {
      const landedByPet = /* @__PURE__ */ new Map();
      for (const tile of this.dock) {
        if (tile.phase === "dock") {
          const group = landedByPet.get(tile.petId) ?? [];
          group.push(tile);
          landedByPet.set(tile.petId, group);
        }
      }
      for (const [, group] of landedByPet.entries()) {
        if (group.length >= 3) {
          const matchedTrio = group.slice(0, 3);
          this.audio.playMatchChime();
          for (const t of matchedTrio) {
            t.phase = "matching";
            t.matchTimer = 0;
            const cx = t.renderX + this.dockSlotW / 2;
            const cy = t.renderY + this.dockSlotH / 2;
            this.spawnParticles(cx, cy, "#10b981", 16);
          }
          this.matchesLeft = Math.max(0, this.matchesLeft - 1);
          this.notifyUI();
        }
      }
      const busyAnimating = this.dock.some(
        (t) => t.phase === "flying" || t.phase === "matching"
      );
      if (busyAnimating) return;
      const remainingBoardTiles = this.tiles.filter(
        (t) => !t.inDock && t.phase === "board"
      ).length;
      if (remainingBoardTiles === 0 && this.dock.length === 0) {
        if (this.status !== "won") {
          this.status = "won";
          this.audio.playVictoryFanfare();
          this.spawnParticles(
            this.logicalWidth / 2,
            this.logicalHeight * 0.36,
            "#10b981",
            42
          );
          this.notifyUI();
          window.dispatchEvent(
            new CustomEvent("STAGE_CLEARED", {
              detail: { score: 1e3, petsRescued: 6 }
            })
          );
        }
        return;
      }
      if (this.dock.length >= _RescueTripleMatchGame.MAX_DOCK_SLOTS) {
        if (this.status !== "lost") {
          this.status = "lost";
          this.dockShakeTimer = 0.45;
          this.audio.playGameOverBuzz();
          const totalRemaining = remainingBoardTiles + this.dock.length;
          this.notifyUI();
          window.dispatchEvent(
            new CustomEvent("GAME_OVER", {
              detail: {
                reason: "DOCK_FULL",
                remainingTiles: totalRemaining
              }
            })
          );
        }
      }
    }
    spawnParticles(x, y, color, count) {
      for (let i = 0; i < count; i++) {
        const angle = Math.PI * 2 * i / count + (Math.random() - 0.5) * 0.45;
        const speed = 60 + Math.random() * 135;
        this.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 35,
          size: 4 + Math.random() * 5,
          color: i % 2 === 0 ? "#34d399" : color,
          alpha: 1,
          life: 0,
          maxLife: 0.5 + Math.random() * 0.3
        });
      }
    }
    notifyUI() {
      const boardRemaining = this.tiles.filter(
        (t) => !t.inDock && t.phase === "board"
      ).length;
      const activeDockCount = this.dock.filter((t) => t.phase !== "matching").length;
      this.hooks.onStateChange({
        level: this.level,
        matchesLeft: this.matchesLeft,
        shufflesLeft: this.shufflesLeft,
        canShuffle: this.status === "playing" && this.shufflesLeft > 0 && boardRemaining > 1,
        dockCount: activeDockCount,
        remainingTiles: boardRemaining + activeDockCount,
        status: this.status
      });
    }
    loop(timestamp) {
      if (!this.lastTimestamp) this.lastTimestamp = timestamp;
      const dt = Math.min(0.05, (timestamp - this.lastTimestamp) / 1e3);
      this.lastTimestamp = timestamp;
      this.update(dt);
      this.render();
      requestAnimationFrame((ts) => this.loop(ts));
    }
    update(dt) {
      if (this.dockShakeTimer > 0) {
        this.dockShakeTimer = Math.max(0, this.dockShakeTimer - dt);
      }
      for (const tile of this.tiles) {
        if (tile.shuffleFlip > 0) {
          tile.shuffleFlip = Math.max(0, tile.shuffleFlip - dt * 3.2);
        }
      }
      let dockUpdated = false;
      let matchedRemoved = false;
      for (const tile of this.dock) {
        if (tile.phase === "flying") {
          tile.flightProgress = Math.min(1, tile.flightProgress + dt * 5);
          const t = 1 - Math.pow(1 - tile.flightProgress, 3);
          const arcY = Math.sin(tile.flightProgress * Math.PI) * -26;
          tile.renderX = tile.startX + (tile.targetX - tile.startX) * t;
          tile.renderY = tile.startY + (tile.targetY - tile.startY) * t + arcY;
          tile.renderW = this.tileWidth + (this.dockSlotW - this.tileWidth) * t;
          tile.renderH = this.tileHeight + (this.dockSlotH - this.tileHeight) * t;
          if (tile.flightProgress >= 1) {
            tile.phase = "dock";
            tile.renderX = tile.targetX;
            tile.renderY = tile.targetY;
            tile.renderW = this.dockSlotW;
            tile.renderH = this.dockSlotH;
            dockUpdated = true;
          }
        } else if (tile.phase === "dock") {
          const slideFactor = Math.min(1, dt * 16);
          tile.renderX += (tile.targetX - tile.renderX) * slideFactor;
          tile.renderY += (tile.targetY - tile.renderY) * slideFactor;
          tile.renderW = this.dockSlotW;
          tile.renderH = this.dockSlotH;
        } else if (tile.phase === "matching") {
          tile.matchTimer += dt * 3.8;
          if (tile.matchTimer < 0.45) {
            tile.scale = 1 + tile.matchTimer / 0.45 * 0.22;
          } else {
            const shrink = (tile.matchTimer - 0.45) / 0.55;
            tile.scale = Math.max(0, 1.22 * (1 - shrink));
            tile.alpha = Math.max(0, 1 - shrink);
          }
          if (tile.matchTimer >= 1) {
            tile.phase = "removed";
            matchedRemoved = true;
          }
        }
      }
      if (matchedRemoved) {
        this.dock = this.dock.filter((t) => t.phase !== "removed");
        this.updateDockSlotTargets(false);
        dockUpdated = true;
        this.notifyUI();
      }
      if (dockUpdated) {
        this.resolveDockMatchesAndOutcome();
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          this.particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 240 * dt;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);
      }
    }
    render() {
      const ctx = this.ctx;
      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
      const bgGrad = ctx.createRadialGradient(
        this.boardCenterX,
        this.boardCenterY,
        16,
        this.boardCenterX,
        this.boardCenterY,
        Math.max(this.logicalWidth, this.logicalHeight) * 0.52
      );
      bgGrad.addColorStop(0, "rgba(56, 189, 248, 0.08)");
      bgGrad.addColorStop(1, "rgba(15, 23, 42, 0)");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
      this.renderDockTray(ctx);
      for (const tile of this.tiles) {
        if (!tile.inDock && tile.phase === "board") {
          this.renderTileCard(ctx, tile, false);
        }
      }
      for (const tile of this.dock) {
        if (tile.phase === "dock" || tile.phase === "matching") {
          this.renderTileCard(ctx, tile, true);
        }
      }
      for (const tile of this.dock) {
        if (tile.phase === "flying") {
          this.renderTileCard(ctx, tile, true);
        }
      }
      this.renderParticles(ctx);
      ctx.restore();
    }
    renderDockTray(ctx) {
      const shakeX = this.dockShakeTimer > 0 ? Math.sin(this.dockShakeTimer * 50) * 5 : 0;
      ctx.save();
      ctx.translate(shakeX, 0);
      const { x, y, w, h } = this.dockRect;
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 5;
      this.roundRectPath(ctx, x, y, w, h, 16);
      const trayGrad = ctx.createLinearGradient(x, y, x, y + h);
      trayGrad.addColorStop(0, "#1e293b");
      trayGrad.addColorStop(1, "#0f172a");
      ctx.fillStyle = trayGrad;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.dock.length >= 6 ? "rgba(244, 63, 94, 0.7)" : "#334155";
      ctx.stroke();
      ctx.restore();
      const activeCount = Math.min(
        this.dock.filter((t) => t.phase !== "matching").length,
        _RescueTripleMatchGame.MAX_DOCK_SLOTS
      );
      ctx.fillStyle = "#94a3b8";
      ctx.font = '700 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(
        `RESCUE DOCK (${activeCount} / ${_RescueTripleMatchGame.MAX_DOCK_SLOTS} SLOTS)`,
        x + w / 2,
        y + 12
      );
      for (let i = 0; i < _RescueTripleMatchGame.MAX_DOCK_SLOTS; i++) {
        const sx = this.dockSlotsX[i];
        const sy = this.dockSlotsY;
        this.roundRectPath(ctx, sx, sy, this.dockSlotW, this.dockSlotH, 9);
        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        ctx.fill();
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(148, 163, 184, 0.32)";
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = "rgba(148, 163, 184, 0.16)";
        ctx.font = '700 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          `${i + 1}`,
          sx + this.dockSlotW / 2,
          sy + this.dockSlotH / 2
        );
      }
      ctx.restore();
    }
    renderTileCard(ctx, tile, inDock) {
      ctx.save();
      ctx.globalAlpha = tile.alpha;
      const isHovered = !inDock && !tile.blocked && this.hoveredTileId === tile.id;
      const isPressed = !inDock && !tile.blocked && this.pressedTileId === tile.id;
      const w = tile.renderW;
      const h = tile.renderH;
      const centerX = tile.renderX + w / 2;
      const centerY = tile.renderY + h / 2;
      let scaleX = tile.scale;
      let scaleY = tile.scale;
      if (isPressed) {
        scaleX *= 0.94;
        scaleY *= 0.94;
      } else if (isHovered) {
        scaleX *= 1.04;
        scaleY *= 1.04;
      }
      if (tile.shuffleFlip > 0) {
        scaleX *= Math.max(0.15, Math.abs(Math.cos(tile.shuffleFlip * Math.PI)));
      }
      ctx.translate(centerX, centerY);
      ctx.scale(scaleX, scaleY);
      if (tile.blocked && !inDock) {
        ctx.filter = "grayscale(30%) brightness(65%)";
      } else if (tile.phase === "matching") {
        ctx.shadowColor = "rgba(16, 185, 129, 0.95)";
        ctx.shadowBlur = 18;
      } else {
        ctx.shadowColor = tile.phase === "flying" ? "rgba(0, 0, 0, 0.55)" : "rgba(0, 0, 0, 0.36)";
        ctx.shadowBlur = tile.phase === "flying" ? 16 : 7;
        ctx.shadowOffsetY = tile.phase === "flying" ? 8 : 4;
      }
      const halfW = w / 2;
      const halfH = h / 2;
      const radius = Math.max(8, Math.floor(w * 0.16));
      const lipDepth = inDock ? 4 : 5;
      this.roundRectPath(ctx, -halfW, -halfH + lipDepth, w, h - lipDepth, radius);
      ctx.fillStyle = tile.blocked && !inDock ? "#64748b" : "#cbd5e1";
      ctx.fill();
      if (tile.phase !== "matching") {
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
      const faceH = h - lipDepth;
      this.roundRectPath(ctx, -halfW, -halfH, w, faceH, radius);
      const faceGrad = ctx.createLinearGradient(0, -halfH, 0, -halfH + faceH);
      faceGrad.addColorStop(0, "#ffffff");
      faceGrad.addColorStop(1, "#f1f5f9");
      ctx.fillStyle = faceGrad;
      ctx.fill();
      ctx.lineWidth = tile.phase === "matching" ? 2.5 : 1.5;
      ctx.strokeStyle = tile.phase === "matching" ? "#10b981" : isHovered ? tile.pet.accentColor || "#f59e0b" : "#cbd5e1";
      ctx.stroke();
      const pad = Math.max(4, Math.floor(w * 0.08));
      const labelH = Math.max(13, Math.floor(faceH * 0.23));
      const imgX = -halfW + pad;
      const imgY = -halfH + pad;
      const imgW = w - pad * 2;
      const imgH = faceH - pad * 1.5 - labelH;
      const imgRadius = Math.max(5, radius - 3);
      ctx.save();
      this.roundRectPath(ctx, imgX, imgY, imgW, imgH, imgRadius);
      ctx.fillStyle = tile.pet.accentColor || "#f59e0b";
      ctx.fill();
      ctx.clip();
      const img = this.petImages.get(tile.petId);
      if (img && this.petImagesLoaded.has(tile.petId) && img.naturalWidth > 0) {
        const scale = Math.max(imgW / img.naturalWidth, imgH / img.naturalHeight);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        const drawX = imgX + (imgW - drawW) / 2;
        const drawY = imgY + (imgH - drawH) / 2;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      } else {
        ctx.fillStyle = tile.pet.accentColor || "#f59e0b";
        ctx.fillRect(imgX, imgY, imgW, imgH);
        ctx.fillStyle = "#ffffff";
        ctx.font = `800 ${Math.floor(imgH * 0.45)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tile.pet.fallbackNumber !== void 0 ? String(tile.pet.fallbackNumber) : tile.pet.name.charAt(0), imgX + imgW / 2, imgY + imgH / 2);
      }
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#0f172a";
      ctx.font = `800 ${Math.max(9, Math.floor(w * 0.18))}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(tile.pet.name, 0, -halfH + faceH - labelH / 2 - 1);
      if (tile.blocked && !inDock) {
        ctx.filter = "none";
        this.roundRectPath(ctx, -halfW, -halfH, w, h, radius);
        ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
        ctx.fill();
      }
      if (tile.phase === "matching") {
        this.roundRectPath(ctx, -halfW, -halfH, w, h, radius);
        ctx.fillStyle = `rgba(16, 185, 129, ${Math.max(0, 0.48 - tile.matchTimer * 0.42)})`;
        ctx.fill();
      }
      ctx.restore();
    }
    renderParticles(ctx) {
      for (const p of this.particles) {
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = "#10b981";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    roundRectPath(ctx, x, y, w, h, r) {
      const radius = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.arcTo(x + w, y, x + w, y + h, radius);
      ctx.arcTo(x + w, y + h, x, y + h, radius);
      ctx.arcTo(x, y + h, x, y, radius);
      ctx.arcTo(x, y, x + w, y, radius);
      ctx.closePath();
    }
  };
  __publicField(_RescueTripleMatchGame, "TOTAL_TILES", 36);
  __publicField(_RescueTripleMatchGame, "BASE_TILE_WIDTH", 56);
  __publicField(_RescueTripleMatchGame, "BASE_TILE_HEIGHT", 70);
  __publicField(_RescueTripleMatchGame, "MAX_DOCK_SLOTS", 7);
  var RescueTripleMatchGame = _RescueTripleMatchGame;

  // server/games/rescue-triple-match/src/main.ts
  function initApp() {
    const canvas = document.getElementById("game-canvas");
    const levelEl = document.getElementById("level-indicator");
    const matchesLeftEl = document.getElementById("matches-left");
    const shuffleBtn = document.getElementById("shuffle-btn");
    const shuffleBadgeEl = document.getElementById("shuffle-count");
    const overlayEl = document.getElementById("status-overlay");
    const overlayBadgeEl = document.getElementById("overlay-badge");
    const overlayTitleEl = document.getElementById("overlay-title");
    const overlayMessageEl = document.getElementById("overlay-message");
    const overlayActionBtn = document.getElementById("overlay-action-btn");
    const overlayContinueBtn = document.getElementById("overlay-continue-btn");
    if (!canvas) {
      throw new Error("Missing #game-canvas element.");
    }
    let currentLevel = 1;
    let lastStatus = "playing";
    const headerEl = document.querySelector(".game-header");
    const setOverlayVisible = (visible) => {
      overlayEl?.classList.toggle("hidden", !visible);
      if (overlayEl) overlayEl.inert = !visible;
      if (headerEl) headerEl.inert = visible;
      canvas.inert = visible;
      if (visible) overlayActionBtn?.focus();
      else if (overlayEl?.contains(document.activeElement)) canvas.focus();
    };
    setOverlayVisible(false);
    overlayEl?.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const buttons = [overlayContinueBtn, overlayActionBtn].filter(
        (button) => !!button && !button.classList.contains("hidden") && !button.disabled
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
          if (state.status === "won") {
            if (overlayBadgeEl) {
              overlayBadgeEl.textContent = "Stage Cleared!";
              overlayBadgeEl.className = "status-badge win";
            }
            if (overlayTitleEl) {
              overlayTitleEl.textContent = "All 6 Pets Rescued!";
            }
            if (overlayMessageEl) {
              overlayMessageEl.textContent = "Score: 1000 \u2022 All 36 shelter pet tiles matched!";
            }
            if (overlayActionBtn) {
              overlayActionBtn.textContent = `Play Level ${state.level + 1}`;
            }
            overlayContinueBtn?.classList.add("hidden");
            setOverlayVisible(true);
          } else if (state.status === "lost") {
            if (overlayBadgeEl) {
              overlayBadgeEl.textContent = "Dock Full (7/7)";
              overlayBadgeEl.className = "status-badge lose";
            }
            if (overlayTitleEl) {
              overlayTitleEl.textContent = "Game Over";
            }
            if (overlayMessageEl) {
              overlayMessageEl.textContent = `7 dock slots filled with ${state.remainingTiles} tiles remaining.`;
            }
            if (overlayActionBtn) {
              overlayActionBtn.textContent = "Restart Level";
            }
            overlayContinueBtn?.classList.remove("hidden");
            setOverlayVisible(true);
          } else {
            setOverlayVisible(false);
          }
        }
      }
    });
    shuffleBtn?.addEventListener("click", () => {
      game.shuffleBoard();
    });
    overlayActionBtn?.addEventListener("click", () => {
      setOverlayVisible(false);
      if (lastStatus === "won") {
        lastStatus = "playing";
        game.startLevel(currentLevel + 1);
      } else {
        lastStatus = "playing";
        game.startLevel(currentLevel);
      }
    });
    overlayContinueBtn?.addEventListener("click", () => {
      window.dispatchEvent(new CustomEvent("RESUME_AFTER_CONTINUE"));
    });
    window.rescueTripleMatchGame = game;
    window.parent.postMessage({ type: "rescue-triple-match-ready" }, "*");
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
