// js/player.js — Crimothy the Scooter-Riding Possum: Physics, Tricks, Upgrades, Vandalism & Play Dead

class Player {
  constructor(x, y) {
    this.spawnX = x;
    this.spawnY = y;
    this.reset();

    // Persistent Upgrades
    this.upgrades = {
      deck: 0,    // 0: Stock Razor, 1: Street Pro, 2: Spiked Road-Warrior, 3: Cyber Trash Hover-Deck
      wheels: 0,  // 0: Plastic, 1: Urethane Grip, 2: All-Terrain Monster, 3: Mag-Lev Rollers
      rocket: 0,  // 0: Soda Bottle, 1: Propane Jet, 2: Twin Afterburner, 3: Nuclear Trash Thruster
      acting: 0,  // 0: Possum Flop, 1: Drama School, 2: Method Corpse + Stink Cloud, 3: Ghost Possum
      spray: 0,   // 0: Cheap Can, 1: Neon Chrome, 2: Pepper-Paint Blaster, 3: Master Vandal
      magnet: 0   // 0: Paws, 1: Long Tail Reach, 2: Velcro Pouch, 3: Trash Vortex
    };
  }

  reset() {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = 0;
    this.vy = 0;
    this.speed = 0;
    this.angle = 0;
    this.r = 16;

    // Jump & Air Trick state
    this.z = 0;
    this.vz = 0;
    this.airTrickAngle = 0;
    this.deckSpinAngle = 0;
    this.tricksInAir = [];
    this.trickCooldown = 0;

    // Health, Boost & Play Dead meters
    this.maxHp = 100;
    this.hp = 100;
    this.invulnTimer = 0;

    this.maxBoost = 100;
    this.boost = 100;
    this.boostActive = false;

    this.maxPlayDead = 100;
    this.playDeadEnergy = 100;
    this.isPlayingDead = false;
    this.playDeadCooldown = 0;

    this.tailPhase = 0;
  }

  getMaxSpeed() {
    return 295 + this.upgrades.wheels * 34 + (this.boostActive ? 165 + this.upgrades.rocket * 28 : 0);
  }

  getMagnetRadius() {
    return 65 + this.upgrades.magnet * 45;
  }

  togglePlayDead(entities, game) {
    if (this.isPlayingDead) {
      this.isPlayingDead = false;
      entities.addFloatingText(this.x, this.y - 30, "🦝 ALIVE & KICKIN'!", "#51cf66", 15);
      return;
    }
    if (this.playDeadEnergy < 20 || this.playDeadCooldown > 0) return;

    this.isPlayingDead = true;
    this.vx *= 0.25;
    this.vy *= 0.25;
    this.speed *= 0.25;
    window.SFX.playDeadFlop();
    entities.addFloatingText(this.x, this.y - 34, "💀 PLAYING DEAD... (SHHH!)", "#cc5de8", 17);
    entities.addParticles(this.x, this.y, "#cc5de8", 10, 90);

    // If upgraded with Stink Cloud, blind very close officers on flop
    if (this.upgrades.acting >= 2) {
      for (const cop of entities.authorities) {
        if (Math.hypot(cop.x - this.x, cop.y - this.y) < 130) {
          cop.confusedTimer = 3.5;
        }
      }
    }
  }

  triggerBunnyHop(entities) {
    if (this.isPlayingDead) {
      this.togglePlayDead(entities);
      return;
    }
    if (this.z === 0) {
      this.vz = 265 + this.upgrades.deck * 22;
      this.tricksInAir = [];
      window.SFX.bunnyHop();
      entities.addParticles(this.x, this.y, "#ced4da", 6, 70, 4);
    } else {
      // Mid-air trick when pressing Space again in air!
      this.performAirTrick('TAILWHIP', entities);
    }
  }

