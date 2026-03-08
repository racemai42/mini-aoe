'use strict';

class Building extends Entity {
  constructor(type, col, row, owner) {
    super(type, col, row, owner);
    this.isBuilding = true;

    const def = BUILDING_DEFS[type];
    this.def = def;
    this.name = def.name;
    this.size = def.size;

    this.hp = 1; // Start at 1 HP (under construction)
    this.maxHp = def.hp;
    this.complete = false;
    this.constructionProgress = 0;

    // Training queue
    this.trainingQueue = [];
    this.trainingTimer = 0;
    this.maxQueueSize = 5;

    // Attack capability (tower, castle)
    this.attackRange = def.attackRange || 0;
    this.attackDamage = def.attackDamage || 0;
    this.attackSpeed = def.attackSpeed || 2.0;
    this.attackCooldown = 0;
    this.attackTarget = null;

    this.stats = {
      meleeArmor: 0,
      pierceArmor: 3,
      los: def.los || 5,
    };

    // Rally point
    this.rallyCol = col + this.size;
    this.rallyRow = row + this.size;

    // Mark terrain as occupied
    this._occupy();
  }

  _occupy() {
    for (let dc = 0; dc < this.size; dc++) {
      for (let dr = 0; dr < this.size; dr++) {
        game.map.setOccupied(this.col + dc, this.row + dr, this.id);
      }
    }
  }

  _unoccupy() {
    for (let dc = 0; dc < this.size; dc++) {
      for (let dr = 0; dr < this.size; dr++) {
        game.map.clearOccupied(this.col + dc, this.row + dr);
      }
    }
  }

  // Center col/row for display purposes
  get centerCol() { return this.col + this.size / 2 - 0.5; }
  get centerRow() { return this.row + this.size / 2 - 0.5; }

  update(dt) {
    if (this.dead) return;
    if (!this.complete) return;

    // Training queue
    if (this.trainingQueue.length > 0) {
      this.trainingTimer -= dt;
      if (this.trainingTimer <= 0) {
        this._spawnUnit();
      }
    }

    // Attack
    if (this.attackRange > 0) {
      if (this.attackCooldown > 0) {
        this.attackCooldown -= dt;
      } else {
        this._performAttack();
      }
    }
  }

  _spawnUnit() {
    const item = this.trainingQueue[0];
    const player = game.players[this.owner];

    if (player.population >= player.popCap) {
      // Can't spawn — wait for pop
      this.trainingTimer = 2;
      return;
    }

    this.trainingQueue.shift();

    // Find spawn tile adjacent to building
    const adj = pathfinder.findAdjacentToFootprint(game.map, this.col, this.row, this.size, this.size);
    let spawnCol = this.col + this.size;
    let spawnRow = this.row + this.size;
    if (adj.length > 0) {
      // Prefer rally point direction
      let best = adj[0], bestDist = Infinity;
      for (const a of adj) {
        const d = Math.abs(a.col - this.rallyCol) + Math.abs(a.row - this.rallyRow);
        if (d < bestDist) { bestDist = d; best = a; }
      }
      spawnCol = best.col;
      spawnRow = best.row;
    }

    const unit = createUnit(item.type, spawnCol, spawnRow, this.owner);

    // Send to rally point
    if (this.rallyCol !== this.col + this.size || this.rallyRow !== this.row + this.size) {
      unit.commandMove(this.rallyCol, this.rallyRow);
    }

    // Start next training
    if (this.trainingQueue.length > 0) {
      const nextDef = UNIT_DEFS[this.trainingQueue[0].type];
      let trainTime = nextDef.trainTime;
      // Civ bonuses
      if (this.owner === 0 && game.players[0].civ === 'britons' && this.type === 'archery_range') {
        trainTime *= 0.8; // 20% faster
      }
      this.trainingTimer = trainTime;
    }

    game.audio.play('train');
  }

  trainUnit(type) {
    if (this.trainingQueue.length >= this.maxQueueSize) return false;
    const def = UNIT_DEFS[type];
    if (!def) return false;

    const player = game.players[this.owner];

    // Check age requirement
    if (def.age > player.age) return false;

    // Check civ restriction
    if (def.civOnly && def.civOnly !== player.civ) return false;

    // Check resources
    const cost = def.cost;
    for (const [res, amt] of Object.entries(cost)) {
      if (player.resources[res] < amt) return false;
    }

    // Deduct resources
    for (const [res, amt] of Object.entries(cost)) {
      player.resources[res] -= amt;
    }

    this.trainingQueue.push({ type });

    if (this.trainingQueue.length === 1) {
      let trainTime = def.trainTime;
      if (this.owner === 0 && player.civ === 'britons' && this.type === 'archery_range') {
        trainTime *= 0.8;
      }
      this.trainingTimer = trainTime;
    }

    return true;
  }

