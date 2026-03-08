'use strict';

const UnitState = {
  IDLE: 'idle',
  MOVING: 'moving',
  GATHERING: 'gathering',
  RETURNING: 'returning',
  BUILDING: 'building',
  ATTACKING: 'attacking',
  FARMING: 'farming',
  REPAIRING: 'repairing',
  HEALING: 'healing',
};

class Unit extends Entity {
  constructor(type, col, row, owner, civName) {
    super(type, col, row, owner);
    this.isUnit = true;
    this.civName = civName;

    const def = UNIT_DEFS[type];
    const stats = applyStatBonuses(type, def, civName);

    this.name = def.name;
    this.stats = {
      hp: stats.hp,
      attack: stats.attack,
      meleeArmor: stats.meleeArmor,
      pierceArmor: stats.pierceArmor,
      range: stats.range,
      minRange: stats.minRange || 0,
      speed: stats.speed,
      attackSpeed: stats.attackSpeed,
      los: stats.los,
      carryCapacity: stats.carryCapacity || 0,
      canGather: !!stats.canGather,
      canBuild: !!stats.canBuild,
      projectile: !!stats.projectile,
      aoe: stats.aoe || 0,
      vsBuildingBonus: stats.vsBuildingBonus || 0,
      vsCavalryBonus: stats.vsCavalryBonus || 0,
      vsArcherBonus: stats.vsArcherBonus || 0,
      canHeal: !!stats.canHeal,
      healRate: stats.healRate || 0,
      color: stats.color || '#ffffff',
    };

    this.hp = stats.hp;
    this.maxHp = stats.hp;

    this.state = UnitState.IDLE;
    this.path = [];
    this.pathTarget = null;    // {col, row} final destination
    this.nextState = null;

    this.attackTarget = null;  // entity ID
    this.attackCooldown = 0;
    this.moveAttack = false;   // attack-move mode

    // Resource carrying
    this.carrying = { type: null, amount: 0 };

    // Gather/build target
    this.gatherTarget = null;  // {col, row, type}
    this.gatherTimer = 0;
    this.gatherRate = 1.0;     // resources per gathering interval
    this.gatherInterval = 1.5; // seconds between gather ticks

    this.buildTarget = null;   // building entity ID
    this.buildTimer = 0;

    this.farmTarget = null;    // building entity ID (farm)
    this.healTarget = null;    // unit entity ID (monk healing)

    // Rally / control groups
    this.controlGroup = -1;

    // Projectiles this unit fired (for rendering)
    this.projectiles = [];

    // Stagger start position to avoid overlap
    this._moveOffset = { col: (Math.random() - 0.5) * 0.3, row: (Math.random() - 0.5) * 0.3 };
  }

  update(dt) {
    if (this.dead) return;

    // Update attack cooldown
    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    // Update projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.progress += dt / p.duration;
      if (p.progress >= 1) {
        this.projectiles.splice(i, 1);
      }
    }

