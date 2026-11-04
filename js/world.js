// js/world.js — Massive 8x8 City Block Map (5420x5420) Packed with Buildings, Alleys & Dumpsters

import { CONSTANTS } from './constants.js';

export class World {
  constructor() {
    this.blockSize = CONSTANTS.WORLD.BLOCK_SIZE;
    this.roadWidth = CONSTANTS.WORLD.ROAD_WIDTH;
    this.gridCount = CONSTANTS.WORLD.GRID_COUNT; // 8x8 = 64 City Blocks! (16 blocks per District)
    const step = this.blockSize + this.roadWidth; // 660
    this.width = this.gridCount * step + this.roadWidth;  // 5420
    this.height = this.gridCount * step + this.roadWidth; // 5420
    this.midX = this.width / 2;  // 2710
    this.midY = this.height / 2; // 2710

    // 4 Massive Unlockable Districts (each 4x4 blocks = 2710x2710)
    this.districts = [
      {
        id: 0,
        name: "SCRAP-HEAP SUBURBS",
        reqInfamy: 0,
        unlocked: true,
        lootMult: 1.0,
        subtitle: "Starter District — 16 Blocks of Tenements, Bodegas, Suburbs & Alley Dumpsters",
        color: "#51cf66",
        bounds: { x1: 0, y1: 0, x2: this.midX, y2: this.midY }
      },
      {
        id: 1,
        name: "NEON DOWNTOWN & SKATE PLAZA",
        reqInfamy: 1500,
        unlocked: false,
        lootMult: 1.5,
        subtitle: "Barricades down! 16 Blocks of Neon High-Rises, Street ATMs, Skate Parks & 1.5x Loot!",
        color: "#cc5de8",
        bounds: { x1: this.midX, y1: 0, x2: this.width, y2: this.midY }
      },
      {
        id: 2,
        name: "GILDED HILLSIDE ESTATES",
        reqInfamy: 4500,
        unlocked: false,
        lootMult: 2.2,
        subtitle: "Gated Mansions open! 16 Blocks of Villas, Golden Flamingos & 2.2x Loot!",
        color: "#fcc419",
        bounds: { x1: 0, y1: this.midY, x2: this.midX, y2: this.height }
      },
      {
        id: 3,
        name: "MAYOR'S COMPOUND & BULLION ROW",
        reqInfamy: 10000,
        unlocked: false,
        lootMult: 3.0,
        subtitle: "Maximum Infamy! 16 Blocks of Gold Banks, Mayor's Trophies & 3.0x VIP Loot!",
        color: "#ff6b6b",
        bounds: { x1: this.midX, y1: this.midY, x2: this.width, y2: this.height }
      }
    ];

    this.buildings = [];
    this.props = [];
    this.ramps = [];
    this.graffitiSpots = [];
    this.skidMarks = [];

    // Primary hideout + District Safe Outposts
    this.hideouts = [];
    this.hideout = {
      x: 400,
      y: 400,
      r: 72,
      label: "BIG SAL'S DUMPSTER GARAGE"
    };

    this.generateNeighborhood();
  }

  getDistrictAt(x, y) {
    const right = x >= this.midX;
    const bottom = y >= this.midY;
    if (!right && !bottom) return this.districts[0];
    if (right && !bottom) return this.districts[1];
    if (!right && bottom) return this.districts[2];
    return this.districts[3];
  }

  getNextLockedDistrict() {
    for (const d of this.districts) {
      if (!d.unlocked) return d;
    }
    return null;
  }

  isPositionLocked(x, y) {
    const d = this.getDistrictAt(x, y);
    return !d.unlocked ? d : null;
  }

  getNearestHideout(x, y) {
    let best = this.hideout;
    let bestDist = Math.hypot(x - best.x, y - best.y);
    for (const h of this.hideouts) {
      const d = Math.hypot(x - h.x, y - h.y);
      if (d < bestDist) {
        bestDist = d;
        best = h;
      }
    }
    return best;
  }

  isInsideAnyHideout(x, y, extraPad = 0) {
    for (const h of this.hideouts) {
      if (Math.hypot(x - h.x, y - h.y) < h.r + extraPad) return h;
    }
    return null;
  }