  performAirTrick(trickName, entities) {
    if (this.z < 12 || this.trickCooldown > 0) return;
    this.trickCooldown = 0.28;
    this.tricksInAir.push(trickName);
    window.SFX.trickSpin();

    if (trickName === 'TAILWHIP' || trickName === 'KICKFLIP') {
      this.deckSpinAngle += Math.PI * 2;
    } else {
      this.airTrickAngle += Math.PI * 2;
    }

    entities.addFloatingText(this.x, this.y - this.z - 28, `🛴 ${trickName}!`, "#63e6be", 15);
    entities.addParticles(this.x, this.y - this.z, "#ffd43b", 8, 120, 4);
  }

  performActionCrime(world, entities, game) {
    if (this.isPlayingDead) {
      this.togglePlayDead(entities, game);
      return;
    }

    // 1. Check if inside any Dumpster Hideout / Outpost to open Garage Shop
    if (world.isInsideAnyHideout(this.x, this.y, 15)) {
      game.toggleShop();
      return;
    }

    // 2. Check nearby Graffiti Walls
    for (const g of world.graffitiSpots) {
      if (!g.tagged && Math.hypot(this.x - g.x, this.y - g.y) < 68) {
        g.tagged = true;
        window.SFX.sprayCan();
        entities.addParticles(g.x, g.y, "#cc5de8", 22, 160, 6);
        entities.addParticles(g.x, g.y, "#63e6be", 16, 140, 5);
        const reward = 35 + this.upgrades.spray * 15;
        entities.addFloatingText(g.x, g.y - 30, `🎨 TAGGED "${g.slogan}"! +${reward}✨`, "#cc5de8", 17);
        game.recordCrime(`Tagged Wall: "${g.slogan}" 🎨`, reward, 18, 'graffiti');
        // Respawn wall tag after 45s
        setTimeout(() => { g.tagged = false; }, 45000);
        return;
      }
    }

    // 3. Check nearby un-looted Dumpsters
    for (const p of world.props) {
      if (p.type === 'dumpster' && !p.looted && Math.hypot(this.x - p.x, this.y - p.y) < 66) {
        p.looted = true;
        p.respawnTimer = 35;
        window.SFX.trashCrash();
        entities.spawnLoot(p.x, p.y, 6 + this.upgrades.magnet * 2, 7);
        entities.addParticles(p.x, p.y, "#51cf66", 18, 170, 6);
        entities.addFloatingText(p.x, p.y - 30, "🗑️ DUMPSTER JACKPOT!", "#51cf66", 17);
        game.recordCrime("Rummaged Commercial Dumpster 🗑️", 20, 10, 'trash');
        return;
      }
    }

    // 4. Otherwise: Possum Hiss & Spray-Paint Cloud (spooks nearby pedestrians into dropping loot & blinds close cops!)
    window.SFX.possumHiss();
    const range = 105 + this.upgrades.spray * 28;
    entities.addParticles(this.x, this.y, "#cc5de8", 16, 180, 6);
    entities.addFloatingText(this.x, this.y - 32, "😾 HISS & SPRAY!", "#ff8787", 15);

    for (const ped of entities.pedestrians) {
      if (ped.hasItem && Math.hypot(ped.x - this.x, ped.y - this.y) < range) {
        entities.snatchFromPedestrian(ped, this, game);
      }
    }

    for (const cop of entities.authorities) {
      if (Math.hypot(cop.x - this.x, cop.y - this.y) < range) {
        cop.blindedTimer = 2.2 + this.upgrades.spray * 0.8;
        entities.addFloatingText(cop.x, cop.y - 24, "🎨 PAINT-BLINDED!", "#cc5de8", 14);
      }
    }
  }

