'use strict';

const TILE = {
  GRASS: 0,
  WATER: 1,
  FOREST: 2,
  GOLD_MINE: 3,
  STONE_MINE: 4,
  BUSH: 5,
  FARM_PLOT: 6,
  DEEP_WATER: 7,
  SAND: 8,
};

const MAP_SIZE = 48;
const TILE_W = 64;
const TILE_H = 32;

class GameMap {
  constructor(width, height) {
    this.width = width || MAP_SIZE;
    this.height = height || MAP_SIZE;
    // terrain[row][col]
    this.terrain = [];
    // Resources: Map of key -> { type, amount, maxAmount }
    this.resources = new Map();
    // Building occupancy: map of key -> buildingId
    this.occupied = new Map();
    // Unit soft blocking (for rendering only; pathfinding ignores units)
    this._rng = Math.random;
  }

  init(seed) {
    this._seed = seed || 12345;
    this._generate();
  }

  _rng_next() {
    this._seed = (this._seed * 1664525 + 1013904223) & 0xffffffff;
    return (this._seed >>> 0) / 0xffffffff;
  }

  _generate() {
    const W = this.width, H = this.height;

    // Initialize all grass
    for (let r = 0; r < H; r++) {
      this.terrain[r] = new Uint8Array(W);
    }

    const rng = () => this._rng_next();

    // --- Water bodies ---
    const numLakes = 2 + Math.floor(rng() * 2);
    const lakes = [];
    for (let i = 0; i < numLakes; i++) {
      const lc = 10 + Math.floor(rng() * (W - 20));
      const lr = 10 + Math.floor(rng() * (H - 20));
      const lrad = 3 + Math.floor(rng() * 5);
      lakes.push({ c: lc, r: lr, rad: lrad });
      for (let dc = -lrad; dc <= lrad; dc++) {
        for (let dr = -lrad; dr <= lrad; dr++) {
          if (dc*dc + dr*dr <= lrad*lrad) {
            const nc = lc + dc, nr = lr + dr;
            if (this.inBounds(nc, nr)) {
              const dist = Math.sqrt(dc*dc + dr*dr);
              if (dist < lrad * 0.6) {
                this.terrain[nr][nc] = TILE.DEEP_WATER;
              } else {
                this.terrain[nr][nc] = TILE.WATER;
              }
            }
          }
        }
      }
    }

    // --- Forests (clusters) ---
    const numForestCenters = 6 + Math.floor(rng() * 6);
    for (let i = 0; i < numForestCenters; i++) {
      const fc = Math.floor(rng() * W);
      const fr = Math.floor(rng() * H);
      const frad = 3 + Math.floor(rng() * 5);
      for (let dc = -frad; dc <= frad; dc++) {
        for (let dr = -frad; dr <= frad; dr++) {
          const nc = fc + dc, nr = fr + dr;
          if (!this.inBounds(nc, nr)) continue;
          if (this.terrain[nr][nc] !== TILE.GRASS) continue;
          const dist = Math.sqrt(dc*dc + dr*dr);
          if (dist <= frad && rng() > 0.3) {
            this.terrain[nr][nc] = TILE.FOREST;
            const amount = 80 + Math.floor(rng() * 80);
            this.resources.set(this._key(nc, nr), { type: 'wood', amount, maxAmount: amount });
          }
        }
      }
    }

    // --- Gold mines (clusters near center) ---
    const numGoldClusters = 4 + Math.floor(rng() * 3);
    for (let i = 0; i < numGoldClusters; i++) {
      const gc = 8 + Math.floor(rng() * (W - 16));
      const gr = 8 + Math.floor(rng() * (H - 16));
      const clusterSize = 3 + Math.floor(rng() * 3);
      for (let j = 0; j < clusterSize; j++) {
        const dc = Math.floor(rng() * 3) - 1;
        const dr = Math.floor(rng() * 3) - 1;
        const nc = gc + dc, nr = gr + dr;
        if (this.inBounds(nc, nr) && this.terrain[nr][nc] === TILE.GRASS) {
          this.terrain[nr][nc] = TILE.GOLD_MINE;
          const amount = 400 + Math.floor(rng() * 400);
          this.resources.set(this._key(nc, nr), { type: 'gold', amount, maxAmount: amount });
        }
      }
    }

    // --- Stone mines ---
    const numStoneClusters = 3 + Math.floor(rng() * 3);
    for (let i = 0; i < numStoneClusters; i++) {
      const sc = 8 + Math.floor(rng() * (W - 16));
      const sr = 8 + Math.floor(rng() * (H - 16));
      const clusterSize = 3 + Math.floor(rng() * 4);
      for (let j = 0; j < clusterSize; j++) {
        const dc = Math.floor(rng() * 3) - 1;
        const dr = Math.floor(rng() * 3) - 1;
        const nc = sc + dc, nr = sr + dr;
        if (this.inBounds(nc, nr) && this.terrain[nr][nc] === TILE.GRASS) {
          this.terrain[nr][nc] = TILE.STONE_MINE;
          const amount = 300 + Math.floor(rng() * 300);
          this.resources.set(this._key(nc, nr), { type: 'stone', amount, maxAmount: amount });
        }
      }
    }

    // --- Bushes (food) ---
    const numBushes = 12 + Math.floor(rng() * 10);
    for (let i = 0; i < numBushes; i++) {
      const bc = Math.floor(rng() * W);
      const br = Math.floor(rng() * H);
      if (this.inBounds(bc, br) && this.terrain[br][bc] === TILE.GRASS) {
        this.terrain[br][bc] = TILE.BUSH;
        const amount = 50 + Math.floor(rng() * 100);
        this.resources.set(this._key(bc, br), { type: 'food', amount, maxAmount: amount });
      }
    }
  }

