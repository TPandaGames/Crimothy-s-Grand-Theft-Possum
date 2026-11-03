// js/entities.js — Pedestrians, Animal Control Authorities, Loot Drops, Particles & Floating Text

class EntityManager {
  constructor(world) {
    this.world = world;
    this.pedestrians = [];
    this.authorities = [];
    this.loot = [];
    this.particles = [];
    this.floatingTexts = [];
    this.nets = []; // flying capture nets from higher-tier Animal Control

    this.pedQuotesRobbed = [
      "MY ARTISANAL PIZZA!!",
      "A POSSUM ON A RAZOR?!",
      "HEY! THAT'S MY PURSE!",
      "CALL ANIMAL CONTROL!",
      "IT HISSED AT ME AND DID A KICKFLIP!",
      "MY SHINY WATCH!",
      "WHAT KIND OF CAT IS THAT?!"
    ];

    this.copQuotesInspect = [
      "Huh... rigor mortis already.",
      "Gross, roadkill. Moving on.",
      "False alarm dispatch, it's stiff.",
      "Whew, smells dead to me!",
      "Oscar-worthy corpse. Wait..."
    ];

    this.spawnInitialPedestrians(105);
  }

  spawnInitialPedestrians(count) {
    const items = [
      { icon: "🍕", name: "Warm Pizza Slice", value: 12 },
      { icon: "👜", name: "Designer Bag", value: 20 },
      { icon: "🍩", name: "Glazed Donut", value: 10 },
      { icon: "⌚", name: "Gold Wristwatch", value: 25 },
      { icon: "📱", name: "Smartphone", value: 18 },
      { icon: "💍", name: "Shiny Ring", value: 30 }
    ];
    const colors = ["#74c0fc", "#ff8787", "#63e6be", "#ffd43b", "#da77f2", "#ffa94d"];

    for (let i = 0; i < count; i++) {
      this.spawnPedestrian(items, colors);
    }
  }

  spawnPedestrian(items, colors) {
    // Pick a random sidewalk/road spot not inside a building
    let x = 200 + Math.random() * (this.world.width - 400);
    let y = 200 + Math.random() * (this.world.height - 400);
    for (let tries = 0; tries < 10; tries++) {
      if (!this.isInsideBuilding(x, y, 22)) break;
      x = 200 + Math.random() * (this.world.width - 400);
      y = 200 + Math.random() * (this.world.height - 400);
    }
    const item = items[Math.floor(Math.random() * items.length)];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const angle = Math.random() * Math.PI * 2;

    this.pedestrians.push({
      x, y,
      r: 13,
      angle,
      speed: 48 + Math.random() * 25,
      color,
      item: { ...item },
      hasItem: true,
      scaredTimer: 0,
      turnTimer: 2 + Math.random() * 4
    });
  }