  generateNeighborhood() {
    this.buildings = [];
    this.props = [];
    this.ramps = [];
    this.graffitiSpots = [];
    this.hideouts = [];

    const step = this.blockSize + this.roadWidth;
    const startOffset = this.roadWidth;

    const districtBuildingTitles = {
      0: [
        "BODEGA", "PIZZA SHACK", "LAUNDROMAT", "PAWN SHOP", "THRIFT MART",
        "AUTO BODY", "DONUT HUT", "TACO STAND", "BAIL BONDS", "DUPLEX",
        "BRICK FLATS", "CORNER DELI", "HARDWARE", "BARBER", "TIRE SHOP", "DINER"
      ],
      1: [
        "CYBER ARCADE", "NEON NOODLE", "SYNTH CLUB", "MEGA PAWN", "VAPE & INK",
        "LASER TAG", "RECORD STORE", "RAMEN BAR", "TECH LOFT", "DISCO TOWER",
        "BOBA PLAZA", "COMIC VAULT", "SKATE LAB", "PIXEL CAFE", "HOLO BANK", "NIGHT MARKET"
      ],
      2: [
        "CHATEAU", "GRAND VILLA", "YACHT CLUB", "TENNIS MANOR", "SPA & SALON",
        "BOUTIQUE", "CAVIAR BAR", "ART GALLERY", "OPERA HOUSE", "ROSE ESTATE",
        "PALM MANOR", "IVY HALL", "SILK LOUNGE", "POLO CLUB", "GILDED SUITES", "WINE CELLAR"
      ],
      3: [
        "GOLD RESERVE", "BULLION VAULT", "MAYOR'S ANNEX", "SWAT BARRACKS", "FEDERAL MINT",
        "COURT HOUSE", "WARDEN TOWER", "DIAMOND EXCHANGE", "EMBASSY", "CROWN PLAZA",
        "TREASURY", "ARMORY", "SENATE HALL", "VIP CASINO", "PENTHOUSE", "CENTRAL BANK"
      ]
    };

    const graffitiSlogans = [
      "EAT TRASH BE FREE",
      "CRIMOTHY WAS HERE",
      "HISS AT AUTHORITY",
      "NO LEASHES!",
      "GARBAGE KING 🦝",
      "LEGALIZE SCOOTERS",
      "50% RAT 100% CRIME",
      "FEAR THE POUCH",
      "RECALL THE MAYOR",
      "TAX THE POODLES",
      "DUMPSTER DIVA",
      "OPOSSUM SYNDICATE"
    ];

    for (let gy = 0; gy < this.gridCount; gy++) {
      for (let gx = 0; gx < this.gridCount; gx++) {
        const bx = startOffset + gx * step;
        const by = startOffset + gy * step;
        const bw = this.blockSize;
        const bh = this.blockSize;
        const distId = (gx >= 4 ? 1 : 0) + (gy >= 4 ? 2 : 0);
        const titles = districtBuildingTitles[distId];
        const titleBase = (gx * 7 + gy * 13) % titles.length;

        // Check if this block is a Safe Dumpster Garage Outpost (1 per District!)
        const isHideoutBlock =
          (gx === 0 && gy === 0) ||
          (gx === 5 && gy === 1) ||
          (gx === 1 && gy === 5) ||
          (gx === 5 && gy === 5);

        // Check if this block is a Skate / Trick Park (2 parks across the city!)
        const isSkatePark = (gx === 4 && gy === 2) || (gx === 2 && gy === 1);

        if (isHideoutBlock) {
          const hObj = {
            x: bx + bw * 0.5,
            y: by + bh * 0.5,
            r: 72,
            label: distId === 0 ? "BIG SAL'S DUMPSTER GARAGE" : `DISTRICT ${distId + 1} SAFE OUTPOST`
          };
          this.hideouts.push(hObj);
          if (gx === 0 && gy === 0) this.hideout = hObj;

          // Surround the safe alley with 4 dense corner buildings + 4 dumpsters!
          this.addBuilding(bx + 20, by + 20, 175, 135, "#3b4252", "#2e3440", "SAL'S GARAGE", true);
          this.addBuilding(bx + 325, by + 20, 175, 135, "#4c566a", "#3b4252", "SCRAP DEPOT", true);
          this.addBuilding(bx + 20, by + 365, 175, 135, "#434c5e", "#2e3440", "ALLEY BODEGA", true);
          this.addBuilding(bx + 325, by + 365, 175, 135, "#5e81ac", "#2e3440", "PAWN & TOOLS", true);

          // Dumpsters around the safe zone
          this.addDumpster(bx + 110, by + 185);
          this.addDumpster(bx + 410, by + 185);
          this.addDumpster(bx + 110, by + 335);
          this.addDumpster(bx + 410, by + 335);

          // Launch ramps
          this.ramps.push({ x: bx + 230, y: by + 150, w: 60, h: 42, dir: 'up', label: 'KICKER' });
          this.ramps.push({ x: bx + 230, y: by + 330, w: 60, h: 42, dir: 'up', label: 'LAUNCH' });
        } else if (isSkatePark) {
          // Skate & Fountain Park with corner shops and dumpsters
          this.addBuilding(bx + 20, by + 20, 135, 110, "#7950f2", "#2e3440", "SKATE SHOP", true);
          this.addBuilding(bx + 365, by + 20, 135, 110, "#1098ad", "#2e3440", "SNACK BAR", true);
          this.addBuilding(bx + 20, by + 390, 135, 110, "#f783ac", "#2e3440", "ARCADE HUT", true);
          this.addBuilding(bx + 365, by + 390, 135, 110, "#fcc419", "#2e3440", "GEAR SHACK", true);

          this.ramps.push({ x: bx + 195, y: by + 195, w: 130, h: 130, dir: 'omni', label: 'FOUNTAIN BOWL', isFountain: (gx === 2) });
          this.ramps.push({ x: bx + 190, y: by + 60, w: 140, h: 48, dir: 'up', label: 'HALFPIPE' });
          this.ramps.push({ x: bx + 190, y: by + 410, w: 140, h: 48, dir: 'up', label: 'FUNBOX' });

          this.addDumpster(bx + 85, by + 155);
          this.addDumpster(bx + 435, by + 155);
          this.addDumpster(bx + 85, by + 365);
          this.addDumpster(bx + 435, by + 365);
        } else {
          // Dense Urban / Suburban Block Layouts with narrow scooter alleys & 4-6 buildings!
          const layoutType = (gx + gy) % 3;
          const roofPalettes = {
            0: ["#d08770", "#ebcb8b", "#a3be8c", "#b48ead", "#88c0d0", "#bf616a", "#5e81ac"],
            1: ["#5f3dc4", "#7048e8", "#1098ad", "#c2255c", "#0ca678", "#f03e3e", "#ae3ec9"],
            2: ["#e6fcf5", "#fff9db", "#f3d9fa", "#d3f9d8", "#ffe8cc", "#e7f5ff", "#fff0f6"],
            3: ["#fcc419", "#fab005", "#e03131", "#343a40", "#ffd43b", "#f59f00", "#495057"]
          };
          const wallPalettes = {
            0: "#2e3440",
            1: "#1f1938",
            2: "#495057",
            3: "#2b2312"
          };
          const pal = roofPalettes[distId];
          const wCol = wallPalettes[distId];

          if (layoutType === 0) {
            // 6-Building Dense Alley Grid (3 top, 3 bottom, horizontal & vertical alleys between them!)
            const specs = [
              [bx + 18,  by + 18,  140, 175],
              [bx + 190, by + 18,  140, 175],
              [bx + 362, by + 18,  140, 175],
              [bx + 18,  by + 325, 140, 175],
              [bx + 190, by + 325, 140, 175],
              [bx + 362, by + 325, 140, 175]
            ];
            specs.forEach((s, idx) => {
              const col = pal[(gx + gy + idx) % pal.length];
              const t = titles[(titleBase + idx) % titles.length];
              this.addBuilding(s[0], s[1], s[2], s[3], col, wCol, t, idx % 2 === 0);
            });

            // 5 Dumpsters lined up in the back alley!
            this.addDumpster(bx + 88,  by + 222);
            this.addDumpster(bx + 260, by + 222);
            this.addDumpster(bx + 432, by + 222);
            this.addDumpster(bx + 174, by + 295);
            this.addDumpster(bx + 346, by + 295);
          } else if (layoutType === 1) {
            // 5-Building Commercial Courtyard (2 wide megastores + 3 row shops)
            const specs = [
              [bx + 20,  by + 20,  220, 170],
              [bx + 280, by + 20,  220, 170],
              [bx + 20,  by + 320, 140, 180],
              [bx + 190, by + 320, 140, 180],
              [bx + 360, by + 320, 140, 180]
            ];
            specs.forEach((s, idx) => {
              const col = pal[(gx * 2 + gy + idx) % pal.length];
              const t = titles[(titleBase + idx) % titles.length];
              this.addBuilding(s[0], s[1], s[2], s[3], col, wCol, t, idx < 3);
            });

            // 4 Dumpsters + Alley Kicker Ramp!
            this.addDumpster(bx + 120, by + 215);
            this.addDumpster(bx + 390, by + 215);
            this.addDumpster(bx + 90,  by + 292);
            this.addDumpster(bx + 430, by + 292);
            this.ramps.push({ x: bx + 230, y: by + 235, w: 60, h: 42, dir: 'up', label: 'ALLEY RAMP' });
          } else {
            // 4 Large Complex Buildings with Cross-Alley + 4 Dumpsters
            const specs = [
              [bx + 22,  by + 22,  195, 190],
              [bx + 303, by + 22,  195, 190],
              [bx + 22,  by + 308, 195, 190],
              [bx + 303, by + 308, 195, 190]
            ];
            specs.forEach((s, idx) => {
              const col = pal[(gx + gy * 3 + idx) % pal.length];
              const t = titles[(titleBase + idx) % titles.length];
              this.addBuilding(s[0], s[1], s[2], s[3], col, wCol, t, true);
            });

            // 4 Dumpsters in the cross-alley
            this.addDumpster(bx + 260, by + 95);
            this.addDumpster(bx + 260, by + 425);
            this.addDumpster(bx + 95,  by + 260);
            this.addDumpster(bx + 425, by + 260);
          }

          // District-specific high-value props in the block!
          if (distId === 0) {
            this.props.push({
              type: 'gnome',
              x: bx + 260,
              y: by + 260,
              r: 12,
              smashed: false,
              vx: 0, vy: 0,
              respawnTimer: 0
            });
          } else if (distId === 1) {
            this.props.push({
              type: 'atm',
              x: bx + 165,
              y: by - 16,
              r: 16,
              smashed: false,
              vx: 0, vy: 0,
              respawnTimer: 0
            });
            this.props.push({
              type: 'atm',
              x: bx + 355,
              y: by + bh + 16,
              r: 16,
              smashed: false,
              vx: 0, vy: 0,
              respawnTimer: 0
            });
          } else if (distId === 2) {
            this.props.push({
              type: 'flamingo',
              x: bx + 165,
              y: by - 16,
              r: 14,
              smashed: false,
              vx: 0, vy: 0,
              respawnTimer: 0
            });
            this.props.push({
              type: 'flamingo',
              x: bx + 355,
              y: by + bh + 16,
              r: 14,
              smashed: false,
              vx: 0, vy: 0,
              respawnTimer: 0
            });
          } else if (distId === 3) {
            this.props.push({
              type: 'trophy',
              x: bx + 165,
              y: by - 16,
              r: 17,
              smashed: false,
              vx: 0, vy: 0,
              respawnTimer: 0
            });
            this.props.push({
              type: 'trophy',
              x: bx + 355,
              y: by + bh + 16,
              r: 17,
              smashed: false,
              vx: 0, vy: 0,
              respawnTimer: 0
            });
          }
        }

        // Sidewalk Trash Cans, Mailboxes, and Sidewalk Dumpsters around every block!
        for (let i = 0; i < 4; i++) {
          const offset = 75 + i * 120;
          // Top sidewalk
          this.props.push({
            type: i % 2 === 0 ? 'trashcan' : 'mailbox',
            x: bx + offset,
            y: by - 16,
            r: 15,
            smashed: false,
            vx: 0, vy: 0,
            respawnTimer: 0
          });
          // Bottom sidewalk
          this.props.push({
            type: i % 2 === 1 ? 'trashcan' : 'mailbox',
            x: bx + offset,
            y: by + bh + 16,
            r: 15,
            smashed: false,
            vx: 0, vy: 0,
            respawnTimer: 0
          });
        }

        // Street-side Dumpsters on left & right curbs of every block!
        this.addDumpster(bx - 16, by + 150);
        this.addDumpster(bx + bw + 16, by + 370);

        // Fire hydrants on block corners
        this.props.push({
          type: 'hydrant',
          x: bx - 18,
          y: by - 18,
          r: 14,
          smashed: false,
          geyserTimer: 0,
          respawnTimer: 0
        });
        this.props.push({
          type: 'hydrant',
          x: bx + bw + 18,
          y: by + bh + 18,
          r: 14,
          smashed: false,
          geyserTimer: 0,
          respawnTimer: 0
        });
      }
    }

    // Assign slogans to graffiti spots
    this.graffitiSpots.forEach((spot, i) => {
      spot.slogan = graffitiSlogans[i % graffitiSlogans.length];
    });
  }

