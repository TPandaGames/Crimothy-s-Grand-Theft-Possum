// js/network.js — Cross-Platform Multiplayer Engine (WebRTC P2P via PeerJS + BroadcastChannel Local Fallback)
// Supports Desktop (Windows/Mac/Linux), Mobile (iOS/Android), Tablets & Gamepads across 3 Modes:
// 1. Co-op Syndicate (Shared crimes, infamy, district unlocks & teammate revives)
// 2. Turf War Versus (Competitive Infamy race + Rival Scooter Bash to knock loose shinies)
// 3. Possums vs. Animal Control (Asymmetric Cops & Robbers — play as Possum or Animal Control!)

import { SFX } from './audio.js';

const PEER_PREFIX = 'crimothy-xplat-v3-';

export const PLAYER_COLORS = [
  { id: 'red',    name: 'Punk Red',     hex: '#e03131', fur: '#868e96' },
  { id: 'cyan',   name: 'Neon Cyan',    hex: '#15aabf', fur: '#748ffc' },
  { id: 'green',  name: 'Toxic Lime',   hex: '#51cf66', fur: '#8ce99a' },
  { id: 'gold',   name: 'Trash Gold',   hex: '#fcc419', fur: '#adb5bd' },
  { id: 'purple', name: 'Synth Purple', hex: '#be4bdb', fur: '#a08696' },
  { id: 'pink',   name: 'Hot Pink',     hex: '#f783ac', fur: '#ced4da' }
];

export const COP_VEHICLES = [
  { id: 'catcher', name: 'Net Catcher',       icon: '🕸️', speed: 325, hp: 120, desc: 'Fast foot officer with rapid-fire Capture Nets [E]' },
  { id: 'k9',      name: 'K-9 Bloodhound',    icon: '🐕', speed: 355, hp: 100, desc: 'Ultra-fast tracker that sniffs out Playing Dead possums!' },
  { id: 'swatvan', name: 'Warden Net-Cruiser', icon: '🚓', speed: 340, hp: 160, desc: 'Heavy Armored Van with Siren Shockwave [Q] & Net Cannon [E]' }
];

export class NetworkManager {
  constructor(game) {
    this.game = game;

    this.localId = 'p' + Math.random().toString(36).substring(2, 9);
    const defaultColors = PLAYER_COLORS.map((c) => c.hex);
    const randomColor = defaultColors[Math.floor(Math.random() * defaultColors.length)];

    this.playerName = localStorage.getItem('crimothy_name') || `POSSUM-${Math.floor(100 + Math.random() * 899)}`;
    this.playerColor = localStorage.getItem('crimothy_color') || randomColor;
    this.playerRole = 'possum'; // 'possum' | 'cop'
    this.copVehicle = 'catcher'; // 'catcher' | 'k9' | 'swatvan'

    // 'coop' | 'versus' | 'cops_robbers'
    this.gameMode = 'coop';

    this.roomCode = '';
    this.isHost = false;
    this.connected = false;
    this.hasSpawnedNearPeer = false;
    this.statusText = 'OFFLINE (SOLO / LOCAL)';

    // WebRTC PeerJS instance & connections map (peerId -> DataConnection)
    this.peer = null;
    this.connections = new Map();
    this.pendingHostConn = null;
    this.reconnectTimer = null;
    this.peerLoadTimer = null;
    this.heartbeatTimer = null;

    // Local BroadcastChannel for instant zero-config multi-tab / same-device testing
    this.bc = null;

    // Remote players map: id -> RemotePlayer state
    this.remotePlayers = new Map();

    // Sync timers
    this.syncAccumulator = 0;
    this.syncInterval = 0.05; // 20 Hz state sync
    this.bashCooldown = 0;

    // Dedup recent event IDs
    this.seenEvents = new Set();
  }

  getPlatformShortIcon() {
    if (this.game.gamepadActive) return '🎮';
    if (this.game.inputMethod === 'touch' || (this.game.deviceInfo && this.game.deviceInfo.isMobileOrTablet)) {
      return '📱';
    }
    return '🖥️';
  }

  getPlatformName() {
    if (this.game.gamepadActive) return 'Gamepad';
    if (this.game.deviceInfo) return this.game.deviceInfo.platformName;
    return 'Desktop';
  }

  generateRoomCode() {
    const words = ['TRASH', 'POSUM', 'SCOOT', 'SHINY', 'HISS9', 'ALLEY', 'CRIME', 'PIZZA', 'DUMP5', 'NEON8'];
    const base = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(10 + Math.random() * 89);
    return `${base.slice(0, 3)}${num}`;
  }

  setProfile({ name, color, role, copVehicle, gameMode }) {
    if (name !== undefined) {
      this.playerName = (name.trim().slice(0, 14) || 'CRIMOTHY').toUpperCase();
      localStorage.setItem('crimothy_name', this.playerName);
    }
    if (color !== undefined) {
      this.playerColor = color;
      localStorage.setItem('crimothy_color', this.playerColor);
      if (this.game.player) this.game.player.customColor = this.playerColor;
    }
    if (role !== undefined) {
      this.playerRole = role;
      if (this.game.player) {
        this.game.player.role = role;
        this.game.player.copVehicle = this.copVehicle;
      }
    }
    if (copVehicle !== undefined) {
      this.copVehicle = copVehicle;
      if (this.game.player) {
        this.game.player.copVehicle = copVehicle;
      }
    }
    if (gameMode !== undefined) {
      this.gameMode = gameMode;
      if (this.isHost && this.connected) {
        this.broadcastEvent('mode_change', { gameMode: this.gameMode });
      }
    }
    if (this.connected) {
      this.broadcastStatePacket();
    }
    this.game.ui.updateMultiplayerUI();
  }