  takeDamage(amount, sourceLabel, game) {
    if (this.invulnTimer > 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = 0.85;
    this.isPlayingDead = false;
    window.SFX.hitDamage();
    game.triggerScreenShake(9, 0.25);
    game.entities.addParticles(this.x, this.y, "#ff6b6b", 14, 160);
    game.entities.addFloatingText(this.x, this.y - 30, `💥 -${amount} HP (${sourceLabel})`, "#ff6b6b", 15);

    if (this.hp <= 0) {
      game.onPlayerBusted(sourceLabel);
    }
  }

  update(dt, keys, world, entities, game) {
    this.tailPhase += dt * (4 + this.speed * 0.04);
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.trickCooldown > 0) this.trickCooldown -= dt;
    if (this.playDeadCooldown > 0) this.playDeadCooldown -= dt;

    const touch = game.touchState || { joyActive: false, joyMag: 0, joyAngle: 0, boostPressed: false };

    // Handle Play Dead state
    if (this.isPlayingDead) {
      const drainRate = Math.max(7, 18 - this.upgrades.acting * 4);
      this.playDeadEnergy -= drainRate * dt;
      // Passive heat reduction while playing dead!
      game.reduceHeat((10 + this.upgrades.acting * 6) * dt);

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.88;
      this.vy *= 0.88;
      this.speed = Math.hypot(this.vx, this.vy);

      // Wake up if energy runs out or player presses gas/jump or pushes touch joystick
      if (this.playDeadEnergy <= 0 || keys['KeyW'] || keys['ArrowUp'] || (touch.joyActive && touch.joyMag > 0.45)) {
        this.isPlayingDead = false;
        this.playDeadCooldown = 1.2;
        entities.addFloatingText(this.x, this.y - 28, "🛴 BACK ON THE DECK!", "#ffd43b", 14);
      }
      return;
    } else {
      this.playDeadEnergy = Math.min(this.maxPlayDead, this.playDeadEnergy + 14 * dt);
    }

    // Steering (Keyboard or Virtual Analog Thumbstick)
    const turnSpeed = 3.5 + this.upgrades.wheels * 0.25;
    if (touch.joyActive && touch.joyMag > 0.14) {
      const angleDiff = Math.atan2(
        Math.sin(touch.joyAngle - this.angle),
        Math.cos(touch.joyAngle - this.angle)
      );
      this.angle += angleDiff * Math.min(1, dt * (turnSpeed * 2.4));
    } else {
      if (keys['KeyA'] || keys['ArrowLeft']) {
        this.angle -= turnSpeed * dt;
      }
      if (keys['KeyD'] || keys['ArrowRight']) {
        this.angle += turnSpeed * dt;
      }
    }

    // Rocket Boost (Shift or Touch Boost Button)
    if ((keys['ShiftLeft'] || keys['ShiftRight'] || touch.boostPressed) && this.boost > 5) {
      this.boostActive = true;
      const drain = Math.max(12, 26 - this.upgrades.rocket * 5);
      this.boost = Math.max(0, this.boost - drain * dt);
      if (Math.random() < 0.45) {
        window.SFX.boostFlame();
      }
      // Flame trail particles & road scorch
      const backX = this.x - Math.cos(this.angle) * 20;
      const backY = this.y - Math.sin(this.angle) * 20;
      entities.addParticles(backX, backY, "#ff922b", 2, 85, 5);
      if (this.z === 0) {
        world.addSkidMark(backX, backY, this.angle, true);
      }
    } else {
      this.boostActive = false;
      this.boost = Math.min(this.maxBoost, this.boost + (14 + this.upgrades.rocket * 5) * dt);
    }

    // Throttle / Brake
    const maxSpd = this.getMaxSpeed();
    const accel = this.boostActive ? 540 : 340 + this.upgrades.wheels * 35;

    if (touch.joyActive && touch.joyMag > 0.14) {
      const throttleMult = Math.min(1, touch.joyMag);
      this.vx += Math.cos(this.angle) * accel * throttleMult * dt;
      this.vy += Math.sin(this.angle) * accel * throttleMult * dt;
    } else if (keys['KeyW'] || keys['ArrowUp'] || this.boostActive) {
      this.vx += Math.cos(this.angle) * accel * dt;
      this.vy += Math.sin(this.angle) * accel * dt;
    } else if (keys['KeyS'] || keys['ArrowDown']) {
      this.vx -= Math.cos(this.angle) * (accel * 0.75) * dt;
      this.vy -= Math.sin(this.angle) * (accel * 0.75) * dt;
    }

    // Drift / Carving friction (align velocity gradually with scooter heading)
    const forwardX = Math.cos(this.angle);
    const forwardY = Math.sin(this.angle);
    const currentSpeed = Math.hypot(this.vx, this.vy);

    if (currentSpeed > 0.01) {
      const velAngle = Math.atan2(this.vy, this.vx);
      const driftDiff = Math.abs(Math.sin(velAngle - this.angle));

      // Leave tire skid marks when carving hard at high speed
      if (this.z === 0 && driftDiff > 0.35 && currentSpeed > 150) {
        world.addSkidMark(this.x, this.y, this.angle, false);
      }

      // Blend velocity vector toward facing direction for snappy arcade scooter feel
      const grip = 0.88;
      const dot = (this.vx * forwardX + this.vy * forwardY);
      const sign = dot >= -20 ? 1 : -1;
      this.vx = this.vx * (1 - grip * dt * 5) + forwardX * currentSpeed * sign * (grip * dt * 5);
      this.vy = this.vy * (1 - grip * dt * 5) + forwardY * currentSpeed * sign * (grip * dt * 5);
    }

    // Air drag / ground drag
    const drag = this.z > 0 ? 0.992 : 0.962;
    this.vx *= Math.pow(drag, dt * 60);
    this.vy *= Math.pow(drag, dt * 60);

    this.speed = Math.hypot(this.vx, this.vy);
    if (this.speed > maxSpd) {
      this.vx = (this.vx / this.speed) * maxSpd;
      this.vy = (this.vy / this.speed) * maxSpd;
      this.speed = maxSpd;
    }

    // Move & Collide with Buildings and Locked District Barricades
    const nextX = Math.max(25, Math.min(world.width - 25, this.x + this.vx * dt));
    const nextY = Math.max(25, Math.min(world.height - 25, this.y + this.vy * dt));

    const lockedX = world.isPositionLocked(nextX, this.y);
    const lockedY = world.isPositionLocked(this.x, nextY);

    if (lockedX) {
      this.vx *= -0.65;
      if (!this.barricadeMsgCooldown || this.barricadeMsgCooldown <= 0) {
        this.barricadeMsgCooldown = 1.2;
        window.SFX.barricadeBounce();
        entities.addParticles(this.x, this.y, lockedX.color, 10, 120);
        entities.addFloatingText(
          this.x,
          this.y - 34,
          `🚧 LOCKED! Need ${lockedX.reqInfamy.toLocaleString()} 💀 Infamy for ${lockedX.name}`,
          lockedX.color,
          15
        );
      }
    } else if (!entities.isInsideBuilding(nextX, this.y, this.r)) {
      this.x = nextX;
    } else {
      this.vx *= -0.45;
    }

    if (lockedY) {
      this.vy *= -0.65;
      if (!this.barricadeMsgCooldown || this.barricadeMsgCooldown <= 0) {
        this.barricadeMsgCooldown = 1.2;
        window.SFX.barricadeBounce();
        entities.addParticles(this.x, this.y, lockedY.color, 10, 120);
        entities.addFloatingText(
          this.x,
          this.y - 34,
          `🚧 LOCKED! Need ${lockedY.reqInfamy.toLocaleString()} 💀 Infamy for ${lockedY.name}`,
          lockedY.color,
          15
        );
      }
    } else if (!entities.isInsideBuilding(this.x, nextY, this.r)) {
      this.y = nextY;
    } else {
      this.vy *= -0.45;
    }

    if (this.barricadeMsgCooldown > 0) {
      this.barricadeMsgCooldown -= dt;
    }

    // Air / Gravity & Tricks
    if (this.z > 0 || this.vz !== 0) {
      this.z += this.vz * dt;
      this.vz -= 640 * dt; // Gravity

      // Check air trick keys (Z / X / J / K)
      if (keys['KeyZ'] || keys['KeyJ']) {
        this.performAirTrick('KICKFLIP', entities);
      } else if (keys['KeyX'] || keys['KeyK']) {
        this.performAirTrick('360 POSSUM SPIN', entities);
      }

      // Spin animations
      if (this.deckSpinAngle > 0) {
        this.deckSpinAngle = Math.max(0, this.deckSpinAngle - dt * 18);
      }
      if (this.airTrickAngle > 0) {
        this.airTrickAngle = Math.max(0, this.airTrickAngle - dt * 16);
      }

      if (this.z <= 0) {
        this.z = 0;
        this.vz = 0;
        this.deckSpinAngle = 0;
        this.airTrickAngle = 0;

        // Landed tricks!
        if (this.tricksInAir.length > 0) {
          const count = this.tricksInAir.length;
          const reward = count * 15;
          window.SFX.trickLand();
          entities.addParticles(this.x, this.y, "#63e6be", 14, 150);
          entities.addFloatingText(this.x, this.y - 34, `🔥 LANDED ${count}x TRICK COMBO! +${reward}✨`, "#fcc419", 17);
          game.recordCrime(`Landed ${this.tricksInAir.join(' + ')} 🛴`, reward, 4, 'trick');
          // Speed burst on clean landing
          this.vx *= 1.25;
          this.vy *= 1.25;
          this.boost = Math.min(this.maxBoost, this.boost + count * 18);
          this.tricksInAir = [];
        }
      }
    }

    // Check Ramps (launch into air if riding over a ramp fast enough)
    if (this.z < 8 && this.speed > 125) {
      for (const r of world.ramps) {
        if (this.x > r.x && this.x < r.x + r.w && this.y > r.y && this.y < r.y + r.h) {
          this.vz = 320 + Math.min(140, this.speed * 0.35);
          window.SFX.bunnyHop();
          entities.addFloatingText(this.x, this.y - 25, `🚀 ${r.label} AIR!`, "#ffd43b", 15);
          break;
        }
      }
    }

    // Check Destructible Props (Trash Cans, Mailboxes, Fire Hydrants, Gnomes)
    for (const p of world.props) {
      if (p.smashed && p.type === 'hydrant' && p.geyserTimer > 0) {
        // Riding over an active hydrant geyser launches Crimothy sky-high!
        if (Math.hypot(this.x - p.x, this.y - p.y) < 28 && this.z < 15) {
          this.vz = 410;
          window.SFX.bunnyHop();
          entities.addFloatingText(this.x, this.y - 30, "💦 GEYSER MEGA-LAUNCH!", "#74c0fc", 17);
        }
      }

      if (p.type === 'dumpster') {
        if (!p.looted && Math.hypot(this.x - p.x, this.y - p.y) < this.r + p.r + 4 && this.z < 20) {
          p.looted = true;
          p.respawnTimer = 30;
          window.SFX.trashCrash();
          game.triggerScreenShake(5, 0.14);
          entities.spawnLoot(p.x, p.y, 5 + this.upgrades.magnet * 2, 7);
          entities.addParticles(p.x, p.y, "#51cf66", 16, 165, 6);
          entities.addFloatingText(p.x, p.y - 28, "🗑️ DUMPSTER RAIDED!", "#51cf66", 16);
          game.recordCrime("Raided Alley Dumpster 🗑️", 20, 9, 'trash');
        }
        continue;
      }

      if (p.smashed) continue;

      const dist = Math.hypot(this.x - p.x, this.y - p.y);
      if (dist < this.r + p.r + (this.upgrades.deck >= 2 ? 8 : 2) && this.z < 20) {
        // Smash prop!
        p.smashed = true;
        p.respawnTimer = 30;
        p.vx = this.vx * 1.1;
        p.vy = this.vy * 1.1;

        window.SFX.trashCrash();
        game.triggerScreenShake(6, 0.16);

        if (p.type === 'trashcan') {
          entities.spawnLoot(p.x, p.y, 3, 5);
          entities.addParticles(p.x, p.y, "#adb5bd", 12, 140);
          entities.addFloatingText(p.x, p.y - 24, "🗑️ TRASH SMASH!", "#a9e34b", 15);
          game.recordCrime("Tipped Municipal Trash Bin 🗑️", 12, 8, 'trash');
        } else if (p.type === 'mailbox') {
          entities.spawnLoot(p.x, p.y, 3, 6);
          entities.addParticles(p.x, p.y, "#fff", 14, 150);
          entities.addFloatingText(p.x, p.y - 24, "📬 SPECIAL DELIVERY!", "#74c0fc", 15);
          game.recordCrime("Federal Mailbox Vandalism 📬", 15, 11, 'vandalism');
        } else if (p.type === 'hydrant') {
          p.geyserTimer = 14.0;
          entities.spawnLoot(p.x, p.y, 2, 8);
          entities.addParticles(p.x, p.y, "#4dabf7", 20, 190);
          entities.addFloatingText(p.x, p.y - 26, "💦 HYDRANT GEYSER!", "#4dabf7", 16);
          game.recordCrime("Busted City Fire Hydrant 💦", 18, 12, 'vandalism');
        } else if (p.type === 'gnome') {
          entities.spawnLoot(p.x, p.y, 4, 8);
          entities.addParticles(p.x, p.y, "#fa5252", 14, 150);
          entities.addFloatingText(p.x, p.y - 24, "🧙 GNOME SHATTERED!", "#ff8787", 16);
          game.recordCrime("Shattered Prize Lawn Gnome 🧙", 22, 9, 'vandalism');
        } else if (p.type === 'atm') {
          entities.spawnLoot(p.x, p.y, 6, 10);
          entities.addParticles(p.x, p.y, "#51cf66", 18, 175);
          entities.addFloatingText(p.x, p.y - 26, "🏧 ATM CASH EXPLOSION!", "#51cf66", 17);
          game.recordCrime("Busted Neon Street ATM 🏧", 35, 16, 'vandalism');
        } else if (p.type === 'flamingo') {
          entities.spawnLoot(p.x, p.y, 6, 12);
          entities.addParticles(p.x, p.y, "#f783ac", 18, 175);
          entities.addFloatingText(p.x, p.y - 26, "🦩 PRIZE FLAMINGO SMASHED!", "#f783ac", 17);
          game.recordCrime("Shattered Gilded Lawn Flamingo 🦩", 45, 18, 'vandalism');
        } else if (p.type === 'trophy') {
          entities.spawnLoot(p.x, p.y, 8, 15);
          entities.addParticles(p.x, p.y, "#ffd43b", 24, 195);
          entities.addFloatingText(p.x, p.y - 28, "🏆 MAYOR'S GOLD TROPHY HEIST!", "#ffd43b", 18);
          game.recordCrime("Toppled Mayor's Gold Trophy 🏆", 70, 24, 'vandalism');
        }
      }
    }
  }

