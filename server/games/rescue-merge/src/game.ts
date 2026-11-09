import { DEFAULT_TIERS, resolveAnimalTiers } from './tiers.js';
import type { ShelterAnimalTier } from './tiers.js';
import { RetroAudioEngine } from './audio.js';

declare const Phaser: any;

export interface PetMatterBody {
  id: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  angle: number;
  tier?: number;
  isMerged?: boolean;
  spawnedAtMs?: number;
  hasCollided?: boolean;
  aboveLineMs?: number;
  petEntry?: ActivePetInstance;
}

export interface ActivePetInstance {
  body: PetMatterBody;
  sprite: any;
  tierData: ShelterAnimalTier;
  spawnedAtMs: number;
  aboveLineMs: number;
  hasCollided: boolean;
}

export interface RescueMergeGameOverDetail {
  score: number;
  highestTierUnlocked: number;
  durationSeconds: number;
}

const GAME_WIDTH = 450;
const GAME_HEIGHT = 800;

const PLAYPEN_LEFT = 18;
const PLAYPEN_RIGHT = 432;
const PLAYPEN_BOTTOM = 774;
const DANGER_LINE_Y = 180;
const DROPPER_Y = 128;

const DROP_COOLDOWN_MS = 500;
const OVERFLOW_LIMIT_MS = 2500;
const DROP_ENTRY_GRACE_MS = 400;

export class RescueMergeScene extends Phaser.Scene {
  private tiers: ShelterAnimalTier[] = DEFAULT_TIERS;
  private audio: RetroAudioEngine;
  private activePets: ActivePetInstance[] = [];

  private score = 0;
  private bestScore = 0;
  private maxTierReached = 1;
  private roundStartTimeMs = 0;
  private isGameOver = false;
  private playable = false;
  private roundStarted = false;
  private roundNumber = 0;

  // Spawner & controls state
  private currentDropTier = 1;
  private nextDropTier = 2;
  private dropperX = GAME_WIDTH / 2;
  private isCoolingDown = false;
  private lastDropTimeMs = 0;
  private isDragging = false;

  // Visual objects
  private hudScoreText: any;
  private hudBestText: any;
  private nextPetPreviewSprite: any;
  private nextPetNameText: any;
  private dropperPreviewSprite: any;
  private dropperRingGraphics: any;
  private guideLineGraphics: any;
  private dangerLineGraphics: any;
  private dangerZoneBanner: any;
  private dangerBannerText: any;
  private dangerTimerBarGraphics: any;
  private dangerPulseTweenAge = 0;
  private isInDanger = false;

  // Game Over Modal elements (in-canvas + synced DOM overlay if present)
  private gameOverContainer: any;
  private restartHandler: (() => void) | null = null;

  constructor() {
    super({ key: 'RescueMergeScene' });
    this.audio = new RetroAudioEngine();
  }

  public preload(): void {
    this.tiers = resolveAnimalTiers();
  }

  public async create(): Promise<void> {
    // Ensure multi-touch support with 2 active pointers
    if (this.input) {
      this.input.addPointer(1);
    }

    // Phaser's default touch handler prevents browser zoom; let the browser
    // handle pinch gestures while retaining single-pointer drag/drop.
    if (this.input?.manager?.touch) this.input.manager.touch.capture = false;
    if (this.game && this.game.canvas) {
      this.game.canvas.style.touchAction = 'pinch-zoom';
      if (this.game.canvas.parentElement) {
        this.game.canvas.parentElement.style.touchAction = 'pinch-zoom';
      }
    }

    await this.loadPetPhotos();
    if (!this.sys.isActive()) return;
    this.generateCircularAnimalTextures();
    this.createStarParticleTexture();

    this.drawPlaypenBackdrop();
    this.createPlaypenWalls();
    this.createTopHud();
    this.createDangerLineAndWarning();
    this.createSpawnerVisuals();
    this.setupDropControls();
    this.setupCollisionHandling();
    this.setupExternalEvents();

    this.startNewRound();
    this.playable = true;
    const restart = document.getElementById('restart-btn') as HTMLButtonElement | null;
    if (restart) restart.disabled = false;
    window.parent.postMessage({ type: 'rescue-merge-ready' }, '*');
  }

  private async loadPetPhotos(): Promise<void> {
    let fallbackCount = 0;
    await Promise.all(this.tiers.map((tier) => new Promise<void>((resolve) => {
      if (!tier.imageUrl) { fallbackCount++; resolve(); return; }
      // An opaque sandbox cannot use anonymous CORS or Phaser's XHR loader.
      // Canvas rendering supports these tainted image sources without readback.
      const image = new Image();
      image.referrerPolicy = 'no-referrer';
      let settled = false;
      const finish = (loaded: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        if (loaded && image.naturalWidth && this.sys.isActive()) {
          this.textures.addImage(`raw_pet_tier_${tier.tier}`, image);
        } else fallbackCount++;
        resolve();
      };
      const timeout = window.setTimeout(() => finish(false), 7000);
      image.onload = () => finish(true);
      image.onerror = () => finish(false);
      image.src = tier.imageUrl;
    })));
    const notice = document.getElementById('photo-notice');
    if (notice) {
      notice.hidden = fallbackCount === 0;
      notice.textContent = fallbackCount
        ? `${fallbackCount} of 6 photos unavailable or not supplied. Numbered bubbles fill those spots.`
        : '';
    }
  }