  applySpawnOffset() {
    let hash = 0;
    for (let i = 0; i < this.localId.length; i++) {
      hash = (hash * 31 + this.localId.charCodeAt(i)) & 0xffff;
    }
    const ang = (hash % 360) * (Math.PI / 180);
    const dist = 36 + (hash % 20);
    const p = this.game.player;
    if (p && Math.hypot(p.x - this.game.world.hideout.x, p.y - this.game.world.hideout.y) < 75) {
      p.x = this.game.world.hideout.x + Math.cos(ang) * dist;
      p.y = this.game.world.hideout.y + Math.sin(ang) * dist;
      p.spawnX = p.x;
      p.spawnY = p.y;
    }
  }

  spawnNearRemotePlayer(rp, announce = true) {
    if (!rp || typeof rp.x !== 'number' || typeof rp.y !== 'number') return;
    const p = this.game.player;
    if (!p) return;

    // Pick a spot ~48px beside the target player that is not inside a building
    let placed = false;
    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4 + 0.4;
      const tx = Math.max(40, Math.min(this.game.world.width - 40, rp.x + Math.cos(ang) * 52));
      const ty = Math.max(40, Math.min(this.game.world.height - 40, rp.y + Math.sin(ang) * 52));
      if (!this.game.entities.isInsideBuilding(tx, ty, p.r + 4)) {
        p.x = tx;
        p.y = ty;
        placed = true;
        break;
      }
    }
    if (!placed) {
      p.x = rp.x + 35;
      p.y = rp.y;
    }

    p.vx = 0;
    p.vy = 0;
    this.game.camera.x = p.x - this.game.camera.viewW / 2;
    this.game.camera.y = p.y - this.game.camera.viewH / 2;

