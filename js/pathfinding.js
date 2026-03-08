'use strict';

// Binary heap for A* open set
class BinaryHeap {
  constructor(scoreFunc) {
    this.content = [];
    this.scoreFunc = scoreFunc;
  }

  push(element) {
    this.content.push(element);
    this._sinkDown(this.content.length - 1);
  }

  pop() {
    const result = this.content[0];
    const end = this.content.pop();
    if (this.content.length > 0) {
      this.content[0] = end;
      this._bubbleUp(0);
    }
    return result;
  }

  size() { return this.content.length; }

  _sinkDown(n) {
    const element = this.content[n];
    while (n > 0) {
      const parentN = ((n + 1) >> 1) - 1;
      const parent = this.content[parentN];
      if (this.scoreFunc(element) < this.scoreFunc(parent)) {
        this.content[parentN] = element;
        this.content[n] = parent;
        n = parentN;
      } else break;
    }
  }

  _bubbleUp(n) {
    const length = this.content.length;
    const element = this.content[n];
    const elemScore = this.scoreFunc(element);
    while (true) {
      const child2N = (n + 1) << 1;
      const child1N = child2N - 1;
      let swap = null;
      let child1Score;
      if (child1N < length) {
        child1Score = this.scoreFunc(this.content[child1N]);
        if (child1Score < elemScore) swap = child1N;
      }
      if (child2N < length) {
        const child2Score = this.scoreFunc(this.content[child2N]);
        if (child2Score < (swap === null ? elemScore : child1Score)) swap = child2N;
      }
      if (swap !== null) {
        this.content[n] = this.content[swap];
        this.content[swap] = element;
        n = swap;
      } else break;
    }
  }
}

// A* Pathfinder — operates on the GameMap grid
class Pathfinder {
  constructor() {}

  // Returns array of {col,row} steps (excluding start, including end)
  findPath(map, startCol, startRow, endCol, endRow) {
    startCol = Math.round(startCol);
    startRow = Math.round(startRow);
    endCol   = Math.round(endCol);
    endRow   = Math.round(endRow);

    if (!map.inBounds(startCol, startRow)) return [];

    // If destination is blocked, find nearest walkable
    if (!map.inBounds(endCol, endRow) || !map.isWalkable(endCol, endRow)) {
      const near = this._nearestWalkable(map, endCol, endRow, 4);
      if (!near) return [];
      endCol = near.col;
      endRow = near.row;
    }

    if (startCol === endCol && startRow === endRow) return [];

    const open = new BinaryHeap(n => n.f);
    const gScore = new Map();
    const cameFrom = new Map();

    const key = (c, r) => (c << 16) | r;
    const sk = key(startCol, startRow);

    gScore.set(sk, 0);
    open.push({ col: startCol, row: startRow, f: this._h(startCol, startRow, endCol, endRow), g: 0 });

    const DIRS = [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[-1,1],[1,-1],[1,1]];
    let iter = 0;
    const MAX_ITER = 3000;

    while (open.size() > 0 && iter++ < MAX_ITER) {
      const cur = open.pop();
      const ck = key(cur.col, cur.row);

      if (cur.col === endCol && cur.row === endRow) {
        return this._reconstruct(cameFrom, endCol, endRow, startCol, startRow);
      }

      for (const [dc, dr] of DIRS) {
        const nc = cur.col + dc;
        const nr = cur.row + dr;
        if (!map.inBounds(nc, nr)) continue;

        const isEnd = nc === endCol && nr === endRow;
        if (!map.isWalkable(nc, nr) && !isEnd) continue;

        // Diagonal: both cardinal neighbors must be passable
        if (dc !== 0 && dr !== 0) {
          if (!map.isWalkable(cur.col + dc, cur.row) && !map.isWalkable(cur.col, cur.row + dr)) continue;
        }

        const cost = (dc !== 0 && dr !== 0) ? 1.414 : 1;
        const ng = cur.g + cost;
        const nk = key(nc, nr);

        if (!gScore.has(nk) || ng < gScore.get(nk)) {
          gScore.set(nk, ng);
          cameFrom.set(nk, ck);
          const h = this._h(nc, nr, endCol, endRow);
          open.push({ col: nc, row: nr, f: ng + h, g: ng });
        }
      }
    }

    return []; // No path
  }

  _reconstruct(cameFrom, endCol, endRow, startCol, startRow) {
    const path = [];
    let cc = endCol, cr = endRow;
    const startK = (startCol << 16) | startRow;
    const key = (c, r) => (c << 16) | r;
    let safety = 0;
    while (safety++ < 2000) {
      path.unshift({ col: cc, row: cr });
      const k = key(cc, cr);
      if (k === startK) break;
      const prev = cameFrom.get(k);
      if (prev === undefined) break;
      cc = prev >> 16;
      cr = prev & 0xFFFF;
    }
    return path.slice(1); // Exclude start
  }

  _h(ac, ar, bc, br) {
    const dc = Math.abs(ac - bc);
    const dr = Math.abs(ar - br);
    // Chebyshev + diagonal correction
    return Math.max(dc, dr) + (Math.SQRT2 - 1) * Math.min(dc, dr);
  }

  _nearestWalkable(map, col, row, radius) {
    for (let r = 1; r <= radius; r++) {
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;
          const nc = col + dc, nr = row + dr;
          if (map.inBounds(nc, nr) && map.isWalkable(nc, nr)) return { col: nc, row: nr };
        }
      }
    }
    return null;
  }

  // Find adjacent tile to a building footprint that is walkable
  findAdjacentToFootprint(map, bCol, bRow, bW, bH) {
    const candidates = [];
    for (let dc = -1; dc <= bW; dc++) {
      for (let dr = -1; dr <= bH; dr++) {
        if (dc >= 0 && dc < bW && dr >= 0 && dr < bH) continue; // inside footprint
        const nc = bCol + dc, nr = bRow + dr;
        if (map.inBounds(nc, nr) && map.isWalkable(nc, nr)) {
          candidates.push({ col: nc, row: nr });
        }
      }
    }
    return candidates;
  }
}

// Singleton
const pathfinder = new Pathfinder();