  /**
   * 3. Dynamic Image Texture Generation:
   * - Draw each animal image into an offscreen circular canvas masked by ctx.arc().
   * - Draw a 4px solid border around the circle using the tier's borderColor.
   * - Register the resulting canvas as a dynamic Phaser texture (pet_tier_1 through pet_tier_6).
   */
  private generateCircularAnimalTextures(): void {
    for (const tier of this.tiers) {
      const textureKey = `pet_tier_${tier.tier}`;
      const rawKey = `raw_pet_tier_${tier.tier}`;

      if (this.textures.exists(textureKey)) {
        this.textures.remove(textureKey);
      }

      const diameter = tier.radius * 2;
      const offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = diameter;
      offscreenCanvas.height = diameter;

      const ctx = offscreenCanvas.getContext('2d');
      if (!ctx) continue;

      const center = tier.radius;
      const clipRadius = Math.max(4, tier.radius - 2);

      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, clipRadius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Background fill inside circle
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, diameter, diameter);

      const hasLoadedRaw =
        this.textures.exists(rawKey) &&
        this.textures.get(rawKey).key !== '__MISSING';

      if (hasLoadedRaw) {
        const sourceImage = this.textures.get(rawKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        if (sourceImage && sourceImage.width > 0 && sourceImage.height > 0) {
          // Heuristic only, not face detection: zoom cover 1.4x and favor the
          // upper-center of the photo where heads often sit. Clamp to avoid empty edges.
          const scale = Math.max(diameter / sourceImage.width, diameter / sourceImage.height) * 1.4;
          const drawW = sourceImage.width * scale;
          const drawH = sourceImage.height * scale;
          const drawX = Math.max(diameter - drawW, Math.min(0, center - drawW * 0.5));
          const drawY = Math.max(diameter - drawH, Math.min(0, center - drawH * 0.38));
          ctx.drawImage(sourceImage, drawX, drawY, drawW, drawH);
        } else {
          this.drawProceduralAnimalFallback(ctx, tier, diameter);
        }
      } else {
        this.drawProceduralAnimalFallback(ctx, tier, diameter);
      }

      // A small glossy reflection, not a filter or recoloring of the photo.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.32)';
      ctx.beginPath();
      ctx.ellipse(center * 0.76, center * 0.43, center * 0.42, center * 0.15, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Draw a 4px solid border around the circle using the tier's borderColor
      ctx.save();
      ctx.beginPath();
      ctx.arc(center, center, tier.radius - 2, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = tier.borderColor;
      ctx.stroke();
      ctx.restore();

      // Register the resulting canvas as a dynamic Phaser texture (pet_tier_1 .. pet_tier_6)
      // addCanvas creates a CanvasTexture whose pixel cache reads image data.
      // A regular Texture accepts a canvas source without reading tainted pixels.
      this.textures.addImage(textureKey, offscreenCanvas);
    }
  }

  /**
   * Explicit numbered bubbles never impersonate a real rescue animal.
   */
  private drawProceduralAnimalFallback(
    ctx: CanvasRenderingContext2D,
    tier: ShelterAnimalTier,
    diameter: number
  ): void {
    const cx = diameter / 2;
    const cy = diameter / 2;
    const r = diameter / 2;

    // Warm backdrop tinted by borderColor
    ctx.fillStyle = tier.borderColor + '33';
    ctx.fillRect(0, 0, diameter, diameter);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = `bold ${Math.max(16, Math.round(r * 0.7))}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(tier.tier), cx, cy);
  }

  /**
   * Generates a circular star particle texture for merge bursts.
   */
  private createStarParticleTexture(): void {
    if (this.textures.exists('merge_star_particle')) return;

    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cx = size / 2;
    const cy = size / 2;

    // Circular glowing badge with a 4-point star inside
    const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, cx);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#fde047');
    grad.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, cx, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const rad = i % 2 === 0 ? 8 : 3.2;
      const angle = (i * Math.PI) / 4;
      const px = cx + Math.cos(angle) * rad;
      const py = cy + Math.sin(angle) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    this.textures.addCanvas('merge_star_particle', canvas);
  }

  /**
   * Draws the cozy shelter playpen environment and tier evolution bar.
   */
  private drawPlaypenBackdrop(): void {
    const bg = this.add.graphics();

    // Deep warm night-shelter gradient sky
    bg.fillStyle(0x131c31, 1);
    bg.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Playpen interior container box (from Y = 180 down to PLAYPEN_BOTTOM)
    bg.fillStyle(0x0f172a, 0.72);
    bg.fillRoundedRect(
      PLAYPEN_LEFT - 4,
      104,
      PLAYPEN_RIGHT - PLAYPEN_LEFT + 8,
      PLAYPEN_BOTTOM - 100,
      16
    );

    // Soft padded floor highlight
    bg.fillStyle(0x334155, 0.55);
    bg.fillRoundedRect(PLAYPEN_LEFT, PLAYPEN_BOTTOM - 8, PLAYPEN_RIGHT - PLAYPEN_LEFT, 12, 6);

    // Left, right, and bottom playpen frame borders (top left open)
    bg.lineStyle(5, 0x475569, 0.95);
    bg.beginPath();
    bg.moveTo(PLAYPEN_LEFT - 2, DANGER_LINE_Y - 38);
    bg.lineTo(PLAYPEN_LEFT - 2, PLAYPEN_BOTTOM + 2);
    bg.lineTo(PLAYPEN_RIGHT + 2, PLAYPEN_BOTTOM + 2);
    bg.lineTo(PLAYPEN_RIGHT + 2, DANGER_LINE_Y - 38);
    bg.strokePath();

    // Bottom evolution legend strip (y = 778..798)
    this.add
      .text(
        GAME_WIDTH / 2,
        788,
        'MERGE TWO MATCHING BUBBLES • SIX TIERS • KEEP BELOW THE LINE',
        {
          fontFamily: '"Trebuchet MS", "Segoe UI", system-ui, sans-serif',
          fontSize: '10.5px',
          fontStyle: 'bold',
          color: '#94a3b8',
          letterSpacing: 0.5
        }
      )
      .setOrigin(0.5, 0.5);
  }

  /**
   * 2. Container: Create static Matter wall bodies on the left, right, and bottom
   * borders of the lower playfield (leaving the top open).
   */
  private createPlaypenWalls(): void {
    const wallThickness = 48;
    const playfieldHeight = PLAYPEN_BOTTOM - 80;
    const centerY = 80 + playfieldHeight / 2;

    // Left wall
    this.matter.add.rectangle(
      PLAYPEN_LEFT - wallThickness / 2,
      centerY,
      wallThickness,
      playfieldHeight + 120,
      {
        isStatic: true,
        friction: 0.08,
        restitution: 0.2,
        label: 'wall_left'
      }
    );

    // Right wall
    this.matter.add.rectangle(
      PLAYPEN_RIGHT + wallThickness / 2,
      centerY,
      wallThickness,
      playfieldHeight + 120,
      {
        isStatic: true,
        friction: 0.08,
        restitution: 0.2,
        label: 'wall_right'
      }
    );

    // Bottom wall (floor)
    this.matter.add.rectangle(
      GAME_WIDTH / 2,
      PLAYPEN_BOTTOM + wallThickness / 2,
      GAME_WIDTH + wallThickness * 2,
      wallThickness,
      {
        isStatic: true,
        friction: 0.15,
        restitution: 0.15,
        label: 'wall_bottom'
      }
    );
  }

  /**
   * 4. Top HUD shows:
   * - Current Score and Best Score.
   * - "Next Pet" circular thumbnail preview in the top-right corner.
   */
  private createTopHud(): void {
    const hudGraphics = this.add.graphics();
    hudGraphics.setDepth(20);

    // Score card (top-left)
    hudGraphics.fillStyle(0x1e293b, 0.92);
    hudGraphics.lineStyle(1.5, 0x334155, 1);
    hudGraphics.fillRoundedRect(16, 12, 134, 72, 14);
    hudGraphics.strokeRoundedRect(16, 12, 134, 72, 14);

    // Best Score card (top-center)
    hudGraphics.fillStyle(0x1e293b, 0.92);
    hudGraphics.fillRoundedRect(158, 12, 134, 72, 14);
    hudGraphics.strokeRoundedRect(158, 12, 134, 72, 14);

    // Next Pet card (top-right corner)
    hudGraphics.fillStyle(0x1e293b, 0.92);
    hudGraphics.fillRoundedRect(300, 12, 134, 72, 14);
    hudGraphics.strokeRoundedRect(300, 12, 134, 72, 14);

    // Score labels
    this.add
      .text(83, 28, 'SCORE', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#94a3b8'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(21);

    this.hudScoreText = this.add
      .text(83, 56, '0', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#f8fafc'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(21);

    // Best Score labels
    this.add
      .text(225, 28, 'BEST', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#fbbf24'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(21);

    this.hudBestText = this.add
      .text(225, 56, String(this.bestScore), {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '24px',
        fontStyle: 'bold',
        color: '#fef08a'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(21);

    // Next Pet labels & circular thumbnail preview in top-right corner
    this.add
      .text(344, 34, 'NEXT PET', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '10px',
        fontStyle: 'bold',
        color: '#94a3b8'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(21);

    this.nextPetNameText = this.add
      .text(344, 54, '', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#e2e8f0'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(21);

    this.nextPetPreviewSprite = this.add
      .image(404, 48, 'pet_tier_1')
      .setDepth(22);
    this.nextPetPreviewSprite.setDisplaySize(44, 44);
  }

  /**
   * 2. Top limit & Overflow Condition:
   * - Draw a semi-transparent dashed red line across the container at Y = 180px.
   * - Subtle pulsating red warning indicator when a pet enters the danger zone.
   */
  private createDangerLineAndWarning(): void {
    this.dangerLineGraphics = this.add.graphics();
    this.dangerLineGraphics.setDepth(15);
    this.drawDashedDangerLine(0.55, 2);

    this.dangerZoneBanner = this.add.graphics();
    this.dangerZoneBanner.setDepth(14);
    this.dangerZoneBanner.setAlpha(0);

    // Soft red danger zone glow band around Y = 180
    this.dangerZoneBanner.fillStyle(0xef4444, 0.22);
    this.dangerZoneBanner.fillRect(PLAYPEN_LEFT, DANGER_LINE_Y - 34, PLAYPEN_RIGHT - PLAYPEN_LEFT, 34);

    // Pill indicator on the danger line
    this.dangerZoneBanner.fillStyle(0xdc2626, 0.92);
    this.dangerZoneBanner.fillRoundedRect(GAME_WIDTH / 2 - 78, DANGER_LINE_Y - 24, 156, 20, 10);

    this.dangerBannerText = this.add
      .text(GAME_WIDTH / 2, DANGER_LINE_Y - 14, 'DANGER ZONE', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#ffffff'
      })
      .setOrigin(0.5, 0.5)
      .setDepth(16)
      .setAlpha(0);

    this.dangerTimerBarGraphics = this.add.graphics();
    this.dangerTimerBarGraphics.setDepth(17);
  }

  private drawDashedDangerLine(alpha: number, thickness: number): void {
    if (!this.dangerLineGraphics) return;
    this.dangerLineGraphics.clear();
    this.dangerLineGraphics.lineStyle(thickness, 0xf87171, alpha);

    const dashLength = 10;
    const gapLength = 7;
    for (let x = PLAYPEN_LEFT; x < PLAYPEN_RIGHT; x += dashLength + gapLength) {
      const endX = Math.min(x + dashLength, PLAYPEN_RIGHT);
      this.dangerLineGraphics.beginPath();
      this.dangerLineGraphics.moveTo(x, DANGER_LINE_Y);
      this.dangerLineGraphics.lineTo(endX, DANGER_LINE_Y);
      this.dangerLineGraphics.strokePath();
    }
  }

  /**
   * Creates the top dropper preview and subtle vertical dashed guide line.
   */
  private createSpawnerVisuals(): void {
    this.guideLineGraphics = this.add.graphics();
    this.guideLineGraphics.setDepth(8);

    this.dropperRingGraphics = this.add.graphics();
    this.dropperRingGraphics.setDepth(18);

    this.dropperPreviewSprite = this.add
      .image(this.dropperX, DROPPER_Y, 'pet_tier_1')
      .setDepth(19);

    this.updateSpawnerVisuals();
  }

  private updateSpawnerVisuals(): void {
    const tierData = this.getTierData(this.currentDropTier);
    const nextTierData = this.getTierData(this.nextDropTier);

    // Clamp dropperX so current pet circle fits inside playpen walls
    this.dropperX = Phaser.Math.Clamp(
      this.dropperX,
      PLAYPEN_LEFT + tierData.radius + 2,
      PLAYPEN_RIGHT - tierData.radius - 2
    );

    // Update dropper sprite
    if (this.dropperPreviewSprite) {
      this.dropperPreviewSprite.setTexture(`pet_tier_${tierData.tier}`);
      this.dropperPreviewSprite.setDisplaySize(tierData.radius * 2, tierData.radius * 2);
      this.dropperPreviewSprite.setPosition(this.dropperX, DROPPER_Y);
      this.dropperPreviewSprite.setAlpha(this.isCoolingDown || this.isGameOver ? 0.35 : 1);
    }

    // Update Next Pet HUD thumbnail
    if (this.nextPetPreviewSprite) {
      this.nextPetPreviewSprite.setTexture(`pet_tier_${nextTierData.tier}`);
      this.nextPetPreviewSprite.setDisplaySize(44, 44);
    }
    if (this.nextPetNameText) {
      this.nextPetNameText.setText(nextTierData.name);
      this.nextPetNameText.setColor(nextTierData.borderColor);
    }

    // Draw subtle vertical dashed guide line projecting down from the spawner
    if (this.guideLineGraphics) {
      this.guideLineGraphics.clear();
      if (!this.isGameOver) {
        const lineAlpha = this.isCoolingDown ? 0.14 : 0.35;
        this.guideLineGraphics.lineStyle(2, 0xe2e8f0, lineAlpha);

        const startY = DROPPER_Y + tierData.radius + 4;
        const endY = PLAYPEN_BOTTOM - 4;
        const dash = 8;
        const gap = 8;
        for (let y = startY; y < endY; y += dash + gap) {
          this.guideLineGraphics.beginPath();
          this.guideLineGraphics.moveTo(this.dropperX, y);
          this.guideLineGraphics.lineTo(this.dropperX, Math.min(y + dash, endY));
          this.guideLineGraphics.strokePath();
        }
      }
    }

    if (this.dropperRingGraphics) {
      this.dropperRingGraphics.clear();
      if (!this.isGameOver && !this.isCoolingDown) {
        this.dropperRingGraphics.lineStyle(1.5, 0xffffff, 0.3);
        this.dropperRingGraphics.strokeCircle(this.dropperX, DROPPER_Y, tierData.radius + 4);
      }
    }
  }

  /**
   * 4. Control Mechanics:
   * - Player touches and drags horizontally along the top drop zone to position the dropper.
   * - Releasing touch (or tapping) drops the animal.
   * - Add a 0.5-second cooldown before the next drop can occur.
   */
  private setupDropControls(): void {
    const updateDropperFromPointer = (pointer: { x: number; y: number }) => {
      if (!this.playable || this.isGameOver) return;
      const tierData = this.getTierData(this.currentDropTier);
      this.dropperX = Phaser.Math.Clamp(
        pointer.x,
        PLAYPEN_LEFT + tierData.radius + 2,
        PLAYPEN_RIGHT - tierData.radius - 2
      );
      this.updateSpawnerVisuals();
    };

    this.input.on('pointerdown', (pointer: { x: number; y: number }) => {
      if (this.isGameOver) return;
      if (this.input.manager.pointers.filter((entry: { isDown: boolean }) => entry.isDown).length > 1) {
        this.isDragging = false;
        return;
      }
      this.isDragging = true;
      updateDropperFromPointer(pointer);
    });

    this.input.on('pointermove', (pointer: { x: number; y: number; isDown?: boolean }) => {
      if (this.isGameOver) return;
      if (this.input.manager.pointers.filter((entry: { isDown: boolean }) => entry.isDown).length > 1) {
        this.isDragging = false;
        return;
      }
      if (this.isDragging || pointer.isDown) {
        updateDropperFromPointer(pointer);
      } else {
        // Also allow hover guide alignment on desktop pointers
        updateDropperFromPointer(pointer);
      }
    });

    this.input.on('pointerup', (pointer: { x: number; y: number }) => {
      if (this.isGameOver) return;
      if (!this.isDragging) return;
      this.isDragging = false;
      updateDropperFromPointer(pointer);
      this.attemptDropPet();
    });
  }

  private pickRandomSpawnerTier(): number {
    // Spawns only lower-tier pets (randomly chooses Tier 1, 2, or 3)
    const choices = [1, 2, 3];
    const index = Math.floor(Math.random() * choices.length);
    return choices[index];
  }

  public attemptDropPet(): void {
    if (!this.playable || this.isGameOver || this.isCoolingDown) return;

    const now = this.time.now;
    if (now - this.lastDropTimeMs < DROP_COOLDOWN_MS) return;

    this.lastDropTimeMs = now;
    this.isCoolingDown = true;

    const droppedTier = this.currentDropTier;
    const dropX = this.dropperX;

    // Play low frequency short pulse drop thud
    this.audio.playDropThud();

    // Spawn the Matter circular body at the dropper coordinates
    this.spawnPetBody(dropX, DROPPER_Y, droppedTier, false);
    if (!this.roundStarted) {
      this.roundStarted = true;
      this.roundStartTimeMs = now;
      window.parent.postMessage({ type: 'rescue-merge-start' }, '*');
    }

    // Advance spawner queue
    this.currentDropTier = this.nextDropTier;
    this.nextDropTier = this.pickRandomSpawnerTier();
    this.updateSpawnerVisuals();

    // 0.5-second cooldown before the next drop can occur
    const roundNumber = this.roundNumber;
    this.time.delayedCall(DROP_COOLDOWN_MS, () => {
      if (this.roundNumber !== roundNumber) return;
      this.isCoolingDown = false;
      this.updateSpawnerVisuals();
    });
  }

  /**
   * 5. Matter.js Body Setup:
   * - Use circular Matter bodies: matter.add.circle(x, y, radius, { restitution: 0.25, friction: 0.1, density: 0.002 })
   * - Attach custom properties to the body: body.tier = currentTier and body.isMerged = false.
   */
  private spawnPetBody(
    x: number,
    y: number,
    tierNumber: number,
    fromMerge: boolean
  ): ActivePetInstance {
    const tierData = this.getTierData(tierNumber);
    const clampedX = Phaser.Math.Clamp(
      x,
      PLAYPEN_LEFT + tierData.radius + 1,
      PLAYPEN_RIGHT - tierData.radius - 1
    );
    const clampedY = Math.min(y, PLAYPEN_BOTTOM - tierData.radius - 1);

    const body = this.matter.add.circle(clampedX, clampedY, tierData.radius, {
      restitution: 0.25,
      friction: 0.1,
      density: 0.002,
      label: `pet_tier_${tierData.tier}`
    }) as PetMatterBody;

    // Attach required custom properties directly onto the Matter body
    body.tier = tierData.tier;
    body.isMerged = false;
    body.spawnedAtMs = this.time.now;
    body.hasCollided = fromMerge;
    body.aboveLineMs = 0;

    // Create matching circular avatar sprite
    const sprite = this.add
      .image(clampedX, clampedY, `pet_tier_${tierData.tier}`)
      .setDepth(10);
    sprite.setDisplaySize(tierData.radius * 2, tierData.radius * 2);

    if (fromMerge) {
      // Pop-in scale bounce animation on merge creation
      sprite.setScale(0.2);
      this.tweens.add({
        targets: sprite,
        scaleX: 1,
        scaleY: 1,
        duration: 190,
        ease: 'Back.easeOut'
      });
    }

    const instance: ActivePetInstance = {
      body,
      sprite,
      tierData,
      spawnedAtMs: this.time.now,
      aboveLineMs: 0,
      hasCollided: fromMerge
    };
    body.petEntry = instance;

    this.activePets.push(instance);

    if (tierData.tier > this.maxTierReached) {
      this.maxTierReached = tierData.tier;
    }

    return instance;
  }

  /**
   * 5. Collision handling via matter.world.on('collisionstart', ...):
   * - Check if bodyA.tier === bodyB.tier AND neither body has isMerged === true.
   * - Check if bodyA.tier < 6 (Tier 6 is max tier, cannot merge further).
   * - Immediately set bodyA.isMerged = true and bodyB.isMerged = true to prevent duplicate merge triggers in the same physics tick.
   * - Calculate collision midpoint: midX = (bodyA.position.x + bodyB.position.x) / 2, midY = (bodyA.position.y + bodyB.position.y) / 2.
   * - Destroy both existing bodies.
   * - Spawn next tier body (tier + 1) at (midX, midY).
   * - Play an 8-bit procedural pop sound and emit a small burst of circular star particles.
   * - Add tier points to the total score.
   */
  private setupCollisionHandling(): void {
    this.matter.world.on('collisionstart', (event: { pairs: Array<{ bodyA: PetMatterBody; bodyB: PetMatterBody }> }) => {
      if (this.isGameOver || !event || !event.pairs) return;

      for (const pair of event.pairs) {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        if (!bodyA || !bodyB) continue;

        // Mark that colliding pets have touched something inside the playpen
        if (bodyA.petEntry) bodyA.petEntry.hasCollided = true;
        if (bodyB.petEntry) bodyB.petEntry.hasCollided = true;

        const tierA = bodyA.tier;
        const tierB = bodyB.tier;

        if (
          typeof tierA === 'number' &&
          typeof tierB === 'number' &&
          tierA === tierB &&
          bodyA.isMerged !== true &&
          bodyB.isMerged !== true &&
          tierA < 6
        ) {
          // Immediately set isMerged = true on both bodies to prevent duplicate merges in the same tick
          bodyA.isMerged = true;
          bodyB.isMerged = true;

          const midX = (bodyA.position.x + bodyB.position.x) / 2;
          const midY = (bodyA.position.y + bodyB.position.y) / 2;
          const nextTier = tierA + 1;

          // Destroy both existing bodies and their sprites
          this.destroyPetBody(bodyA);
          this.destroyPetBody(bodyB);

          // Spawn next tier body (tier + 1) at (midX, midY)
          const mergedPet = this.spawnPetBody(midX, midY, nextTier, true);

          // Play 8-bit procedural pop sound (and triumphant chime if Tier 6 Mustang reached)
          this.audio.playMergePop(nextTier);
          if (nextTier === 6) {
            this.audio.playMaxTierChime();
          }

          // Emit a small burst of circular star particles
          this.emitMergeStarBurst(midX, midY, mergedPet.tierData);

          // Add tier points to the total score
          this.addScore(mergedPet.tierData.points, midX, midY, mergedPet.tierData.borderColor);
        }
      }
    });
  }

  private destroyPetBody(body: PetMatterBody): void {
    const index = this.activePets.findIndex((item) => item.body === body);
    if (index !== -1) {
      const [removed] = this.activePets.splice(index, 1);
      if (removed.sprite) {
        removed.sprite.destroy();
      }
    }
    this.matter.world.remove(body);
  }

  /**
   * Emits a radial burst of circular star particles at the merge point.
   */
  private emitMergeStarBurst(x: number, y: number, tierData: ShelterAnimalTier): void {
    const count = 12 + tierData.tier * 2;
    const colorInt = Phaser.Display.Color.HexStringToColor(tierData.borderColor).color;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.25;
      const dist = tierData.radius * 0.65 + Math.random() * 38;
      const particle = this.add
        .image(x, y, 'merge_star_particle')
        .setDepth(25)
        .setScale(0.55 + Math.random() * 0.45);

      if (i % 2 === 0) {
        particle.setTint(colorInt);
      }

      this.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        scaleX: 0.05,
        scaleY: 0.05,
        alpha: 0,
        rotation: (Math.random() - 0.5) * 3,
        duration: 360 + Math.random() * 180,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          particle.destroy();
        }
      });
    }
  }

  private addScore(points: number, x: number, y: number, hexColor: string): void {
    this.score += points;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
    }

    if (this.hudScoreText) {
      this.hudScoreText.setText(String(this.score));
    }
    if (this.hudBestText) {
      this.hudBestText.setText(String(this.bestScore));
    }

    // Floating score popup at merge midpoint
    const popup = this.add
      .text(x, y - 10, `+${points}`, {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: hexColor,
        stroke: '#0f172a',
        strokeThickness: 4
      })
      .setOrigin(0.5, 0.5)
      .setDepth(26);

    this.tweens.add({
      targets: popup,
      y: y - 48,
      alpha: 0,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy()
    });
  }

  /**
   * Frame update loop:
   * - Syncs circular avatar sprites with Matter.js bodies (position & rotational tumble).
   * - Evaluates overflow condition above Y = 180px for > 2.5 consecutive seconds.
   * - Updates pulsating red danger indicator and danger line ticking sound.
   */
  public update(time: number, delta: number): void {
    if (!this.playable) return;
    // Sync all active pet sprites to their Matter bodies
    let highestAboveLineMs = 0;
    let anyPetInDangerZone = false;

    for (const pet of this.activePets) {
      if (!pet.body || !pet.sprite) continue;

      pet.sprite.setPosition(pet.body.position.x, pet.body.position.y);
      pet.sprite.setRotation(pet.body.angle);

      if (this.isGameOver) continue;

      const aliveMs = time - pet.spawnedAtMs;
      const eligibleForOverflowCheck = pet.hasCollided || aliveMs > DROP_ENTRY_GRACE_MS;

      // Check if pet circle's center is above the red danger line (Y = 180px)
      if (eligibleForOverflowCheck && pet.body.position.y < DANGER_LINE_Y) {
        pet.aboveLineMs += delta;
        anyPetInDangerZone = true;
        if (pet.aboveLineMs > highestAboveLineMs) {
          highestAboveLineMs = pet.aboveLineMs;
        }
      } else {
        pet.aboveLineMs = 0;
      }
    }

    if (this.isGameOver) return;

    this.updateDangerState(anyPetInDangerZone, highestAboveLineMs, delta);

    if (highestAboveLineMs >= OVERFLOW_LIMIT_MS) {
      this.triggerGameOver();
    }
  }

  /**
   * 2. Overflow Condition Visuals & Audio:
   * - Subtle pulsating red warning indicator when a pet enters the danger zone.
   * - Danger line ticking: Soft periodic warning ping.
   */
  private updateDangerState(
    anyPetInDangerZone: boolean,
    highestAboveLineMs: number,
    delta: number
  ): void {
    this.isInDanger = anyPetInDangerZone;

    if (!anyPetInDangerZone) {
      this.dangerPulseTweenAge = 0;
      if (this.dangerZoneBanner && this.dangerZoneBanner.alpha > 0) {
        this.dangerZoneBanner.setAlpha(0);
      }
      if (this.dangerBannerText && this.dangerBannerText.alpha > 0) {
        this.dangerBannerText.setAlpha(0);
      }
      if (this.dangerTimerBarGraphics) {
        this.dangerTimerBarGraphics.clear();
      }
      this.drawDashedDangerLine(0.55, 2);
      return;
    }

    // Pulsating red warning indicator
    this.dangerPulseTweenAge += delta * 0.008;
    const pulse = 0.55 + 0.45 * Math.sin(this.dangerPulseTweenAge * Math.PI);
    const urgencyRatio = Math.min(1, highestAboveLineMs / OVERFLOW_LIMIT_MS);

    if (this.dangerZoneBanner) {
      this.dangerZoneBanner.setAlpha(0.35 + pulse * 0.65);
    }
    if (this.dangerBannerText) {
      const remainingSec = Math.max(0, (OVERFLOW_LIMIT_MS - highestAboveLineMs) / 1000).toFixed(1);
      this.dangerBannerText.setText(`OVERFLOW IN ${remainingSec}s`);
      this.dangerBannerText.setAlpha(0.75 + pulse * 0.25);
    }

    this.drawDashedDangerLine(0.7 + pulse * 0.3, 3);

    // Draw progress bar along the danger line showing consecutive time toward 2.5s
    if (this.dangerTimerBarGraphics) {
      this.dangerTimerBarGraphics.clear();
      const fullWidth = PLAYPEN_RIGHT - PLAYPEN_LEFT;
      this.dangerTimerBarGraphics.fillStyle(0xef4444, 0.9);
      this.dangerTimerBarGraphics.fillRect(
        PLAYPEN_LEFT,
        DANGER_LINE_Y - 2,
        fullWidth * urgencyRatio,
        4
      );
    }

    // Periodic danger line ticking sound via Web Audio API
    this.audio.playDangerPing(urgencyRatio);
  }

  /**
   * 7. Clean State Management & Events:
   * - Game Over Screen displays final score, highest animal tier unlocked, and a "Play Again" button.
   * - Dispatches window CustomEvent('RESCUE_MERGE_GAME_OVER', { detail: { score, highestTierUnlocked, durationSeconds } }).
   */
  public triggerGameOver(): void {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.isDragging = false;

    this.updateSpawnerVisuals();

    const durationSeconds = Math.max(
      1,
      Math.round((this.time.now - this.roundStartTimeMs) / 1000)
    );

    const detail: RescueMergeGameOverDetail = {
      score: this.score,
      highestTierUnlocked: this.maxTierReached,
      durationSeconds
    };

    // Dispatch window event for the parent website
    window.dispatchEvent(
      new CustomEvent('RESCUE_MERGE_GAME_OVER', {
        detail
      })
    );

    this.showGameOverModal(detail);
  }

  private showGameOverModal(detail: RescueMergeGameOverDetail): void {
    if (this.gameOverContainer) {
      this.gameOverContainer.destroy(true);
    }

    const unlockedTier = this.getTierData(detail.highestTierUnlocked);

    const container = this.add.container(0, 0).setDepth(50);

    // Dimmed backdrop
    const backdrop = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x090d16, 0.78)
      .setInteractive();

    // Modal card
    const cardW = 368;
    const cardH = 430;
    const cardX = (GAME_WIDTH - cardW) / 2;
    const cardY = (GAME_HEIGHT - cardH) / 2;

    const cardBg = this.add.graphics();
    cardBg.fillStyle(0x1e293b, 0.98);
    cardBg.lineStyle(3, 0x475569, 1);
    cardBg.fillRoundedRect(cardX, cardY, cardW, cardH, 22);
    cardBg.strokeRoundedRect(cardX, cardY, cardW, cardH, 22);

    const badge = this.add
      .text(GAME_WIDTH / 2, cardY + 38, 'PLAYPEN FULL • GAME OVER', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#f87171',
        letterSpacing: 1
      })
      .setOrigin(0.5, 0.5);

    const title = this.add
      .text(GAME_WIDTH / 2, cardY + 72, 'Rescue Round Complete!', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '23px',
        fontStyle: 'bold',
        color: '#f8fafc'
      })
      .setOrigin(0.5, 0.5);

    // Score Display Box
    const scoreBox = this.add.graphics();
    scoreBox.fillStyle(0x0f172a, 0.9);
    scoreBox.lineStyle(1.5, 0x334155, 1);
    scoreBox.fillRoundedRect(cardX + 28, cardY + 102, cardW - 56, 82, 14);
    scoreBox.strokeRoundedRect(cardX + 28, cardY + 102, cardW - 56, 82, 14);

    const scoreLabel = this.add
      .text(GAME_WIDTH / 2, cardY + 124, 'FINAL SCORE', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#94a3b8'
      })
      .setOrigin(0.5, 0.5);

    const scoreVal = this.add
      .text(GAME_WIDTH / 2, cardY + 156, String(detail.score), {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '34px',
        fontStyle: 'bold',
        color: '#fde047'
      })
      .setOrigin(0.5, 0.5);

    // Highest Animal Tier Unlocked Box
    const tierBox = this.add.graphics();
    tierBox.fillStyle(0x0f172a, 0.9);
    tierBox.lineStyle(1.5, 0x334155, 1);
    tierBox.fillRoundedRect(cardX + 28, cardY + 198, cardW - 56, 128, 14);
    tierBox.strokeRoundedRect(cardX + 28, cardY + 198, cardW - 56, 128, 14);

    const unlockedHeader = this.add
      .text(GAME_WIDTH / 2, cardY + 218, 'HIGHEST ANIMAL TIER UNLOCKED', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: '#94a3b8'
      })
      .setOrigin(0.5, 0.5);

    const unlockedAvatar = this.add
      .image(cardX + 92, cardY + 272, `pet_tier_${unlockedTier.tier}`)
      .setDisplaySize(68, 68);

    const unlockedName = this.add
      .text(cardX + 144, cardY + 258, `Tier ${unlockedTier.tier}: ${unlockedTier.name}`, {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: unlockedTier.borderColor
      })
      .setOrigin(0, 0.5);

    const unlockedBreed = this.add
      .text(cardX + 144, cardY + 284, unlockedTier.breed, {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '14px',
        color: '#cbd5e1'
      })
      .setOrigin(0, 0.5);

    // Play Again Button
    const btnW = cardW - 56;
    const btnH = 54;
    const btnX = GAME_WIDTH / 2;
    const btnY = cardY + 372;

    const btnBg = this.add
      .rectangle(btnX, btnY, btnW, btnH, 0x22c55e, 1)
      .setStrokeStyle(2, 0x86efac)
      .setInteractive({ useHandCursor: true });

    const btnText = this.add
      .text(btnX, btnY, 'PLAY AGAIN', {
        fontFamily: '"Trebuchet MS", system-ui, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#052e16'
      })
      .setOrigin(0.5, 0.5);

    btnBg.on('pointerover', () => btnBg.setFillStyle(0x4ade80, 1));
    btnBg.on('pointerout', () => btnBg.setFillStyle(0x22c55e, 1));
    btnBg.on('pointerdown', () => {
      this.audio.playDropThud();
      this.startNewRound();
    });

    container.add([
      backdrop,
      cardBg,
      badge,
      title,
      scoreBox,
      scoreLabel,
      scoreVal,
      tierBox,
      unlockedHeader,
      unlockedAvatar,
      unlockedName,
      unlockedBreed,
      btnBg,
      btnText
    ]);

    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      alpha: 1,
      duration: 220,
      ease: 'Quad.easeOut'
    });

    this.gameOverContainer = container;
  }

  /**
   * 7. Expose a restart listener for the host page:
   * window.addEventListener('RESTART_GAME', () => { ... })
   */
  private setupExternalEvents(): void {
    if (this.restartHandler) {
      window.removeEventListener('RESTART_GAME', this.restartHandler);
    }

    this.restartHandler = () => {
      this.startNewRound();
    };

    window.addEventListener('RESTART_GAME', this.restartHandler);
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) restartBtn.onclick = this.restartHandler;
    this.events.once('shutdown', () => {
      if (this.restartHandler) window.removeEventListener('RESTART_GAME', this.restartHandler);
      if (restartBtn) restartBtn.onclick = null;
      if (muteBtn) muteBtn.onclick = null;
    });

    // Optional sound mute button in header if present
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.onclick = () => {
        const muted = this.audio.toggleMute();
        muteBtn.textContent = muted ? 'Sound: off' : 'Sound: on';
        muteBtn.setAttribute('aria-pressed', String(muted));
      };
    }
  }

  /**
   * Resets score, clears all Matter physics pet bodies, and starts a fresh round.
   */
  public startNewRound(): void {
    this.roundNumber++;
    this.roundStarted = false;
    // Clear existing pet physics bodies & sprites
    for (const pet of [...this.activePets]) {
      if (pet.sprite) {
        pet.sprite.destroy();
      }
      if (pet.body) {
        this.matter.world.remove(pet.body);
      }
    }
    this.activePets = [];

    if (this.gameOverContainer) {
      this.gameOverContainer.destroy(true);
      this.gameOverContainer = null;
    }

    this.score = 0;
    this.maxTierReached = 1;
    this.isGameOver = false;
    this.isCoolingDown = false;
    this.isDragging = false;
    this.isInDanger = false;
    this.lastDropTimeMs = -DROP_COOLDOWN_MS;
    this.roundStartTimeMs = this.time ? this.time.now : 0;
    this.dropperX = GAME_WIDTH / 2;

    this.currentDropTier = this.pickRandomSpawnerTier();
    this.nextDropTier = this.pickRandomSpawnerTier();

    if (this.hudScoreText) {
      this.hudScoreText.setText('0');
    }
    if (this.hudBestText) {
      this.hudBestText.setText(String(this.bestScore));
    }
    if (this.dangerZoneBanner) {
      this.dangerZoneBanner.setAlpha(0);
    }
    if (this.dangerBannerText) {
      this.dangerBannerText.setAlpha(0);
    }
    if (this.dangerTimerBarGraphics) {
      this.dangerTimerBarGraphics.clear();
    }

    this.drawDashedDangerLine(0.55, 2);
    this.updateSpawnerVisuals();
  }

  private getTierData(tierNumber: number): ShelterAnimalTier {
    return (
      this.tiers.find((t) => t.tier === tierNumber) ||
      this.tiers[0] ||
      DEFAULT_TIERS[0]
    );
  }

  public getState(): { playable: boolean; score: number; bestScore: number; isGameOver: boolean; petCount: number; roundStarted: boolean; highestTier: number } {
    return {
      playable: this.playable,
      score: this.score,
      bestScore: this.bestScore,
      isGameOver: this.isGameOver,
      petCount: this.activePets.length,
      roundStarted: this.roundStarted,
      highestTier: this.maxTierReached
    };
  }
}

/**
 * 1. Viewport & Canvas Setup + 2. Matter.js Physics Configuration:
 * - Portrait mode: 450px width by 800px height
 * - Scaling: Phaser.Scale.FIT with Phaser.Scale.CENTER_BOTH
 * - Multi-touch support: input.activePointers = 2
 * - Matter gravity: { y: 1.2 }
 */
export function createRescueMergeGame(containerId = 'game-container'): any {
  const config = {
    type: Phaser.CANVAS,
    parent: containerId,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#131c31',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT
    },
    input: {
      activePointers: 2,
      touch: { capture: false }
    },
    physics: {
      default: 'matter',
      matter: {
        gravity: { x: 0, y: 1.2 },
        debug: false
      }
    },
    scene: [RescueMergeScene]
  };

  const game = new Phaser.Game(config);
  window.rescueMergeGame = game;
  return game;
}

// Auto-boot when loaded in browser
if (typeof window !== 'undefined') {
  const boot = () => createRescueMergeGame('game-container');
  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}