    if (announce) {
      SFX.bunnyHop();
      this.game.entities.addParticles(p.x, p.y, '#63e6be', 18, 160, 5);
      this.game.entities.addFloatingText(p.x, p.y - 42, `⚡ WARPED TO ${rp.name}!`, '#63e6be', 16);
    }
    this.broadcastStatePacket();
  }

  warpToPlayer(targetId = null) {
    if (this.remotePlayers.size === 0) return;
    let target = targetId ? this.remotePlayers.get(targetId) : null;
    if (!target) {
      target = this.remotePlayers.values().next().value;
    }
    if (target) {
      this.spawnNearRemotePlayer(target, true);
    }
  }

  startBackgroundHeartbeat() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    // Keep broadcasting state even when browser tab is in the background (where requestAnimationFrame pauses!)
    this.heartbeatTimer = setInterval(() => {
      if (!this.connected) return;
      this.broadcastStatePacket();
    }, 120);
  }

  hostRoom(customCode = '') {
    this.disconnect();
    const cleaned = (customCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    this.roomCode = (cleaned || this.generateRoomCode()).slice(0, 8);
    this.isHost = true;
    this.connected = true;
    this.hasSpawnedNearPeer = true; // Host stays at their position
    this.statusText = `HOSTING ROOM: ${this.roomCode}`;

    this.applySpawnOffset();
    this.setupBroadcastChannel(this.roomCode);
    this.setupPeerJS(this.roomCode, true);
    this.startBackgroundHeartbeat();
    this.sendHello();
    this.broadcastStatePacket();

    this.game.ui.updateMultiplayerUI();
    return this.roomCode;
  }

  joinRoom(code) {
    const clean = (code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!clean) return '';

    this.disconnect();
    this.roomCode = clean;
    this.isHost = false;
    this.connected = true;
    this.hasSpawnedNearPeer = false; // Will auto-spawn next to first discovered peer!
    this.statusText = `CONNECTING TO ${this.roomCode}...`;

    this.applySpawnOffset();
    this.setupBroadcastChannel(this.roomCode);
    // Try claiming hostPeerId first in case no one has hosted this code yet;
    // if someone is already hosting it, PeerJS fires 'unavailable-id' and automatically connects as client!
    this.setupPeerJS(this.roomCode, true);
    this.startBackgroundHeartbeat();

    // Send immediate hello + state on BroadcastChannel in case peer is on same browser/device
    this.sendHello();
    this.broadcastStatePacket();
    this.game.ui.updateMultiplayerUI();
    return this.roomCode;
  }

  disconnect() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.peerLoadTimer) {
      clearTimeout(this.peerLoadTimer);
      this.peerLoadTimer = null;
    }
    if (this.connected) {
      this.broadcastRaw({
        type: 'leave',
        senderId: this.localId
      });
    }
    if (this.bc) {
      try { this.bc.close(); } catch (_) {}
      this.bc = null;
    }
    for (const conn of this.connections.values()) {
      try { conn.close(); } catch (_) {}
    }
    this.connections.clear();
    this.pendingHostConn = null;
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
      this.peer = null;
    }
    this.remotePlayers.clear();
    this.connected = false;
    this.isHost = false;
    this.roomCode = '';
    this.statusText = 'OFFLINE (SOLO / LOCAL)';
    this.game.ui.updateMultiplayerUI();
  }

  setupBroadcastChannel(roomCode) {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      this.bc = new BroadcastChannel(`crimothy_room_${roomCode}`);
      this.bc.onmessage = (ev) => {
        if (ev && ev.data) {
          this.handleIncomingPacket(ev.data, null);
        }
      };
      if (this.isHost) {
        this.statusText = `LIVE ROOM: ${this.roomCode} (READY)`;
      } else {
        this.statusText = `IN ROOM: ${this.roomCode}`;
      }
    } catch (_) {}
  }

  setupPeerJS(roomCode, tryAsHost, retryCount = 0) {
    const PeerClass = window.Peer;
    if (!PeerClass) {
      if (retryCount < 20) {
        this.peerLoadTimer = setTimeout(() => {
          if (this.connected && this.roomCode === roomCode) {
            this.setupPeerJS(roomCode, tryAsHost, retryCount + 1);
          }
        }, 300);
      } else {
        this.statusText = `ROOM: ${roomCode} (LOCAL LAN/TAB MODE)`;
        this.game.ui.updateMultiplayerUI();
      }
      return;
    }

    const hostPeerId = `${PEER_PREFIX}${roomCode}`;
    const myPeerId = tryAsHost ? hostPeerId : `${PEER_PREFIX}${roomCode}-${this.localId}`;

    try {
      if (this.peer) {
        try { this.peer.destroy(); } catch (_) {}
      }

      this.peer = new PeerClass(myPeerId, {
        debug: 0,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun.cloudflare.com:3478' }
          ]
        }
      });

      this.peer.on('open', () => {
        if (!this.connected || this.roomCode !== roomCode) return;
        this.isHost = tryAsHost;
        if (tryAsHost) {
          this.statusText = `HOSTING: ${roomCode} (${this.getPlayerCount()}P ONLINE)`;
          this.game.ui.updateMultiplayerUI();
        } else {
          this.connectToHostPeer(hostPeerId);
          if (this.reconnectTimer) clearInterval(this.reconnectTimer);
          this.reconnectTimer = setInterval(() => {
            if (!this.connected || this.isHost) {
              clearInterval(this.reconnectTimer);
              this.reconnectTimer = null;
              return;
            }
            const existing = this.connections.get(hostPeerId);
            if ((!existing || !existing.open) && (!this.pendingHostConn || !this.pendingHostConn.open)) {
              this.connectToHostPeer(hostPeerId);
            }
          }, 2500);
        }
      });

      this.peer.on('connection', (conn) => {
        this.registerPeerConnection(conn);
      });

      this.peer.on('error', (err) => {
        // If room ID is already taken on PeerServer, someone is already hosting this room code — connect to them as client!
        if (tryAsHost && err && err.type === 'unavailable-id') {
          this.isHost = false;
          this.statusText = `JOINING ROOM ${roomCode}...`;
          try { this.peer.destroy(); } catch (_) {}
          this.peer = null;
          this.setupPeerJS(roomCode, false);
          return;
        }
        if (this.connected) {
          this.statusText = `${this.isHost ? 'HOSTING' : 'IN ROOM'}: ${this.roomCode} (${this.getPlayerCount()}P)`;
          this.game.ui.updateMultiplayerUI();
        }
      });
    } catch (_) {
      this.statusText = `ROOM ${roomCode} (LOCAL MODE)`;
      this.game.ui.updateMultiplayerUI();
    }
  }

  connectToHostPeer(hostPeerId) {
    if (!this.peer || this.peer.destroyed || !this.peer.open) return;
    try {
      const conn = this.peer.connect(hostPeerId);
      if (conn) {
        this.pendingHostConn = conn;
        this.registerPeerConnection(conn);
      }
    } catch (_) {}
  }

  registerPeerConnection(conn) {
    if (!conn) return;

    const onOpen = () => {
      this.connections.set(conn.peer, conn);
      this.statusText = `${this.isHost ? 'HOSTING' : 'IN ROOM'}: ${this.roomCode} (${this.getPlayerCount()}P ONLINE)`;
      this.sendHello(conn, false);
      this.broadcastStatePacket();
      if (this.isHost) {
        this.sendWorldSnapshot(conn);
      }
      this.game.ui.updateMultiplayerUI();
    };

    if (conn.open) {
      onOpen();
    } else {
      conn.on('open', onOpen);
    }

    conn.on('data', (data) => {
      this.handleIncomingPacket(data, conn);
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      if (this.pendingHostConn === conn) this.pendingHostConn = null;
      this.game.ui.updateMultiplayerUI();
    });

    conn.on('error', () => {
      this.connections.delete(conn.peer);
      if (this.pendingHostConn === conn) this.pendingHostConn = null;
    });
  }

  sendHello(targetConn = null, isReply = false) {
    const p = this.game.player;
    const pkt = {
      type: 'hello',
      isReply,
      senderId: this.localId,
      name: this.playerName,
      color: this.playerColor,
      role: this.playerRole,
      copVehicle: this.copVehicle,
      platformIcon: this.getPlatformShortIcon(),
      platformName: this.getPlatformName(),
      gameMode: this.gameMode,
      x: p ? Math.round(p.x) : 400,
      y: p ? Math.round(p.y) : 400
    };
    if (targetConn && targetConn.open) {
      try { targetConn.send(pkt); } catch (_) {}
    } else {
      this.broadcastRaw(pkt);
    }
  }

  broadcastStatePacket() {
    if (!this.connected || !this.game.player) return;
    const p = this.game.player;
    this.broadcastRaw({
      type: 'state',
      senderId: this.localId,
      name: this.playerName,
      color: this.playerColor,
      role: this.playerRole,
      copVehicle: this.copVehicle,
      platformIcon: this.getPlatformShortIcon(),
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      vx: Math.round(p.vx),
      vy: Math.round(p.vy),
      z: Math.round(p.z),
      angle: +(p.angle.toFixed(3)),
      speed: Math.round(p.speed),
      airTrickAngle: +(p.airTrickAngle.toFixed(2)),
      deckSpinAngle: +(p.deckSpinAngle.toFixed(2)),
      isPlayingDead: p.isPlayingDead,
      boostActive: p.boostActive,
      hp: Math.round(p.hp),
      maxHp: p.maxHp,
      shinies: this.game.shinies,
      infamy: this.game.infamy,
      busts: p.busts || 0,
      upgrades: p.upgrades
    });
  }

  sendWorldSnapshot(targetConn = null) {
    if (!this.isHost) return;
    const unlockedIds = this.game.world.districts.filter((d) => d.unlocked).map((d) => d.id);
    const taggedIndices = [];
    this.game.world.graffitiSpots.forEach((g, idx) => {
      if (g.tagged) taggedIndices.push(idx);
    });

    const pkt = {
      type: 'world_snapshot',
      senderId: this.localId,
      gameMode: this.gameMode,
      infamy: this.game.infamy,
      heat: this.game.heat,
      wantedLevel: this.game.wantedLevel,
      bountyIdx: this.game.currentBountyIdx,
      bountyProgress: this.game.bounties[this.game.currentBountyIdx]?.progress || 0,
      unlockedIds,
      taggedIndices
    };
    if (targetConn && targetConn.open) {
      try { targetConn.send(pkt); } catch (_) {}
    } else {
      this.broadcastRaw(pkt);
    }
  }

  broadcastRaw(packet, excludeConn = null) {
    if (!this.connected) return;

    // 1. Send over BroadcastChannel (same device / multi-tab)
    if (this.bc) {
      try {
        this.bc.postMessage(packet);
      } catch (_) {}
    }

    // 2. Send over WebRTC PeerJS DataConnections
    for (const conn of this.connections.values()) {
      if (conn !== excludeConn && conn.open) {
        try {
          conn.send(packet);
        } catch (_) {}
      }
    }
  }

  broadcastEvent(eventType, payload = {}) {
    if (!this.connected) return;
    const eventId = `${this.localId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.seenEvents.add(eventId);
    this.broadcastRaw({
      type: 'event',
      eventId,
      senderId: this.localId,
      senderName: this.playerName,
      eventType,
      payload
    });
  }

  handleIncomingPacket(data, sourceConn) {
    if (!data || data.senderId === this.localId) return;

    // If we are the Host and received a packet over WebRTC from client A, relay it to other WebRTC clients B, C...
    if (this.isHost && sourceConn && this.connections.size > 1) {
      for (const conn of this.connections.values()) {
        if (conn !== sourceConn && conn.open) {
          try { conn.send(data); } catch (_) {}
        }
      }
    }

    if (data.type === 'hello') {
      const isNewPeer = !this.remotePlayers.has(data.senderId);
      const rp = this.ensureRemotePlayer(data.senderId, data);
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        rp.x = data.x;
        rp.y = data.y;
        rp.targetX = data.x;
        rp.targetY = data.y;
      }

      // If we just joined this room, spawn right next to the first peer we discover so we're immediately visible together!
      if (!this.hasSpawnedNearPeer && typeof data.x === 'number' && typeof data.y === 'number') {
        this.hasSpawnedNearPeer = true;
        this.spawnNearRemotePlayer(rp, false);
      }

      // Reply with our own hello + state so the joining peer immediately sees us!
      if (!data.isReply) {
        this.sendHello(sourceConn, true);
        this.broadcastStatePacket();
      }
      if (this.isHost) {
        this.sendWorldSnapshot(sourceConn);
      }

      this.statusText = `${this.isHost ? 'HOSTING' : 'IN ROOM'}: ${this.roomCode} (${this.getPlayerCount()}P ONLINE)`;

      if (isNewPeer) {
        this.game.entities.addFloatingText(
          this.game.player.x,
          this.game.player.y - 50,
          `${data.platformIcon || '🌐'} ${data.name} JOINED THE STREETS!`,
          '#63e6be',
          16
        );
        this.addCrimeToast(`${data.platformIcon || '🌐'} ${data.name} joined (${data.role === 'cop' ? '🚨 COP' : '🦝 POSSUM'})`);
      }
      this.game.ui.updateMultiplayerUI();
      return;
    }

    if (data.type === 'leave') {
      const rp = this.remotePlayers.get(data.senderId);
      if (rp) {
        this.addCrimeToast(`👋 ${rp.name} left the room`);
        this.remotePlayers.delete(data.senderId);
        this.statusText = `${this.isHost ? 'HOSTING' : 'IN ROOM'}: ${this.roomCode} (${this.getPlayerCount()}P ONLINE)`;
        this.game.ui.updateMultiplayerUI();
      }
      return;
    }

    if (data.type === 'world_snapshot' && !this.isHost) {
      this.gameMode = data.gameMode || this.gameMode;
      if (this.gameMode === 'coop') {
        this.game.infamy = Math.max(this.game.infamy, data.infamy || 0);
        this.game.heat = data.heat || 0;
        this.game.wantedLevel = data.wantedLevel || 0;
        if (typeof data.bountyIdx === 'number') {
          this.game.currentBountyIdx = data.bountyIdx;
          if (this.game.bounties[this.game.currentBountyIdx]) {
            this.game.bounties[this.game.currentBountyIdx].progress = data.bountyProgress || 0;
          }
        }
      }
      if (Array.isArray(data.unlockedIds)) {
        for (const id of data.unlockedIds) {
          const dist = this.game.world.districts.find((d) => d.id === id);
          if (dist) dist.unlocked = true;
        }
      }
      if (Array.isArray(data.taggedIndices)) {
        for (const idx of data.taggedIndices) {
          if (this.game.world.graffitiSpots[idx]) {
            this.game.world.graffitiSpots[idx].tagged = true;
          }
        }
      }
      this.game.ui.updateHUD();
      this.game.ui.updateMultiplayerUI();
      return;
    }

    if (data.type === 'state') {
      const isNew = !this.remotePlayers.has(data.senderId);
      const rp = this.ensureRemotePlayer(data.senderId, data);
      if ((isNew || Math.hypot(data.x - rp.x, data.y - rp.y) > 400) && typeof data.x === 'number' && typeof data.y === 'number') {
        rp.x = data.x;
        rp.y = data.y;
      }
      if (!this.hasSpawnedNearPeer && typeof data.x === 'number' && typeof data.y === 'number') {
        this.hasSpawnedNearPeer = true;
        this.spawnNearRemotePlayer(rp, false);
      }
      rp.targetX = data.x;
      rp.targetY = data.y;
      rp.vx = data.vx || 0;
      rp.vy = data.vy || 0;
      rp.z = data.z || 0;
      rp.angle = data.angle || 0;
      rp.speed = data.speed || 0;
      rp.airTrickAngle = data.airTrickAngle || 0;
      rp.deckSpinAngle = data.deckSpinAngle || 0;
      rp.isPlayingDead = !!data.isPlayingDead;
      rp.boostActive = !!data.boostActive;
      rp.hp = data.hp ?? 100;
      rp.maxHp = data.maxHp ?? 100;
      rp.role = data.role || 'possum';
      rp.copVehicle = data.copVehicle || 'catcher';
      if (data.color && data.color !== this.playerColor) {
        rp.color = data.color;
      }
      rp.name = data.name || rp.name;
      rp.platformIcon = data.platformIcon || rp.platformIcon || '🌐';
      rp.shinies = data.shinies || 0;
      rp.infamy = data.infamy || 0;
      rp.busts = data.busts || 0;
      rp.upgrades = data.upgrades || rp.upgrades;
      rp.lastSeen = performance.now();
      return;
    }

    if (data.type === 'event') {
      if (data.eventId && this.seenEvents.has(data.eventId)) return;
      if (data.eventId) {
        this.seenEvents.add(data.eventId);
        if (this.seenEvents.size > 400) {
          const first = this.seenEvents.values().next().value;
          this.seenEvents.delete(first);
        }
      }
      this.handleNetworkEvent(data.eventType, data.payload || {}, data.senderId, data.senderName);
    }
  }

  ensureRemotePlayer(id, initData = {}) {
    let rp = this.remotePlayers.get(id);
    if (!rp) {
      const sx = initData.x ?? this.game.world.hideout.x + 36;
      const sy = initData.y ?? this.game.world.hideout.y + 36;

      // Ensure remote player has a distinct high-visibility color if identical to local player
      let assignedColor = initData.color || '#15aabf';
      if (assignedColor === this.playerColor) {
        const altColors = ['#15aabf', '#51cf66', '#fcc419', '#be4bdb', '#f783ac', '#e03131'].filter((c) => c !== this.playerColor);
        assignedColor = altColors[this.remotePlayers.size % altColors.length];
      }

      rp = {
        id,
        peerIndex: this.remotePlayers.size + 2,
        name: initData.name || `POSSUM-${this.remotePlayers.size + 2}`,
        color: assignedColor,
        role: initData.role || 'possum',
        copVehicle: initData.copVehicle || 'catcher',
        platformIcon: initData.platformIcon || '🌐',
        platformName: initData.platformName || 'Player',
        x: sx,
        y: sy,
        targetX: sx,
        targetY: sy,
        vx: 0,
        vy: 0,
        z: 0,
        angle: 0,
        speed: 0,
        r: 16,
        airTrickAngle: 0,
        deckSpinAngle: 0,
        isPlayingDead: false,
        boostActive: false,
        hp: 100,
        maxHp: 100,
        shinies: 0,
        infamy: 0,
        busts: 0,
        tailPhase: 0,
        sirenWaveTimer: 0,
        emoteText: '',
        emoteTimer: 0,
        upgrades: { deck: 0, wheels: 0, rocket: 0, acting: 0, spray: 0, magnet: 0 },
        lastSeen: performance.now()
      };
      this.remotePlayers.set(id, rp);
      this.statusText = `${this.isHost ? 'HOSTING' : 'IN ROOM'}: ${this.roomCode} (${this.getPlayerCount()}P ONLINE)`;
      this.game.ui.updateMultiplayerUI();
    }
    return rp;
  }

  handleNetworkEvent(eventType, payload, senderId, senderName) {
    const g = this.game;

    if (eventType === 'mode_change') {
      this.gameMode = payload.gameMode || 'coop';
      this.addCrimeToast(`🎮 Mode set to: ${this.getModeLabel()}`);
      g.ui.updateMultiplayerUI();
      g.ui.updateHUD();
    } else if (eventType === 'crime') {
      this.addCrimeToast(`🦝 ${senderName}: ${payload.title} (+${payload.reward}✨)`);
      if (this.gameMode === 'coop') {
        g.shinies += Math.round((payload.reward || 10) * 0.5);
        g.infamy = Math.max(g.infamy, payload.totalInfamy || g.infamy + (payload.reward || 10) * 10);
        g.heat = Math.min(500, Math.max(g.heat, payload.heat || g.heat));
        g.wantedLevel = Math.min(5, Math.floor(g.heat / 85));
        g.checkDistrictUnlocks();
        if (payload.category) {
          g.checkBountyProgress(payload.category, true);
        }
        g.ui.updateHUD();
      } else if (this.gameMode === 'cops_robbers') {
        g.heat = Math.min(500, g.heat + (payload.heatAdded || 12));
        g.wantedLevel = Math.min(5, Math.floor(g.heat / 85));
        if (this.playerRole === 'cop' && payload.x && payload.y) {
          g.entities.addFloatingText(payload.x, payload.y - 40, `🚨 CRIME ALERT: ${senderName}!`, '#ff4d4f', 16);
        }
        g.ui.updateHUD();
      }
    } else if (eventType === 'prop_smash') {
      const prop = g.world.props[payload.propIndex];
      if (prop) {
        if (prop.type === 'dumpster') {
          prop.looted = true;
          prop.respawnTimer = 30;
        } else {
          prop.smashed = true;
          prop.respawnTimer = 30;
          prop.vx = payload.vx || 0;
          prop.vy = payload.vy || 0;
          if (prop.type === 'hydrant') prop.geyserTimer = 14.0;
        }
        g.entities.addParticles(prop.x, prop.y, '#ffd43b', 10, 130);
      }
    } else if (eventType === 'graffiti_tag') {
      const spot = g.world.graffitiSpots[payload.spotIndex];
      if (spot && !spot.tagged) {
        spot.tagged = true;
        g.entities.addParticles(spot.x, spot.y, '#cc5de8', 18, 150, 5);
        setTimeout(() => { spot.tagged = false; }, 45000);
      }
    } else if (eventType === 'net_fired') {
      g.entities.nets.push({
        x: payload.x,
        y: payload.y,
        vx: payload.vx,
        vy: payload.vy,
        r: 18,
        life: 1.25,
        ownerId: senderId,
        ownerName: senderName
      });
      SFX.sprayCan();
    } else if (eventType === 'siren_blast') {
      const rp = this.remotePlayers.get(senderId);
      if (rp) rp.sirenWaveTimer = 0.65;
      SFX.sirenchirp();
      g.entities.addParticles(payload.x, payload.y, '#339af0', 20, 210, 6);
      if (this.playerRole === 'possum') {
        const d = Math.hypot(g.player.x - payload.x, g.player.y - payload.y);
        if (d < 190) {
          if (g.player.isPlayingDead) {
            g.player.isPlayingDead = false;
            g.entities.addFloatingText(g.player.x, g.player.y - 36, '🚨 SIREN SPOOKED YOU AWAKE!', '#ff4d4f', 16);
          }
          g.player.takeDamage(12, `OFFICER ${senderName}'S SIREN`, g);
        }
      }
    } else if (eventType === 'pvp_bash') {
      if (payload.targetId === this.localId) {
        g.player.vx += payload.pushVx || 0;
        g.player.vy += payload.pushVy || 0;
        if (payload.damage > 0) {
          g.player.takeDamage(payload.damage, `${senderName}`, g);
        } else {
          SFX.trashCrash();
          g.triggerScreenShake(7, 0.2);
        }
        if (this.gameMode === 'versus' && g.shinies > 5) {
          const stolen = Math.min(g.shinies, Math.max(4, Math.floor(g.shinies * 0.15)));
          g.shinies -= stolen;
          g.entities.spawnLoot(g.player.x, g.player.y, 4, Math.ceil(stolen / 4));
          g.entities.addFloatingText(g.player.x, g.player.y - 42, `💥 BASHED BY ${senderName}! -${stolen}✨`, '#ff922b', 16);
          g.ui.updateHUD();
        }
      }
    } else if (eventType === 'coop_revive') {
      if (payload.targetId === this.localId) {
        g.player.hp = g.player.maxHp;
        if (g.bustedModalOpen) {
          document.getElementById('busted-modal').classList.add('hidden');
          g.bustedModalOpen = false;
          g.paused = false;
        }
        SFX.upgradeBuy();
        g.entities.addParticles(g.player.x, g.player.y, '#51cf66', 20, 160);
        g.entities.addFloatingText(g.player.x, g.player.y - 40, `💚 REVIVED & HEALED BY ${senderName}!`, '#51cf66', 17);
        g.ui.updateHUD();
      }
    } else if (eventType === 'emote') {
      const rp = this.remotePlayers.get(senderId);
      if (rp) {
        rp.emoteText = payload.text;
        rp.emoteTimer = 3.2;
        g.entities.addFloatingText(rp.x, rp.y - 44, `${rp.name}: ${payload.text}`, '#ffd43b', 15);
      }
      this.addCrimeToast(`💬 ${senderName}: ${payload.text}`);
    }
  }

  sendEmote(text) {
    const p = this.game.player;
    p.emoteText = text;
    p.emoteTimer = 3.2;
    this.game.entities.addFloatingText(p.x, p.y - 44, `${this.playerName}: ${text}`, '#ffd43b', 16);
    if (this.connected) {
      this.broadcastEvent('emote', { text });
    }
  }

  addCrimeToast(msg) {
    const feed = document.getElementById('crime-feed');
    if (!feed) return;
    const toast = document.createElement('div');
    toast.className = 'crime-toast';
    toast.style.borderLeftColor = '#63e6be';
    toast.textContent = msg;
    feed.prepend(toast);
    while (feed.children.length > 4) {
      feed.lastChild.remove();
    }
    setTimeout(() => toast.remove(), 4000);
  }

  getModeLabel() {
    if (this.gameMode === 'versus') return '⚔️ TURF WAR (VERSUS)';
    if (this.gameMode === 'cops_robbers') return '🚨 POSSUMS VS. COPS';
    return '🤝 CO-OP SYNDICATE';
  }

  getPlayerCount() {
    return 1 + this.remotePlayers.size;
  }

  getLeaderboard() {
    const list = [
      {
        id: this.localId,
        name: `${this.playerName} (YOU)`,
        role: this.playerRole,
        color: this.playerColor,
        platformIcon: this.getPlatformShortIcon(),
        hp: Math.round(this.game.player.hp),
        maxHp: this.game.player.maxHp,
        shinies: this.game.shinies,
        infamy: this.game.infamy,
        busts: this.game.player.busts || 0,
        isLocal: true
      }
    ];
    for (const rp of this.remotePlayers.values()) {
      list.push({
        id: rp.id,
        name: rp.name,
        role: rp.role,
        color: rp.color,
        platformIcon: rp.platformIcon || '🌐',
        hp: Math.round(rp.hp),
        maxHp: rp.maxHp || 100,
        shinies: rp.shinies || 0,
        infamy: rp.infamy || 0,
        busts: rp.busts || 0,
        isLocal: false
      });
    }
    list.sort((a, b) => (b.infamy + b.busts * 500) - (a.infamy + a.busts * 500));
    return list;
  }

  update(dt) {
    if (this.bashCooldown > 0) this.bashCooldown -= dt;

    if (this.game.player.emoteTimer > 0) {
      this.game.player.emoteTimer -= dt;
    }

    if (!this.connected) return;

    const now = performance.now();

    // 1. Interpolate Remote Players & Check PvP / Co-op Collisions
    for (const [id, rp] of this.remotePlayers.entries()) {
      // Only remove a peer if completely silent for 90 seconds
      if (now - rp.lastSeen > 90000) {
        this.remotePlayers.delete(id);
        this.statusText = `${this.isHost ? 'HOSTING' : 'IN ROOM'}: ${this.roomCode} (${this.getPlayerCount()}P ONLINE)`;
        this.game.ui.updateMultiplayerUI();
        continue;
      }

      // Dead-reckoning + smooth lerp toward target position
      rp.targetX += rp.vx * dt * 0.5;
      rp.targetY += rp.vy * dt * 0.5;
      const lerpFactor = Math.min(1, dt * 14);
      rp.x += (rp.targetX - rp.x) * lerpFactor;
      rp.y += (rp.targetY - rp.y) * lerpFactor;
      rp.tailPhase += dt * (4 + rp.speed * 0.04);

      if (rp.sirenWaveTimer > 0) rp.sirenWaveTimer -= dt;
      if (rp.emoteTimer > 0) rp.emoteTimer -= dt;

      // Check interactions with Local Player
      const lp = this.game.player;
      const dist = Math.hypot(lp.x - rp.x, lp.y - rp.y);

      if (dist < lp.r + rp.r + 8 && Math.abs(lp.z - rp.z) < 22 && this.bashCooldown <= 0) {
        if (this.gameMode === 'coop' && this.playerRole === 'possum' && rp.role === 'possum') {
          if (rp.hp < rp.maxHp * 0.85) {
            this.bashCooldown = 2.0;
            this.broadcastEvent('coop_revive', { targetId: rp.id });
            this.game.entities.addFloatingText(rp.x, rp.y - 34, `💚 TEAMMATE HEALED!`, '#51cf66', 15);
          }
        } else if (this.gameMode === 'versus' && lp.boostActive) {
          this.bashCooldown = 1.1;
          const ang = Math.atan2(rp.y - lp.y, rp.x - lp.x);
          this.broadcastEvent('pvp_bash', {
            targetId: rp.id,
            pushVx: Math.cos(ang) * 340,
            pushVy: Math.sin(ang) * 340,
            damage: 14
          });
          SFX.trashCrash();
          this.game.entities.addParticles((lp.x + rp.x) / 2, (lp.y + rp.y) / 2, '#ffd43b', 14, 170);
          this.game.entities.addFloatingText(rp.x, rp.y - 30, `💥 RIVAL SCOOTER BASH!`, '#ff922b', 16);
        } else if (this.playerRole === 'cop' && rp.role === 'possum' && !rp.isPlayingDead) {
          this.bashCooldown = 1.0;
          const ang = Math.atan2(rp.y - lp.y, rp.x - lp.x);
          this.broadcastEvent('pvp_bash', {
            targetId: rp.id,
            pushVx: Math.cos(ang) * 320,
            pushVy: Math.sin(ang) * 320,
            damage: 22
          });
          lp.busts = (lp.busts || 0) + 1;
          this.game.addShinies(35, rp.x, rp.y, '🚨');
          SFX.trashCrash();
          this.game.entities.addFloatingText(rp.x, rp.y - 34, `🚨 BUSTED ${rp.name}! +35✨`, '#339af0', 17);
        }
      }
    }

    // 2. Broadcast Local Player State at 20 Hz
    this.syncAccumulator += dt;
    if (this.syncAccumulator >= this.syncInterval) {
      this.syncAccumulator = 0;
      this.broadcastStatePacket();
    }
  }

  drawRemotePlayers(ctx, time) {
    const cam = this.game.camera;
    const viewX1 = cam.x;
    const viewY1 = cam.y;
    const viewX2 = cam.x + cam.viewW;
    const viewY2 = cam.y + cam.viewH;

    for (const rp of this.remotePlayers.values()) {
      const accentColor = rp.role === 'cop' ? '#339af0' : (rp.color || '#15aabf');

      ctx.save();
      ctx.translate(rp.x, rp.y);

      // 1. High-Visibility Pulsing Multiplayer Ground Beacon Ring (makes room players unmistakably visible!)
      const pulseRadius = 26 + Math.sin(time * 6) * 3.5;
      ctx.save();
      ctx.fillStyle = rp.role === 'cop' ? 'rgba(51, 154, 240, 0.22)' : 'rgba(99, 230, 190, 0.20)';
      ctx.beginPath();
      ctx.arc(0, 2, pulseRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.arc(0, 2, pulseRadius, time * 2, time * 2 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Siren Shockwave Ring if Cop Player just triggered Siren Blast
      if (rp.sirenWaveTimer > 0) {
        const progress = 1 - rp.sirenWaveTimer / 0.65;
        ctx.strokeStyle = `rgba(51, 154, 240, ${1 - progress})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(0, 0, 25 + progress * 165, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 2. Draw Remote Player Character Model
      if (rp.role === 'cop') {
        this.drawCopCharacter(ctx, rp, time);
      } else {
        this.drawPossumCharacter(ctx, rp, time);
      }

      // 3. Draw Prominent Floating Name Tag, Role Badge, Emote Bubble & Health Bar
      ctx.save();
      ctx.translate(0, -(rp.z || 0) - 38);

      const pTag = `P${rp.peerIndex || 2}`;
      const badgeText = `${rp.platformIcon || '🌐'} [${pTag}] ${rp.name}`;
      ctx.font = "900 12px 'Segoe UI', sans-serif";
      ctx.textAlign = 'center';
      const tw = ctx.measureText(badgeText).width + 16;

      ctx.fillStyle = 'rgba(14, 17, 23, 0.92)';
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2.5;
      ctx.fillRect(-tw / 2, -16, tw, 20);
      ctx.strokeRect(-tw / 2, -16, tw, 20);

      // Little downward pointer triangle under name tag
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(-5, 4);
      ctx.lineTo(5, 4);
      ctx.lineTo(0, 9);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fff';
      ctx.fillText(badgeText, 0, -2);

      // Mini HP bar
      const hpPct = Math.max(0, Math.min(1, rp.hp / (rp.maxHp || 100)));
      ctx.fillStyle = '#111';
      ctx.fillRect(-24, 10, 48, 6);
      ctx.fillStyle = rp.role === 'cop' ? '#339af0' : '#51cf66';
      ctx.fillRect(-23, 11, 46 * hpPct, 4);

      // Active Emote Speech Bubble above Name Tag
      if (rp.emoteTimer > 0 && rp.emoteText) {
        ctx.font = "900 13px 'Segoe UI', sans-serif";
        const ew = ctx.measureText(rp.emoteText).width + 18;
        ctx.fillStyle = '#ffd43b';
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2.5;
        ctx.fillRect(-ew / 2, -40, ew, 21);
        ctx.strokeRect(-ew / 2, -40, ew, 21);
        ctx.fillStyle = '#111';
        ctx.fillText(rp.emoteText, 0, -25);
      }

      ctx.restore();
      ctx.restore();

      // 4. If Remote Player is off-screen, draw an edge-of-screen directional pointer + distance!
      if (rp.x < viewX1 + 25 || rp.x > viewX2 - 25 || rp.y < viewY1 + 25 || rp.y > viewY2 - 25) {
        const cx = viewX1 + cam.viewW / 2;
        const cy = viewY1 + cam.viewH / 2;
        const ang = Math.atan2(rp.y - cy, rp.x - cx);
        const distM = Math.round(Math.hypot(rp.x - this.game.player.x, rp.y - this.game.player.y) / 10);
        const pad = 54;
        const px = Math.max(viewX1 + pad, Math.min(viewX2 - pad, cx + Math.cos(ang) * (cam.viewW * 0.42)));
        const py = Math.max(viewY1 + pad + 55, Math.min(viewY2 - pad - 45, cy + Math.sin(ang) * (cam.viewH * 0.40)));

        ctx.save();
        ctx.translate(px, py);

        // Directional Arrow Tip pointing toward the remote player
        ctx.save();
        ctx.rotate(ang);
        ctx.fillStyle = accentColor;
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(28, 0);
        ctx.lineTo(16, -9);
        ctx.lineTo(16, 9);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = 'rgba(15, 18, 24, 0.92)';
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 19, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.font = "900 13px 'Segoe UI', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(rp.role === 'cop' ? '🚨' : '🦝', 0, 5);

        ctx.fillStyle = '#ffd43b';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.font = "900 11px 'Segoe UI', sans-serif";
        const label = `${rp.name} (${distM}m) [T: WARP]`;
        ctx.strokeText(label, 0, 32);
        ctx.fillText(label, 0, 32);
        ctx.restore();
      }
    }
  }

  drawCopCharacter(ctx, unit, time) {
    ctx.save();
    ctx.translate(0, -(unit.z || 0));
    ctx.rotate(unit.angle);

    const vType = unit.copVehicle || 'catcher';
    if (vType === 'swatvan') {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(-26, -15, 56, 36);
      ctx.fillStyle = '#212529';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.fillRect(-28, -18, 56, 36);
      ctx.strokeRect(-28, -18, 56, 36);

      ctx.fillStyle = '#e03131';
      ctx.fillRect(-10, -18, 22, 36);

      const flashRed = Math.floor(time * 14) % 2 === 0;
      ctx.fillStyle = flashRed ? '#ff4d4f' : '#339af0';
      ctx.fillRect(4, -14, 7, 12);
      ctx.fillStyle = flashRed ? '#339af0' : '#ff4d4f';
      ctx.fillRect(4, 2, 7, 12);
    } else if (vType === 'k9') {
      ctx.fillStyle = '#8b5a2b';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#339af0';
      ctx.fillRect(-5, -9, 8, 18);
      ctx.fillStyle = '#5c3a21';
      ctx.beginPath();
      ctx.arc(13, 0, 6.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Net Catcher Officer
      ctx.fillStyle = '#1c7ed6';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#ced4da';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(4, 8);
      ctx.lineTo(24, 14);
      ctx.stroke();

      ctx.strokeStyle = '#63e6be';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(28, 15, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (unit.boostActive) {
      ctx.fillStyle = '#339af0';
      ctx.beginPath();
      ctx.moveTo(-22, -5);
      ctx.lineTo(-36 - Math.random() * 8, 0);
      ctx.lineTo(-22, 5);
      ctx.fill();
    }
    ctx.restore();
  }

  drawPossumCharacter(ctx, rp, time) {
    const shadowScale = Math.max(0.45, 1 - (rp.z || 0) / 220);
    ctx.save();
    ctx.scale(shadowScale, shadowScale);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 22, 11, rp.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(0, -(rp.z || 0));
    ctx.rotate(rp.angle + (rp.airTrickAngle || 0));

    if (rp.isPlayingDead) {
      ctx.fillStyle = '#adb5bd';
      ctx.fillRect(-16, 12, 32, 6);
      ctx.strokeStyle = 'rgba(204, 93, 232, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + Math.sin(time * 8) * 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#868e96';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f1f3f5';
      ctx.beginPath();
      ctx.arc(13, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Scooter deck
    ctx.save();
    ctx.rotate(rp.deckSpinAngle || 0);
    const deckColors = ['#ced4da', '#fcc419', '#fa5252', '#63e6be'];
    const deckLvl = rp.upgrades ? rp.upgrades.deck : 0;
    ctx.fillStyle = '#212529';
    ctx.fillRect(15, -5, 8, 10);
    ctx.fillRect(-21, -5, 8, 10);
    ctx.fillStyle = deckColors[deckLvl] || '#ced4da';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    ctx.fillRect(-19, -7, 38, 14);
    ctx.strokeRect(-19, -7, 38, 14);

    if (rp.boostActive) {
      ctx.fillStyle = '#ffd43b';
      ctx.beginPath();
      ctx.moveTo(-25, -5);
      ctx.lineTo(-39 - Math.random() * 10, 0);
      ctx.lineTo(-25, 5);
      ctx.fill();
    }
    ctx.restore();

    // Tail
    const tailWag = Math.sin(rp.tailPhase || 0) * 7;
    ctx.strokeStyle = '#f783ac';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.quadraticCurveTo(-22, tailWag * 0.6, -31, tailWag);
    ctx.stroke();

    // Torso
    ctx.fillStyle = '#868e96';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(-2, 0, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Custom Bandana Color
    ctx.fillStyle = rp.color || '#15aabf';
    ctx.beginPath();
    ctx.arc(3, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    // Handlebars
    ctx.strokeStyle = '#dee2e6';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(14, -12);
    ctx.lineTo(14, 12);
    ctx.stroke();

    // Head
    ctx.fillStyle = '#f8f9fa';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, -8);
    ctx.lineTo(19, 0);
    ctx.lineTo(2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ff8787';
    ctx.beginPath();
    ctx.arc(19, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(10, -3.5, 2, 0, Math.PI * 2);
    ctx.arc(10, 3.5, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
