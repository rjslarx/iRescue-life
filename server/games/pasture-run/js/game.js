/**
 * Pasture Run — 1980s Retro Arcade Mini-Game (Phaser 3)
 * Mobile-first 9:16 portrait side-scroller featuring Mustang the rescued horse.
 */

const GAME_WIDTH = 540;
const GAME_HEIGHT = 960;

// Playable vertical corridor for Mustang's pasture run
const PASTURE_TOP_Y = 230;
const PASTURE_GROUND_Y = 740;

class PastureRunScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PastureRunScene' });

    // Game state: 'TITLE' | 'PLAYING' | 'GAMEOVER'
    this.gameState = 'TITLE';
    this.lives = 3;
    this.maxLives = 3;
    this.distanceMeters = 0;
    this.bonusScore = 0;
    // Isolated sandbox has no access to the website's storage or donor data.
    this.highScore = 0;

    this.scrollSpeed = 310; // Base pixels/sec
    this.isThrusting = false;
    this.invulnerableUntil = 0;

    // Spawn timers
    this.nextObstacleTime = 0;
    this.nextCollectibleTime = 0;
    this.gallopAnimTimer = 0;
    this.gallopFrame = 0;
    this.stepCounter = 0;

  }

  preload() {
    // Generate all crisp 80s pixel-art textures procedurally
    window.PastureTextures.generateAll(this);
  }

  create() {
    // Configure world bounds to the playable pasture corridor
    this.physics.world.setBounds(0, PASTURE_TOP_Y - 40, GAME_WIDTH, PASTURE_GROUND_Y - PASTURE_TOP_Y + 75);

    this.createSkyAndSun();
    this.createParallaxLayers();
    this.createParticleSystems();
    this.createGroups();
    this.createPlayer();
    this.createHUD();
    this.createTitleOverlay();
    this.createGameOverOverlay();
    this.setupControls();

    window.parent.postMessage({ type: 'pasture-ready' }, '*');
  }

  createSkyAndSun() {
    // Crisp 1980s synth-sunset / golden hour sky bands
    const skyGraphics = this.add.graphics();
    const bands = [
      { y: 0, h: 90, color: 0x100726 },
      { y: 90, h: 80, color: 0x1d1145 },
      { y: 170, h: 80, color: 0x381960 },
      { y: 250, h: 80, color: 0x64226e },
      { y: 330, h: 80, color: 0x9b2d64 },
      { y: 410, h: 80, color: 0xd45153 },
      { y: 490, h: 90, color: 0xf58840 },
      { y: 580, h: 380, color: 0x15803d },
    ];
    bands.forEach((b) => {
      skyGraphics.fillStyle(b.color, 1);
      skyGraphics.fillRect(0, b.y, GAME_WIDTH, b.h);
    });

    // Twinkling 8-bit pixel stars in upper sky
    this.stars = [];
    for (let i = 0; i < 28; i++) {
      const sx = Phaser.Math.Between(16, GAME_WIDTH - 16);
      const sy = Phaser.Math.Between(18, 250);
      const size = i % 4 === 0 ? 4 : 3;
      const star = this.add.rectangle(sx, sy, size, size, i % 3 === 0 ? 0x00f5d4 : 0xfff3b0);
      star.setAlpha(Phaser.Math.FloatBetween(0.35, 0.95));
      this.stars.push({ sprite: star, speed: Phaser.Math.FloatBetween(0.002, 0.006), offset: i });
    }

    // Retro segmented arcade sun on the horizon
    const sunX = GAME_WIDTH * 0.72;
    const sunY = 390;
    const sunGraphics = this.add.graphics();
    sunGraphics.fillStyle(0xffd43b, 0.95);
    sunGraphics.fillCircle(sunX, sunY, 68);
    sunGraphics.fillStyle(0xff7b00, 0.45);
    sunGraphics.fillCircle(sunX, sunY, 82);
    // Horizontal retro scan cuts across the lower sun
    for (let sliceY = sunY + 8; sliceY < sunY + 70; sliceY += 12) {
      const h = Math.min(6, Math.floor((sliceY - sunY) / 9));
      sunGraphics.fillStyle(0x9b2d64, 1);
      sunGraphics.fillRect(sunX - 75, sliceY, 150, h);
    }
  }

  createParallaxLayers() {
    // 1. Drifting Pixel Clouds
    this.bgClouds = this.add
      .tileSprite(0, 145, GAME_WIDTH, 160, 'bg_clouds')
      .setOrigin(0, 0)
      .setAlpha(0.85);

    // 2. Distant Mountains
    this.bgMountains = this.add
      .tileSprite(0, 320, GAME_WIDTH, 220, 'bg_mountains')
      .setOrigin(0, 0);

    // 3. Distant Ranch Fence & Trees
    this.bgTreesFence = this.add
      .tileSprite(0, 415, GAME_WIDTH, 200, 'bg_trees_fence')
      .setOrigin(0, 0);

    // 4. Foreground Scrolling Pasture Grass & Wildflowers (covers playable pasture corridor)
    this.bgGrassUpper = this.add
      .tileSprite(0, 595, GAME_WIDTH, 240, 'bg_foreground_grass')
      .setOrigin(0, 0);

    this.bgGrassLower = this.add
      .tileSprite(0, 765, GAME_WIDTH, 240, 'bg_foreground_grass')
      .setOrigin(0, 0);
  }

  createParticleSystems() {
    // Hoof dust & upward thrust sparkles
    this.thrustEmitter = this.add.particles(0, 0, 'particle_gold', {
      speedX: { min: -220, max: -90 },
      speedY: { min: 30, max: 140 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: 360,
      frequency: 35,
      emitting: false,
    });
    this.thrustEmitter.setDepth(18);

    // Pickup celebration burst
    this.pickupEmitter = this.add.particles(0, 0, 'particle_cyan', {
      speed: { min: 70, max: 220 },
      scale: { start: 1.3, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 450,
      emitting: false,
    });
    this.pickupEmitter.setDepth(35);

    // Collision impact burst
    this.hitEmitter = this.add.particles(0, 0, 'particle_red', {
      speed: { min: 90, max: 260 },
      scale: { start: 1.5, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 500,
      emitting: false,
    });
    this.hitEmitter.setDepth(35);
  }

  createGroups() {
    this.obstaclesGroup = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });

    this.collectiblesGroup = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
  }

  createPlayer() {
    this.player = this.physics.add.sprite(135, PASTURE_GROUND_Y, 'mustang_0');
    this.player.setDepth(20);
    this.player.setCollideWorldBounds(true);

    // Forgiving arcade hitbox centered on Mustang's body
    this.player.body.setSize(64, 46);
    this.player.body.setOffset(18, 16);
    this.player.body.setAllowGravity(false);

    // Overlap handlers for obstacles & collectibles
    this.physics.add.overlap(
      this.player,
      this.obstaclesGroup,
      this.handleObstacleCollision,
      null,
      this
    );

    this.physics.add.overlap(
      this.player,
      this.collectiblesGroup,
      this.handleCollectiblePickup,
      null,
      this
    );
  }

  createHUD() {
    this.hudContainer = this.add.container(0, 0).setDepth(50);

    // Top Retro Arcade Scoreboard Bar
    const hudBg = this.add.rectangle(GAME_WIDTH / 2, 54, GAME_WIDTH - 24, 84, 0x0e081a, 0.82);
    hudBg.setStrokeStyle(3, 0x00f5d4, 0.9);
    this.hudContainer.add(hudBg);

    // Lives Label + 3 Pixel Hearts (Top-Left)
    const livesLabel = this.add.text(28, 22, 'LIVES', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '10px',
      color: '#ff9ebb',
    });
    this.hudContainer.add(livesLabel);

    this.heartSprites = [];
    for (let i = 0; i < this.maxLives; i++) {
      const heart = this.add
        .image(44 + i * 44, 62, 'ui_heart_full')
        .setScale(1.0);
      this.heartSprites.push(heart);
      this.hudContainer.add(heart);
    }

    // Distance Score (Top-Center)
    const distLabel = this.add
      .text(GAME_WIDTH / 2, 22, 'DISTANCE', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#00f5d4',
      })
      .setOrigin(0.5, 0);

    this.distanceText = this.add
      .text(GAME_WIDTH / 2, 48, '0000m', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5, 0);

    this.hudContainer.add([distLabel, this.distanceText]);

    // Bonus / Total Points (Top-Right)
    const scoreLabel = this.add
      .text(GAME_WIDTH - 28, 22, 'SCORE', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '10px',
        color: '#ffd43b',
      })
      .setOrigin(1, 0);

    this.scoreText = this.add
      .text(GAME_WIDTH - 28, 48, '00000', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '18px',
        color: '#ffd43b',
      })
      .setOrigin(1, 0);

    this.hudContainer.add([scoreLabel, this.scoreText]);

    // Subtle Thrust Indicator Pill at Bottom of Screen
    this.controlHintText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 34, 'HOLD SCREEN TO GALLOP UP • RELEASE TO DROP', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '9px',
        color: '#fff3b0',
        backgroundColor: '#160d29cc',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(50);
  }

  updateHeartsHUD() {
    for (let i = 0; i < this.maxLives; i++) {
      const textureKey = i < this.lives ? 'ui_heart_full' : 'ui_heart_empty';
      this.heartSprites[i].setTexture(textureKey);
    }
  }

  createTitleOverlay() {
    this.titleContainer = this.add.container(0, 0).setDepth(70);

    const dimBg = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x090414,
      0.72
    );

    const card = this.add.rectangle(GAME_WIDTH / 2, 470, 476, 610, 0x160d2a, 0.96);
    card.setStrokeStyle(4, 0xff2a85, 1);

    const innerBorder = this.add.rectangle(GAME_WIDTH / 2, 470, 460, 594);
    innerBorder.setStrokeStyle(2, 0x00f5d4, 0.8);

    const badge = this.add
      .text(GAME_WIDTH / 2, 212, '★ 1984 SANCTUARY EDITION ★', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '11px',
        color: '#00f5d4',
      })
      .setOrigin(0.5);

    const mainTitleShadow = this.add
      .text(GAME_WIDTH / 2 + 4, 274, 'PASTURE\nRUN', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '42px',
        color: '#6b0f46',
        align: 'center',
        lineSpacing: 12,
      })
      .setOrigin(0.5);

    const mainTitle = this.add
      .text(GAME_WIDTH / 2, 270, 'PASTURE\nRUN', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '42px',
        color: '#ffd43b',
        align: 'center',
        lineSpacing: 12,
      })
      .setOrigin(0.5);

    // Legend / Scoring Table
    const legendAppleIcon = this.add.image(145, 390, 'item_apple').setScale(0.95);
    const legendAppleText = this.add
      .text(180, 390, 'RED APPLE     +25 PTS', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '11px',
        color: '#fecaca',
      })
      .setOrigin(0, 0.5);

    const legendShoeIcon = this.add.image(145, 440, 'item_horseshoe').setScale(0.95);
    const legendShoeText = this.add
      .text(180, 440, 'GOLD SHOE     +50 PTS', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '11px',
        color: '#fde68a',
      })
      .setOrigin(0, 0.5);

    const howToPlay = this.add
      .text(
        GAME_WIDTH / 2,
        518,
        'TAP & HOLD ANYWHERE TO THRUST UP\nRELEASE TO GLIDE DOWN PASTURE\nDODGE BRUSH, FENCES & MUD!',
        {
          fontFamily: '"Press Start 2P", monospace',
          fontSize: '10px',
          color: '#cbd5e1',
          align: 'center',
          lineSpacing: 10,
        }
      )
      .setOrigin(0.5);

    this.titleHighScoreText = this.add
      .text(GAME_WIDTH / 2, 588, `HIGH SCORE: ${String(this.highScore).padStart(5, '0')}`, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '12px',
        color: '#00f5d4',
      })
      .setOrigin(0.5);

    // Interactive "TAP TO PLAY" Button
    const tapBtnBg = this.add
      .rectangle(GAME_WIDTH / 2, 675, 360, 74, 0x22c55e, 1)
      .setStrokeStyle(4, 0xffffff, 1)
      .setInteractive({ useHandCursor: true });

    const tapBtnText = this.add
      .text(GAME_WIDTH / 2, 675, 'TAP TO PLAY', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '22px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const audioSubText = this.add
      .text(GAME_WIDTH / 2, 735, 'UNLOCKS 8-BIT SYNTH AUDIO', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '9px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    // Pulse animation on TAP TO PLAY
    this.tweens.add({
      targets: [tapBtnBg, tapBtnText],
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 520,
      yoyo: true,
      repeat: -1,
    });

    // Clicking anywhere on the title overlay or button unlocks Web Audio and starts run
    dimBg.setInteractive();
    const startHandler = () => {
      if (this.gameState !== 'TITLE') return;
      window.retroAudio.unlock();
      window.retroAudio.playStartJingle();
      this.startNewRun();
    };

    tapBtnBg.on('pointerdown', startHandler);
    dimBg.on('pointerdown', startHandler);

    this.titleContainer.add([
      dimBg,
      card,
      innerBorder,
      badge,
      mainTitleShadow,
      mainTitle,
      legendAppleIcon,
      legendAppleText,
      legendShoeIcon,
      legendShoeText,
      howToPlay,
      this.titleHighScoreText,
      tapBtnBg,
      tapBtnText,
      audioSubText,
    ]);
  }

  createGameOverOverlay() {
    this.gameOverContainer = this.add.container(0, 0).setDepth(80).setVisible(false);

    const overlayBg = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x070312, 0.82)
      .setInteractive(); // Blocks clicks from bleeding through to gameplay

    const panel = this.add.rectangle(GAME_WIDTH / 2, 485, 488, 630, 0x160d29, 0.98);
    panel.setStrokeStyle(4, 0xff2a55, 1);

    const innerFrame = this.add.rectangle(GAME_WIDTH / 2, 485, 472, 614);
    innerFrame.setStrokeStyle(2, 0xffd43b, 0.85);

    const gameOverTitleShadow = this.add
      .text(GAME_WIDTH / 2 + 3, 233, 'GAME OVER', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '34px',
        color: '#4c0519',
      })
      .setOrigin(0.5);

    const gameOverTitle = this.add
      .text(GAME_WIDTH / 2, 230, 'GAME OVER', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '34px',
        color: '#ff2a55',
      })
      .setOrigin(0.5);

    const subStatus = this.add
      .text(GAME_WIDTH / 2, 278, 'MUSTANG NEEDS A BREATHER!', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '11px',
        color: '#fda4af',
      })
      .setOrigin(0.5);

    // Final Distance Score Box
    const scoreBox = this.add.rectangle(GAME_WIDTH / 2, 385, 420, 145, 0x0b0616, 1);
    scoreBox.setStrokeStyle(2, 0x3b2d54, 1);

    this.finalDistanceText = this.add
      .text(GAME_WIDTH / 2, 342, 'FINAL DISTANCE: 0m', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '16px',
        color: '#00f5d4',
      })
      .setOrigin(0.5);

    this.finalTotalScoreText = this.add
      .text(GAME_WIDTH / 2, 385, 'TOTAL SCORE: 0', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '15px',
        color: '#ffd43b',
      })
      .setOrigin(0.5);

    this.finalHighScoreText = this.add
      .text(GAME_WIDTH / 2, 426, 'BEST SCORE: 0', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '12px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5);

    const perkHint = this.add.text(GAME_WIDTH / 2, 530,
      'VIP MEMBER PERK\nPLAY AGAIN ANYTIME', {
        fontFamily: '"Press Start 2P", monospace', fontSize: '15px',
        color: '#86efac', align: 'center', lineSpacing: 12,
      }).setOrigin(0.5);

    // "Play Again" Button
    const playAgainShadow = this.add.rectangle(GAME_WIDTH / 2, 668, 340, 68, 0x1e1b4b, 1);
    const playAgainBtn = this.add
      .rectangle(GAME_WIDTH / 2, 662, 340, 68, 0x3b82f6, 1)
      .setStrokeStyle(3, 0xffffff, 1)
      .setInteractive({ useHandCursor: true });

    const playAgainLabel = this.add
      .text(GAME_WIDTH / 2, 662, 'PLAY AGAIN', {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    playAgainBtn.on('pointerover', () => playAgainBtn.setFillStyle(0x60a5fa, 1));
    playAgainBtn.on('pointerout', () => playAgainBtn.setFillStyle(0x3b82f6, 1));
    playAgainBtn.on('pointerdown', () => {
      window.retroAudio.unlock();
      window.retroAudio.playStartJingle();
      this.startNewRun();
    });

    this.gameOverContainer.add([
      overlayBg,
      panel,
      innerFrame,
      gameOverTitleShadow,
      gameOverTitle,
      subStatus,
      scoreBox,
      this.finalDistanceText,
      this.finalTotalScoreText,
      this.finalHighScoreText,
      perkHint,
      playAgainShadow,
      playAgainBtn,
      playAgainLabel,
    ]);
  }

  setupControls() {
    // One-touch control anywhere on the screen
    this.input.on('pointerdown', () => {
      if (this.gameState === 'PLAYING') {
        this.isThrusting = true;
        this.applyInitialThrustImpulse();
      }
    });

    this.input.on('pointerup', () => {
      this.isThrusting = false;
    });

    this.input.on('pointerupoutside', () => {
      this.isThrusting = false;
    });

    // Keyboard support for desktop testing (Space / Up Arrow / W)
    this.cursors = this.input.keyboard.createCursorKeys();
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.wKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);

    this.spaceKey.on('down', () => {
      if (this.gameState === 'TITLE') {
        window.retroAudio.unlock();
        window.retroAudio.playStartJingle();
        this.startNewRun();
      } else if (this.gameState === 'PLAYING') {
        this.applyInitialThrustImpulse();
      }
    });
  }

  applyInitialThrustImpulse() {
    if (!this.player || !this.player.body) return;
    // Give an immediate upward velocity kick on tap so single taps feel crisp
    const currentVy = this.player.body.velocity.y;
    this.player.body.setVelocityY(Math.min(currentVy - 190, -260));
    window.retroAudio.playThrustBoing(true);
  }

  startNewRun() {
    window.parent.postMessage({ type: 'pasture-start' }, '*');
    this.gameState = 'PLAYING';
    this.lives = this.maxLives;
    this.distanceMeters = 0;
    this.bonusScore = 0;
    this.scrollSpeed = 320;
    this.isThrusting = false;
    this.invulnerableUntil = this.time.now + 1000;

    // Clear existing obstacles & collectibles
    this.obstaclesGroup.clear(true, true);
    this.collectiblesGroup.clear(true, true);

    // Reset Mustang position & physics
    this.player.setPosition(135, PASTURE_GROUND_Y - 10);
    this.player.setAlpha(1);
    this.player.clearTint();
    this.player.setAngle(0);
    this.player.body.setAllowGravity(true);
    this.player.body.setGravityY(980);
    this.player.body.setVelocity(0, 0);

    this.updateHeartsHUD();
    this.updateScoreHUD();

    this.titleContainer.setVisible(false);
    this.gameOverContainer.setVisible(false);

    const now = this.time.now;
    this.nextObstacleTime = now + 1100;
    this.nextCollectibleTime = now + 750;
  }

  spawnObstacle() {
    // Choose obstacle type: low brush, broken fence post, or mud patch
    const roll = Phaser.Math.Between(0, 99);
    let key = 'obs_brush';
    let hitboxW = 58;
    let hitboxH = 40;
    let spawnY = PASTURE_GROUND_Y;

    if (roll < 38) {
      // Low Brush — spawns across ground, mid, or upper pasture ridge
      key = 'obs_brush';
      hitboxW = 56;
      hitboxH = 38;
      const laneRoll = Phaser.Math.Between(0, 2);
      if (laneRoll === 0) {
        spawnY = Phaser.Math.Between(PASTURE_GROUND_Y - 20, PASTURE_GROUND_Y + 14);
      } else if (laneRoll === 1) {
        spawnY = Phaser.Math.Between(460, 610);
      } else {
        spawnY = Phaser.Math.Between(PASTURE_TOP_Y + 35, 420);
      }
    } else if (roll < 72) {
      // Broken Fence Post — tall obstacle across mid/ground or upper pasture
      key = 'obs_fence';
      hitboxW = 52;
      hitboxH = 54;
      spawnY = Phaser.Math.Between(PASTURE_TOP_Y + 45, PASTURE_GROUND_Y);
    } else {
      // Sticky Mud Patch — low/mid pasture turf hazard
      key = 'obs_mud';
      hitboxW = 68;
      hitboxH = 24;
      spawnY = Phaser.Math.Between(560, PASTURE_GROUND_Y + 22);
    }

    const obs = this.obstaclesGroup.create(GAME_WIDTH + 70, spawnY, key);
    obs.setDepth(16);
    obs.body.setSize(hitboxW, hitboxH);
    obs.body.setOffset((obs.width - hitboxW) / 2, (obs.height - hitboxH) / 2);
    obs.obstacleType = key;
  }

  spawnCollectible() {
    // Golden Horseshoes (35% chance, +50 pts) or Red Apples (65% chance, +25 pts)
    const isHorseshoe = Math.random() < 0.35;
    const key = isHorseshoe ? 'item_horseshoe' : 'item_apple';
    const spawnY = Phaser.Math.Between(PASTURE_TOP_Y + 40, PASTURE_GROUND_Y - 10);

    const item = this.collectiblesGroup.create(GAME_WIDTH + 60, spawnY, key);
    item.setDepth(17);
    item.body.setSize(34, 34);
    item.body.setOffset(4, 4);
    item.collectibleType = isHorseshoe ? 'horseshoe' : 'apple';
    item.bonusPoints = isHorseshoe ? 50 : 25;
    item.baseY = spawnY;
    item.floatPhase = Math.random() * Math.PI * 2;
  }

  handleObstacleCollision(player, obstacle) {
    if (this.gameState !== 'PLAYING') return;
    if (this.time.now < this.invulnerableUntil) return;

    // Remove collided obstacle
    this.hitEmitter.emitParticleAt(obstacle.x, obstacle.y, 16);
    obstacle.destroy();

    // Deduct 1 heart
    this.lives = Math.max(0, this.lives - 1);
    this.updateHeartsHUD();

    // Play 8-bit collision buzz & shake camera
    window.retroAudio.playCollisionBuzz();
    this.cameras.main.shake(210, 0.016);

    this.spawnFloatingText(player.x + 20, player.y - 40, '-1 HEART!', '#ff2a55', 14);

    if (this.lives <= 0) {
      this.triggerGameOver();
    } else {
      // Brief invulnerability flash (1.8 seconds)
      this.invulnerableUntil = this.time.now + 1800;
      player.setVelocityY(-180);
    }
  }

  handleCollectiblePickup(player, item) {
    if (this.gameState !== 'PLAYING') return;

    const pts = item.bonusPoints || 25;
    const type = item.collectibleType || 'apple';
    const ix = item.x;
    const iy = item.y;

    item.destroy();

    this.bonusScore += pts;
    this.updateScoreHUD();

    window.retroAudio.playPickupChime(type);
    this.pickupEmitter.setTexture(type === 'horseshoe' ? 'particle_gold' : 'particle_cyan');
    this.pickupEmitter.emitParticleAt(ix, iy, 12);

    const label = type === 'horseshoe' ? `+${pts} GOLD!` : `+${pts} APPLE!`;
    const color = type === 'horseshoe' ? '#ffd43b' : '#4ade80';
    this.spawnFloatingText(ix, iy - 16, label, color, 13);
  }

  spawnFloatingText(x, y, message, color = '#ffffff', fontSize = 13) {
    const txt = this.add
      .text(x, y, message, {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: `${fontSize}px`,
        color,
        stroke: '#090414',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(60);

    this.tweens.add({
      targets: txt,
      y: y - 48,
      alpha: 0,
      duration: 780,
      ease: 'Cubic.easeOut',
      onComplete: () => txt.destroy(),
    });
  }

  triggerGameOver() {
    this.gameState = 'GAMEOVER';
    this.isThrusting = false;
    this.thrustEmitter.stop();

    this.player.body.setVelocity(0, 0);
    this.player.body.setAllowGravity(false);
    this.player.setAlpha(1);
    this.player.setTint(0xff6b8b);

    window.retroAudio.playGameOver();

    const distInt = Math.floor(this.distanceMeters);
    const totalScore = distInt + this.bonusScore;

    if (totalScore > this.highScore) {
      this.highScore = totalScore;
    }

    this.finalDistanceText.setText(`FINAL DISTANCE: ${distInt}m`);
    this.finalTotalScoreText.setText(`TOTAL SCORE: ${totalScore}`);
    this.finalHighScoreText.setText(`HIGH SCORE: ${this.highScore}`);
    this.titleHighScoreText.setText(`HIGH SCORE: ${String(this.highScore).padStart(5, '0')}`);

    this.gameOverContainer.setVisible(true);
  }

  updateScoreHUD() {
    const distInt = Math.floor(this.distanceMeters);
    const totalScore = distInt + this.bonusScore;
    this.distanceText.setText(`${String(distInt).padStart(4, '0')}m`);
    this.scoreText.setText(String(totalScore).padStart(5, '0'));
  }

  update(time, delta) {
    const dt = delta / 1000;

    // Twinkle stars in sky
    this.stars.forEach((s) => {
      s.sprite.setAlpha(0.4 + 0.55 * Math.abs(Math.sin(time * s.speed + s.offset)));
    });

    // Scroll parallax backgrounds even on Title Screen for arcade attract-mode vibe
    const effectiveSpeed = this.gameState === 'PLAYING' ? this.scrollSpeed : 110;
    this.bgClouds.tilePositionX += effectiveSpeed * 0.12 * dt;
    this.bgMountains.tilePositionX += effectiveSpeed * 0.22 * dt;
    this.bgTreesFence.tilePositionX += effectiveSpeed * 0.52 * dt;
    this.bgGrassUpper.tilePositionX += effectiveSpeed * 1.0 * dt;
    this.bgGrassLower.tilePositionX += effectiveSpeed * 1.15 * dt;

    if (this.gameState === 'TITLE') {
      // Gentle idle gallop animation on Title Screen
      this.gallopAnimTimer += delta;
      if (this.gallopAnimTimer > 130) {
        this.gallopAnimTimer = 0;
        this.gallopFrame = (this.gallopFrame + 1) % 2;
        this.player.setTexture(`mustang_${this.gallopFrame}`);
      }
      this.player.y = PASTURE_GROUND_Y - 12 + Math.sin(time * 0.006) * 8;
      return;
    }

    if (this.gameState !== 'PLAYING') {
      return;
    }

    // Gradually ramp up arcade scroll speed with distance
    this.scrollSpeed = Math.min(620, 320 + this.distanceMeters * 0.42);
    this.distanceMeters += (this.scrollSpeed * dt) / 18;
    this.updateScoreHUD();

    // Check active upward thrust from touch hold or keyboard hold
    const keyHeld =
      (this.cursors && this.cursors.up.isDown) ||
      (this.spaceKey && this.spaceKey.isDown) ||
      (this.wKey && this.wKey.isDown);
    const activeThrust = this.isThrusting || keyHeld;

    if (activeThrust) {
      // Apply smooth upward thrust acceleration against gravity
      const newVy = Math.max(this.player.body.velocity.y - 1650 * dt, -430);
      this.player.body.setVelocityY(newVy);

      this.player.setTexture('mustang_thrust');
      this.thrustEmitter.setTexture('particle_gold');
      this.thrustEmitter.emitParticleAt(this.player.x - 28, this.player.y + 18, 1);
      window.retroAudio.playThrustBoing(false);
    } else {
      // Clamp maximum downward fall speed so releasing feels smooth and controllable
      if (this.player.body.velocity.y > 460) {
        this.player.body.setVelocityY(460);
      }

      // Gallop frame animation
      const onGround = this.player.y >= PASTURE_GROUND_Y - 18;
      this.gallopAnimTimer += delta;
      const frameInterval = onGround ? 95 : 140;
      if (this.gallopAnimTimer >= frameInterval) {
        this.gallopAnimTimer = 0;
        this.gallopFrame = (this.gallopFrame + 1) % 2;
        this.player.setTexture(`mustang_${this.gallopFrame}`);

        if (onGround) {
          this.stepCounter++;
          window.retroAudio.playGallopStep(this.stepCounter);
          this.thrustEmitter.setTexture('particle_dust');
          this.thrustEmitter.emitParticleAt(this.player.x - 26, this.player.y + 24, 1);
        }
      }
    }

    // Subtle pitch tilt based on vertical velocity
    const targetAngle = Phaser.Math.Clamp(this.player.body.velocity.y * 0.045, -18, 14);
    this.player.setAngle(targetAngle);

    // Handle invulnerability flashing
    if (time < this.invulnerableUntil) {
      const flashOn = Math.floor(time / 75) % 2 === 0;
      this.player.setAlpha(flashOn ? 0.35 : 1.0);
      this.player.setTint(flashOn ? 0x00f5d4 : 0xffffff);
    } else {
      this.player.setAlpha(1.0);
      this.player.clearTint();
    }

    // Spawn Obstacles at randomized intervals
    if (time >= this.nextObstacleTime) {
      this.spawnObstacle();
      const speedFactor = Phaser.Math.Clamp((620 - this.scrollSpeed) / 300, 0.45, 1.0);
      const minGap = 680 * speedFactor;
      const maxGap = 1350 * speedFactor;
      this.nextObstacleTime = time + Phaser.Math.Between(minGap, maxGap);
    }

    // Spawn Collectibles (Golden Horseshoes & Red Apples) at randomized intervals
    if (time >= this.nextCollectibleTime) {
      this.spawnCollectible();
      this.nextCollectibleTime = time + Phaser.Math.Between(900, 1750);
    }

    // Move & cleanup Obstacles
    this.obstaclesGroup.getChildren().forEach((obs) => {
      obs.x -= this.scrollSpeed * dt;
      if (obs.x < -100) {
        obs.destroy();
      }
    });

    // Move, bob, & cleanup Collectibles
    this.collectiblesGroup.getChildren().forEach((item) => {
      item.x -= this.scrollSpeed * dt;
      item.y = item.baseY + Math.sin(time * 0.006 + item.floatPhase) * 10;
      if (item.x < -80) {
        item.destroy();
      }
    });
  }
}

// Phaser 3 Game Configuration (9:16 portrait, Phaser.Scale.FIT, auto-centering)
const phaserConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#090414',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [PastureRunScene],
};

window.addEventListener('DOMContentLoaded', () => {
  window.pastureRunGame = new Phaser.Game(phaserConfig);

  // Wire up the Arcade Cabinet SFX Mute Button
  const muteBtn = document.getElementById('mute-toggle-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', () => {
      window.retroAudio.unlock();
      const isMuted = window.retroAudio.toggleMute();
      muteBtn.textContent = isMuted ? 'SFX: OFF' : 'SFX: ON';
    });
  }

});