  isInsideBuilding(x, y, pad = 16) {
    for (const b of this.world.buildings) {
      if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) {
        return true;
      }
    }
    return false;
  }

  spawnLoot(x, y, count = 3, baseValue = 5) {
    const icons = ["✨", "🥫", "🪙", "💎", "🍕", "🔑"];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 65 + Math.random() * 110;
      this.loot.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        value: baseValue + Math.floor(Math.random() * 5),
        icon: icons[Math.floor(Math.random() * icons.length)],
        life: 18.0,
        bob: Math.random() * Math.PI * 2
      });
    }
  }

  addParticles(x, y, color, count = 12, speed = 130, size = 5) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.8) * speed;
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color,
        size: size * (0.6 + Math.random() * 0.7),
        life: 0.4 + Math.random() * 0.45,
        maxLife: 0.85
      });
    }
  }

  addFloatingText(x, y, text, color = "#ffd43b", size = 16) {
    this.floatingTexts.push({
      x,
      y,
      text,
      color,
      size,
      vy: -52,
      life: 1.25,
      maxLife: 1.25
    });
  }

  // Spawn Animal Control units matching current Wanted Level
  maintainAuthorities(wantedLevel, player) {
    const desiredCount = wantedLevel === 0 ? 0 : wantedLevel * 2 + 1;
    if (this.authorities.length < desiredCount) {
      this.spawnAuthorityUnit(wantedLevel, player);
    } else if (wantedLevel === 0 && this.authorities.length > 0) {
      // Despawn far units when heat is gone
      for (let i = this.authorities.length - 1; i >= 0; i--) {
        const u = this.authorities[i];
        if (Math.hypot(u.x - player.x, u.y - player.y) > 650) {
          this.authorities.splice(i, 1);
        }
      }
    }
  }

  spawnAuthorityUnit(wantedLevel, player) {
    // Spawn just outside the player's camera view on a road
    const angle = Math.random() * Math.PI * 2;
    const dist = 560 + Math.random() * 220;
    let x = Math.max(80, Math.min(this.world.width - 80, player.x + Math.cos(angle) * dist));
    let y = Math.max(80, Math.min(this.world.height - 80, player.y + Math.sin(angle) * dist));

    if (this.isInsideBuilding(x, y, 25)) {
      x = this.world.roadWidth / 2;
    }

    // Choose unit type based on wanted level
    let type = 'segway';
    let speed = 155;
    let r = 15;
    let label = "SEGWAY PAUL";

    if (wantedLevel >= 5 && Math.random() < 0.35) {
      type = 'swatvan';
      speed = 265;
      r = 26;
      label = "WARDEN NET-CRUISER";
    } else if (wantedLevel >= 4 && Math.random() < 0.45) {
      type = 'k9';
      speed = 248;
      r = 13;
      label = "K-9 BLOODHOUND";
    } else if (wantedLevel >= 3 && Math.random() < 0.4) {
      type = 'van';
      speed = 235;
      r = 24;
      label = "ANIMAL CONTROL VAN";
    } else if (wantedLevel >= 2) {
      type = 'catcher';
      speed = 192;
      r = 14;
      label = "NET CATCHER";
    }

    this.authorities.push({
      x, y,
      vx: 0, vy: 0,
      r,
      type,
      label,
      baseSpeed: speed,
      angle: 0,
      confusedTimer: 0,
      blindedTimer: 0,
      netCooldown: 2.0 + Math.random() * 2.0,
      inspectQuoteSent: false
    });
  }

  update(dt, player, game) {
    // 1. Update Loot Drops
    const magnetRadius = player.getMagnetRadius();
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i];
      l.life -= dt;
      l.bob += dt * 7;
      l.x += l.vx * dt;
      l.y += l.vy * dt;
      l.vx *= 0.9;
      l.vy *= 0.9;

      const dx = player.x - l.x;
      const dy = player.y - l.y;
      const dist = Math.hypot(dx, dy);

      if (dist < magnetRadius) {
        const pull = (1 - dist / magnetRadius) * 440 + 180;
        l.x += (dx / dist) * pull * dt;
        l.y += (dy / dist) * pull * dt;
      }

      if (dist < player.r + 16) {
        game.addShinies(l.value, l.x, l.y, l.icon);
        window.SFX.shinyPickup();
        this.loot.splice(i, 1);
        continue;
      }

      if (l.life <= 0) {
        this.loot.splice(i, 1);
      }
    }

    // 2. Update Pedestrians
    for (const p of this.pedestrians) {
      p.turnTimer -= dt;
      if (p.scaredTimer > 0) {
        p.scaredTimer -= dt;
      }

      const currSpeed = p.scaredTimer > 0 ? p.speed * 2.3 : p.speed;
      const nx = p.x + Math.cos(p.angle) * currSpeed * dt;
      const ny = p.y + Math.sin(p.angle) * currSpeed * dt;

      if (
        nx < 40 || nx > this.world.width - 40 ||
        ny < 40 || ny > this.world.height - 40 ||
        this.isInsideBuilding(nx, ny, 16)
      ) {
        p.angle += Math.PI * 0.65 + (Math.random() - 0.5);
      } else {
        p.x = nx;
        p.y = ny;
      }

      if (p.turnTimer <= 0) {
        p.angle += (Math.random() - 0.5) * 1.4;
        p.turnTimer = 2.5 + Math.random() * 4;
      }

      // Check auto-snatch if player rides close by
      const distToPlayer = Math.hypot(player.x - p.x, player.y - p.y);
      const snatchReach = player.r + p.r + (player.upgrades.magnet * 14) + 12;
      if (p.hasItem && !player.isPlayingDead && distToPlayer < snatchReach && player.speed > 75) {
        this.snatchFromPedestrian(p, player, game);
      }
    }

    // 3. Update Authorities (Animal Control)
    this.maintainAuthorities(game.wantedLevel, player);

    const inSafeHideout = !!this.world.isInsideAnyHideout(player.x, player.y);

    for (let i = this.authorities.length - 1; i >= 0; i--) {
      const cop = this.authorities[i];

      if (cop.blindedTimer > 0) {
        cop.blindedTimer -= dt;
        cop.angle += dt * 8;
        continue;
      }

      const dx = player.x - cop.x;
      const dy = player.y - cop.y;
      const dist = Math.hypot(dx, dy);

      // Check if player is Playing Dead or inside Safe Hideout!
      const foolDistance = cop.type === 'k9'
        ? Math.max(25, 95 - player.upgrades.acting * 32)
        : Math.max(18, 65 - player.upgrades.acting * 22);

      if (game.wantedLevel === 0 || inSafeHideout) {
        // Patrol away
        cop.angle += Math.sin(dt) * 0.2;
        cop.x += Math.cos(cop.angle) * (cop.baseSpeed * 0.55) * dt;
        cop.y += Math.sin(cop.angle) * (cop.baseSpeed * 0.55) * dt;
        continue;
      }

      if (player.isPlayingDead && dist > foolDistance) {
        // Cop gets confused and walks up slowly to inspect the "corpse", then leaves!
        if (dist < 170 && !cop.inspectQuoteSent) {
          cop.inspectQuoteSent = true;
          cop.confusedTimer = 3.0;
          const q = this.copQuotesInspect[Math.floor(Math.random() * this.copQuotesInspect.length)];
          this.addFloatingText(cop.x, cop.y - 24, `❓ "${q}"`, "#74c0fc", 13);
          // Drain heat bonus when fooling a cop!
          game.reduceHeat(18 + player.upgrades.acting * 8);
        }

        if (cop.confusedTimer > 0) {
          cop.confusedTimer -= dt;
          // Walk away from the "dead" possum
          const awayAngle = Math.atan2(-dy, -dx);
          cop.angle = awayAngle;
          cop.x += Math.cos(cop.angle) * (cop.baseSpeed * 0.5) * dt;
          cop.y += Math.sin(cop.angle) * (cop.baseSpeed * 0.5) * dt;
        } else {
          // Wander slowly
          cop.x += Math.cos(cop.angle) * (cop.baseSpeed * 0.4) * dt;
          cop.y += Math.sin(cop.angle) * (cop.baseSpeed * 0.4) * dt;
        }
        continue;
      } else {
        cop.inspectQuoteSent = false;
      }

      // Actively chasing Crimothy!
      const targetAngle = Math.atan2(dy, dx);
      cop.angle = targetAngle;

      let moveX = cop.x + Math.cos(cop.angle) * cop.baseSpeed * dt;
      let moveY = cop.y + Math.sin(cop.angle) * cop.baseSpeed * dt;

      if (!this.isInsideBuilding(moveX, cop.y, cop.r)) {
        cop.x = moveX;
      }
      if (!this.isInsideBuilding(cop.x, moveY, cop.r)) {
        cop.y = moveY;
      }

      // Check if cop runs into a gushing fire hydrant geyser!
      for (const prop of this.world.props) {
        if (prop.type === 'hydrant' && prop.smashed && prop.geyserTimer > 0) {
          if (Math.hypot(cop.x - prop.x, cop.y - prop.y) < 34) {
            cop.blindedTimer = 2.0;
            this.addFloatingText(cop.x, cop.y - 20, "💦 BLASTED!", "#4dabf7", 14);
          }
        }
      }

      // Throw capture net if catcher or swatvan
      if ((cop.type === 'catcher' || cop.type === 'swatvan') && dist < 270 && dist > 70 && player.z < 10) {
        cop.netCooldown -= dt;
        if (cop.netCooldown <= 0) {
          cop.netCooldown = 3.2;
          this.nets.push({
            x: cop.x,
            y: cop.y,
            vx: Math.cos(targetAngle) * 320,
            vy: Math.sin(targetAngle) * 320,
            r: 16,
            life: 1.1
          });
        }
      }

      // Contact with Player (only if player isn't jumping high over them!)
      if (dist < cop.r + player.r && player.z < 18) {
        if (player.boostActive && player.upgrades.deck >= 2) {
          // Spiked deck + boost knocks back foot officers!
          cop.blindedTimer = 1.8;
          cop.x -= Math.cos(targetAngle) * 55;
          cop.y -= Math.sin(targetAngle) * 55;
          this.addParticles(cop.x, cop.y, "#ffd43b", 12, 160);
          this.addFloatingText(cop.x, cop.y - 20, "💥 BOWLED OVER!", "#ffa94d", 15);
          window.SFX.trashCrash();
        } else {
          player.takeDamage(18, cop.label, game);
          // Push apart
          cop.x -= Math.cos(targetAngle) * 48;
          cop.y -= Math.sin(targetAngle) * 48;
        }
      }
    }

    // 4. Update Flying Capture Nets
    for (let i = this.nets.length - 1; i >= 0; i--) {
      const n = this.nets[i];
      n.life -= dt;
      n.x += n.vx * dt;
      n.y += n.vy * dt;

      if (Math.hypot(n.x - player.x, n.y - player.y) < n.r + player.r && player.z < 16) {
        player.takeDamage(14, "CAPTURE NET", game);
        this.addFloatingText(player.x, player.y - 25, "🕸️ NETTED! (JUMP NEXT TIME!)", "#ff6b6b", 14);
        this.nets.splice(i, 1);
        continue;
      }
      if (n.life <= 0) this.nets.splice(i, 1);
    }

    // 5. Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    // 6. Update Floating Texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      ft.y += ft.vy * dt;
      ft.vy *= 0.94;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  snatchFromPedestrian(ped, player, game) {
    ped.hasItem = false;
    ped.scaredTimer = 5.0;
    ped.angle = Math.atan2(ped.y - player.y, ped.x - player.x);

    const quote = this.pedQuotesRobbed[Math.floor(Math.random() * this.pedQuotesRobbed.length)];
    this.addFloatingText(ped.x, ped.y - 26, `💬 "${quote}"`, "#fff", 13);
    this.addFloatingText(player.x, player.y - 38, `YOINK! +${ped.item.value} ${ped.item.icon}`, "#ffd43b", 17);

    this.addParticles(ped.x, ped.y, "#ffd43b", 12, 140);
    window.SFX.shinyPickup();

    game.recordCrime(`Snatched ${ped.item.name} ${ped.item.icon}`, ped.item.value, 14);

    // Respawn their item after a while
    setTimeout(() => {
      ped.hasItem = true;
    }, 22000);
  }

  draw(ctx, time) {
    // 1. Draw Loot Drops
    for (const l of this.loot) {
      const bobY = Math.sin(l.bob) * 4;
      ctx.save();
      ctx.translate(l.x, l.y + bobY);
      // Glow circle
      ctx.fillStyle = "rgba(255, 212, 59, 0.28)";
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = "18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(l.icon, 0, 0);
      ctx.restore();
    }

    // 2. Draw Pedestrians
    for (const p of this.pedestrians) {
      ctx.save();
      ctx.translate(p.x, p.y);

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.arc(2, 4, p.r, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = p.color;
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Head
      ctx.fillStyle = "#ffe8cc";
      ctx.beginPath();
      ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3, 7, 0, Math.PI * 2);
      ctx.fill();

      // Held Shiny Item icon floating next to them
      if (p.hasItem) {
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.item.icon, 14, -10 + Math.sin(time * 6) * 2);
      } else if (p.scaredTimer > 0) {
        ctx.font = "900 14px sans-serif";
        ctx.fillStyle = "#ff6b6b";
        ctx.fillText("❗", 0, -18);
      }
      ctx.restore();
    }

    // 3. Draw Authorities (Animal Control Officers & Vans)
    for (const cop of this.authorities) {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.rotate(cop.angle);

      if (cop.type === 'van' || cop.type === 'swatvan') {
        // Patrol Truck / SWAT Van
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(-26, -15, 56, 36);

        ctx.fillStyle = cop.type === 'swatvan' ? "#212529" : "#f8f9fa";
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 3;
        ctx.fillRect(-28, -18, 56, 36);
        ctx.strokeRect(-28, -18, 56, 36);

        // Animal Control stripe
        ctx.fillStyle = cop.type === 'swatvan' ? "#e03131" : "#339af0";
        ctx.fillRect(-10, -18, 22, 36);

        // Flashing Siren Lightbar
        const flashRed = Math.floor(time * 12) % 2 === 0;
        ctx.fillStyle = flashRed ? "#ff4d4f" : "#339af0";
        ctx.fillRect(4, -14, 7, 12);
        ctx.fillStyle = flashRed ? "#339af0" : "#ff4d4f";
        ctx.fillRect(4, 2, 7, 12);
      } else if (cop.type === 'k9') {
        // K-9 Bloodhound
        ctx.fillStyle = "#8b5a2b";
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 15, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Snout & ears
        ctx.fillStyle = "#5c3a21";
        ctx.beginPath();
        ctx.arc(12, 0, 6, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Foot Catcher or Segway Officer
        ctx.fillStyle = "#1c7ed6";
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, cop.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Catch Net Pole
        ctx.strokeStyle = "#ced4da";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(4, 8);
        ctx.lineTo(24, 14);
        ctx.stroke();

        ctx.strokeStyle = "#63e6be";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(28, 15, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();

      // Status icon above officer
      if (cop.blindedTimer > 0) {
        ctx.fillStyle = "#cc5de8";
        ctx.font = "900 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("💫 BLINDED!", cop.x, cop.y - 24);
      } else if (cop.confusedTimer > 0) {
        ctx.fillStyle = "#ffd43b";
        ctx.font = "900 15px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("❓", cop.x, cop.y - 24);
      }
    }

    // 4. Draw Flying Capture Nets
    for (const n of this.nets) {
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.strokeStyle = "#63e6be";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, n.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-n.r, 0);
      ctx.lineTo(n.r, 0);
      ctx.moveTo(0, -n.r);
      ctx.lineTo(0, n.r);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Draw Particles
    for (const pt of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 6. Draw Floating Comic Texts
    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
      ctx.font = `900 ${ft.size}px 'Segoe UI', sans-serif`;
      ctx.textAlign = "center";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 4;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }
}

window.EntityManager = EntityManager;