    switch (this.state) {
      case UnitState.IDLE:      this._updateIdle(dt); break;
      case UnitState.MOVING:    this._updateMoving(dt); break;
      case UnitState.GATHERING: this._updateGathering(dt); break;
      case UnitState.RETURNING: this._updateReturning(dt); break;
      case UnitState.BUILDING:  this._updateBuilding(dt); break;
      case UnitState.ATTACKING: this._updateAttacking(dt); break;
      case UnitState.FARMING:   this._updateFarming(dt); break;
      case UnitState.REPAIRING: this._updateRepairing(dt); break;
      case UnitState.HEALING:   this._updateHealing(dt); break;
    }
  }

  // ===== STATE: IDLE =====
  _updateIdle(dt) {
    // Monks auto-heal nearby friendly units
    if (this.stats.canHeal) {
      const injured = this._findInjuredFriendly(4);
      if (injured) {
        this.healTarget = injured.id;
        this.state = UnitState.HEALING;
        return;
      }
    }
    // Auto-attack nearest enemy in range
    const enemy = this._findNearestEnemy(this.stats.range + 0.5);
    if (enemy) {
      this._startAttacking(enemy);
      return;
    }
    // Chase enemies if attack-move
    if (this.moveAttack && this.pathTarget) {
      const nearEnemy = this._findNearestEnemy(6);
      if (nearEnemy) {
        this._startAttacking(nearEnemy);
        return;
      }
    }
  }

  // ===== STATE: MOVING =====
  _updateMoving(dt) {
    if (this.path.length === 0) {
      this.state = this.nextState || UnitState.IDLE;
      this.nextState = null;
      return;
    }

    const target = this.path[0];
    const dx = target.col - this.col;
    const dy = target.row - this.row;
    const dist = Math.sqrt(dx * dx + dy * dy);

    const speed = this.stats.speed;
    const step = speed * dt;

    if (dist <= step + 0.05) {
      this.col = target.col;
      this.row = target.row;
      this.path.shift();
      if (this.path.length === 0) {
        this.state = this.nextState || UnitState.IDLE;
        this.nextState = null;
        // Arrived callback
        this._onArrived();
      }
    } else {
      this.col += (dx / dist) * step;
      this.row += (dy / dist) * step;
    }

    // Check for enemies while moving (if attack-move)
    if (this.moveAttack) {
      const enemy = this._findNearestEnemy(this.stats.range + 0.5);
      if (enemy) {
        this._startAttacking(enemy);
      }
    }
  }

  _onArrived() {
    if (this.nextState === UnitState.GATHERING) {
      this.state = UnitState.GATHERING;
      this.nextState = null;
      this.gatherTimer = 0;
    } else if (this.nextState === UnitState.RETURNING) {
      this.state = UnitState.RETURNING;
      this.nextState = null;
    } else if (this.nextState === UnitState.BUILDING) {
      this.state = UnitState.BUILDING;
      this.nextState = null;
      this.buildTimer = 0;
    } else if (this.nextState === UnitState.FARMING) {
      this.state = UnitState.FARMING;
      this.nextState = null;
    } else if (this.nextState === UnitState.REPAIRING) {
      this.state = UnitState.REPAIRING;
      this.nextState = null;
    }
  }

  // ===== STATE: GATHERING =====
  _updateGathering(dt) {
    if (!this.gatherTarget) { this.state = UnitState.IDLE; return; }
    const { col, row } = this.gatherTarget;

    // Check if resource still exists
    const res = game.map.getResource(col, row);
    if (!res || res.amount <= 0) {
      // Find another resource of same type nearby
      const alt = game.map.findNearestResource(this.tileCol, this.tileRow, this.gatherTarget.type, 15);
      if (alt) {
        this.commandGather(alt.col, alt.row);
      } else {
        this.state = UnitState.IDLE;
      }
      return;
    }

    // Check distance — must be adjacent
    const distToRes = this.distTo(col, row);
    if (distToRes > 1.8) {
      // Move closer
      this._pathToResource(col, row);
      return;
    }

    this.gatherTimer -= dt;
    if (this.gatherTimer <= 0) {
      this.gatherTimer = this.gatherInterval;
      // Gather
      const canTake = this.stats.carryCapacity - this.carrying.amount;
      const taken = game.map.depleteResource(col, row, Math.min(this.gatherRate, canTake));
      if (taken > 0) {
        this.carrying.type = this.gatherTarget.type;
        this.carrying.amount += taken;
        game.onResourceGathered(this.owner, this.gatherTarget.type, 0); // track gathering (not yet dropped)
      }

      // Check if carrying capacity reached
      if (this.carrying.amount >= this.stats.carryCapacity) {
        this._returnToDropOff();
      }
    }
  }

  // ===== STATE: RETURNING =====
  _updateReturning(dt) {
    // Find drop-off if no path
    if (this.path.length > 0) return; // still moving

    // We've arrived at drop-off
    if (this.carrying.amount > 0) {
      const resType = this.carrying.type;
      const amount = this.carrying.amount;
      game.players[this.owner].resources[resType] += amount;
      game.onResourceGathered(this.owner, resType, amount);
      this.carrying.amount = 0;
      this.carrying.type = null;
    }

    // Go back to resource
    if (this.gatherTarget) {
      const res = game.map.getResource(this.gatherTarget.col, this.gatherTarget.row);
      if (res && res.amount > 0) {
        this._pathToResource(this.gatherTarget.col, this.gatherTarget.row);
      } else {
        const alt = game.map.findNearestResource(this.tileCol, this.tileRow, this.gatherTarget.type, 15);
        if (alt) this.commandGather(alt.col, alt.row);
        else this.state = UnitState.IDLE;
      }
    } else {
      this.state = UnitState.IDLE;
    }
  }

  // ===== STATE: BUILDING =====
  _updateBuilding(dt) {
    if (!this.buildTarget) { this.state = UnitState.IDLE; return; }
    const bldg = game.getEntity(this.buildTarget);
    if (!bldg || bldg.dead) { this.state = UnitState.IDLE; this.buildTarget = null; return; }

    // Check distance to building
    const distToBldg = this.distTo(bldg.col + bldg.size / 2 - 0.5, bldg.row + bldg.size / 2 - 0.5);
    if (distToBldg > bldg.size / 2 + 1.5) {
      this._pathToBuilding(bldg);
      return;
    }

    this.buildTimer += dt;
    // Build progress
    const buildRate = bldg.maxHp / bldg.def.buildTime; // hp per second
    bldg.hp = Math.min(bldg.maxHp, bldg.hp + buildRate * dt);
    bldg.constructionProgress = bldg.hp / bldg.maxHp;

    if (bldg.constructionProgress >= 1) {
      bldg.complete = true;
      this.state = UnitState.IDLE;
      this.buildTarget = null;
    }
  }

  // ===== STATE: ATTACKING =====
  _updateAttacking(dt) {
    const target = game.getEntity(this.attackTarget);
    if (!target || target.dead) {
      this.attackTarget = null;
      // Look for next target
      const nextEnemy = this._findNearestEnemy(this.stats.range + 0.5);
      if (nextEnemy) {
        this._startAttacking(nextEnemy);
      } else if (this.moveAttack && this.pathTarget) {
        // Continue attack-move
        this._moveTo(this.pathTarget.col, this.pathTarget.row, true);
      } else {
        this.state = UnitState.IDLE;
      }
      return;
    }

    const dist = this.dist(target);
    const minR = this.stats.minRange || 0;
    const maxR = this.stats.range;

    // Check if target is in range
    if (dist > maxR + 0.5) {
      // Move toward target
      this._moveToAttack(target);
      return;
    }

    // Too close (for units with min range like mangonel)
    if (dist < minR) {
      // Back away
      const dx = this.col - target.col;
      const dy = this.row - target.row;
      const d = Math.sqrt(dx*dx + dy*dy) || 1;
      const retreatCol = this.col + (dx / d) * 2;
      const retreatRow = this.row + (dy / d) * 2;
      this._moveTo(retreatCol, retreatRow);
      return;
    }

    // In range — stop and attack
    this.path = [];

    if (this.attackCooldown <= 0) {
      this._performAttack(target);
    }
  }

  // ===== STATE: FARMING =====
  _updateFarming(dt) {
    if (!this.farmTarget) { this.state = UnitState.IDLE; return; }
    const farm = game.getEntity(this.farmTarget);
    if (!farm || farm.dead || !farm.complete) { this.state = UnitState.IDLE; return; }

    const distToFarm = this.distTo(farm.col + 1, farm.row + 1);
    if (distToFarm > farm.size / 2 + 1.5) {
      this._pathToBuilding(farm);
      return;
    }

    // Gain food at farm rate, drop off to player directly
    this.gatherTimer -= dt;
    if (this.gatherTimer <= 0) {
      this.gatherTimer = this.gatherInterval;
      const food = farm.def.foodRate * this.gatherInterval;
      game.players[this.owner].resources.food += food;
      game.onResourceGathered(this.owner, 'food', food);
    }
  }

  // ===== STATE: REPAIRING =====
  _updateRepairing(dt) {
    if (!this.buildTarget) { this.state = UnitState.IDLE; return; }
    const bldg = game.getEntity(this.buildTarget);
    if (!bldg || bldg.dead) { this.state = UnitState.IDLE; return; }
    if (bldg.hp >= bldg.maxHp) { this.state = UnitState.IDLE; return; }

    const distToBldg = this.distTo(bldg.col + bldg.size / 2 - 0.5, bldg.row + bldg.size / 2 - 0.5);
    if (distToBldg > bldg.size / 2 + 1.5) {
      this._pathToBuilding(bldg);
      return;
    }

    // Repair at 20 HP per second (costs wood)
    const repairRate = 20;
    const woodCostRate = 0.2;
    const player = game.players[this.owner];
    if (player.resources.wood >= woodCostRate * dt) {
      player.resources.wood -= woodCostRate * dt;
      bldg.hp = Math.min(bldg.maxHp, bldg.hp + repairRate * dt);
    }
  }

  // ===== STATE: HEALING (Monk) =====
  _updateHealing(dt) {
    if (!this.stats.canHeal) { this.state = UnitState.IDLE; return; }
    const target = game.getEntity(this.healTarget);
    if (!target || target.dead || target.hp >= target.maxHp) {
      this.healTarget = null;
      this.state = UnitState.IDLE;
      return;
    }

    const dist = this.dist(target);
    if (dist > 4) {
      // Move toward injured unit
      this._moveTo(Math.round(target.col), Math.round(target.row));
      this.state = UnitState.HEALING;
      return;
    }

    // Heal
    target.hp = Math.min(target.maxHp, target.hp + this.stats.healRate * dt);
  }

  _findInjuredFriendly(radius) {
    let best = null, bestDist = Infinity;
    game.getAllEntities().forEach(e => {
      if (e.dead || e === this) return;
      if (e.owner !== this.owner) return;
      if (!e.isUnit) return;
      if (e.hp >= e.maxHp) return;
      const d = this.dist(e);
      if (d <= radius && d < bestDist) { bestDist = d; best = e; }
    });
    return best;
  }

  // ===== COMMANDS (public API) =====

  commandMove(col, row, addToPath) {
    this.attackTarget = null;
    this.moveAttack = false;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.farmTarget = null;
    this.nextState = UnitState.IDLE;
    this._moveTo(col, row, false);
  }

  commandAttackMove(col, row) {
    this.moveAttack = true;
    this.pathTarget = { col, row };
    this._moveTo(col, row, true);
  }

  commandAttack(targetId) {
    const target = game.getEntity(targetId);
    if (!target) return;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.farmTarget = null;
    this._startAttacking(target);
  }

  commandGather(col, row) {
    const res = game.map.getResource(col, row);
    if (!res) return;
    this.gatherTarget = { col, row, type: res.type };
    this.attackTarget = null;
    this.buildTarget = null;
    this.farmTarget = null;
    this._pathToResource(col, row);
  }

  commandBuild(buildingId) {
    this.buildTarget = buildingId;
    this.gatherTarget = null;
    this.attackTarget = null;
    this.farmTarget = null;
    const bldg = game.getEntity(buildingId);
    if (bldg) this._pathToBuilding(bldg);
  }

  commandFarm(farmId) {
    this.farmTarget = farmId;
    this.gatherTarget = null;
    this.attackTarget = null;
    this.buildTarget = null;
    const farm = game.getEntity(farmId);
    if (farm) this._pathToBuilding(farm, UnitState.FARMING);
  }

  commandRepair(buildingId) {
    this.buildTarget = buildingId;
    this.gatherTarget = null;
    this.attackTarget = null;
    this.farmTarget = null;
    const bldg = game.getEntity(buildingId);
    if (bldg) this._pathToBuilding(bldg, UnitState.REPAIRING);
  }

  commandStop() {
    this.state = UnitState.IDLE;
    this.path = [];
    this.attackTarget = null;
    this.moveAttack = false;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.farmTarget = null;
    this.healTarget = null;
    this.nextState = null;
  }

  // ===== INTERNAL MOVEMENT =====

  _moveTo(col, row, isAttackMove) {
    this.moveAttack = !!isAttackMove;
    if (!isAttackMove) this.pathTarget = { col, row };

    const startCol = Math.round(this.col);
    const startRow = Math.round(this.row);
    const endCol = Math.round(col);
    const endRow = Math.round(row);

    if (startCol === endCol && startRow === endRow) {
      this.state = this.nextState || UnitState.IDLE;
      return;
    }

    const path = pathfinder.findPath(game.map, startCol, startRow, endCol, endRow);
    if (path.length > 0) {
      this.path = path;
      this.state = UnitState.MOVING;
    } else {
      // No path — try to get close
      this.path = [];
      this.state = this.nextState || UnitState.IDLE;
    }
  }

  _pathToResource(col, row) {
    // Find adjacent walkable tile to resource
    const candidates = [];
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    for (const [dc, dr] of dirs) {
      const nc = col + dc, nr = row + dr;
      if (game.map.inBounds(nc, nr) && game.map.isWalkable(nc, nr)) {
        candidates.push({ col: nc, row: nr });
      }
    }

    if (candidates.length === 0) {
      // Resource tile itself as a fallback
      candidates.push({ col, row });
    }

    // Pick nearest candidate
    let best = candidates[0], bestDist = Infinity;
    for (const c of candidates) {
      const d = this.distTo(c.col, c.row);
      if (d < bestDist) { bestDist = d; best = c; }
    }

    this.nextState = UnitState.GATHERING;
    this._moveTo(best.col, best.row);
    if (this.state !== UnitState.MOVING) {
      this.state = UnitState.GATHERING;
      this.gatherTimer = 0;
    }
  }

  _returnToDropOff() {
    const resType = this.carrying.type;
    const dropOff = game.findNearestDropOff(this.owner, resType, this.col, this.row);
    if (!dropOff) {
      // No drop-off, just idle
      this.state = UnitState.IDLE;
      return;
    }

    // Move to adjacent tile of drop-off
    const adj = pathfinder.findAdjacentToFootprint(game.map, dropOff.col, dropOff.row, dropOff.size, dropOff.size);
    let dest;
    if (adj.length > 0) {
      let bestDist = Infinity;
      for (const a of adj) {
        const d = this.distTo(a.col, a.row);
        if (d < bestDist) { bestDist = d; dest = a; }
      }
    }

    if (!dest) {
      // Arrive at center of drop-off
      dest = { col: dropOff.col + Math.floor(dropOff.size / 2), row: dropOff.row + Math.floor(dropOff.size / 2) };
    }

    this.nextState = UnitState.RETURNING;
    this._moveTo(dest.col, dest.row);
    if (this.state !== UnitState.MOVING) {
      // Already there
      this.state = UnitState.RETURNING;
    }
  }

  _pathToBuilding(bldg, nextState) {
    const adj = pathfinder.findAdjacentToFootprint(game.map, bldg.col, bldg.row, bldg.size, bldg.size);
    let dest;
    if (adj.length > 0) {
      let bestDist = Infinity;
      for (const a of adj) {
        const d = this.distTo(a.col, a.row);
        if (d < bestDist) { bestDist = d; dest = a; }
      }
    }
    if (!dest) {
      dest = { col: bldg.col + Math.floor(bldg.size / 2), row: bldg.row + Math.floor(bldg.size / 2) };
    }

    this.nextState = nextState || UnitState.BUILDING;
    this._moveTo(dest.col, dest.row);
    if (this.state !== UnitState.MOVING) {
      this.state = nextState || UnitState.BUILDING;
      this.buildTimer = 0;
    }
  }

  _moveToAttack(target) {
    // Move toward target, stopping at attack range
    const dist = this.dist(target);
    if (dist <= this.stats.range) return;

    const dx = target.col - this.col;
    const dy = target.row - this.row;
    const d = Math.sqrt(dx*dx + dy*dy) || 1;
    // Move to just within range
    const destCol = target.col - (dx / d) * (this.stats.range * 0.8);
    const destRow = target.row - (dy / d) * (this.stats.range * 0.8);

    const startCol = Math.round(this.col);
    const startRow = Math.round(this.row);
    const endCol = Math.round(destCol);
    const endRow = Math.round(destRow);

    if (startCol !== endCol || startRow !== endRow) {
      const path = pathfinder.findPath(game.map, startCol, startRow, endCol, endRow);
      if (path.length > 0) {
        this.path = path;
        this.state = UnitState.ATTACKING; // keep attacking state but move
      }
    }
  }

  // ===== COMBAT =====

  _startAttacking(target) {
    this.attackTarget = target.id;
    this.state = UnitState.ATTACKING;
    this.gatherTarget = null;
    this.buildTarget = null;
    this.farmTarget = null;
  }

  _performAttack(target) {
    this.attackCooldown = this.stats.attackSpeed;

    const isMelee = this.stats.range <= 1.5;
    let damage = this.stats.attack;

    // Apply armor reduction
    if (target.isBuilding || target.isUnit) {
      const armor = isMelee ? (target.stats?.meleeArmor || 0) : (target.stats?.pierceArmor || 0);
      damage = Math.max(1, damage - armor);
    }

    // Building bonus
    if (target.isBuilding && this.stats.vsBuildingBonus) {
      damage += this.stats.vsBuildingBonus;
    }

    // Anti-cavalry bonus
    const cavalryTypes = new Set(['scout', 'knight', 'light_cavalry', 'camel_rider', 'cavalry_archer', 'paladin']);
    if (this.stats.vsCavalryBonus && target.isUnit && cavalryTypes.has(target.type)) {
      damage += this.stats.vsCavalryBonus;
    }

    // Anti-archer bonus
    const archerTypes = new Set(['archer', 'crossbowman', 'longbowman', 'skirmisher', 'cavalry_archer', 'arbalester', 'throwing_axeman']);
    if (this.stats.vsArcherBonus && target.isUnit && archerTypes.has(target.type)) {
      damage += this.stats.vsArcherBonus;
    }

    if (this.stats.projectile) {
      // Create projectile for visual effect
      this.projectiles.push({
        startCol: this.col, startRow: this.row,
        endCol: target.col, endRow: target.row,
        progress: 0, duration: 0.4,
        targetId: target.id,
        damage: damage,
      });
    } else {
      // Instant damage
      this._dealDamage(target, damage);
    }

    // AOE damage (mangonel)
    if (this.stats.aoe > 0) {
      const aoeR = this.stats.aoe;
      game.getAllEntities().forEach(e => {
        if (e === target || e.dead) return;
        if (this.isEnemy(e) && e.dist && e.dist(target) <= aoeR) {
          const aoeD = Math.max(1, damage - (e.stats?.meleeArmor || 0));
          this._dealDamage(e, aoeD);
        }
      });
    }
  }

  _dealDamage(target, damage) {
    const killed = target.takeDamage(damage);
    game.audio.play(target.isBuilding ? 'hit_building' : 'hit');
    if (killed) {
      game.onEntityKilled(target, this);
    }
  }

  // When projectile arrives
  resolveProjectile(proj) {
    const target = game.getEntity(proj.targetId);
    if (target && !target.dead) {
      this._dealDamage(target, proj.damage);
    }
  }

  // ===== UTILITY =====

  _findNearestEnemy(radius) {
    let best = null, bestDist = Infinity;
    game.getAllEntities().forEach(e => {
      if (e.dead || e === this) return;
      if (!this.isEnemy(e)) return;
      const d = this.dist(e);
      if (d <= radius && d < bestDist) {
        bestDist = d;
        best = e;
      }
    });
    return best;
  }

  isIdle() {
    return this.state === UnitState.IDLE && !this.attackTarget;
  }

  getCarryString() {
    if (!this.carrying.amount) return '';
    const icons = { food: '&#127823;', wood: '&#127795;', gold: '&#9679;', stone: '&#9632;' };
    return `${icons[this.carrying.type] || ''} ${this.carrying.amount}`;
  }
}

// Factory function
function createUnit(type, col, row, owner) {
  const civ = game.players[owner].civ;
  const unit = new Unit(type, col, row, owner, civ);
  game.addEntity(unit);
  game.players[owner].population++;
  return unit;
}
