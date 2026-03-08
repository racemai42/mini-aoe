'use strict';

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this._waterAnim = 0;

    // Tile colors
    this.tileColors = {
      [TILE.GRASS]:      '#4a7a35',
      [TILE.WATER]:      '#3a6595',
      [TILE.DEEP_WATER]: '#2a4875',
      [TILE.FOREST]:     '#2d5a1a',
      [TILE.GOLD_MINE]:  '#8a7a20',
      [TILE.STONE_MINE]: '#777777',
      [TILE.BUSH]:       '#3a7a25',
      [TILE.FARM_PLOT]:  '#8a6a30',
      [TILE.SAND]:       '#c8a858',
    };

    this.tileSideColors = {
      [TILE.GRASS]:      '#2d5020',
      [TILE.WATER]:      '#2a4875',
      [TILE.DEEP_WATER]: '#1a3060',
      [TILE.FOREST]:     '#1e3d10',
      [TILE.GOLD_MINE]:  '#5a5010',
      [TILE.STONE_MINE]: '#555555',
      [TILE.BUSH]:       '#2a5015',
      [TILE.FARM_PLOT]:  '#6a4a20',
      [TILE.SAND]:       '#a08040',
    };
  }

  resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  render(dt) {
    this._waterAnim += dt;
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, W, H);

    const map = game.map;
    const cam = game.camera;
    const fog = game.fog;

    // ===== RENDER TILES (back to front) =====
    for (let diag = 0; diag < map.width + map.height - 1; diag++) {
      for (let col = 0; col < map.width; col++) {
        const row = diag - col;
        if (row < 0 || row >= map.height) continue;

        const fogState = fog.getState(col, row);
        if (fogState === FOG.UNKNOWN) continue;

        const sp = map.toScreen(col, row, cam.x, cam.y, W, H);

        // Cull off-screen tiles
        if (sp.x < -TILE_W || sp.x > W + TILE_W) continue;
        if (sp.y < -TILE_H * 2 || sp.y > H + TILE_H) continue;

        const tileType = map.getTile(col, row);
        this._drawTile(ctx, sp.x, sp.y, tileType, fogState, col, row);
      }
    }

    // ===== RENDER ENTITIES (sorted by depth) =====
    // Gather visible entities
    const visibleEntities = [];
    game.getAllEntities().forEach(e => {
      if (e.dead) return;
      const tCol = e.isBuilding ? e.col + e.size / 2 : e.tileCol;
      const tRow = e.isBuilding ? e.row + e.size / 2 : e.tileRow;
      const fogState = fog.getState(Math.round(tCol), Math.round(tRow));
      if (fogState === FOG.UNKNOWN) return;
      if (e.owner !== 0 && fogState !== FOG.VISIBLE) return; // Enemy only visible when in fog
      e._renderDepth = (tCol + tRow);
      e._fogState = fogState;
      visibleEntities.push(e);
    });

    visibleEntities.sort((a, b) => a._renderDepth - b._renderDepth);

    for (const e of visibleEntities) {
      const sp = e.screenPos(cam.x, cam.y, W, H);
      if (sp.x < -100 || sp.x > W + 100) continue;
      if (sp.y < -100 || sp.y > H + 100) continue;

      if (e.isBuilding) {
        this._drawBuilding(ctx, e, sp, e._fogState);
      } else {
        this._drawUnit(ctx, e, sp, e._fogState);
      }
    }

    // ===== RENDER PROJECTILES =====
    this._drawProjectiles(ctx, cam, W, H);

    // ===== RENDER BUILD GHOST =====
    if (game.input.buildMode) {
      this._drawBuildGhost(ctx, cam, W, H);
    }

    // ===== RENDER SELECTION BOX =====
    if (game.input.isDragging && game.input.dragBox) {
      const b = game.input.dragBox;
      ctx.strokeStyle = 'rgba(100,255,100,0.8)';
      ctx.lineWidth = 1;
      ctx.fillStyle = 'rgba(100,255,100,0.1)';
      ctx.fillRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
      ctx.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
    }
  }

  // ===== TILE DRAWING =====

  _drawTile(ctx, sx, sy, tileType, fogState, col, row) {
    const W2 = TILE_W / 2;
    const H2 = TILE_H / 2;

    let topColor = this.tileColors[tileType] || '#4a7a35';
    let sideColor = this.tileSideColors[tileType] || '#2d5020';

    if (fogState === FOG.EXPLORED) {
      topColor = this._dimColor(topColor, 0.4);
      sideColor = this._dimColor(sideColor, 0.4);
    }

    // Water animation
    if (tileType === TILE.WATER || tileType === TILE.DEEP_WATER) {
      const wave = Math.sin(this._waterAnim * 2 + col * 0.5 + row * 0.5) * 0.08;
      topColor = this._blendColor(topColor, '#5a85bb', 0.3 + wave);
    }

    // Draw diamond (top face)
    ctx.beginPath();
    ctx.moveTo(sx, sy - H2);         // top
    ctx.lineTo(sx + W2, sy);          // right
    ctx.lineTo(sx, sy + H2);          // bottom
    ctx.lineTo(sx - W2, sy);          // left
    ctx.closePath();
    ctx.fillStyle = topColor;
    ctx.fill();

    // Draw side (right face — slightly darker)
    ctx.beginPath();
    ctx.moveTo(sx + W2, sy);
    ctx.lineTo(sx, sy + H2);
    ctx.lineTo(sx, sy + H2 + 4);
    ctx.lineTo(sx + W2, sy + 4);
    ctx.closePath();
    ctx.fillStyle = sideColor;
    ctx.fill();

    // Draw tile outline (subtle)
    ctx.beginPath();
    ctx.moveTo(sx, sy - H2);
    ctx.lineTo(sx + W2, sy);
    ctx.lineTo(sx, sy + H2);
    ctx.lineTo(sx - W2, sy);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Draw resource overlays
    if (fogState === FOG.VISIBLE) {
      this._drawTileOverlay(ctx, sx, sy, tileType, col, row);
    }
  }

  _drawTileOverlay(ctx, sx, sy, tileType, col, row) {
    const res = game.map.getResource(col, row);

    if (tileType === TILE.FOREST) {
      // Draw tree
      this._drawTree(ctx, sx, sy - TILE_H / 2, res);
    } else if (tileType === TILE.GOLD_MINE) {
      this._drawGoldMine(ctx, sx, sy - TILE_H / 2, res);
    } else if (tileType === TILE.STONE_MINE) {
      this._drawStoneMine(ctx, sx, sy - TILE_H / 2, res);
    } else if (tileType === TILE.BUSH) {
      this._drawBush(ctx, sx, sy - TILE_H / 2, res);
    }
  }

  _drawTree(ctx, sx, sy, res) {
    const ratio = res ? res.amount / res.maxAmount : 0;
    const trunkH = 10 + ratio * 5;
    const canopyR = 10 + ratio * 5;

    // Trunk
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(sx - 2, sy + trunkH / 2, 4, trunkH);

    // Canopy layers
    ctx.fillStyle = '#2a6020';
    ctx.beginPath();
    ctx.arc(sx, sy, canopyR * 0.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#3a8030';
    ctx.beginPath();
    ctx.arc(sx - 2, sy - 4, canopyR * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4a9a40';
    ctx.beginPath();
    ctx.arc(sx, sy - 8, canopyR * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawGoldMine(ctx, sx, sy, res) {
    const ratio = res ? res.amount / res.maxAmount : 0;
    const sz = 8 + ratio * 6;

    ctx.fillStyle = '#ccaa22';
    ctx.beginPath();
    ctx.arc(sx - 3, sy + 4, sz * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffdd44';
    ctx.beginPath();
    ctx.arc(sx + 2, sy + 2, sz * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffee88';
    ctx.beginPath();
    ctx.arc(sx, sy + 1, sz * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawStoneMine(ctx, sx, sy, res) {
    const ratio = res ? res.amount / res.maxAmount : 0;
    const sz = 7 + ratio * 5;

    ctx.fillStyle = '#888888';
    ctx.beginPath();
    ctx.arc(sx - 4, sy + 4, sz * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#aaaaaa';
    ctx.beginPath();
    ctx.arc(sx + 3, sy + 3, sz * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#cccccc';
    ctx.beginPath();
    ctx.arc(sx, sy + 1, sz * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawBush(ctx, sx, sy, res) {
    const ratio = res ? res.amount / res.maxAmount : 0;
    const sz = 6 + ratio * 4;

    ctx.fillStyle = '#558833';
    ctx.beginPath();
    ctx.arc(sx - 3, sy + 3, sz * 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#77aa44';
    ctx.beginPath();
    ctx.arc(sx + 2, sy + 2, sz * 0.7, 0, Math.PI * 2);
    ctx.fill();

    // Berries
    if (ratio > 0.1) {
      ctx.fillStyle = '#cc2244';
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(sx + (i-1)*4 - 1, sy + 2 + (i%2)*2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ===== UNIT DRAWING =====

  _drawUnit(ctx, unit, sp, fogState) {
    const x = sp.x, y = sp.y;
    const dim = fogState === FOG.EXPLORED ? 0.4 : 1.0;
    const playerColor = CIVS[game.players[unit.owner].civ].color;
    const isSelected = game.selection.includes(unit.id);

    // Selection circle
    if (isSelected) {
      ctx.strokeStyle = 'rgba(100,255,100,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 2, 14, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const unitColor = unit.stats.color || '#ffffff';
    const color = fogState === FOG.EXPLORED ? this._dimColor(unitColor, dim) : unitColor;

    this._drawUnitShape(ctx, x, y, unit.type, color, playerColor, dim);

    // Carrying indicator
    if (unit.carrying && unit.carrying.amount > 0) {
      const icons = { food: '#44cc44', wood: '#aa7733', gold: '#ffdd00', stone: '#aaaaaa' };
      ctx.fillStyle = icons[unit.carrying.type] || '#ffffff';
      ctx.beginPath();
      ctx.arc(x + 8, y - 10, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // State indicator
    this._drawStateIndicator(ctx, unit, x, y);

    // HP bar (only if damaged)
    if (unit.hp < unit.maxHp) {
      this._drawHPBar(ctx, x, y - 18, 20, unit.hpFraction());
    }
  }

  _drawUnitShape(ctx, x, y, type, color, teamColor, dim) {
    ctx.save();
    ctx.globalAlpha = dim;

    // Team color ring
    ctx.fillStyle = teamColor;
    ctx.beginPath();
    ctx.arc(x, y - 6, 10, 0, Math.PI * 2);
    ctx.fill();

    // Body (type-specific)
    switch (type) {
      case 'villager':
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y - 7, 7, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.fillStyle = '#f0c080';
        ctx.beginPath();
        ctx.arc(x, y - 13, 4, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'scout':
      case 'knight':
        // Horse shape
        ctx.fillStyle = color;
        ctx.fillRect(x - 8, y - 12, 16, 10);
        ctx.beginPath();
        ctx.arc(x + 7, y - 9, 5, 0, Math.PI * 2); // Rump
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - 4, y - 14, 4, 0, Math.PI * 2); // Head
        ctx.fill();
        ctx.fillStyle = '#f0c080'; // Rider
        ctx.beginPath();
        ctx.arc(x + 2, y - 17, 4, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'battering_ram':
      case 'mangonel':
        ctx.fillStyle = '#885533';
        ctx.fillRect(x - 12, y - 8, 24, 10);
        ctx.fillStyle = color;
        if (type === 'mangonel') {
          ctx.fillRect(x - 3, y - 16, 6, 10);
        }
        break;

      case 'archer':
      case 'crossbowman':
      case 'longbowman':
        ctx.fillStyle = color;
        // Body
        ctx.beginPath();
        ctx.arc(x, y - 7, 7, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.fillStyle = '#f0c080';
        ctx.beginPath();
        ctx.arc(x, y - 14, 4, 0, Math.PI * 2);
        ctx.fill();
        // Bow
        ctx.strokeStyle = '#885522';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + 5, y - 9, 6, -0.5, 0.5);
        ctx.stroke();
        break;

      default:
        // Infantry
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y - 7, 7, 0, Math.PI * 2);
        ctx.fill();
        // Head
        ctx.fillStyle = '#f0c080';
        ctx.beginPath();
        ctx.arc(x, y - 14, 4, 0, Math.PI * 2);
        ctx.fill();
        // Shield
        ctx.fillStyle = 'rgba(100,100,200,0.7)';
        ctx.fillRect(x - 9, y - 11, 4, 8);
        break;
    }

    ctx.restore();
  }

  _drawStateIndicator(ctx, unit, x, y) {
    if (unit.state === UnitState.GATHERING || unit.state === UnitState.FARMING) {
      ctx.fillStyle = '#44ff44';
      ctx.font = '10px sans-serif';
      ctx.fillText('⛏', x - 4, y - 18);
    } else if (unit.state === UnitState.BUILDING || unit.state === UnitState.REPAIRING) {
      ctx.fillStyle = '#ffcc00';
      ctx.font = '10px sans-serif';
      ctx.fillText('🔨', x - 4, y - 18);
    }
  }

  // ===== BUILDING DRAWING =====

  _drawBuilding(ctx, bldg, sp, fogState) {
    const def = bldg.def;
    const size = bldg.size;
    const dim = fogState === FOG.EXPLORED ? 0.5 : 1.0;
    const isSelected = game.selection.includes(bldg.id);
    const playerColor = CIVS[game.players[bldg.owner].civ].color;

    ctx.save();
    ctx.globalAlpha = dim;

    // Compute isometric footprint corners
    const corners = this._buildingCorners(bldg, game.camera.x, game.camera.y, game.canvas.width, game.canvas.height);

    // Draw footprint shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.moveTo(corners.top.x, corners.top.y);
    ctx.lineTo(corners.right.x, corners.right.y);
    ctx.lineTo(corners.bottom.x, corners.bottom.y);
    ctx.lineTo(corners.left.x, corners.left.y);
    ctx.closePath();
    ctx.fill();

    // Draw the building based on type
    const bColor = dim < 1 ? this._dimColor(def.color, dim) : def.color;
    this._drawBuildingShape(ctx, bldg, sp, corners, bColor, playerColor, fogState);

    // Selection highlight
    if (isSelected) {
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = 'rgba(100,255,100,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(corners.top.x, corners.top.y - 2);
      ctx.lineTo(corners.right.x + 2, corners.right.y);
      ctx.lineTo(corners.bottom.x, corners.bottom.y + 2);
      ctx.lineTo(corners.left.x - 2, corners.left.y);
      ctx.closePath();
      ctx.stroke();
    }

    ctx.restore();

    // Construction progress
    if (!bldg.complete) {
      this._drawConstructionProgress(ctx, sp, bldg);
    }

    // HP bar
    if (bldg.hp < bldg.maxHp) {
      this._drawHPBar(ctx, sp.x, sp.y - size * TILE_H / 2 - 30, size * TILE_W / 2, bldg.hpFraction());
    }

    // Training queue progress
    if (bldg.complete && bldg.trainingQueue.length > 0 && game.selection.includes(bldg.id)) {
      // Shown in UI panel
    }
  }

  _buildingCorners(bldg, camX, camY, W, H) {
    const { col, row, size } = bldg;
    const map = game.map;

    const topLeft = map.toScreen(col, row, camX, camY, W, H);
    const topRight = map.toScreen(col + size, row, camX, camY, W, H);
    const bottomRight = map.toScreen(col + size, row + size, camX, camY, W, H);
    const bottomLeft = map.toScreen(col, row + size, camX, camY, W, H);

    return {
      top: topLeft,
      right: topRight,
      bottom: bottomRight,
      left: bottomLeft,
      center: { x: (topLeft.x + bottomRight.x) / 2, y: (topLeft.y + bottomRight.y) / 2 },
    };
  }

  _drawBuildingShape(ctx, bldg, sp, corners, color, teamColor, fogState) {
    const type = bldg.type;
    const cx = corners.center.x;
    const cy = corners.center.y;
    const sz = bldg.size;
    const h = sz * 18; // Height in pixels

    // Draw isometric base (floor)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(corners.top.x, corners.top.y);
    ctx.lineTo(corners.right.x, corners.right.y);
    ctx.lineTo(corners.bottom.x, corners.bottom.y);
    ctx.lineTo(corners.left.x, corners.left.y);
    ctx.closePath();
    ctx.fill();

    // Draw walls (vertical box)
    const wallColor = this._darken(color, 0.6);
    const wallColorSide = this._darken(color, 0.4);

    // Back-left wall
    ctx.fillStyle = wallColorSide;
    ctx.beginPath();
    ctx.moveTo(corners.left.x, corners.left.y);
    ctx.lineTo(corners.top.x, corners.top.y);
    ctx.lineTo(corners.top.x, corners.top.y - h);
    ctx.lineTo(corners.left.x, corners.left.y - h);
    ctx.closePath();
    ctx.fill();

    // Back-right wall
    ctx.fillStyle = wallColor;
    ctx.beginPath();
    ctx.moveTo(corners.top.x, corners.top.y);
    ctx.lineTo(corners.right.x, corners.right.y);
    ctx.lineTo(corners.right.x, corners.right.y - h);
    ctx.lineTo(corners.top.x, corners.top.y - h);
    ctx.closePath();
    ctx.fill();

    // Roof (top diamond)
    ctx.fillStyle = this._lighten(color, 1.3);
    ctx.beginPath();
    ctx.moveTo(corners.top.x, corners.top.y - h);
    ctx.lineTo(corners.right.x, corners.right.y - h);
    ctx.lineTo(corners.bottom.x, corners.bottom.y - h);
    ctx.lineTo(corners.left.x, corners.left.y - h);
    ctx.closePath();
    ctx.fill();

    // Team color stripe on roof
    if (fogState === FOG.VISIBLE) {
      ctx.fillStyle = teamColor;
      ctx.globalAlpha *= 0.5;
      ctx.beginPath();
      ctx.moveTo(corners.top.x, corners.top.y - h);
      ctx.lineTo(corners.right.x, corners.right.y - h);
      ctx.lineTo(corners.bottom.x, corners.bottom.y - h);
      ctx.lineTo(corners.left.x, corners.left.y - h);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha /= 0.5;
    }

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(corners.top.x, corners.top.y - h);
    ctx.lineTo(corners.right.x, corners.right.y - h);
    ctx.lineTo(corners.bottom.x, corners.bottom.y - h);
    ctx.lineTo(corners.left.x, corners.left.y - h);
    ctx.closePath();
    ctx.stroke();

    // Building-specific decorations
    if (fogState === FOG.VISIBLE) {
      this._drawBuildingDecoration(ctx, bldg, cx, corners.top.y - h, h);
    }
  }

  _drawBuildingDecoration(ctx, bldg, cx, topY, h) {
    const type = bldg.type;

    switch (type) {
      case 'town_center':
        // Flag
        ctx.fillStyle = CIVS[game.players[bldg.owner].civ].color;
        ctx.fillRect(cx - 1, topY - 20, 2, 20);
        ctx.beginPath();
        ctx.moveTo(cx, topY - 20);
        ctx.lineTo(cx + 12, topY - 14);
        ctx.lineTo(cx, topY - 8);
        ctx.closePath();
        ctx.fill();
        break;

      case 'tower':
        // Battlements
        ctx.fillStyle = '#aaa';
        for (let i = -1; i <= 1; i++) {
          ctx.fillRect(cx + i * 8 - 3, topY - 8, 5, 8);
        }
        break;

      case 'castle':
        // Towers at corners
        ctx.fillStyle = '#887766';
        ctx.fillRect(cx - 20, topY - 15, 8, 15);
        ctx.fillRect(cx + 12, topY - 15, 8, 15);
        // Flag
        ctx.fillStyle = CIVS[game.players[bldg.owner].civ].color;
        ctx.fillRect(cx - 1, topY - 30, 2, 18);
        ctx.beginPath();
        ctx.moveTo(cx, topY - 30);
        ctx.lineTo(cx + 12, topY - 24);
        ctx.lineTo(cx, topY - 18);
        ctx.closePath();
        ctx.fill();
        break;

      case 'barracks':
        // Crossed swords
        ctx.strokeStyle = '#cc3333';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 8, topY - 5);
        ctx.lineTo(cx + 8, topY - 15);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx + 8, topY - 5);
        ctx.lineTo(cx - 8, topY - 15);
        ctx.stroke();
        break;

      case 'farm':
        // Farm rows
        ctx.strokeStyle = '#886600';
        ctx.lineWidth = 1;
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(cx - 12, topY - 2 + i * 4);
          ctx.lineTo(cx + 12, topY - 2 + i * 4);
          ctx.stroke();
        }
        break;
    }
  }

  _drawConstructionProgress(ctx, sp, bldg) {
    const prog = bldg.constructionProgress;
    const barW = bldg.size * 20;
    const x = sp.x - barW / 2;
    const y = sp.y - bldg.size * 20;

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - 1, y - 1, barW + 2, 10);
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(x, y, barW * prog, 8);
    ctx.fillStyle = '#fff';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(prog * 100)}%`, sp.x, y + 7);
    ctx.textAlign = 'left';
  }

  // ===== PROJECTILE DRAWING =====

  _drawProjectiles(ctx, cam, W, H) {
    // Global projectiles (from buildings)
    for (const p of globalProjectiles) {
      this._drawProjectile(ctx, p, cam, W, H, '#ffff88');
    }

    // Unit projectiles
    game.getAllEntities().forEach(e => {
      if (!e.isUnit || !e.projectiles) return;
      for (const p of e.projectiles) {
        if (!game.fog.isVisible(e.tileCol, e.tileRow)) continue;
        const color = e.type === 'mangonel' ? '#ff6600' : '#ffff88';
        this._drawProjectile(ctx, p, cam, W, H, color);
      }
    });
  }

  _drawProjectile(ctx, p, cam, W, H, color) {
    const map = game.map;
    const startSP = map.toScreen(p.startCol, p.startRow, cam.x, cam.y, W, H);
    const endSP = map.toScreen(p.endCol, p.endRow, cam.x, cam.y, W, H);

    const t = p.progress;
    const px = startSP.x + (endSP.x - startSP.x) * t;
    const py = startSP.y + (endSP.y - startSP.y) * t - Math.sin(t * Math.PI) * 20;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ===== BUILD GHOST =====

  _drawBuildGhost(ctx, cam, W, H) {
    const pos = game.input.getBuildGhostPos();
    if (!pos) return;

    const type = game.input.buildMode.type;
    const def = BUILDING_DEFS[type];
    if (!def) return;

    const valid = game.input.getBuildGhostValid();
    const map = game.map;

    // Draw ghost footprint
    const corners = {
      top: map.toScreen(pos.col, pos.row, cam.x, cam.y, W, H),
      right: map.toScreen(pos.col + def.size, pos.row, cam.x, cam.y, W, H),
      bottom: map.toScreen(pos.col + def.size, pos.row + def.size, cam.x, cam.y, W, H),
      left: map.toScreen(pos.col, pos.row + def.size, cam.x, cam.y, W, H),
    };

    ctx.globalAlpha = 0.5;
    ctx.fillStyle = valid ? '#44ff44' : '#ff4444';
    ctx.beginPath();
    ctx.moveTo(corners.top.x, corners.top.y);
    ctx.lineTo(corners.right.x, corners.right.y);
    ctx.lineTo(corners.bottom.x, corners.bottom.y);
    ctx.lineTo(corners.left.x, corners.left.y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1.0;

    // Ghost outline
    ctx.strokeStyle = valid ? '#00ff00' : '#ff0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(corners.top.x, corners.top.y);
    ctx.lineTo(corners.right.x, corners.right.y);
    ctx.lineTo(corners.bottom.x, corners.bottom.y);
    ctx.lineTo(corners.left.x, corners.left.y);
    ctx.closePath();
    ctx.stroke();
  }

  // ===== HP BAR =====

  _drawHPBar(ctx, x, y, width, fraction) {
    const h = 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x - width / 2 - 1, y - 1, width + 2, h + 2);

    const hpColor = fraction > 0.5 ? '#44cc44' : fraction > 0.25 ? '#ccaa00' : '#cc2222';
    ctx.fillStyle = hpColor;
    ctx.fillRect(x - width / 2, y, width * fraction, h);
  }

  // ===== COLOR HELPERS =====

  _dimColor(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.round(r*factor)},${Math.round(g*factor)},${Math.round(b*factor)})`;
  }

  _darken(hex, factor) {
    const r = parseInt(hex.slice(1, 3), 16) || 128;
    const g = parseInt(hex.slice(3, 5), 16) || 128;
    const b = parseInt(hex.slice(5, 7), 16) || 128;
    return `rgb(${Math.round(r*factor)},${Math.round(g*factor)},${Math.round(b*factor)})`;
  }

  _lighten(hex, factor) {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) * factor || 128);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) * factor || 128);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) * factor || 128);
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  }

  _blendColor(hex1, hex2, t) {
    const r1 = parseInt(hex1.slice(1, 3), 16) || 0;
    const g1 = parseInt(hex1.slice(3, 5), 16) || 0;
    const b1 = parseInt(hex1.slice(5, 7), 16) || 0;
    const r2 = parseInt(hex2.slice(1, 3), 16) || 0;
    const g2 = parseInt(hex2.slice(3, 5), 16) || 0;
    const b2 = parseInt(hex2.slice(5, 7), 16) || 0;
    return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
  }

  // ===== MINIMAP =====

  renderMinimap(mmCanvas) {
    const ctx = mmCanvas.getContext('2d');
    const W = mmCanvas.width;
    const H = mmCanvas.height;
    const map = game.map;
    const fog = game.fog;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const scaleX = W / map.width;
    const scaleY = H / map.height;

    // Draw tiles
    for (let row = 0; row < map.height; row++) {
      for (let col = 0; col < map.width; col++) {
        const fogState = fog.getState(col, row);
        if (fogState === FOG.UNKNOWN) continue;

        const tileType = map.getTile(col, row);
        let color;
        switch (tileType) {
          case TILE.GRASS: color = '#3a6a28'; break;
          case TILE.WATER: case TILE.DEEP_WATER: color = '#2a4875'; break;
          case TILE.FOREST: color = '#1e4a10'; break;
          case TILE.GOLD_MINE: color = '#aa9920'; break;
          case TILE.STONE_MINE: color = '#777777'; break;
          case TILE.BUSH: color = '#3a7a25'; break;
          default: color = '#3a6a28'; break;
        }

        if (fogState === FOG.EXPLORED) {
          color = this._dimColor(color, 0.5);
        }

        ctx.fillStyle = color;
        ctx.fillRect(col * scaleX, row * scaleY, scaleX + 0.5, scaleY + 0.5);
      }
    }

    // Draw entities on minimap
    game.getAllEntities().forEach(e => {
      if (e.dead) return;
      const fogState = fog.getState(e.tileCol, e.tileRow);
      if (fogState !== FOG.VISIBLE && e.owner !== 0) return;
      if (fogState === FOG.UNKNOWN) return;

      const mx = e.col * scaleX;
      const my = e.row * scaleY;
      const playerColor = CIVS[game.players[e.owner].civ].color;

      if (e.isBuilding) {
        ctx.fillStyle = playerColor;
        ctx.fillRect(mx, my, e.size * scaleX, e.size * scaleY);
      } else {
        ctx.fillStyle = playerColor;
        ctx.beginPath();
        ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Camera viewport indicator
    const vpLeft = game.map.fromScreen(0, 44, game.camera.x, game.camera.y, game.canvas.width, game.canvas.height);
    const vpRight = game.map.fromScreen(game.canvas.width, game.canvas.height - 180, game.camera.x, game.camera.y, game.canvas.width, game.canvas.height);

    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      vpLeft.col * scaleX, vpLeft.row * scaleY,
      (vpRight.col - vpLeft.col) * scaleX,
      (vpRight.row - vpLeft.row) * scaleY
    );
  }
}
