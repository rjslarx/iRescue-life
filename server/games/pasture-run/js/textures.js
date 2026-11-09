/**
 * Pasture Run — Crisp 1980s Pixel-Art Texture Generator
 * Generates all character sprites, obstacles, collectibles, HUD hearts,
 * and parallax background tile textures directly into Phaser's TextureManager.
 */
window.PastureTextures = {
  generateAll(scene) {
    this.createPixelParticles(scene);
    this.createHeartTextures(scene);
    this.createCollectibleTextures(scene);
    this.createObstacleTextures(scene);
    this.createMustangFrames(scene);
    this.createParallaxTextures(scene);
  },

  /**
   * Helper to draw a pixel grid (array of strings) onto a canvas texture.
   */
  drawPixelArt(scene, key, grid, palette, pixelSize = 4) {
    const rows = grid.length;
    const cols = grid[0].length;
    const width = cols * pixelSize;
    const height = rows * pixelSize;

    const tex = scene.textures.createCanvas(key, width, height);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;

    for (let r = 0; r < rows; r++) {
      const rowStr = grid[r];
      for (let c = 0; c < cols; c++) {
        const ch = rowStr[c];
        if (ch !== '.' && palette[ch]) {
          ctx.fillStyle = palette[ch];
          ctx.fillRect(c * pixelSize, r * pixelSize, pixelSize, pixelSize);
        }
      }
    }
    tex.refresh();
    return tex;
  },

  createPixelParticles(scene) {
    const colors = [
      { key: 'particle_gold', color: '#ffd43b' },
      { key: 'particle_cyan', color: '#00f5d4' },
      { key: 'particle_dust', color: '#e9d8a6' },
      { key: 'particle_red', color: '#ff4d6d' },
      { key: 'particle_mud', color: '#7f4f24' },
    ];
    colors.forEach(({ key, color }) => {
      const tex = scene.textures.createCanvas(key, 8, 8);
      const ctx = tex.getContext();
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 8, 8);
      tex.refresh();
    });
  },

  createHeartTextures(scene) {
    const heartGrid = [
      '..RRR...RRR..',
      '.RRRRR.RRRRR.',
      'RRRRWWWRRRRRR',
      'RRRRWRRRRRRRR',
      'RRRRRRRRRRRRR',
      '.RRRRRRRRRRR.',
      '..RRRRRRRRR..',
      '...RRRRRRR...',
      '....RRRRR....',
      '.....RRR.....',
      '......R......',
    ];

    this.drawPixelArt(
      scene,
      'ui_heart_full',
      heartGrid,
      {
        R: '#ff2a55',
        W: '#ffd6e0',
      },
      3
    );

    this.drawPixelArt(
      scene,
      'ui_heart_empty',
      heartGrid,
      {
        R: '#3b2d54',
        W: '#524170',
      },
      3
    );
  },

  createCollectibleTextures(scene) {
    // Golden Horseshoe (14x14 grid, pixelSize 3 -> 42x42)
    const horseshoeGrid = [
      '....GGGGGG....',
      '..GGYYYYYYGG..',
      '.GYYWWWWWWYYG.',
      '.GYWGGGGGGWYG.',
      'GYWG......GWYG',
      'GYG........GYG',
      'GYG........GYG',
      'GYD........DYG',
      'GYG........GYG',
      'GYD........DYG',
      '.GYG......GYG.',
      '.GWWG....GWWG.',
      '..GGGG..GGGG..',
      '..............',
    ];
    this.drawPixelArt(
      scene,
      'item_horseshoe',
      horseshoeGrid,
      {
        G: '#d97706',
        Y: '#ffd43b',
        W: '#fff9db',
        D: '#92400e',
      },
      3
    );

    // Crisp Red Apple (14x14 grid, pixelSize 3 -> 42x42)
    const appleGrid = [
      '......SSLL....',
      '......SLLLL...',
      '...RRRR.RRR...',
      '..RRRRRRRRRR..',
      '.RRRWWWRRRRRR.',
      '.RRWWRRRRRRRR.',
      '.RRWRRRRRRRRR.',
      '.RRRRRRRRRRRR.',
      '.RRRRRRRRRRRR.',
      '..RRRRRRRRDDR.',
      '..RRRRRRDDDR..',
      '...RRRRDDDR...',
      '....RR.DDR....',
      '..............',
    ];
    this.drawPixelArt(
      scene,
      'item_apple',
      appleGrid,
      {
        S: '#78350f',
        L: '#4ade80',
        R: '#ef4444',
        W: '#fecaca',
        D: '#b91c1c',
      },
      3
    );
  },

  createObstacleTextures(scene) {
    // 1. Low Brush (spiky bramble bush - 20x14 grid, pixelSize 4 -> 80x56)
    const brushGrid = [
      '....G...L....G......',
      '..GGLG.LLL..GLG.G...',
      '.GLLLLGLLLLGLLLGLG..',
      '.GLLBLLLLLLLLBLGLLG.',
      'GLLLLLLLLDDLLLLLLLLG',
      'GLLDDLLLLDDLLLLBLLLG',
      'GLLLLBLLLLLLLLDDLLLG',
      'DDDDLLLLDDLLLLLLDDDD',
      'DDDDDLLLLLLBLLLLDDDD',
      '.DDDDDDLLLLLLLDDDDD.',
      '.DDDDDDDDDDDDDDDDDD.',
      '..DDDDTTDDDDTTDDDD..',
      '...TTTTTT..TTTTTT...',
      '....................',
    ];
    this.drawPixelArt(
      scene,
      'obs_brush',
      brushGrid,
      {
        L: '#4ade80',
        G: '#16a34a',
        D: '#14532d',
        B: '#f43f5e',
        T: '#451a03',
      },
      4
    );

    // 2. Broken Fence Post (18x18 grid, pixelSize 4 -> 72x72)
    const fenceGrid = [
      '...LL..........RR.',
      '..LWBL........RWBR',
      '..LWBL.......RWBR.',
      'LLLWBLRRRRRRRRWBR.',
      'WWWWWWWWWWWWWWWWB.',
      'BBBBBBBBBBBBBBBBB.',
      '..LWBL.......RWBR.',
      '..LWBL.......RWBR.',
      '..LWBL..RRRRRRWBR.',
      '..LWBLLRWWWWWWWWB.',
      '..LWBL.BBBBBBBBBB.',
      '..LWBL.......RWBR.',
      '..LWBL.......RWBR.',
      '..LWBL.......RWBR.',
      '..DDDD.......DDDD.',
      '..DDDD.......DDDD.',
      '.GGGGGG.....GGGGGG',
      '..................',
    ];
    this.drawPixelArt(
      scene,
      'obs_fence',
      fenceGrid,
      {
        L: '#f59e0b',
        W: '#d97706',
        R: '#b45309',
        B: '#78350f',
        D: '#451a03',
        G: '#15803d',
      },
      4
    );

    // 3. Sticky Mud Patch (22x9 grid, pixelSize 4 -> 88x36)
    const mudGrid = [
      '.....MM........MM.....',
      '....MLLM..MM..MLLM....',
      '..MMMMMMMMMMMMMMMMMM..',
      '.MMMLLLMMMMMMMMLLMMMM.',
      'MMMMDDDDMMMMMMDDDDMMMM',
      'MMMMMMMMDDDDDDDDMMMMMM',
      '.DDDDDDDDDDDDDDDDDDDD.',
      '..DDDDDDDDDDDDDDDDDD..',
      '......................',
    ];
    this.drawPixelArt(
      scene,
      'obs_mud',
      mudGrid,
      {
        L: '#b08968',
        M: '#7f5539',
        D: '#432818',
      },
      4
    );
  },

  createMustangFrames(scene) {
    const palette = {
      M: '#2b1306', // Dark espresso mane & tail
      H: '#f59e0b', // Golden buckskin/amber highlight
      B: '#d97724', // Warm mustang chestnut coat
      S: '#9a3412', // Coat shadow
      W: '#ffffff', // White blaze & socks
      E: '#090510', // Eye pupil
      C: '#00f5d4', // Rescue sanctuary cyan collar/halter
      K: '#1c1917', // Dark hooves
    };

    // Frame 0: Extended Gallop Stride (24x18 grid, pixelSize 4 -> 96x72)
    const runFrame0 = [
      '................MMW.....',
      '...............MMMMBW...',
      '..............MMMBHEBW..',
      '.............MMMBBBCCW..',
      '............MMMBBBBBBB..',
      '...........MMMBHHBBBB...',
      '...MMMM....MMBHHHHBB....',
      '..MMMMMM..BBBBHHHHBB....',
      '.MMM..BBBBBBBBBBBBBB....',
      'MM....BHHHHHHHHBBBB.....',
      'M.....BBBBBBBBBBBBS.....',
      '......BSSBBBBBBBSSB.....',
      '.....BB..BB....BB..BB...',
      '....BB....BB..BB....BB..',
      '...WW......W..W......WW.',
      '..KK.......K..K.......KK',
      '........................',
      '........................',
    ];

    // Frame 1: Gathered Gallop Stride
    const runFrame1 = [
      '................MMW.....',
      '...............MMMMBW...',
      '..............MMMBHEBW..',
      '.............MMMBBBCCW..',
      '............MMMBBBBBBB..',
      '....MMM....MMMBHHBBBB...',
      '..MMMMMM...MMBHHHHBB....',
      '.MMM..MM..BBBBHHHHBB....',
      'MM....BBBBBBBBBBBBBB....',
      '......BHHHHHHHHBBBB.....',
      '......BBBBBBBBBBBBS.....',
      '......BSSBBBBBBBSSB.....',
      '.......BB.BB..BB.BB.....',
      '......BB...BBBB...BB....',
      '......WW...WWWW...WW....',
      '......KK...KKKK...KK....',
      '........................',
      '........................',
    ];

    // Frame 2: Upward Thrust / Leaping Pegasus-Mustang Pose
    const thrustFrame = [
      '...............MMW......',
      '..............MMMMBW....',
      '.............MMMBHEBW...',
      '............MMMBBBCCW...',
      '...........MMMBBBBBBB...',
      '..MMMMM...MMMBHHBBBB....',
      '.MMMMMMM..MMBHHHHBB.....',
      'MMM...BBBBBBBHHHHBB.....',
      'M.....BHHHHHHHHBBBB.....',
      '......BBBBBBBBBBBBBB....',
      '......BSSBBBBBBBSSBBB...',
      '.....BB.........BB..WW..',
      '....BB...........WW..KK.',
      '...WW.............KK....',
      '..KK....................',
      '........................',
      '........................',
      '........................',
    ];

    this.drawPixelArt(scene, 'mustang_0', runFrame0, palette, 4);
    this.drawPixelArt(scene, 'mustang_1', runFrame1, palette, 4);
    this.drawPixelArt(scene, 'mustang_thrust', thrustFrame, palette, 4);
  },

  createParallaxTextures(scene) {
    // 1. Distant Mountains & Retro Sunset Band (540 x 220 seamless tile)
    {
      const w = 540;
      const h = 220;
      const tex = scene.textures.createCanvas('bg_mountains', w, h);
      const ctx = tex.getContext();
      ctx.imageSmoothingEnabled = false;

      // Far purple mountain silhouettes with stepped pixel edges
      const drawMountain = (peakX, peakY, baseWidth, colorMain, colorHighlight) => {
        const step = 6;
        for (let y = peakY; y < h; y += step) {
          const progress = (y - peakY) / (h - peakY);
          const halfW = Math.floor(( progress * baseWidth ) / (2 * step)) * step;
          ctx.fillStyle = colorMain;
          ctx.fillRect(peakX - halfW, y, halfW * 2, step);
          // Sunlit left ridge
          ctx.fillStyle = colorHighlight;
          ctx.fillRect(peakX - halfW, y, Math.max(step, Math.floor(halfW * 0.32)), step);
        }
      };

      drawMountain(110, 36, 280, '#2c1b47', '#4b2d73');
      drawMountain(290, 18, 340, '#23153c', '#3d2566');
      drawMountain(450, 48, 260, '#2c1b47', '#4b2d73');
      drawMountain(0, 60, 220, '#1c1030', '#331d54');
      drawMountain(540, 60, 220, '#1c1030', '#331d54');

      tex.refresh();
    }

    // 2. Retro Pixel Clouds (540 x 160 seamless tile)
    {
      const w = 540;
      const h = 160;
      const tex = scene.textures.createCanvas('bg_clouds', w, h);
      const ctx = tex.getContext();
      ctx.imageSmoothingEnabled = false;

      const drawCloud = (x, y, scale = 1) => {
        const p = 6 * scale;
        ctx.fillStyle = '#ff9ebb';
        ctx.fillRect(x + p * 2, y, p * 5, p);
        ctx.fillStyle = '#fff0f5';
        ctx.fillRect(x + p, y + p, p * 7, p * 2);
        ctx.fillRect(x, y + p * 2, p * 9, p);
        ctx.fillStyle = '#d884b8';
        ctx.fillRect(x + p, y + p * 3, p * 7, p);
      };

      drawCloud(40, 24, 1);
      drawCloud(240, 64, 1.2);
      drawCloud(410, 32, 0.9);
      tex.refresh();
    }

    // 3. Midground Pasture Hills, Trees & Ranch Fence (540 x 200 seamless tile)
    {
      const w = 540;
      const h = 200;
      const tex = scene.textures.createCanvas('bg_trees_fence', w, h);
      const ctx = tex.getContext();
      ctx.imageSmoothingEnabled = false;

      // Rolling distant meadow strip
      ctx.fillStyle = '#14532d';
      ctx.fillRect(0, 110, w, 90);
      ctx.fillStyle = '#166534';
      for (let x = 0; x < w; x += 12) {
        const wave = Math.round(Math.sin((x / w) * Math.PI * 4) * 10);
        ctx.fillRect(x, 100 + wave, 12, 100 - wave);
      }

      // Pixel trees
      const drawTree = (tx, ty) => {
        // Trunk
        ctx.fillStyle = '#5c2d0c';
        ctx.fillRect(tx + 16, ty + 44, 12, 32);
        // Canopy tiers
        ctx.fillStyle = '#15803d';
        ctx.fillRect(tx, ty + 24, 44, 24);
        ctx.fillRect(tx + 6, ty + 8, 32, 20);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(tx + 4, ty + 24, 20, 16);
        ctx.fillRect(tx + 10, ty + 8, 16, 14);
        ctx.fillRect(tx + 12, ty, 20, 10);
      };

      drawTree(36, 36);
      drawTree(190, 48);
      drawTree(360, 32);
      drawTree(470, 50);

      // Continuous wooden pasture fence along the bottom of midground
      const fenceTop = 148;
      // Horizontal rails
      ctx.fillStyle = '#78350f';
      ctx.fillRect(0, fenceTop + 8, w, 8);
      ctx.fillRect(0, fenceTop + 26, w, 8);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(0, fenceTop + 8, w, 4);
      ctx.fillRect(0, fenceTop + 26, w, 4);

      // Vertical posts every 54px (540 / 54 = 10 posts for exact seamless wrap)
      for (let x = 0; x < w; x += 54) {
        ctx.fillStyle = '#78350f';
        ctx.fillRect(x + 8, fenceTop, 10, 48);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(x + 8, fenceTop, 6, 44);
      }

      tex.refresh();
    }

    // 4. Foreground Scrolling Pasture Turf & Wildflowers (540 x 240 seamless tile)
    {
      const w = 540;
      const h = 240;
      const tex = scene.textures.createCanvas('bg_foreground_grass', w, h);
      const ctx = tex.getContext();
      ctx.imageSmoothingEnabled = false;

      // Top bright grass lip
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(0, 0, w, 14);

      // Main lush turf body
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(0, 14, w, 66);

      // Deeper emerald lower pasture
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(0, 80, w, 90);

      // Rich soil / bottom earth band
      ctx.fillStyle = '#15803d';
      ctx.fillRect(0, 170, w, 70);

      // Crisp pixel grass blades & wildflowers for high-speed motion cues
      for (let x = 0; x < w; x += 18) {
        // Upper lip grass tufts
        ctx.fillStyle = '#86efac';
        ctx.fillRect(x, 0, 6, 6);
        ctx.fillRect(x + 9, 4, 6, 6);

        // Mid turf stripes
        ctx.fillStyle = '#16a34a';
        ctx.fillRect((x * 3) % w, 28 + ((x * 7) % 40), 14, 6);

        // Lower turf tufts
        ctx.fillStyle = '#22c55e';
        ctx.fillRect((x * 5) % w, 92 + ((x * 11) % 60), 10, 6);
      }

      // Pixel wildflowers (yellow & pink)
      const flowerColors = ['#ffd43b', '#ff4d8d', '#00f5d4', '#ffffff'];
      for (let i = 0; i < 24; i++) {
        const fx = (i * 45 + 12) % (w - 12);
        const fy = 22 + ((i * 37) % 130);
        ctx.fillStyle = '#14532d';
        ctx.fillRect(fx + 2, fy + 4, 4, 6);
        ctx.fillStyle = flowerColors[i % flowerColors.length];
        ctx.fillRect(fx, fy, 6, 6);
      }

      tex.refresh();
    }
  },
};