  draw(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // 1. Ground Shadow (scales slightly when jumping high in the air)
    const shadowScale = Math.max(0.45, 1 - this.z / 220);
    ctx.save();
    ctx.scale(shadowScale, shadowScale);
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    ctx.beginPath();
    ctx.ellipse(0, 5, 22, 11, this.angle, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Translate up by jump height z
    ctx.translate(0, -this.z);
    ctx.rotate(this.angle + this.airTrickAngle);

    // Blink if invulnerable
    if (this.invulnTimer > 0 && Math.floor(time * 20) % 2 === 0) {
      ctx.globalAlpha = 0.5;
    }

    if (this.isPlayingDead) {
      // --- DRAW DRAMATIC "PLAYING DEAD" POSSUM ---
      // Scooter lying tipped on its side nearby
      ctx.fillStyle = "#adb5bd";
      ctx.fillRect(-16, 12, 32, 6);

      // Stink / Drama Aura
      ctx.strokeStyle = "rgba(204, 93, 232, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 22 + Math.sin(time * 8) * 4, 0, Math.PI * 2);
      ctx.stroke();

      // Possum flopped on back, four little pink paws sticking up in the air!
      ctx.fillStyle = "#868e96";
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, 17, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Pink tail curled limp
      ctx.strokeStyle = "#f783ac";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.quadraticCurveTo(-28, -10, -24, 8);
      ctx.stroke();

      // White face + Pink floppy tongue sticking out!
      ctx.fillStyle = "#f1f3f5";
      ctx.beginPath();
      ctx.arc(13, 0, 8, 0, Math.PI * 2);
      ctx.fill();

      // Pink tongue hanging out the side
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.ellipse(15, 8, 4, 6, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Little buzzing flies circling overhead
      for (let f = 0; f < 3; f++) {
        const fx = Math.cos(time * 7 + f * 2.1) * 14;
        const fy = Math.sin(time * 9 + f * 2.1) * 9;
        ctx.fillStyle = "#111";
        ctx.fillRect(fx, fy, 3, 3);
      }

      ctx.restore();
      return;
    }

    // --- 2. DRAW SCOOTER DECK (rotates independently during Tailwhips/Kickflips!) ---
    ctx.save();
    ctx.rotate(this.deckSpinAngle);

    // Deck color based on upgrade
    const deckColors = ["#ced4da", "#fcc419", "#fa5252", "#63e6be"];
    ctx.fillStyle = deckColors[this.upgrades.deck] || "#ced4da";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;

    // Wheels
    ctx.fillStyle = this.upgrades.wheels >= 2 ? "#ffd43b" : "#212529";
    ctx.fillRect(15, -5, 8, 10);
    ctx.fillRect(-21, -5, 8, 10);

    // Scooter Deck Board
    ctx.fillStyle = deckColors[this.upgrades.deck];
    ctx.fillRect(-19, -7, 38, 14);
    ctx.strokeRect(-19, -7, 38, 14);

    // Grip tape stripe
    ctx.fillStyle = "#212529";
    ctx.fillRect(-13, -4, 24, 8);

    // Spikes if Spiked Deck upgrade is unlocked!
    if (this.upgrades.deck >= 2) {
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.moveTo(19, -7);
      ctx.lineTo(27, -4);
      ctx.lineTo(19, 0);
      ctx.lineTo(27, 4);
      ctx.lineTo(19, 7);
      ctx.fill();
    }

    // Rocket Thruster on the back of the deck
    if (this.upgrades.rocket >= 1 || this.boostActive) {
      ctx.fillStyle = "#e03131";
      ctx.fillRect(-25, -5, 7, 10);
      if (this.boostActive) {
        ctx.fillStyle = "#ffd43b";
        ctx.beginPath();
        ctx.moveTo(-25, -5);
        ctx.lineTo(-39 - Math.random() * 10, 0);
        ctx.lineTo(-25, 5);
        ctx.fill();
      }
    }
    ctx.restore();

    // --- 3. DRAW CRIMOTHY THE POSSUM ---
    // Long Pink Prehensile Tail waving behind!
    const tailWag = Math.sin(this.tailPhase) * 7;
    ctx.strokeStyle = "#f783ac";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-11, 0);
    ctx.quadraticCurveTo(-22, tailWag * 0.6, -31, tailWag);
    ctx.stroke();

    // Torso (fluffy grey-silver possum fur + red punk bandana)
    ctx.fillStyle = "#868e96";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(-2, 0, 13, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Punk Bandana / Vest
    ctx.fillStyle = "#e03131";
    ctx.beginPath();
    ctx.arc(3, 0, 8, 0, Math.PI * 2);
    ctx.fill();

    // Scooter Handlebars (in front of Crimothy)
    ctx.strokeStyle = "#dee2e6";
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(14, -12);
    ctx.lineTo(14, 12);
    ctx.stroke();
    // Red Handlebar Grips
    ctx.strokeStyle = "#fa5252";
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(14, -13);
    ctx.lineTo(14, -8);
    ctx.moveTo(14, 8);
    ctx.lineTo(14, 13);
    ctx.stroke();

    // Possum Head (pointed white cone snout + round dark ears + pink nose)
    ctx.fillStyle = "#f8f9fa";
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(2, -8);
    ctx.lineTo(19, 0);
    ctx.lineTo(2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Round Black Ears with Pink Tips
    ctx.fillStyle = "#212529";
    ctx.beginPath();
    ctx.arc(2, -8, 4.5, 0, Math.PI * 2);
    ctx.arc(2, 8, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Bright Pink Snout Tip
    ctx.fillStyle = "#ff8787";
    ctx.beginPath();
    ctx.arc(19, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    // Beady Chaotic Eyes
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(10, -3.5, 2, 0, Math.PI * 2);
    ctx.arc(10, 3.5, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

window.Player = Player;

