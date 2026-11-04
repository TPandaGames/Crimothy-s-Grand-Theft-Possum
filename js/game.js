// js/game.js — Main Game Loop, Camera, Wanted System, Combos, Bounties, Minimap, Upgrade Garage & Cross-Platform Multiplayer

import { World } from './world.js';
import { EntityManager } from './entities.js';
import { Player } from './player.js';
import { SFX } from './audio.js';
import { UIManager } from './ui.js';
import { NetworkManager } from './network.js';
import { CONSTANTS } from './constants.js';

export class Game {
  constructor() {
    window.game = this;
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    this.dpr = 1;
    this.joyMaxRadius = 44;

    this.world = new World();
    this.entities = new EntityManager(this.world);
    this.player = new Player(this.world.hideout.x, this.world.hideout.y);
    this.player2 = null;

    // Camera (with adaptive resolution zoom)
    this.camera = {
      x: this.player.x,
      y: this.player.y,
      zoom: 1,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      shakeMag: 0,
      shakeTimer: 0
    };

    this.keys = {};
    this.paused = true; // Starts on title screen
    this.shopOpen = false;
    this.mpModalOpen = false;
    this.bustedModalOpen = false;
    this.time = 0;

    // Input Method Detection & Touch State
    this.inputMethod = 'keyboard'; // 'keyboard' | 'touch'
    this.gamepadActive = false;
    this.manualInputOverride = false;
    this.touchState = {
      joyActive: false,
      joyTouchId: null,
      joyAngle: 0,
      joyMag: 0,
      boostPressed: false
    };

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.resize());
    }

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
    this.comboMaxTimer = CONSTANTS.GAME.COMBO_MAX_TIMER;
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

    this.sfx = SFX;
    this.ui = new UIManager(this);
    this.network = new NetworkManager(this);
    this.player.customColor = this.network.playerColor;

    this.detectInitialInputMethod();
    this.bindEvents();
    this.bindTouchControls();
    this.ui.initMultiplayerControls();
    this.ui.updateHUD();
    this.ui.renderShop();
    this.checkUrlInviteParams();

    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  checkUrlInviteParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      const room = params.get('room');
      const mode = params.get('mode');
      if (mode && ['coop', 'versus', 'cops_robbers'].includes(mode)) {
        this.network.setProfile({ gameMode: mode });
      }
      if (room) {
        this.selectedPlayMode = 'online';
        document.getElementById('title-mode-1p')?.classList.remove('active');
        document.getElementById('title-mode-2p')?.classList.remove('active');
        document.getElementById('title-mode-online')?.classList.add('active');
        document.getElementById('title-online-box')?.classList.remove('hidden');

        const titleInput = document.getElementById('title-mp-code');
        const modalInput = document.getElementById('mp-room-input');
        if (titleInput) titleInput.value = room.toUpperCase();
        if (modalInput) modalInput.value = room.toUpperCase();

        // Wait briefly for PeerJS script to finish defer load, then join
        setTimeout(() => {
          this.network.joinRoom(room);
        }, 350);
      }
    } catch (_) {}
  }

  resize() {
    this.detectScreenResolution();
    if (!this.manualInputOverride) {
      this.detectInitialInputMethod();
    }
  }

  detectScreenResolution() {
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    this.dpr = dpr;

    // 1. Set High-DPI Canvas Buffer Size
    this.canvas.width = Math.round(vw * dpr);
    this.canvas.height = Math.round(vh * dpr);

    // 2. Determine Orientation & Screen Size Tier
    const isPortrait = vh > vw;
    let tier = 'lg';
    if (vw < 480 || vh < 430) {
      tier = 'xs';
    } else if (vw < 860 || vh < 560) {
      tier = 'sm';
    } else if (vw < 1280) {
      tier = 'md';
    } else if (vw >= 2000) {
      tier = 'xl';
    }
    this.screenTier = tier;
    this.isPortrait = isPortrait;

    // Apply resolution tier & orientation classes to <body>
    const b = document.body;
    b.classList.remove('screen-xs', 'screen-sm', 'screen-md', 'screen-lg', 'screen-xl', 'orient-portrait', 'orient-landscape');
    b.classList.add(`screen-${tier}`, isPortrait ? 'orient-portrait' : 'orient-landscape');

    // 3. Compute Adaptive UI & Button Scale Factors + Minimap Size
    const tierConfig = {
      xs: { uiScale: 0.72, btnScale: 0.78, joySize: 106, knobSize: 44, pad: 8,  minimap: 84 },
      sm: { uiScale: 0.84, btnScale: 0.88, joySize: 120, knobSize: 48, pad: 10, minimap: 106 },
      md: { uiScale: 0.94, btnScale: 0.98, joySize: 134, knobSize: 54, pad: 12, minimap: 138 },
      lg: { uiScale: 1.00, btnScale: 1.04, joySize: 142, knobSize: 56, pad: 14, minimap: 168 },
      xl: { uiScale: 1.18, btnScale: 1.18, joySize: 164, knobSize: 64, pad: 18, minimap: 206 }
    }[tier];

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--ui-scale', tierConfig.uiScale);
    rootStyle.setProperty('--btn-scale', tierConfig.btnScale);
    rootStyle.setProperty('--joy-size', `${tierConfig.joySize}px`);
    rootStyle.setProperty('--knob-size', `${tierConfig.knobSize}px`);
    rootStyle.setProperty('--hud-pad', `${tierConfig.pad}px`);

    this.joyMaxRadius = Math.round(tierConfig.joySize * 0.34);

    if (this.minimapCanvas) {
      this.minimapCanvas.width = tierConfig.minimap;
      this.minimapCanvas.height = tierConfig.minimap;
    }

    // 4. Compute Adaptive Camera Zoom based on Screen Resolution
    const baseZoom = isPortrait
      ? Math.min(vw / 560, vh / 860)
      : Math.min(vw / 1280, vh / 740);
    const zoom = Math.max(0.62, Math.min(1.45, +baseZoom.toFixed(2)));

    if (this.camera) {
      this.camera.zoom = zoom;
      this.camera.viewW = vw / zoom;
      this.camera.viewH = vh / zoom;
    }

    // 5. Update Resolution Label on Title Screen
    const resLabel = document.getElementById('detected-resolution-label');
    if (resLabel) {
      resLabel.textContent =
        `📐 SCREEN: ${vw}×${vh} (${dpr.toFixed(1)}x DPI) • TIER: ${tier.toUpperCase()} ${isPortrait ? 'PORTRAIT' : 'LANDSCAPE'} • ZOOM: ${zoom}x`;
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
      // Do not intercept keys when typing in room code or callsign input
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) {
        return;
      }

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
      } else if (e.code === 'Digit1') {
        this.network.sendEmote('😾 HISS!!');
      } else if (e.code === 'Digit2') {
        this.network.sendEmote('🍕 PIZZA HERE!');
      } else if (e.code === 'Digit3') {
        this.network.sendEmote('🚨 COPS INCOMING!');
      } else if (e.code === 'Digit4') {
        this.network.sendEmote('🛴 SICK TRICK!');
      } else if (e.code === 'KeyT') {
        this.network.warpToPlayer();
      }

      if (this.player2) {
        if (e.code === 'Numpad0' || e.code === 'Enter') {
          e.preventDefault();
          this.player2.triggerBunnyHop(this.entities);
        } else if (e.code === 'Numpad1' || e.code === 'Comma') {
          this.player2.togglePlayDead(this.entities, this);
        } else if (e.code === 'Numpad2' || e.code === 'Period') {
          this.player2.performActionCrime(this.world, this.entities, this);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Auto-detect touch usage anywhere on screen
    window.addEventListener('touchstart', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON')) {
        return;
      }
      if (!this.manualInputOverride && this.inputMethod !== 'touch') {
        this.setInputMethod('touch', false);
      }
    }, { passive: true });

    // Listen for responsive mode / device media-query changes
    if (window.matchMedia) {
      const mq = window.matchMedia('(pointer: coarse)');
      if (mq.addEventListener) {
        mq.addEventListener('change', () => {
          this.manualInputOverride = false;
          this.detectInitialInputMethod();
        });
      }
    }

    // Title Screen Input Mode Selector buttons
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

    // Play Mode Selector buttons (1P Solo / 2P Local / Online Cross-Platform)
    const title1pBtn = document.getElementById('title-mode-1p');
    const title2pBtn = document.getElementById('title-mode-2p');
    const titleOnlineBtn = document.getElementById('title-mode-online');
    const titleOnlineBox = document.getElementById('title-online-box');
    this.selectedPlayMode = '1p'; // '1p' | '2p' | 'online'

    const setPlayMode = (mode) => {
      this.selectedPlayMode = mode;
      title1pBtn?.classList.toggle('active', mode === '1p');
      title2pBtn?.classList.toggle('active', mode === '2p');
      titleOnlineBtn?.classList.toggle('active', mode === 'online');
      titleOnlineBox?.classList.toggle('hidden', mode !== 'online');
    };

    title1pBtn?.addEventListener('click', () => setPlayMode('1p'));
    title2pBtn?.addEventListener('click', () => setPlayMode('2p'));
    titleOnlineBtn?.addEventListener('click', () => setPlayMode('online'));

    // Mouse buttons for quick tricks / action (only when in keyboard/mouse mode)
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.paused || this.inputMethod === 'touch') return;
      if (e.button === 0) {
        if (this.player.z > 10 && this.player.role === 'possum') {
          this.player.performAirTrick('KICKFLIP', this.entities);
        } else {
          this.player.performActionCrime(this.world, this.entities, this);
        }
      } else if (e.button === 2) {
        this.player.triggerBunnyHop(this.entities);
      }
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Start Game Button
    document.getElementById('btn-start-game').addEventListener('click', () => {
      if (this.selectedPlayMode === '2p') {
        this.player2 = new Player(this.world.hideout.x + 28, this.world.hideout.y);
        this.player2.isPlayer2 = true;
      } else {
        this.player2 = null;
      }

      if (this.selectedPlayMode === 'online') {
        const codeInput = document.getElementById('title-mp-code');
        const modalInput = document.getElementById('mp-room-input');
        const enteredCode = codeInput ? codeInput.value.trim().toUpperCase() : '';
        if (enteredCode && (!this.network.connected || this.network.roomCode !== enteredCode)) {
          const joined = this.network.joinRoom(enteredCode);
          if (codeInput) codeInput.value = joined;
          if (modalInput) modalInput.value = joined;
        } else if (!this.network.connected) {
          const hosted = this.network.hostRoom();
          if (codeInput) codeInput.value = hosted;
          if (modalInput) modalInput.value = hosted;
        } else {
          this.network.sendHello();
        }
      }

      SFX.init();
      SFX.startBGM(() => this.wantedLevel);
      document.getElementById('title-modal').classList.add('hidden');
      this.paused = false;
      this.ui.updateRoleControlLabels();
      this.ui.updateHUD();
    });

    // Shop Modal Buttons
    document.getElementById('btn-shop').addEventListener('click', () => this.toggleShop());
    document.getElementById('touch-btn-shop').addEventListener('click', () => this.toggleShop());
    document.getElementById('btn-close-shop').addEventListener('click', () => this.toggleShop());
    document.getElementById('btn-resume').addEventListener('click', () => this.toggleShop());

    // Multiplayer Lobby Modal Buttons
    document.getElementById('btn-mp-lobby')?.addEventListener('click', () => this.toggleMpModal());
    document.getElementById('touch-btn-mp')?.addEventListener('click', () => this.toggleMpModal());
    document.getElementById('btn-close-mp')?.addEventListener('click', () => this.toggleMpModal());
    document.getElementById('btn-mp-resume')?.addEventListener('click', () => this.toggleMpModal());

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
        SFX.upgradeBuy();
        this.entities.addFloatingText(this.player.x, this.player.y - 30, "🍕 FULL GRIT RESTORED!", "#51cf66", 17);
        this.ui.renderShop();
        this.ui.updateHUD();
      }
    });

    const toggleMuteBoth = () => {
      const muted = SFX.toggleMute();
      const icon = muted ? '🔇' : '🔊';
      document.getElementById('btn-mute').textContent = icon;
      document.getElementById('touch-btn-mute').textContent = icon;
    };
    document.getElementById('btn-mute').addEventListener('click', toggleMuteBoth);
    document.getElementById('touch-btn-mute').addEventListener('click', toggleMuteBoth);

    document.getElementById('btn-respawn').addEventListener('click', () => {
      document.getElementById('busted-modal').classList.add('hidden');
      this.bustedModalOpen = false;
      this.player.reset();
      if (this.player2) this.player2.reset();
      this.heat = 0;
      this.wantedLevel = 0;
      this.entities.authorities = [];
      this.entities.nets = [];
      this.paused = false;
      this.ui.updateHUD();
    });
  }

  bindTouchControls() {
    const joyZone = document.getElementById('touch-joystick-zone');
    const joyBase = document.getElementById('joystick-base');
    const joyKnob = document.getElementById('joystick-knob');

    const updateJoystickFromPoint = (clientX, clientY) => {
      const maxRadius = this.joyMaxRadius || 44;
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
      SFX.init();
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
          SFX.init();
          this.touchState.joyTouchId = t.identifier;
          canvasOriginX = t.clientX;
          canvasOriginY = t.clientY;
          break;
        }
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (this.touchState.joyTouchId === null) return;
      const maxRadius = this.joyMaxRadius || 44;
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
        SFX.init();
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

    // 3. CRIME / TAG / FIRE NET Button
    bindActionBtn('touch-btn-crime', () => {
      this.player.performActionCrime(this.world, this.entities, this);
    });

    // 4. PLAY DEAD / SIREN Button
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
    if (this.mpModalOpen) this.toggleMpModal();
    this.shopOpen = !this.shopOpen;
    const modal = document.getElementById('shop-modal');
    if (this.shopOpen) {
      this.paused = true;
      this.ui.renderShop();
      modal.classList.remove('hidden');
    } else {
      this.paused = false;
      modal.classList.add('hidden');
    }
  }

  toggleMpModal() {
    if (this.shopOpen) this.toggleShop();
    this.mpModalOpen = !this.mpModalOpen;
    const modal = document.getElementById('mp-modal');
    if (this.mpModalOpen) {
      this.paused = true;
      this.ui.updateMultiplayerUI();
      modal.classList.remove('hidden');
    } else {
      this.paused = false;
      modal.classList.add('hidden');
    }
  }

  addShinies(amount, x, y, icon = '✨') {
    const distMult = this.world.getDistrictAt(this.player.x, this.player.y).lootMult || 1.0;
    const finalAmt = Math.round(amount * this.comboMultiplier * distMult);
    this.shinies += finalAmt;
    this.infamy += finalAmt * 5;
    this.checkDistrictUnlocks();
    this.ui.updateHUD();
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
      SFX.sirenchirp();
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

    // Broadcast crime to Cross-Platform Peers
    if (this.network && this.network.connected) {
      this.network.broadcastEvent('crime', {
        title: crimeTitle,
        reward: totalReward,
        totalInfamy: this.infamy,
        heat: this.heat,
        heatAdded,
        category: crimeCategory,
        x: Math.round(this.player.x),
        y: Math.round(this.player.y)
      });
    }

    // Check active Street Challenge (Bounty)
    this.checkBountyProgress(crimeCategory);
    this.ui.updateHUD();
  }

  checkDistrictUnlocks() {
    for (const d of this.world.districts) {
      if (!d.unlocked && this.infamy >= d.reqInfamy) {
        d.unlocked = true;
        SFX.zoneUnlock();
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

  checkBountyProgress(category, fromNetwork = false) {
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
        SFX.upgradeBuy();
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
    // In Online Multiplayer, auto-respawn or allow Co-op Teammate Revive without freezing the world!
    const penalty = Math.floor(this.shinies * 0.2);
    this.shinies = Math.max(0, this.shinies - penalty);

    if (this.network && this.network.connected) {
      this.bustedModalOpen = true;
      document.getElementById('busted-reason').textContent =
        `You got scooped up by ${caughtBy}! (-${penalty} ✨ Shinies). Click below to break out immediately, or wait for a Co-op Possum teammate to ride over and revive you!`;
    } else {
      this.paused = true;
      document.getElementById('busted-reason').textContent =
        `You got scooped up by ${caughtBy}! Animal Control confiscated ${penalty} ✨ Shinies as "evidence", but you kept all your scooter upgrades!`;
    }

    document.getElementById('busted-stats').innerHTML = `
      <div>💀 Total Infamy: ${this.infamy}</div>
      <div>✨ Remaining Shinies: ${this.shinies}</div>
      <div>🚨 Crimes Committed: ${this.crimesCommitted}</div>
    `;
    document.getElementById('busted-modal').classList.remove('hidden');
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

    // Remote Multiplayer Peers on Minimap (with pulsing beacon ring & name tag)
    if (this.network && this.network.connected) {
      const pulse = 5.5 + Math.sin(this.time * 7) * 2.5;
      for (const rp of this.network.remotePlayers.values()) {
        const mx = rp.x * scaleX;
        const my = rp.y * scaleY;
        const pCol = rp.role === 'cop' ? '#339af0' : (rp.color || '#15aabf');

        ctx.strokeStyle = pCol;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = pCol;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = '900 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((rp.name || 'P2').slice(0, 6), mx, my - 7);
      }
    }

    // Local Player 2 (if active)
    if (this.player2) {
      ctx.fillStyle = '#339af0';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(this.player2.x * scaleX, this.player2.y * scaleY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Local Player 1 (bright yellow dot)
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
      this.gamepadActive = true;
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

    if (btnA || btnB || btnX || btnY) this.gamepadActive = true;

    if (btnA && !this.prevGpA) this.player.triggerBunnyHop(this.entities);
    if (btnX && !this.prevGpX) this.player.performActionCrime(this.world, this.entities, this);
    if (btnY && !this.prevGpY) this.player.togglePlayDead(this.entities, this);
    this.touchState.boostPressed = !!btnB;

    this.prevGpA = btnA;
    this.prevGpX = btnX;
    this.prevGpY = btnY;

    // Player 2 Gamepad support
    const gp2 = pads[1];
    if (gp2 && this.player2) {
      const ax2 = gp2.axes[0] || 0;
      const ay2 = gp2.axes[1] || 0;
      if (Math.hypot(ax2, ay2) > 0.2) {
        this.player2.angle = Math.atan2(ay2, ax2);
        this.player2.vx += Math.cos(this.player2.angle) * 340 * 0.05;
        this.player2.vy += Math.sin(this.player2.angle) * 340 * 0.05;
      }
      const btnA2 = gp2.buttons[0] && gp2.buttons[0].pressed;
      const btnB2 = (gp2.buttons[1] && gp2.buttons[1].pressed) || (gp2.buttons[7] && gp2.buttons[7].pressed);
      const btnX2 = gp2.buttons[2] && gp2.buttons[2].pressed;
      const btnY2 = gp2.buttons[3] && gp2.buttons[3].pressed;

      if (btnA2 && !this.prevGpA2) this.player2.triggerBunnyHop(this.entities);
      if (btnX2 && !this.prevGpX2) this.player2.performActionCrime(this.world, this.entities, this);
      if (btnY2 && !this.prevGpY2) this.player2.togglePlayDead(this.entities, this);
      this.player2.boostActive = !!btnB2;

      this.prevGpA2 = btnA2;
      this.prevGpX2 = btnX2;
      this.prevGpY2 = btnY2;
    }
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.lastFrameTime) / 1000);
    this.lastFrameTime = now;

    // Always keep network packets & interpolation alive even if shop/modal is open!
    if (this.network) {
      this.network.update(dt);
    }

    if (!this.paused) {
      this.time += dt;
      this.pollGamepad();

      // Update World, Player, and Entities
      this.world.update(dt);
      if (!this.bustedModalOpen) {
        this.player.update(dt, this.keys, this.world, this.entities, this);
      }
      if (this.player2) {
        this.player2.update(dt, this.keys, this.world, this.entities, this);
      }
      const players = this.player2 ? [this.player, this.player2] : [this.player];
      this.entities.update(dt, players, this);

      // Natural slow heat decay or fast hideout decay
      const inHideout = !!this.world.isInsideAnyHideout(this.player.x, this.player.y) ||
        (this.player2 && !!this.world.isInsideAnyHideout(this.player2.x, this.player2.y));
      if (inHideout) {
        this.reduceHeat(25 * dt);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 8 * dt);
        if (this.player2) this.player2.hp = Math.min(this.player2.maxHp, this.player2.hp + 8 * dt);
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

      // Smooth Camera with Velocity Look-Ahead & Adaptive Resolution View Size
      let avgX = this.player.x;
      let avgY = this.player.y;
      let lookAheadX = this.player.vx * 0.22;
      let lookAheadY = this.player.vy * 0.22;

      if (this.player2) {
        avgX = (this.player.x + this.player2.x) / 2;
        avgY = (this.player.y + this.player2.y) / 2;
        lookAheadX = (this.player.vx + this.player2.vx) * 0.11;
        lookAheadY = (this.player.vy + this.player2.vy) * 0.11;
      }

      const targetCamX = avgX + lookAheadX - this.camera.viewW / 2;
      const targetCamY = avgY + lookAheadY - this.camera.viewH / 2;

      this.camera.x += (targetCamX - this.camera.x) * Math.min(1, dt * 7);
      this.camera.y += (targetCamY - this.camera.y) * Math.min(1, dt * 7);

      if (this.camera.shakeTimer > 0) {
        this.camera.shakeTimer -= dt;
      }

      this.ui.updateContextualPrompt();
      this.ui.updateHUD();
    }

    this.render();
    this.drawMinimap();

    requestAnimationFrame((t) => this.loop(t));
  }

  render() {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    const scale = (this.dpr || 1) * (this.camera.zoom || 1);
    ctx.scale(scale, scale);

    let shakeX = 0;
    let shakeY = 0;
    if (this.camera.shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * this.camera.shakeMag * 2;
      shakeY = (Math.random() - 0.5) * this.camera.shakeMag * 2;
    }

    ctx.translate(-this.camera.x + shakeX, -this.camera.y + shakeY);

    // Draw World, Entities, Remote Cross-Platform Players & Local Players
    this.world.draw(ctx, this.camera, this.time);
    this.entities.draw(ctx, this.time);
    if (this.network && this.network.connected) {
      this.network.drawRemotePlayers(ctx, this.time);
    }
    this.player.draw(ctx, this.time);
    if (this.player2) this.player2.draw(ctx, this.time);

    ctx.restore();
  }
}
