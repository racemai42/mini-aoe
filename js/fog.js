'use strict';

const FOG = {
  UNKNOWN: 0,   // Never seen — black
  EXPLORED: 1,  // Seen but not currently visible — dimmed
  VISIBLE: 2,   // Currently visible — full
};

class FogOfWar {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    // Visibility state for player (0)
    this.state = new Uint8Array(width * height);
    // Precomputed LOS circles
    this._losCache = new Map();
  }

  _idx(col, row) { return row * this.width + col; }

  getState(col, row) {
    if (col < 0 || col >= this.width || row < 0 || row >= this.height) return FOG.UNKNOWN;
    return this.state[this._idx(col, row)];
  }

  // Called each frame — reset VISIBLE to EXPLORED, then recompute
  update() {
    // Mark all VISIBLE as EXPLORED
    for (let i = 0; i < this.state.length; i++) {
      if (this.state[i] === FOG.VISIBLE) this.state[i] = FOG.EXPLORED;
    }

    // For each player entity (owner === 0), reveal tiles around it
    game.getAllEntities().forEach(e => {
      if (e.dead || e.owner !== 0) return;
      const los = e.stats?.los || e.def?.los || 4;
      this._revealCircle(e.col, e.row, los);
    });
  }

  _revealCircle(cx, cy, radius) {
    const ir = Math.ceil(radius);
    const cxi = Math.round(cx);
    const cyi = Math.round(cy);

    for (let dc = -ir; dc <= ir; dc++) {
      for (let dr = -ir; dr <= ir; dr++) {
        if (dc*dc + dr*dr <= radius * radius + 0.5) {
          const nc = cxi + dc, nr = cyi + dr;
          if (nc >= 0 && nc < this.width && nr >= 0 && nr < this.height) {
            this.state[this._idx(nc, nr)] = FOG.VISIBLE;
          }
        }
      }
    }
  }

  isVisible(col, row) {
    return this.getState(col, row) === FOG.VISIBLE;
  }

  isExplored(col, row) {
    return this.getState(col, row) >= FOG.EXPLORED;
  }

  // Reveal a large area at start
  revealArea(col, row, radius) {
    this._revealCircle(col, row, radius);
    // Also mark as explored
    const ir = Math.ceil(radius);
    for (let dc = -ir; dc <= ir; dc++) {
      for (let dr = -ir; dr <= ir; dr++) {
        const nc = Math.round(col) + dc, nr = Math.round(row) + dr;
        if (nc >= 0 && nc < this.width && nr >= 0 && nr < this.height) {
          if (this.state[this._idx(nc, nr)] === FOG.UNKNOWN) {
            this.state[this._idx(nc, nr)] = FOG.EXPLORED;
          }
        }
      }
    }
  }
}