  // Clear a radius around a position (for starting areas)
  clearArea(col, row, radius) {
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        const nc = col + dc, nr = row + dr;
        if (!this.inBounds(nc, nr)) continue;
        const dist = Math.sqrt(dc*dc + dr*dr);
        if (dist <= radius) {
          this.terrain[nr][nc] = TILE.GRASS;
          this.resources.delete(this._key(nc, nr));
        }
      }
    }
  }

  _key(col, row) {
    return (col << 16) | row;
  }

  inBounds(col, row) {
    return col >= 0 && col < this.width && row >= 0 && row < this.height;
  }

  getTile(col, row) {
    if (!this.inBounds(col, row)) return TILE.WATER;
    return this.terrain[row][col];
  }

  setTile(col, row, type) {
    if (!this.inBounds(col, row)) return;
    this.terrain[row][col] = type;
  }

  isWalkable(col, row) {
    if (!this.inBounds(col, row)) return false;
    const t = this.terrain[row][col];
    if (t === TILE.WATER || t === TILE.DEEP_WATER) return false;
    if (this.occupied.has(this._key(col, row))) return false;
    return true;
  }

  isWalkableIgnoreBuildings(col, row) {
    if (!this.inBounds(col, row)) return false;
    const t = this.terrain[row][col];
    return t !== TILE.WATER && t !== TILE.DEEP_WATER;
  }

  getResource(col, row) {
    return this.resources.get(this._key(col, row)) || null;
  }

  depleteResource(col, row, amount) {
    const k = this._key(col, row);
    const res = this.resources.get(k);
    if (!res) return 0;
    const taken = Math.min(res.amount, amount);
    res.amount -= taken;
    if (res.amount <= 0) {
      this.resources.delete(k);
      // Remove the tile's resource appearance
      this.terrain[row][col] = TILE.GRASS;
    }
    return taken;
  }

  setOccupied(col, row, buildingId) {
    this.occupied.set(this._key(col, row), buildingId);
  }

  clearOccupied(col, row) {
    this.occupied.delete(this._key(col, row));
  }

  getOccupant(col, row) {
    return this.occupied.get(this._key(col, row)) || null;
  }

  // Find nearest resource of type within radius from position
  findNearestResource(col, row, type, radius) {
    let best = null, bestDist = Infinity;
    const r = radius || 20;
    for (let dc = -r; dc <= r; dc++) {
      for (let dr = -r; dr <= r; dr++) {
        const nc = col + dc, nr = row + dr;
        if (!this.inBounds(nc, nr)) continue;
        const res = this.getResource(nc, nr);
        if (res && res.type === type && res.amount > 0) {
          const dist = Math.abs(dc) + Math.abs(dr);
          if (dist < bestDist) {
            bestDist = dist;
            best = { col: nc, row: nr };
          }
        }
      }
    }
    return best;
  }

  // World to screen
  toScreen(col, row, camX, camY, canvasW, canvasH) {
    const sx = (col - row) * (TILE_W / 2) - camX + canvasW / 2;
    const sy = (col + row) * (TILE_H / 2) - camY + canvasH / 4;
    return { x: sx, y: sy };
  }

  // Screen to world (float)
  fromScreen(sx, sy, camX, camY, canvasW, canvasH) {
    const rx = sx - canvasW / 2 + camX;
    const ry = sy - canvasH / 4 + camY;
    const col = (rx / (TILE_W / 2) + ry / (TILE_H / 2)) / 2;
    const row = (ry / (TILE_H / 2) - rx / (TILE_W / 2)) / 2;
    return { col, row };
  }
}
