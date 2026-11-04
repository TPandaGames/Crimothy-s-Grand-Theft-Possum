// js/ui.js — Adaptive Cross-Platform HUD, Shop Modal & Multiplayer Roster UI

import { PLAYER_COLORS } from './network.js';

export class UIManager {
  constructor(game) {
    this.game = game;
  }

  initMultiplayerControls() {
    const net = this.game.network;
    if (!net) return;

    // Populate color swatches in MP Modal
    const swatchContainer = document.getElementById('mp-color-swatches');
    if (swatchContainer) {
      swatchContainer.innerHTML = '';
      for (const c of PLAYER_COLORS) {
        const btn = document.createElement('button');
        btn.className = `color-swatch ${net.playerColor === c.hex ? 'active' : ''}`;
        btn.style.background = c.hex;
        btn.title = c.name;
        btn.addEventListener('click', () => {
          net.setProfile({ color: c.hex });
          swatchContainer.querySelectorAll('.color-swatch').forEach((el) => el.classList.remove('active'));
          btn.classList.add('active');
        });
        swatchContainer.appendChild(btn);
      }
    }

    // Sync initial Callsign inputs
    const mpNameInput = document.getElementById('mp-name-input');
    const titleNameInput = document.getElementById('title-mp-name');
    if (mpNameInput) {
      mpNameInput.value = net.playerName;
      mpNameInput.addEventListener('input', () => {
        net.setProfile({ name: mpNameInput.value });
        if (titleNameInput) titleNameInput.value = net.playerName;
      });
    }
    if (titleNameInput) {
      titleNameInput.value = net.playerName;
      titleNameInput.addEventListener('input', () => {
        net.setProfile({ name: titleNameInput.value });
        if (mpNameInput) mpNameInput.value = net.playerName;
      });
    }

    // Role Selection (Possum vs Animal Control)
    const btnRolePossum = document.getElementById('mp-role-possum');
    const btnRoleCop = document.getElementById('mp-role-cop');
    const copVehicleBox = document.getElementById('mp-cop-vehicle-box');
    const titleRoleSelect = document.getElementById('title-mp-role');

    const applyRole = (role) => {
      net.setProfile({ role });
      if (btnRolePossum && btnRoleCop) {
        btnRolePossum.classList.toggle('active', role === 'possum');
        btnRoleCop.classList.toggle('active', role === 'cop');
      }
      if (copVehicleBox) {
        copVehicleBox.classList.toggle('hidden', role !== 'cop');
      }
      if (titleRoleSelect) {
        titleRoleSelect.value = role;
      }
      this.updateRoleControlLabels();
      this.updateHUD();
    };

    if (btnRolePossum) btnRolePossum.addEventListener('click', () => applyRole('possum'));
    if (btnRoleCop) btnRoleCop.addEventListener('click', () => applyRole('cop'));
    if (titleRoleSelect) {
      titleRoleSelect.addEventListener('change', () => applyRole(titleRoleSelect.value));
    }

    // Animal Control Unit Selector
    document.querySelectorAll('.cop-unit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const unit = btn.getAttribute('data-unit');
        net.setProfile({ copVehicle: unit });
        document.querySelectorAll('.cop-unit-btn').forEach((b) => b.classList.toggle('active', b === btn));
        this.updateHUD();
      });
    });

    // Game Mode Selector (Co-op, Versus, Possums vs Cops)
    const titleModeSelect = document.getElementById('title-mp-gamemode');
    const applyGameMode = (mode) => {
      net.setProfile({ gameMode: mode });
      document.querySelectorAll('.mp-gamemode-btn').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-mode') === mode);
      });
      if (titleModeSelect) titleModeSelect.value = mode;
      this.updateMultiplayerUI();
    };

    document.querySelectorAll('.mp-gamemode-btn').forEach((btn) => {
      btn.addEventListener('click', () => applyGameMode(btn.getAttribute('data-mode')));
    });
    if (titleModeSelect) {
      titleModeSelect.addEventListener('change', () => applyGameMode(titleModeSelect.value));
    }

    // Host & Join Buttons (in both MP Modal and Title Screen)
    const mpRoomInput = document.getElementById('mp-room-input');
    const titleRoomInput = document.getElementById('title-mp-code');

    const handleHost = () => {
      this.game.sfx.upgradeBuy();
      const code = net.hostRoom();
      if (mpRoomInput) mpRoomInput.value = code;
      if (titleRoomInput) titleRoomInput.value = code;
    };

    const handleJoin = (inputEl) => {
      const code = inputEl ? inputEl.value.trim() : '';
      if (!code) {
        // If empty, host a new room automatically so 1 click always gets them online!
        handleHost();
        return;
      }
      this.game.sfx.shinyPickup();
      const joined = net.joinRoom(code);
      if (mpRoomInput) mpRoomInput.value = joined;
      if (titleRoomInput) titleRoomInput.value = joined;
    };

    const btnHost = document.getElementById('btn-mp-host');
    const btnJoin = document.getElementById('btn-mp-join');
    const titleBtnHost = document.getElementById('title-btn-host');
    const titleBtnJoin = document.getElementById('title-btn-join');

    if (btnHost) btnHost.addEventListener('click', handleHost);
    if (btnJoin) btnJoin.addEventListener('click', () => handleJoin(mpRoomInput));
    if (titleBtnHost) titleBtnHost.addEventListener('click', handleHost);
    if (titleBtnJoin) titleBtnJoin.addEventListener('click', () => handleJoin(titleRoomInput));

    // Copy Code & Copy Link
    const copyRoomCode = () => {
      if (!net.roomCode) return;
      navigator.clipboard?.writeText(net.roomCode).catch(() => {});
      this.game.entities.addFloatingText(this.game.player.x, this.game.player.y - 45, `📋 COPIED CODE: ${net.roomCode}`, '#63e6be', 15);
      const statusEl = document.getElementById('mp-status-label');
      if (statusEl) statusEl.textContent = `📋 COPIED ROOM CODE "${net.roomCode}" TO CLIPBOARD!`;
    };

    const copyInviteLink = () => {
      if (!net.roomCode) {
        handleHost();
      }
      const url = new URL(window.location.href);
      url.searchParams.set('room', net.roomCode);
      url.searchParams.set('mode', net.gameMode);
      navigator.clipboard?.writeText(url.toString()).catch(() => {});
      this.game.entities.addFloatingText(this.game.player.x, this.game.player.y - 45, `🔗 INVITE LINK COPIED!`, '#ffd43b', 15);
      const statusEl = document.getElementById('mp-status-label');
      if (statusEl) statusEl.textContent = `🔗 COPIED SHAREABLE CROSS-PLATFORM LINK FOR ROOM ${net.roomCode}!`;
    };

    document.getElementById('btn-mp-copy-code')?.addEventListener('click', copyRoomCode);
    document.getElementById('mp-hud-room-badge')?.addEventListener('click', copyRoomCode);
    document.getElementById('btn-mp-copy-link')?.addEventListener('click', copyInviteLink);
    document.getElementById('btn-mp-copy-hud')?.addEventListener('click', copyInviteLink);

    document.getElementById('btn-mp-disconnect')?.addEventListener('click', () => {
      net.disconnect();
    });

    // Quick Emote Buttons
    document.querySelectorAll('.emote-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.getAttribute('data-emote');
        if (text) net.sendEmote(text);
      });
    });

    this.updateMultiplayerUI();
  }

  updateRoleControlLabels() {
    const isCop = this.game.player.role === 'cop';
    const labelSpecial = document.getElementById('label-special');
    if (labelSpecial) {
      labelSpecial.textContent = isCop ? 'SIREN WAVE' : 'PLAY DEAD';
    }

    const kbE = document.getElementById('kb-label-e');
    const kbQ = document.getElementById('kb-label-q');
    if (kbE) {
      kbE.innerHTML = isCop ? `<kbd>E</kbd> <strong>FIRE CAPTURE NET</strong>` : `<kbd>E</kbd> Crime / Tag / Snatch`;
    }
    if (kbQ) {
      kbQ.innerHTML = isCop ? `<kbd>Q</kbd> <strong>SIREN SHOCKWAVE</strong>` : `<kbd>Q</kbd> <strong>PLAY DEAD</strong>`;
    }

    const tIconCrime = document.getElementById('touch-icon-crime');
    const tLabelCrime = document.getElementById('touch-label-crime');
    const tIconDead = document.getElementById('touch-icon-dead');
    const tLabelDead = document.getElementById('touch-label-dead');
    const joyKnob = document.getElementById('joystick-knob');

    if (tIconCrime) tIconCrime.textContent = isCop ? '🕸️' : '🎨';
    if (tLabelCrime) tLabelCrime.textContent = isCop ? 'FIRE NET' : 'CRIME / TAG';
    if (tIconDead) tIconDead.textContent = isCop ? '🚨' : '💀';
    if (tLabelDead) tLabelDead.textContent = isCop ? 'SIREN' : 'PLAY DEAD';
    if (joyKnob) joyKnob.textContent = isCop ? '🚨' : '🦝';
  }

  updateMultiplayerUI() {
    const net = this.game.network;
    if (!net) return;

    const hudPanel = document.getElementById('mp-hud-panel');
    const roomBadge = document.getElementById('mp-hud-room-badge');
    const modeBadge = document.getElementById('mp-hud-mode-badge');
    const hudRoster = document.getElementById('mp-hud-roster');
    const modalRoster = document.getElementById('mp-modal-roster');
    const statusLabel = document.getElementById('mp-status-label');
    const titleStatus = document.getElementById('title-mp-status');
    const btnDisconnect = document.getElementById('btn-mp-disconnect');
    const btnMpLobby = document.getElementById('btn-mp-lobby');
    const touchBtnMp = document.getElementById('touch-btn-mp');

    if (hudPanel) {
      hudPanel.classList.toggle('hidden', !net.connected);
    }
    if (btnDisconnect) {
      btnDisconnect.classList.toggle('hidden', !net.connected);
    }
    if (roomBadge) {
      roomBadge.textContent = net.connected ? `🌐 ROOM: ${net.roomCode}` : '🌐 OFFLINE';
    }
    if (modeBadge) {
      modeBadge.textContent = net.getModeLabel();
    }
    if (statusLabel) {
      statusLabel.textContent = `📡 ${net.statusText}`;
    }
    if (titleStatus && net.connected) {
      titleStatus.textContent = `✅ ${net.statusText} — Share Room Code "${net.roomCode}" with any device!`;
    }
    const onlineBtnLabel = net.connected ? `🌐 ${net.roomCode} (${net.getPlayerCount()}P)` : '🌐 ONLINE';
    if (btnMpLobby) btnMpLobby.textContent = onlineBtnLabel;
    if (touchBtnMp) touchBtnMp.textContent = onlineBtnLabel;

    const board = net.getLeaderboard();

    if (hudRoster) {
      hudRoster.innerHTML = board.map((p) => {
        const roleIcon = p.role === 'cop' ? '🚨' : '🦝';
        const metric = p.role === 'cop' ? `${p.busts} BUSTS` : `${p.infamy} 💀`;
        return `
          <div class="mp-roster-row" style="border-left-color: ${p.role === 'cop' ? '#339af0' : p.color}">
            <span class="mp-roster-name">${p.platformIcon} ${roleIcon} ${p.name}</span>
            <span class="mp-roster-score">${metric} • ${p.hp}HP</span>
          </div>
        `;
      }).join('');
    }

    if (modalRoster) {
      modalRoster.innerHTML = board.map((p) => {
        const roleIcon = p.role === 'cop' ? '🚨 COP' : '🦝 POSSUM';
        return `
          <div class="mp-player-pill" style="border-color: ${p.role === 'cop' ? '#339af0' : p.color}">
            <span>${p.platformIcon} ${p.name}</span>
            <span style="color:#ffd43b;">${roleIcon}</span>
          </div>
        `;
      }).join('');
    }
  }

  updateContextualPrompt() {
    const promptEl = document.getElementById('action-prompt');
    let promptHTML = null;
    const isTouch = this.game.inputMethod === 'touch';
    const actKey = isTouch ? `<kbd>🎨 CRIME</kbd>` : `<kbd>E</kbd>`;
    const shopKey = isTouch ? `<kbd>🛒 GARAGE</kbd>` : `<kbd>E</kbd> or <kbd>TAB</kbd>`;

    if (this.game.world.isInsideAnyHideout(this.game.player.x, this.game.player.y, 12)) {
      promptHTML = `${isTouch ? 'Tap' : 'Press'} ${shopKey} to Open Big Sal's Dumpster Garage!`;
    } else if (this.game.player.role === 'cop') {
      const netKey = isTouch ? `<kbd>🕸️ FIRE NET</kbd>` : `<kbd>E</kbd>`;
      const sirenKey = isTouch ? `<kbd>🚨 SIREN</kbd>` : `<kbd>Q</kbd>`;
      promptHTML = `🚓 PATROL MODE: ${netKey} Fire Capture Net • ${sirenKey} Siren Shockwave!`;
    } else {
      for (const g of this.game.world.graffitiSpots) {
        if (!g.tagged && Math.hypot(this.game.player.x - g.x, this.game.player.y - g.y) < 68) {
          promptHTML = `${isTouch ? 'Tap' : 'Press'} ${actKey} to Spray-Paint "${g.slogan}"!`;
          break;
        }
      }
      if (!promptHTML) {
        for (const p of this.game.world.props) {
          if (p.type === 'dumpster' && !p.looted && Math.hypot(this.game.player.x - p.x, this.game.player.y - p.y) < 66) {
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
    document.getElementById('hp-fill').style.width = `${(this.game.player.hp / this.game.player.maxHp) * 100}%`;
    document.getElementById('boost-fill').style.width = `${(this.game.player.boost / this.game.player.maxBoost) * 100}%`;
    document.getElementById('dead-fill').style.width = `${(this.game.player.playDeadEnergy / this.game.player.maxPlayDead) * 100}%`;

    // Portrait status
    const emojiEl = document.getElementById('portrait-emoji');
    const stateEl = document.getElementById('portrait-state');
    const boxEl = document.getElementById('possum-portrait');
    if (this.game.player.role === 'cop') {
      const icons = { catcher: '🕸️', k9: '🐕', swatvan: '🚓' };
      emojiEl.textContent = icons[this.game.player.copVehicle] || '🚨';
      stateEl.textContent = `BUSTED: ${this.game.player.busts || 0}`;
      boxEl.style.borderColor = '#339af0';
    } else if (this.game.player.isPlayingDead) {
      emojiEl.textContent = '💀';
      stateEl.textContent = 'PLAYING DEAD';
      boxEl.style.borderColor = '#cc5de8';
    } else if (this.game.player.z > 10) {
      emojiEl.textContent = '🛴';
      stateEl.textContent = 'SHREDDING AIR!';
      boxEl.style.borderColor = '#63e6be';
    } else if (this.game.wantedLevel >= 3) {
      emojiEl.textContent = '😾';
      stateEl.textContent = 'MOST WANTED';
      boxEl.style.borderColor = '#ff6b6b';
    } else {
      emojiEl.textContent = '🦝';
      stateEl.textContent = 'RIDING DIRTY';
      boxEl.style.borderColor = this.game.player.customColor || '#f59f00';
    }

    if (this.game.player2) {
      document.getElementById('hud-p2').classList.remove('hidden');
      document.getElementById('hp-fill-p2').style.width = `${(this.game.player2.hp / this.game.player2.maxHp) * 100}%`;
      document.getElementById('boost-fill-p2').style.width = `${(this.game.player2.boost / this.game.player2.maxBoost) * 100}%`;
      document.getElementById('dead-fill-p2').style.width = `${(this.game.player2.playDeadEnergy / this.game.player2.maxPlayDead) * 100}%`;

      const emojiEl2 = document.getElementById('portrait-emoji-p2');
      const stateEl2 = document.getElementById('portrait-state-p2');
      const boxEl2 = document.getElementById('possum-portrait-p2');
      if (this.game.player2.isPlayingDead) {
        emojiEl2.textContent = '💀';
        stateEl2.textContent = 'PLAYING DEAD';
        boxEl2.style.borderColor = '#cc5de8';
      } else if (this.game.player2.z > 10) {
        emojiEl2.textContent = '🛴';
        stateEl2.textContent = 'SHREDDING AIR!';
        boxEl2.style.borderColor = '#63e6be';
      } else if (this.game.wantedLevel >= 3) {
        emojiEl2.textContent = '😾';
        stateEl2.textContent = 'MOST WANTED';
        boxEl2.style.borderColor = '#ff6b6b';
      } else {
        emojiEl2.textContent = '🦝';
        stateEl2.textContent = 'RIDING DIRTY';
        boxEl2.style.borderColor = '#339af0';
      }
    } else {
      document.getElementById('hud-p2').classList.add('hidden');
    }

    // Combo Banner
    const comboBox = document.getElementById('combo-box');
    if (this.game.comboTimer > 0 && this.game.comboCount >= 2) {
      comboBox.classList.remove('hidden');
      document.getElementById('combo-multiplier').textContent = `${this.game.comboMultiplier}x CRIME COMBO!`;
      document.getElementById('combo-score').textContent = `+${this.game.comboBank} SHINIES`;
      document.getElementById('combo-timer-fill').style.width = `${(this.game.comboTimer / this.game.comboMaxTimer) * 100}%`;
    } else {
      comboBox.classList.add('hidden');
    }

    // Active Challenge
    const b = this.game.bounties[this.game.currentBountyIdx];
    if (b) {
      document.getElementById('bounty-text').textContent = `${b.desc} (${b.progress}/${b.target}) — Reward: ${b.reward}✨`;
    }

    // District Status & Next Infamy Unlock Progress
    const currDist = this.game.world.getDistrictAt(this.game.player.x, this.game.player.y);
    const nextDist = this.game.world.getNextLockedDistrict();
    const currDistEl = document.getElementById('current-district-name');
    const nextDistEl = document.getElementById('next-district-status');

    if (currDistEl && currDist) {
      currDistEl.textContent = `📍 ${currDist.name} (${currDist.lootMult}x LOOT)`;
      currDistEl.style.color = currDist.color;
    }
    if (nextDistEl) {
      if (nextDist) {
        nextDistEl.textContent = `🔒 NEXT: ${nextDist.name} (${this.game.infamy.toLocaleString()} / ${nextDist.reqInfamy.toLocaleString()} 💀)`;
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
      star.classList.toggle('active', lvl <= this.game.wantedLevel);
    });

    const heatPct = Math.min(100, (this.game.heat / 425) * 100);
    document.getElementById('heat-fill').style.width = `${heatPct}%`;
    const heatStatus = document.getElementById('heat-status');
    if (this.game.player.isPlayingDead) {
      heatStatus.textContent = 'HEAT: COOLING💀';
      heatStatus.style.color = '#cc5de8';
    } else if (this.game.wantedLevel === 0) {
      heatStatus.textContent = 'HEAT: CHILL';
      heatStatus.style.color = '#74c0fc';
    } else {
      heatStatus.textContent = `WANTED LVL ${this.game.wantedLevel}`;
      heatStatus.style.color = '#ff6b6b';
    }

    // Currencies
    document.getElementById('shiny-count').textContent = this.game.shinies;
    document.getElementById('infamy-count').textContent = this.game.infamy;

    if (this.game.network && this.game.network.connected) {
      this.updateMultiplayerUI();
    }
  }

  renderShop() {
    document.getElementById('shop-shiny-count').textContent = this.game.shinies;
    const container = document.getElementById('upgrade-list');
    container.innerHTML = '';

    for (const item of this.game.upgradeCatalog) {
      const currentLvl = this.game.player.upgrades[item.key];
      const isMax = currentLvl >= 3;
      const cost = isMax ? 0 : item.costs[currentLvl];
      const canAfford = !isMax && this.game.shinies >= cost;

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
          if (this.game.shinies >= cost) {
            this.game.shinies -= cost;
            this.game.player.upgrades[item.key]++;
            this.game.sfx.upgradeBuy();
            this.renderShop();
            this.updateHUD();
          }
        });
      }

      container.appendChild(card);
    }
  }
}
