// js/game.js — Main Game Loop, Camera, Wanted System, Combos, Bounties, Minimap & Upgrade Garage

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.world = new window.World();
    this.entities = new window.EntityManager(this.world);
    this.player = new window.Player(this.world.hideout.x, this.world.hideout.y);

    this.keys = {};
    this.paused = true; // Starts on title screen
    this.shopOpen = false;
    this.time = 0;

    // Input Method Detection & Touch State
    this.inputMethod = 'keyboard'; // 'keyboard' | 'touch'
    this.manualInputOverride = false;
    this.touchState = {
      joyActive: false,
      joyTouchId: null,
      joyAngle: 0,
      joyMag: 0,
      boostPressed: false
    };

    // Economy & Infamy
    this.shinies = 40; // Starter shinies so player can test upgrades early!
    this.infamy = 0;
    this.crimesCommitted = 0;

    // Wanted Heat (0 to 500 -> 0 to 5 stars)
    this.heat = 0;
    this.wantedLevel = 0;
    this.lastSirenLevel = 0;

    // Combo Multiplier System
    this.comboCount = 0;
    this.comboMultiplier = 1.0;
    this.comboTimer = 0;
    this.comboMaxTimer = 5.5;
    this.comboBank = 0;

    // Active Street Challenges (Bounties)
    this.bounties = [
      { desc: "Smash 3 Trash Cans or Mailboxes", type: 'trash_vandal', progress: 0, target: 3, reward: 55 },
      { desc: "Spray-Paint 2 Graffiti Walls [E]", type: 'graffiti', progress: 0, reward: 65, target: 2 },
      { desc: "Land 3 Scooter Air Tricks [SPACE + Z/X]", type: 'trick', progress: 0, target: 3, reward: 60 },
      { desc: "Snatch 3 Shiny Items from Pedestrians", type: 'snatch', progress: 0, target: 3, reward: 75 },
      { desc: "Survive & Escape a 2+ Star Chase (Play Dead [Q]!)", type: 'escape', progress: 0, target: 1, reward: 90 }
    ];
    this.currentBountyIdx = 0;

    // Camera
    this.camera = {
      x: this.player.x,
      y: this.player.y,
      shakeMag: 0,
      shakeTimer: 0
    };

    // Upgrade Catalog for Big Sal's Dumpster Garage
    this.upgradeCatalog = [
      {
        key: 'deck',
        icon: '🛴',
        name: 'Scooter Deck',
        tiers: ['Stock Razor', 'Trash-Carbon Pro', 'Spiked Road-Warrior', 'Cyber Hover-Deck'],
        costs: [35, 85, 160],
        desc: 'Higher bunnyhops & at Tier 2 adds front spikes that bowl over bins and foot catchers while boosting!'
      },
      {
        key: 'wheels',
        icon: '⚙️',
        name: 'Street Wheels',
        tiers: ['Squeaky Plastic', 'Urethane Street Grip', 'All-Terrain Monster', 'Mag-Lev Rollers'],
        costs: [30, 75, 140],
        desc: 'Increases top speed, acceleration, and carving turn responsiveness.'
      },
      {
        key: 'rocket',
        icon: '🚀',
        name: 'Rocket Thruster',
        tiers: ['Soda Bottle', 'Propane Turbo Jet', 'Twin Afterburners', 'Nuclear Trash Core'],
        costs: [40, 90, 175],
        desc: 'Faster SHIFT Nitro Boost speed, longer boost duration, and faster recharge.'
      },
      {
        key: 'acting',
        icon: '💀',
        name: 'Play Dead Theatrics',
        tiers: ['Basic Flop', 'Possum Drama School', 'Method Corpse + Stink', 'Oscar Winner'],
        costs: [35, 80, 150],
        desc: 'Fools closer Animal Control & K-9 units when playing dead [Q] and drains Heat much faster!'
      },
      {
        key: 'spray',
        icon: '🎨',
        name: 'Spray Can Arsenal',
        tiers: ['Cheap Can', 'Neon Chrome', 'Pepper-Paint Blaster', 'Banksy of Trash'],
        costs: [30, 70, 130],
        desc: 'Bigger payouts for tagging walls [E] and wider Hiss/Spray cloud to blind pursuing officers.'
      },
      {
        key: 'magnet',
        icon: '🧲',
        name: 'Prehensile Tail Reach',
        tiers: ['Grabby Paws', 'Long Tail Whip', 'Velcro Marsupial Pouch', 'Shiny Vortex'],
        costs: [30, 75, 140],
        desc: 'Pulls in shiny loot & snatches pedestrian snacks/purses from much further away!'
      }
    ];

    this.detectInitialInputMethod();
    this.bindEvents();
    this.bindTouchControls();
    this.updateHUD();
    this.renderShop();

    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    if (!this.manualInputOverride) {
      this.detectInitialInputMethod();
    }
  }

  detectDevicePlatform() {
    const ua = navigator.userAgent || '';
    const isUAPhone = /Android.*Mobile|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const isUATablet = /iPad|Android(?!.*Mobile)|Tablet/i.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isUAMobileData = navigator.userAgentData ? navigator.userAgentData.mobile : false;
    const isCoarsePointer = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
    const isNoHover = window.matchMedia ? window.matchMedia('(hover: none)').matches : false;
    const hasTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    const isMobileOrTablet =
      isUAPhone ||
      isUATablet ||
      isUAMobileData ||
      (isCoarsePointer && isNoHover) ||
      (hasTouch && window.innerWidth <= 920);

    let platformName = 'Desktop (Keyboard & Mouse)';
    if (isUAPhone || isUAMobileData) {
      platformName = /iPhone|iPod/i.test(ua) ? 'iOS Mobile Phone' : 'Android / Mobile Phone';
    } else if (isUATablet) {
      platformName = 'Tablet (Touch Screen)';
    } else if (isMobileOrTablet) {
      platformName = 'Mobile / Touch Screen Device';
    } else if (/Win/i.test(navigator.platform || ua)) {
      platformName = hasTouch ? 'Windows Touchscreen PC (Keyboard + Touch)' : 'Windows Desktop PC';
    } else if (/Mac/i.test(navigator.platform || ua)) {
      platformName = 'macOS Desktop';
    } else if (/Linux/i.test(navigator.platform || ua)) {
      platformName = 'Linux Desktop';
    }

    return {
      isMobileOrTablet,
      hasTouch,
      platformName
    };
  }

  detectInitialInputMethod() {
    const info = this.detectDevicePlatform();
    this.deviceInfo = info;

    const labelEl = document.getElementById('detected-device-label');
    if (labelEl) {
      labelEl.textContent = info.isMobileOrTablet
        ? `📱 DETECTED: ${info.platformName.toUpperCase()} — TOUCH CONTROLS ACTIVE`
        : `🖥️ DETECTED: ${info.platformName.toUpperCase()} — KEYBOARD & MOUSE ACTIVE`;
    }

    if (info.isMobileOrTablet) {
      this.setInputMethod('touch', false);
    } else {
      this.setInputMethod('keyboard', false);
    }
  }

  setInputMethod(mode, isManual = false) {
    if (isManual) {
      this.manualInputOverride = true;
    }
    this.inputMethod = mode;
    const isTouch = mode === 'touch';

    document.body.classList.toggle('input-touch', isTouch);
    const touchOverlay = document.getElementById('touch-controls');
    if (touchOverlay) {
      touchOverlay.classList.toggle('hidden', !isTouch);
    }

    const kbBtn = document.getElementById('btn-input-mode');
    const touchBtn = document.getElementById('touch-btn-input');
    if (kbBtn) kbBtn.textContent = isTouch ? '📱 TOUCH' : '⌨️ KB/M';
    if (touchBtn) touchBtn.textContent = isTouch ? '📱 TOUCH' : '⌨️ KB/M';

    // Update Title Screen Mode Selector buttons
    const titleKb = document.getElementById('title-mode-kb');
    const titleTouch = document.getElementById('title-mode-touch');
    if (titleKb && titleTouch) {
      titleKb.classList.toggle('active', !isTouch);
      titleTouch.classList.toggle('active', isTouch);
    }
  }

  bindEvents() {
    // Auto-detect physical keyboard usage
    window.addEventListener('keydown', (e) => {
      if (!this.manualInputOverride && this.inputMethod !== 'keyboard') {
        this.setInputMethod('keyboard', false);
      }
      this.keys[e.code] = true;

      if (e.code === 'Tab') {
        e.preventDefault();
        if (!this.paused || this.shopOpen) {
          this.toggleShop();
        }
      }
      if (this.paused) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.player.triggerBunnyHop(this.entities);
      } else if (e.code === 'KeyQ') {
        this.player.togglePlayDead(this.entities, this);
      } else if (e.code === 'KeyE') {
        this.player.performActionCrime(this.world, this.entities, this);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Auto-detect touch usage anywhere on screen
    window.addEventListener('touchstart', () => {
      if (!this.manualInputOverride && this.inputMethod !== 'touch') {
        this.setInputMethod('touch', false);
      }
    }, { passive: true });

    // Listen for responsive mode / device media-query changes (e.g. DevTools mobile toggle)
    if (window.matchMedia) {
      const mq = window.matchMedia('(pointer: coarse)');
      if (mq.addEventListener) {
        mq.addEventListener('change', () => {
          this.manualInputOverride = false;
          this.detectInitialInputMethod();
        });
      }
    }

    // Title Screen Mode Selector buttons
    const titleKbBtn = document.getElementById('title-mode-kb');
    const titleTouchBtn = document.getElementById('title-mode-touch');
    if (titleKbBtn) {
      titleKbBtn.addEventListener('click', () => {
        this.setInputMethod('keyboard', true);
        const labelEl = document.getElementById('detected-device-label');
        if (labelEl) labelEl.textContent = '🖥️ MODE SELECTED: DESKTOP (KEYBOARD & MOUSE)';
      });
    }
    if (titleTouchBtn) {
      titleTouchBtn.addEventListener('click', () => {
        this.setInputMethod('touch', true);
        const labelEl = document.getElementById('detected-device-label');
        if (labelEl) labelEl.textContent = '📱 MODE SELECTED: MOBILE / TABLET (TOUCH SCREEN)';
      });
    }

    // Mouse buttons for quick tricks / action (only when in keyboard/mouse mode)
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.paused || this.inputMethod === 'touch') return;
      if (e.button === 0) {
        if (this.player.z > 10) {
          this.player.performAirTrick('KICKFLIP', this.entities);
        } else {
          this.player.performActionCrime(this.world, this.entities, this);
        }
      } else if (e.button === 2) {
        this.player.triggerBunnyHop(this.entities);
      }
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // UI Buttons
    document.getElementById('btn-start-game').addEventListener('click', () => {
      window.SFX.init();
      window.SFX.startBGM(() => this.wantedLevel);
      document.getElementById('title-modal').classList.add('hidden');
      this.paused = false;
    });

    document.getElementById('btn-shop').addEventListener('click', () => this.toggleShop());
    document.getElementById('touch-btn-shop').addEventListener('click', () => this.toggleShop());
    document.getElementById('btn-close-shop').addEventListener('click', () => this.toggleShop());
    document.getElementById('btn-resume').addEventListener('click', () => this.toggleShop());

    const toggleInputModeBtn = () => {
      const nextMode = this.inputMethod === 'touch' ? 'keyboard' : 'touch';
      this.setInputMethod(nextMode, true);
      if (this.entities && this.player) {
        this.entities.addFloatingText(
          this.player.x,
          this.player.y - 40,
          nextMode === 'touch' ? '📱 TOUCH CONTROLS ENABLED' : '⌨️ KEYBOARD/MOUSE ENABLED',
          '#63e6be',
          15
        );
      }
    };
    document.getElementById('btn-input-mode').addEventListener('click', toggleInputModeBtn);
    document.getElementById('touch-btn-input').addEventListener('click', toggleInputModeBtn);

    document.getElementById('btn-repair').addEventListener('click', () => {
      if (this.shinies >= 25 && this.player.hp < this.player.maxHp) {
        this.shinies -= 25;
        this.player.hp = this.player.maxHp;
        window.SFX.upgradeBuy();
        this.entities.addFloatingText(this.player.x, this.player.y - 30, "🍕 FULL GRIT RESTORED!", "#51cf66", 17);
        this.renderShop();
        this.updateHUD();
      }
    });

    const toggleMuteBoth = () => {
      const muted = window.SFX.toggleMute();
      const icon = muted ? '🔇' : '🔊';
      document.getElementById('btn-mute').textContent = icon;
      document.getElementById('touch-btn-mute').textContent = icon;
    };
    document.getElementById('btn-mute').addEventListener('click', toggleMuteBoth);
    document.getElementById('touch-btn-mute').addEventListener('click', toggleMuteBoth);

    document.getElementById('btn-respawn').addEventListener('click', () => {
      document.getElementById('busted-modal').classList.add('hidden');
      this.player.reset();
      this.heat = 0;
      this.wantedLevel = 0;
      this.entities.authorities = [];
      this.entities.nets = [];
      this.paused = false;
      this.updateHUD();
    });
  }

  bindTouchControls() {
    const joyZone = document.getElementById('touch-joystick-zone');
    const joyBase = document.getElementById('joystick-base');
    const joyKnob = document.getElementById('joystick-knob');
    const maxRadius = 44;

    const updateJoystickFromPoint = (clientX, clientY) => {
      const rect = joyBase.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(maxRadius, dist);
      const angle = Math.atan2(dy, dx);

      const kx = Math.cos(angle) * clamped;
      const ky = Math.sin(angle) * clamped;
      joyKnob.style.transform = `translate(${kx}px, ${ky}px)`;

      this.touchState.joyActive = true;
      this.touchState.joyAngle = angle;
      this.touchState.joyMag = clamped / maxRadius;
    };

    const resetJoystick = () => {
      joyKnob.style.transform = 'translate(0px, 0px)';
      this.touchState.joyActive = false;
      this.touchState.joyTouchId = null;
      this.touchState.joyMag = 0;
    };

    // Multi-touch events for Virtual Analog Thumbstick
    joyZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      window.SFX.init();
      const touch = e.changedTouches[0];
      this.touchState.joyTouchId = touch.identifier;
      updateJoystickFromPoint(touch.clientX, touch.clientY);
    }, { passive: false });

    joyZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.touchState.joyTouchId) {
          updateJoystickFromPoint(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: false });

    const onJoyTouchEnd = (e) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === this.touchState.joyTouchId) {
          resetJoystick();
          break;
        }
      }
    };
    joyZone.addEventListener('touchend', onJoyTouchEnd, { passive: false });
    joyZone.addEventListener('touchcancel', onJoyTouchEnd, { passive: false });

    // Also allow touching & dragging ANYWHERE on the left half of the game canvas!
    let canvasOriginX = 0;
    let canvasOriginY = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      if (this.paused) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth * 0.5 && this.touchState.joyTouchId === null) {
          e.preventDefault();
          window.SFX.init();
          this.touchState.joyTouchId = t.identifier;
          canvasOriginX = t.clientX;
          canvasOriginY = t.clientY;
          break;
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (this.touchState.joyTouchId === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.touchState.joyTouchId) {
          e.preventDefault();
          const dx = t.clientX - canvasOriginX;
          const dy = t.clientY - canvasOriginY;
          const dist = Math.hypot(dx, dy);
          const clamped = Math.min(maxRadius, dist);
          const angle = Math.atan2(dy, dx);
          joyKnob.style.transform = `translate(${Math.cos(angle) * clamped}px, ${Math.sin(angle) * clamped}px)`;
          this.touchState.joyActive = true;
          this.touchState.joyAngle = angle;
          this.touchState.joyMag = clamped / maxRadius;
          break;
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchend', onJoyTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', onJoyTouchEnd, { passive: false });

    // Also allow mouse dragging on the virtual joystick when testing Touch Mode on PC
    let mouseJoyDown = false;
    joyZone.addEventListener('mousedown', (e) => {
      e.preventDefault();
      mouseJoyDown = true;
      updateJoystickFromPoint(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (mouseJoyDown) {
        updateJoystickFromPoint(e.clientX, e.clientY);
      }
    });
    window.addEventListener('mouseup', () => {
      if (mouseJoyDown) {
        mouseJoyDown = false;
        resetJoystick();
      }
    });

    // Helper for Right-Side Arcade Touch Action Buttons
    const bindActionBtn = (id, onDown, onUp = null) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      const handleStart = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.SFX.init();
        btn.classList.add('pressed');
        if (!this.paused) onDown();
      };
      const handleEnd = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.remove('pressed');
        if (onUp) onUp();
      };

      btn.addEventListener('touchstart', handleStart, { passive: false });
      btn.addEventListener('touchend', handleEnd, { passive: false });
      btn.addEventListener('touchcancel', handleEnd, { passive: false });
      btn.addEventListener('mousedown', handleStart);
      btn.addEventListener('mouseup', handleEnd);
      btn.addEventListener('mouseleave', handleEnd);
    };

    // 1. HOP / TAILWHIP Button
    bindActionBtn('touch-btn-jump', () => {
      this.player.triggerBunnyHop(this.entities);
    });

    // 2. BOOST Button (Hold)
    bindActionBtn(
      'touch-btn-boost',
      () => { this.touchState.boostPressed = true; },
      () => { this.touchState.boostPressed = false; }
    );

    // 3. CRIME / TAG Button
    bindActionBtn('touch-btn-crime', () => {
      this.player.performActionCrime(this.world, this.entities, this);
    });

    // 4. PLAY DEAD Button
    bindActionBtn('touch-btn-dead', () => {
      this.player.togglePlayDead(this.entities, this);
    });

    // 5. AIR FLIP / 360 SPIN Button
    bindActionBtn('touch-btn-flip', () => {
      if (this.player.z < 12) {
        this.player.triggerBunnyHop(this.entities);
      } else {
        const trick = Math.random() < 0.5 ? 'KICKFLIP' : '360 POSSUM SPIN';
        this.player.performAirTrick(trick, this.entities);
      }
    });
  }

  toggleShop() {
    this.shopOpen = !this.shopOpen;
    const modal = document.getElementById('shop-modal');
    if (this.shopOpen) {
      this.paused = true;
      this.renderShop();
      modal.classList.remove('hidden');
    } else {
      this.paused = false;
      modal.classList.add('hidden');
    }
  }

  renderShop() {
    document.getElementById('shop-shiny-count').textContent = this.shinies;
    const container = document.getElementById('upgrade-list');
    container.innerHTML = '';

    for (const item of this.upgradeCatalog) {
      const currentLvl = this.player.upgrades[item.key];
      const isMax = currentLvl >= 3;
      const cost = isMax ? 0 : item.costs[currentLvl];
      const canAfford = !isMax && this.shinies >= cost;

      const card = document.createElement('div');
      card.className = `upgrade-card ${isMax ? 'maxed' : ''}`;
      card.innerHTML = `
        <div>
          <div class="upg-top">
            <div class="upg-icon">${item.icon}</div>
            <div>
              <div class="upg-title">${item.name}</div>
              <div class="upg-tier">Tier ${currentLvl}/3: ${item.tiers[currentLvl]}</div>
            </div>
          </div>
          <p class="upg-desc" style="margin-top:8px;">${item.desc}</p>
        </div>
        <button class="arcade-btn upg-buy-btn" ${(!canAfford || isMax) ? 'disabled' : ''}>
          ${isMax ? '✔ MAXED OUT' : `UPGRADE TO ${item.tiers[currentLvl + 1]} (${cost} ✨)`}
        </button>
      `;

      if (!isMax) {
        card.querySelector('button').addEventListener('click', () => {
          if (this.shinies >= cost) {
            this.shinies -= cost;
            this.player.upgrades[item.key]++;
            window.SFX.upgradeBuy();
            this.renderShop();
            this.updateHUD();
          }
        });
      }

      container.appendChild(card);
    }
  }

  addShinies(amount, x, y, icon = '✨') {
    const distMult = this.world.getDistrictAt(this.player.x, this.player.y).lootMult || 1.0;
    const finalAmt = Math.round(amount * this.comboMultiplier * distMult);
    this.shinies += finalAmt;
    this.infamy += finalAmt * 5;
    this.checkDistrictUnlocks();
    this.updateHUD();
  }

  recordCrime(crimeTitle, shinyReward, heatAdded, crimeCategory = 'snatch') {
    this.crimesCommitted++;

    // Combo & District Multiplier
    const distMult = this.world.getDistrictAt(this.player.x, this.player.y).lootMult || 1.0;
    this.comboCount++;
    this.comboMultiplier = Math.min(5.0, +(1 + this.comboCount * 0.25).toFixed(2));
    this.comboTimer = this.comboMaxTimer;
    const totalReward = Math.round(shinyReward * this.comboMultiplier * distMult);
    this.comboBank += totalReward;

    this.shinies += totalReward;
    this.infamy += totalReward * 10;
    this.checkDistrictUnlocks();

    // Increase Heat
    const prevWanted = this.wantedLevel;
    this.heat = Math.min(500, this.heat + heatAdded);
    this.wantedLevel = Math.min(5, Math.floor(this.heat / 85));

    if (this.wantedLevel > prevWanted) {
      window.SFX.sirenchirp();
      this.entities.addFloatingText(this.player.x, this.player.y - 52, `🚨 WANTED LEVEL ${this.wantedLevel}!`, "#ff4d4f", 20);
    }

    // Add Crime Toast in Top-Right Feed
    const feed = document.getElementById('crime-feed');
    const toast = document.createElement('div');
    toast.className = 'crime-toast';
    toast.textContent = `${crimeTitle} (+${totalReward}✨)`;
    feed.prepend(toast);
    while (feed.children.length > 4) {
      feed.lastChild.remove();
    }
    setTimeout(() => toast.remove(), 3800);

    // Check active Street Challenge (Bounty)
    this.checkBountyProgress(crimeCategory);
    this.updateHUD();
  }

  checkDistrictUnlocks() {
    for (const d of this.world.districts) {
      if (!d.unlocked && this.infamy >= d.reqInfamy) {
        d.unlocked = true;
        window.SFX.zoneUnlock();
        this.triggerScreenShake(11, 0.45);

        // Celebration particles around Crimothy
        this.entities.addParticles(this.player.x, this.player.y, d.color, 32, 230, 7);
        this.entities.addParticles(this.player.x, this.player.y, "#ffd43b", 24, 200, 6);
        this.entities.addFloatingText(
          this.player.x,
          this.player.y - 68,
          `🔓 UNLOCKED: ${d.name}!`,
          "#51cf66",
          21
        );

        // Show top-center Unlock Celebration Banner
        const banner = document.getElementById('unlock-banner');
        document.getElementById('unlock-title').textContent = d.name;
        document.getElementById('unlock-subtitle').textContent = d.subtitle;
        banner.classList.remove('hidden');
        if (this.unlockBannerTimeout) clearTimeout(this.unlockBannerTimeout);
        this.unlockBannerTimeout = setTimeout(() => {
          banner.classList.add('hidden');
        }, 5500);
      }
    }
  }

  checkBountyProgress(category) {
    const b = this.bounties[this.currentBountyIdx];
    if (!b) return;

    let matched = false;
    if (b.type === 'trash_vandal' && (category === 'trash' || category === 'vandalism')) matched = true;
    if (b.type === 'graffiti' && category === 'graffiti') matched = true;
    if (b.type === 'trick' && category === 'trick') matched = true;
    if (b.type === 'snatch' && category === 'snatch') matched = true;
    if (b.type === 'escape' && category === 'escape') matched = true;

    if (matched) {
      b.progress++;
      if (b.progress >= b.target) {
        // Bounty completed!
        this.shinies += b.reward;
        this.infamy += b.reward * 15;
        this.checkDistrictUnlocks();
        window.SFX.upgradeBuy();
        this.entities.addFloatingText(
          this.player.x,
          this.player.y - 60,
          `🏆 CHALLENGE COMPLETE! +${b.reward} ✨`,
          "#51cf66",
          20
        );
        b.progress = 0;
        this.currentBountyIdx = (this.currentBountyIdx + 1) % this.bounties.length;
      }
    }
  }

  reduceHeat(amount) {
    if (this.heat <= 0) return;
    const prevWanted = this.wantedLevel;
    this.heat = Math.max(0, this.heat - amount);
    this.wantedLevel = Math.min(5, Math.floor(this.heat / 85));

    if (prevWanted >= 2 && this.wantedLevel === 0) {
      this.entities.addFloatingText(this.player.x, this.player.y - 45, "😎 HEAT LOST! COPS FOOLED!", "#51cf66", 18);
      this.checkBountyProgress('escape');
    }
  }

  triggerScreenShake(mag = 6, duration = 0.2) {
    this.camera.shakeMag = mag;
    this.camera.shakeTimer = duration;
  }

  onPlayerBusted(caughtBy) {
    this.paused = true;
    const penalty = Math.floor(this.shinies * 0.2);
    this.shinies = Math.max(0, this.shinies - penalty);

    document.getElementById('busted-reason').textContent =
      `You got scooped up by ${caughtBy}! Animal Control confiscated ${penalty} ✨ Shinies as "evidence", but you kept all your scooter upgrades!`;
    document.getElementById('busted-stats').innerHTML = `
      <div>💀 Total Infamy: ${this.infamy}</div>
      <div>✨ Remaining Shinies: ${this.shinies}</div>
      <div>🚨 Crimes Committed: ${this.crimesCommitted}</div>
    `;
    document.getElementById('busted-modal').classList.remove('hidden');
  }

  updateContextualPrompt() {
    const promptEl = document.getElementById('action-prompt');
    let promptHTML = null;
    const isTouch = this.inputMethod === 'touch';
    const actKey = isTouch ? `<kbd>🎨 CRIME</kbd>` : `<kbd>E</kbd>`;
    const shopKey = isTouch ? `<kbd>🛒 GARAGE</kbd>` : `<kbd>E</kbd> or <kbd>TAB</kbd>`;

    if (this.world.isInsideAnyHideout(this.player.x, this.player.y, 12)) {
      promptHTML = `${isTouch ? 'Tap' : 'Press'} ${shopKey} to Open Big Sal's Dumpster Garage!`;
    } else {
      for (const g of this.world.graffitiSpots) {
        if (!g.tagged && Math.hypot(this.player.x - g.x, this.player.y - g.y) < 68) {
          promptHTML = `${isTouch ? 'Tap' : 'Press'} ${actKey} to Spray-Paint "${g.slogan}"!`;
          break;
        }
      }
      if (!promptHTML) {
        for (const p of this.world.props) {
          if (p.type === 'dumpster' && !p.looted && Math.hypot(this.player.x - p.x, this.player.y - p.y) < 66) {
            promptHTML = `${isTouch ? 'Tap' : 'Press'} ${actKey} (or Ram!) to Raid Dumpster!`;
            break;
          }
        }
      }
    }

    if (promptHTML) {
      promptEl.innerHTML = promptHTML;
      promptEl.classList.remove('hidden');
    } else {
      promptEl.classList.add('hidden');
    }
  }

  updateHUD() {
    // Bars
    document.getElementById('hp-fill').style.width = `${(this.player.hp / this.player.maxHp) * 100}%`;
    document.getElementById('boost-fill').style.width = `${(this.player.boost / this.player.maxBoost) * 100}%`;
    document.getElementById('dead-fill').style.width = `${(this.player.playDeadEnergy / this.player.maxPlayDead) * 100}%`;

    // Portrait status
    const emojiEl = document.getElementById('portrait-emoji');
    const stateEl = document.getElementById('portrait-state');
    const boxEl = document.getElementById('possum-portrait');
    if (this.player.isPlayingDead) {
      emojiEl.textContent = '💀';
      stateEl.textContent = 'PLAYING DEAD';
      boxEl.style.borderColor = '#cc5de8';
    } else if (this.player.z > 10) {
      emojiEl.textContent = '🛴';
      stateEl.textContent = 'SHREDDING AIR!';
      boxEl.style.borderColor = '#63e6be';
    } else if (this.wantedLevel >= 3) {
      emojiEl.textContent = '😾';
      stateEl.textContent = 'MOST WANTED';
      boxEl.style.borderColor = '#ff6b6b';
    } else {
      emojiEl.textContent = '🦝';
      stateEl.textContent = 'RIDING DIRTY';
      boxEl.style.borderColor = '#f59f00';
    }

    // Combo Banner
    const comboBox = document.getElementById('combo-box');
    if (this.comboTimer > 0 && this.comboCount >= 2) {
      comboBox.classList.remove('hidden');
      document.getElementById('combo-multiplier').textContent = `${this.comboMultiplier}x CRIME COMBO!`;
      document.getElementById('combo-score').textContent = `+${this.comboBank} SHINIES`;
      document.getElementById('combo-timer-fill').style.width = `${(this.comboTimer / this.comboMaxTimer) * 100}%`;
    } else {
      comboBox.classList.add('hidden');
    }

    // Active Challenge
    const b = this.bounties[this.currentBountyIdx];
    if (b) {
      document.getElementById('bounty-text').textContent = `${b.desc} (${b.progress}/${b.target}) — Reward: ${b.reward}✨`;
    }

    // District Status & Next Infamy Unlock Progress
    const currDist = this.world.getDistrictAt(this.player.x, this.player.y);
    const nextDist = this.world.getNextLockedDistrict();
    const currDistEl = document.getElementById('current-district-name');
    const nextDistEl = document.getElementById('next-district-status');

    if (currDistEl && currDist) {
      currDistEl.textContent = `📍 ${currDist.name} (${currDist.lootMult}x LOOT)`;
      currDistEl.style.color = currDist.color;
    }
    if (nextDistEl) {
      if (nextDist) {
        nextDistEl.textContent = `🔒 NEXT: ${nextDist.name} (${this.infamy.toLocaleString()} / ${nextDist.reqInfamy.toLocaleString()} 💀)`;
        nextDistEl.style.color = '#ffd43b';
      } else {
        nextDistEl.textContent = `👑 ALL 4 DISTRICTS UNLOCKED!`;
        nextDistEl.style.color = '#51cf66';
      }
    }

    // Wanted Stars & Heat
    const stars = document.querySelectorAll('#wanted-stars .star');
    stars.forEach((star) => {
      const lvl = parseInt(star.getAttribute('data-level'), 10);
      star.classList.toggle('active', lvl <= this.wantedLevel);
    });

    const heatPct = Math.min(100, (this.heat / 425) * 100);
    document.getElementById('heat-fill').style.width = `${heatPct}%`;
    const heatStatus = document.getElementById('heat-status');
    if (this.player.isPlayingDead) {
      heatStatus.textContent = 'HEAT: COOLING💀';
      heatStatus.style.color = '#cc5de8';
    } else if (this.wantedLevel === 0) {
      heatStatus.textContent = 'HEAT: CHILL';
      heatStatus.style.color = '#74c0fc';
    } else {
      heatStatus.textContent = `WANTED LVL ${this.wantedLevel}`;
      heatStatus.style.color = '#ff6b6b';
    }

    // Currencies
    document.getElementById('shiny-count').textContent = this.shinies;
    document.getElementById('infamy-count').textContent = this.infamy;
  }

  drawMinimap() {
    const ctx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;
    const scaleX = w / this.world.width;
    const scaleY = h / this.world.height;

    ctx.fillStyle = '#181c24';
    ctx.fillRect(0, 0, w, h);

    // Buildings
    ctx.fillStyle = '#3b4252';
    for (const b of this.world.buildings) {
      ctx.fillRect(b.x * scaleX, b.y * scaleY, b.w * scaleX, b.h * scaleY);
    }

    // Locked District Overlays on Minimap
    for (const d of this.world.districts) {
      if (d.unlocked) continue;
      const rx = d.bounds.x1 * scaleX;
      const ry = d.bounds.y1 * scaleY;
      const rw = (d.bounds.x2 - d.bounds.x1) * scaleX;
      const rh = (d.bounds.y2 - d.bounds.y1) * scaleY;

      ctx.fillStyle = 'rgba(10, 8, 16, 0.72)';
      ctx.fillRect(rx, ry, rw, rh);

      ctx.strokeStyle = d.color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);

      ctx.fillStyle = '#ffd43b';
      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`🔒${d.reqInfamy / 1000}k💀`, rx + rw / 2, ry + rh / 2 + 4);
    }

    // Un-looted Dumpsters (green specks)
    ctx.fillStyle = '#2f9e44';
    for (const p of this.world.props) {
      if (p.type === 'dumpster' && !p.looted) {
        ctx.fillRect(p.x * scaleX - 1, p.y * scaleY - 1, 2, 2);
      }
    }

    // Untagged Graffiti Spots (purple dots)
    ctx.fillStyle = '#cc5de8';
    for (const g of this.world.graffitiSpots) {
      if (!g.tagged) {
        ctx.fillRect(g.x * scaleX - 1.5, g.y * scaleY - 1.5, 3, 3);
      }
    }

    // Hideout Safe Zones (green circles)
    ctx.fillStyle = '#51cf66';
    for (const hObj of this.world.hideouts) {
      ctx.beginPath();
      ctx.arc(hObj.x * scaleX, hObj.y * scaleY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Authorities (red flashing dots)
    ctx.fillStyle = '#ff6b6b';
    for (const cop of this.entities.authorities) {
      ctx.beginPath();
      ctx.arc(cop.x * scaleX, cop.y * scaleY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player (bright yellow dot)
    ctx.fillStyle = '#ffd43b';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.player.x * scaleX, this.player.y * scaleY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  pollGamepad() {
    if (!navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const gp = pads && (pads[0] || pads[1] || pads[2] || pads[3]);
    if (!gp) return;

    const ax = gp.axes[0] || 0;
    const ay = gp.axes[1] || 0;
    const mag = Math.hypot(ax, ay);

    if (mag > 0.22) {
      this.touchState.joyActive = true;
      this.touchState.joyAngle = Math.atan2(ay, ax);
      this.touchState.joyMag = Math.min(1, mag);
      this.gamepadSteering = true;
    } else if (this.gamepadSteering) {
      this.touchState.joyActive = false;
      this.touchState.joyMag = 0;
      this.gamepadSteering = false;
    }

    // Buttons: 0 = A/Cross (Hop/Whip), 1 = B/Circle (Boost), 2 = X/Square (Crime), 3 = Y/Triangle (Play Dead), 7 = RT (Boost)
    const btnA = gp.buttons[0] && gp.buttons[0].pressed;
    const btnB = (gp.buttons[1] && gp.buttons[1].pressed) || (gp.buttons[7] && gp.buttons[7].pressed);
    const btnX = gp.buttons[2] && gp.buttons[2].pressed;
    const btnY = gp.buttons[3] && gp.buttons[3].pressed;

    if (btnA && !this.prevGpA) this.player.triggerBunnyHop(this.entities);
    if (btnX && !this.prevGpX) this.player.performActionCrime(this.world, this.entities, this);
    if (btnY && !this.prevGpY) this.player.togglePlayDead(this.entities, this);
    this.touchState.boostPressed = !!btnB;

    this.prevGpA = btnA;
    this.prevGpX = btnX;
    this.prevGpY = btnY;
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    if (!this.paused) {
      this.time += dt;
      this.pollGamepad();

      // Update World, Player, and Entities
      this.world.update(dt);
      this.player.update(dt, this.keys, this.world, this.entities, this);
      this.entities.update(dt, this.player, this);

      // Natural slow heat decay or fast hideout decay
      const inHideout = !!this.world.isInsideAnyHideout(this.player.x, this.player.y);
      if (inHideout) {
        this.reduceHeat(25 * dt);
        // Slowly heal in hideout too!
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 8 * dt);
      } else if (this.heat > 0) {
        this.reduceHeat(1.8 * dt);
      }

      // Combo Timer
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) {
          this.comboCount = 0;
          this.comboMultiplier = 1.0;
          this.comboBank = 0;
        }
      }

      // Smooth Camera with Velocity Look-Ahead
      const lookAheadX = this.player.vx * 0.22;
      const lookAheadY = this.player.vy * 0.22;
      const targetCamX = this.player.x + lookAheadX - this.canvas.width / 2;
      const targetCamY = this.player.y + lookAheadY - this.canvas.height / 2;

      this.camera.x += (targetCamX - this.camera.x) * Math.min(1, dt * 7);
      this.camera.y += (targetCamY - this.camera.y) * Math.min(1, dt * 7);

      if (this.camera.shakeTimer > 0) {
        this.camera.shakeTimer -= dt;
      }

      this.updateContextualPrompt();
      this.updateHUD();
    }

    this.render();
    this.drawMinimap();

    requestAnimationFrame((t) => this.loop(t));
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    let shakeX = 0;
    let shakeY = 0;
    if (this.camera.shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * this.camera.shakeMag * 2;
      shakeY = (Math.random() - 0.5) * this.camera.shakeMag * 2;
    }

    ctx.translate(-this.camera.x + shakeX, -this.camera.y + shakeY);

    // Draw World, Player & Entities
    this.world.draw(ctx, this.camera, this.time);
    this.entities.draw(ctx, this.time);
    this.player.draw(ctx, this.time);

    ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});