  cancelTraining(index) {
    if (index < 0 || index >= this.trainingQueue.length) return;
    const item = this.trainingQueue.splice(index, 1)[0];
    // Refund 80% of resources
    const def = UNIT_DEFS[item.type];
    if (def) {
      const player = game.players[this.owner];
      for (const [res, amt] of Object.entries(def.cost)) {
        player.resources[res] += Math.floor(amt * 0.8);
      }
    }
    if (index === 0) {
      this.trainingTimer = 0;
      if (this.trainingQueue.length > 0) {
        const nextDef = UNIT_DEFS[this.trainingQueue[0].type];
        this.trainingTimer = nextDef.trainTime;
      }
    }
  }

  _performAttack() {
    if (this.attackRange <= 0 || this.attackDamage <= 0) return;

    // Find nearest enemy
    let best = null, bestDist = Infinity;
    game.getAllEntities().forEach(e => {
      if (e.dead) return;
      if (e.owner === this.owner) return;
      const d = this.distTo(e.col, e.row);
      if (d <= this.attackRange && d < bestDist) {
        bestDist = d;
        best = e;
      }
    });

    if (!best) return;

    this.attackCooldown = this.attackSpeed;
    const armor = best.stats?.pierceArmor || 0;
    const damage = Math.max(1, this.attackDamage - armor);
    const killed = best.takeDamage(damage);

    // Create arrow projectile
    game.addProjectile({
      startCol: this.centerCol, startRow: this.centerRow,
      endCol: best.col, endRow: best.row,
      progress: 0, duration: 0.5,
      owner: this.owner,
    });

    if (killed) game.onEntityKilled(best, this);
  }

  takeDamage(amount) {
    const killed = super.takeDamage(amount);
    if (killed) {
      this._unoccupy();
    }
    return killed;
  }

  // Get list of units this building can train (based on age, civ)
  getTrainableUnits() {
    if (!this.def.produces) return [];
    const player = game.players[this.owner];
    return this.def.produces.filter(type => {
      const def = UNIT_DEFS[type];
      if (!def) return false;
      if (def.age > player.age) return false;
      if (def.civOnly && def.civOnly !== player.civ) return false;
      return true;
    });
  }

  getQueueProgress() {
    if (this.trainingQueue.length === 0) return 0;
    const def = UNIT_DEFS[this.trainingQueue[0].type];
    if (!def) return 0;
    return 1 - (this.trainingTimer / def.trainTime);
  }

  distTo(col, row) {
    // Distance from center of building
    const dc = this.centerCol - col;
    const dr = this.centerRow - row;
    return Math.sqrt(dc*dc + dr*dr);
  }
}

// ===== Building placement and creation =====

function canPlaceBuilding(type, col, row, owner) {
  const def = BUILDING_DEFS[type];
  if (!def) return false;

  const player = game.players[owner];

  // Age check
  if (def.age > player.age) return false;

  // Check resources (planning mode — don't deduct yet)
  const cost = def.cost;
  for (const [res, amt] of Object.entries(cost)) {
    // TC wood cost reduction for Britons
    let actualAmt = amt;
    if (type === 'town_center' && res === 'wood' && player.civ === 'britons') {
      actualAmt = Math.floor(amt * CIVS.britons.bonuses.tcWoodCostMultiplier);
    }
    if (player.resources[res] < actualAmt) return false;
  }

  // Check if tiles are clear
  if (!_checkTilesClear(col, row, def.size)) return false;

  return true;
}

function _checkTilesClear(col, row, size) {
  for (let dc = 0; dc < size; dc++) {
    for (let dr = 0; dr < size; dr++) {
      const nc = col + dc, nr = row + dr;
      if (!game.map.inBounds(nc, nr)) return false;
      const tile = game.map.getTile(nc, nr);
      if (tile === TILE.WATER || tile === TILE.DEEP_WATER) return false;
      if (game.map.getOccupant(nc, nr)) return false;
    }
  }
  return true;
}

function placeBuilding(type, col, row, owner, free) {
  const def = BUILDING_DEFS[type];
  if (!def) return null;

  const player = game.players[owner];

  if (!free) {
    // Deduct resources
    const cost = def.cost;
    for (const [res, amt] of Object.entries(cost)) {
      let actualAmt = amt;
      if (type === 'town_center' && res === 'wood' && player.civ === 'britons') {
        actualAmt = Math.floor(amt * CIVS.britons.bonuses.tcWoodCostMultiplier);
      }
      player.resources[res] -= actualAmt;
    }
  }

  // Clear terrain under building
  for (let dc = 0; dc < def.size; dc++) {
    for (let dr = 0; dr < def.size; dr++) {
      game.map.setTile(col + dc, row + dr, TILE.GRASS);
      game.map.resources.delete(game.map._key(col + dc, row + dr));
    }
  }

  const building = new Building(type, col, row, owner);

  // Pop cap
  if (def.popCap) {
    player.popCap += def.popCap;
  }

  game.addEntity(building);
  game.audio.play('build');
  return building;
}

// Place a completed building (for initialization)
function placeCompletedBuilding(type, col, row, owner) {
  const bldg = placeBuilding(type, col, row, owner, true);
  if (bldg) {
    bldg.hp = bldg.maxHp;
    bldg.complete = true;
    bldg.constructionProgress = 1;
  }
  return bldg;
}
