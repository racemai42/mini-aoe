'use strict';

let _nextEntityId = 1;

class Entity {
  constructor(type, col, row, owner) {
    this.id = _nextEntityId++;
    this.type = type;       // string key in UNIT_DEFS or BUILDING_DEFS
    this.col = col;         // floating point world col
    this.row = row;         // floating point world row
    this.owner = owner;     // 0=player, 1=AI
    this.hp = 1;
    this.maxHp = 1;
    this.dead = false;
    this.isUnit = false;
    this.isBuilding = false;
  }

  get tileCol() { return Math.round(this.col); }
  get tileRow() { return Math.round(this.row); }

  dist(other) {
    const dc = this.col - other.col;
    const dr = this.row - other.row;
    return Math.sqrt(dc*dc + dr*dr);
  }

  distTo(col, row) {
    const dc = this.col - col;
    const dr = this.row - row;
    return Math.sqrt(dc*dc + dr*dr);
  }

  isEnemy(other) {
    return other.owner !== this.owner;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp === 0) this.dead = true;
    return this.dead;
  }

  hpFraction() {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  // Screen position (center of entity)
  screenPos(camX, camY, canvasW, canvasH) {
    return game.map.toScreen(this.col, this.row, camX, camY, canvasW, canvasH);
  }
}