  addDumpster(x, y) {
    this.props.push({
      type: 'dumpster',
      x,
      y,
      r: 24,
      smashed: false,
      looted: false,
      vx: 0,
      vy: 0,
      respawnTimer: 0
    });
  }

  addBuilding(x, y, w, h, roofColor, wallColor, label, addGraffiti = false) {
    this.buildings.push({ x, y, w, h, roofColor, wallColor, label });
    if (addGraffiti) {
      this.graffitiSpots.push({
        x: x + w / 2,
        y: y + h + 6,
        w: Math.min(105, w - 16),
        tagged: false,
        slogan: "CRIMOTHY!",
        color: "#ff6b6b"
      });
    }
  }

  addSkidMark(x, y, angle, isFlame = false) {
    this.skidMarks.push({
      x, y, angle,
      isFlame,
      alpha: isFlame ? 0.85 : 0.45,
      life: isFlame ? 4.0 : 6.0
    });
    if (this.skidMarks.length > 300) {
      this.skidMarks.shift();
    }
  }

  update(dt) {
    for (let i = this.skidMarks.length - 1; i >= 0; i--) {
      const s = this.skidMarks[i];
      s.life -= dt;
      if (s.life <= 0) this.skidMarks.splice(i, 1);
    }

    for (const p of this.props) {
      if (p.vx || p.vy) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.9;
        p.vy *= 0.9;
        if (Math.hypot(p.vx, p.vy) < 5) {
          p.vx = 0;
          p.vy = 0;
        }
      }
      if (p.type === 'hydrant' && p.smashed && p.geyserTimer > 0) {
        p.geyserTimer -= dt;
      }
      if (p.smashed || p.looted) {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          p.smashed = false;
          p.looted = false;
        }
      }
    }
  }

  draw(ctx, camera, time) {
    const step = this.blockSize + this.roadWidth;
    const startOffset = this.roadWidth;

    // Viewport bounds for fast culling on the huge 5420x5420 map (accounts for resolution zoom)
    const viewW = camera.viewW || window.innerWidth;
    const viewH = camera.viewH || window.innerHeight;
    const viewX1 = camera.x - 180;
    const viewY1 = camera.y - 180;
    const viewX2 = camera.x + viewW + 180;
    const viewY2 = camera.y + viewH + 180;

    // 1. Base Asphalt World Background
    ctx.fillStyle = "#242933";
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. Road Lane Dashes
    ctx.strokeStyle = "#e5a93c";
    ctx.lineWidth = 4;
    ctx.setLineDash([26, 26]);

    for (let i = 0; i <= this.gridCount; i++) {
      const roadCenter = i * step + this.roadWidth / 2;
      if (roadCenter >= viewY1 && roadCenter <= viewY2) {
        ctx.beginPath();
        ctx.moveTo(Math.max(0, viewX1), roadCenter);
        ctx.lineTo(Math.min(this.width, viewX2), roadCenter);
        ctx.stroke();
      }
      if (roadCenter >= viewX1 && roadCenter <= viewX2) {
        ctx.beginPath();
        ctx.moveTo(roadCenter, Math.max(0, viewY1));
        ctx.lineTo(roadCenter, Math.min(this.height, viewY2));
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // 3. City Blocks (Culled to viewport)
    for (let gy = 0; gy < this.gridCount; gy++) {
      for (let gx = 0; gx < this.gridCount; gx++) {
        const bx = startOffset + gx * step;
        const by = startOffset + gy * step;
        const bw = this.blockSize;
        const bh = this.blockSize;

        if (bx + bw + 30 < viewX1 || bx - 30 > viewX2 || by + bh + 30 < viewY1 || by - 30 > viewY2) {
          continue;
        }

        const distId = (gx >= 4 ? 1 : 0) + (gy >= 4 ? 2 : 0);

        // Sidewalk Curb
        ctx.fillStyle = distId === 1 ? "#4b3869" : distId === 2 ? "#8c9480" : distId === 3 ? "#8c7430" : "#7c8594";
        ctx.fillRect(bx - 26, by - 26, bw + 52, bh + 52);

        // Sidewalk Pavement
        ctx.fillStyle = distId === 1 ? "#34284a" : distId === 2 ? "#b7bfab" : distId === 3 ? "#b59d56" : "#9aa2b1";
        ctx.fillRect(bx - 20, by - 20, bw + 40, bh + 40);

        // Block Interior (Alleyways & Courtyards)
        if ((gx === 4 && gy === 2) || (gx === 2 && gy === 1)) {
          ctx.fillStyle = "#483a6b"; // Skatepark concrete
        } else if (distId === 0) {
          ctx.fillStyle = (gx + gy) % 2 === 0 ? "#3a404d" : "#3d6b47"; // Alley concrete or suburban grass
        } else if (distId === 1) {
          ctx.fillStyle = "#252038"; // Neon Downtown dark alley
        } else if (distId === 2) {
          ctx.fillStyle = "#2b7a4b"; // Gilded Estates emerald turf
        } else {
          ctx.fillStyle = "#4a3f28"; // Mayor's Compound gold/stone plaza
        }
        ctx.fillRect(bx, by, bw, bh);
      }
    }

    // 4. Draw All Safe Zone Hideouts / Outposts
    for (const h of this.hideouts) {
      if (h.x + h.r < viewX1 || h.x - h.r > viewX2 || h.y + h.r < viewY1 || h.y - h.r > viewY2) continue;
      ctx.save();
      ctx.translate(h.x, h.y);
      ctx.strokeStyle = "#51cf66";
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.arc(0, 0, h.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "rgba(81, 207, 102, 0.16)";
      ctx.beginPath();
      ctx.arc(0, 0, h.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#51cf66";
      ctx.font = "900 12px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🗑️ " + h.label, 0, -h.r - 8);
      ctx.fillStyle = "#ffd43b";
      ctx.font = "700 10px 'Segoe UI', sans-serif";
      ctx.fillText("[SAFE ZONE — PRESS E / TAB TO SHOP]", 0, h.r + 16);
      ctx.restore();
    }

    // 5. Skid Marks & Flame Trails
    for (const s of this.skidMarks) {
      if (s.x < viewX1 || s.x > viewX2 || s.y < viewY1 || s.y > viewY2) continue;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      if (s.isFlame) {
        ctx.fillStyle = `rgba(255, 120, 30, ${Math.min(0.85, s.life * 0.3)})`;
        ctx.fillRect(-8, -5, 16, 10);
      } else {
        ctx.fillStyle = `rgba(15, 17, 22, ${Math.min(0.45, s.life * 0.12)})`;
        ctx.fillRect(-6, -3, 12, 6);
      }
      ctx.restore();
    }

    // 6. Ramps & Fountain
    for (const r of this.ramps) {
      if (r.x + r.w < viewX1 || r.x > viewX2 || r.y + r.h < viewY1 || r.y > viewY2) continue;
      ctx.save();
      if (r.isFountain) {
        const cx = r.x + r.w / 2;
        const cy = r.y + r.h / 2;
        ctx.fillStyle = "#7c8594";
        ctx.beginPath();
        ctx.arc(cx, cy, r.w / 2 + 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#339af0";
        ctx.beginPath();
        ctx.arc(cx, cy, r.w / 2 - 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#a5d8ff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ((time * 30) % (r.w / 2 - 6)), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#d08770";
        ctx.strokeStyle = "#1a1d24";
        ctx.lineWidth = 3;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeRect(r.x, r.y, r.w, r.h);

        ctx.fillStyle = "#ffd43b";
        ctx.font = "900 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("▲ RAMP ▲", r.x + r.w / 2, r.y + r.h / 2 + 4);
      }
      ctx.restore();
    }

    // 7. Props (Culled to viewport)
    for (const p of this.props) {
      if (p.x < viewX1 || p.x > viewX2 || p.y < viewY1 || p.y > viewY2) continue;
      ctx.save();
      ctx.translate(p.x, p.y);

      if (p.type === 'trashcan') {
        if (p.smashed) {
          ctx.fillStyle = "#495057";
          ctx.fillRect(-14, -8, 24, 16);
          ctx.fillStyle = "#a9e34b";
          ctx.beginPath();
          ctx.arc(14, 4, 5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.beginPath();
          ctx.arc(3, 4, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#6c757d";
          ctx.strokeStyle = "#212529";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (p.type === 'mailbox') {
        if (p.smashed) {
          ctx.fillStyle = "#3b5bdb";
          ctx.fillRect(-12, -6, 20, 12);
          ctx.fillStyle = "#fff";
          ctx.fillRect(12, -5, 9, 6);
        } else {
          ctx.fillStyle = "#3b5bdb";
          ctx.strokeStyle = "#181b22";
          ctx.lineWidth = 2.5;
          ctx.fillRect(-10, -8, 20, 16);
          ctx.strokeRect(-10, -8, 20, 16);
          ctx.fillStyle = "#fa5252";
          ctx.fillRect(8, -6, 5, 4);
        }
      } else if (p.type === 'hydrant') {
        if (p.smashed) {
          if (p.geyserTimer > 0) {
            const rad = 26 + Math.sin(time * 22) * 8;
            ctx.fillStyle = "rgba(77, 171, 247, 0.55)";
            ctx.beginPath();
            ctx.arc(0, 0, rad, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#e7f5ff";
            ctx.beginPath();
            ctx.arc(0, 0, rad * 0.45, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "#c92a2a";
          ctx.beginPath();
          ctx.arc(8, 5, 8, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "#e03131";
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (p.type === 'gnome') {
        if (p.smashed) {
          ctx.fillStyle = "#e03131";
          ctx.fillRect(-5, -3, 10, 6);
        } else {
          ctx.fillStyle = "#e03131";
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (p.type === 'atm') {
        if (p.smashed) {
          ctx.fillStyle = "#1098ad";
          ctx.fillRect(-14, -10, 26, 18);
          ctx.fillStyle = "#51cf66";
          ctx.fillRect(10, -6, 10, 6);
        } else {
          ctx.fillStyle = "#15aabf";
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 2.5;
          ctx.fillRect(-13, -13, 26, 26);
          ctx.strokeRect(-13, -13, 26, 26);
          ctx.fillStyle = "#ffd43b";
          ctx.font = "900 10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("ATM", 0, 4);
        }
      } else if (p.type === 'flamingo') {
        if (p.smashed) {
          ctx.fillStyle = "#f783ac";
          ctx.fillRect(-8, -4, 16, 8);
        } else {
          ctx.fillStyle = "#f783ac";
          ctx.strokeStyle = "#fcc419";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.font = "14px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("🦩", 0, 5);
        }
      } else if (p.type === 'trophy') {
        if (p.smashed) {
          ctx.fillStyle = "#fcc419";
          ctx.fillRect(-12, -8, 22, 14);
        } else {
          ctx.fillStyle = "#ffd43b";
          ctx.strokeStyle = "#111";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.font = "15px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("🏆", 0, 5);
        }
      } else if (p.type === 'dumpster') {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(-22, -12, 48, 30);
        ctx.fillStyle = p.looted ? "#2b4c3f" : "#2f9e44";
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 3;
        ctx.fillRect(-24, -16, 48, 32);
        ctx.strokeRect(-24, -16, 48, 32);
        ctx.fillStyle = "#212529";
        ctx.fillRect(-20, -12, 18, 24);
        ctx.fillRect(2, -12, 18, 24);
        if (!p.looted) {
          ctx.fillStyle = "#ffd43b";
          ctx.font = "900 10px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("✨DUMPSTER", 0, -20);
        }
      }
      ctx.restore();
    }

    // 8. Buildings & Roofs (Culled to viewport)
    for (const b of this.buildings) {
      if (b.x + b.w + 20 < viewX1 || b.x - 20 > viewX2 || b.y + b.h + 20 < viewY1 || b.y - 20 > viewY2) {
        continue;
      }
      ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
      ctx.fillRect(b.x + 10, b.y + 12, b.w, b.h);

      ctx.fillStyle = b.wallColor;
      ctx.strokeStyle = "#141619";
      ctx.lineWidth = 3.5;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeRect(b.x, b.y, b.w, b.h);

      ctx.fillStyle = b.roofColor;
      ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);

      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "900 12px 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 4);
    }

    // 9. Graffiti Wall Spots (Culled to viewport)
    for (const g of this.graffitiSpots) {
      if (g.x + g.w < viewX1 || g.x - g.w > viewX2 || g.y + 30 < viewY1 || g.y - 30 > viewY2) continue;
      ctx.save();
      ctx.translate(g.x, g.y);
      if (g.tagged) {
        ctx.fillStyle = "rgba(20, 20, 28, 0.88)";
        ctx.fillRect(-g.w / 2, -12, g.w, 22);
        ctx.strokeStyle = "#cc5de8";
        ctx.lineWidth = 2;
        ctx.strokeRect(-g.w / 2, -12, g.w, 22);

        ctx.fillStyle = "#63e6be";
        ctx.font = "900 10px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🎨 " + g.slogan, 0, 3);
      } else {
        const pulse = 0.55 + Math.sin(time * 5) * 0.35;
        ctx.strokeStyle = `rgba(204, 93, 232, ${pulse})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(-g.w / 2, -9, g.w, 18);
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(240, 140, 255, ${pulse})`;
        ctx.font = "800 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🎨 TAG WALL [E]", 0, 4);
      }
      ctx.restore();
    }

    // 10. Draw Locked District Laser Barricades & Warning Checkpoints
    for (const d of this.districts) {
      if (d.unlocked) continue;
      const { x1, y1, x2, y2 } = d.bounds;

      ctx.save();
      ctx.fillStyle = "rgba(18, 12, 24, 0.45)";
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);

      ctx.strokeStyle = d.color;
      ctx.lineWidth = 8;
      ctx.setLineDash([22, 14]);
      ctx.strokeRect(x1 + 4, y1 + 4, x2 - x1 - 8, y2 - y1 - 8);
      ctx.setLineDash([]);

      // Draw Checkpoint Signs along every road crossing into the locked district
      const signPoints = [];
      if (d.id === 1) {
        for (let r = 0; r < 4; r++) {
          signPoints.push({ x: x1, y: 380 + r * step });
        }
      } else if (d.id === 2) {
        for (let c = 0; c < 4; c++) {
          signPoints.push({ x: 380 + c * step, y: y1 });
        }
      } else if (d.id === 3) {
        for (let r = 4; r < 8; r++) {
          signPoints.push({ x: x1, y: 380 + r * step });
        }
        for (let c = 4; c < 8; c++) {
          signPoints.push({ x: 380 + c * step, y: y1 });
        }
      }

      for (const sp of signPoints) {
        if (sp.x + 150 < viewX1 || sp.x - 150 > viewX2 || sp.y + 60 < viewY1 || sp.y - 60 > viewY2) continue;
        ctx.save();
        ctx.translate(sp.x, sp.y);
        ctx.fillStyle = "rgba(18, 20, 28, 0.94)";
        ctx.strokeStyle = d.color;
        ctx.lineWidth = 3;
        ctx.fillRect(-135, -24, 270, 48);
        ctx.strokeRect(-135, -24, 270, 48);

        ctx.fillStyle = d.color;
        ctx.font = "900 12px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`🚧 LOCKED: ${d.name}`, 0, -4);
        ctx.fillStyle = "#ffd43b";
        ctx.font = "800 11px 'Segoe UI', sans-serif";
        ctx.fillText(`NEED ${d.reqInfamy.toLocaleString()} 💀 INFAMY TO UNLOCK`, 0, 14);
        ctx.restore();
      }

      ctx.restore();
    }

    // 11. Outer World Fence Boundary
    ctx.strokeStyle = "#fa5252";
    ctx.lineWidth = 10;
    ctx.strokeRect(4, 4, this.width - 8, this.height - 8);
  }
}


