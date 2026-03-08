'use strict';

const AI_OWNER = 1;

class AIController {
  constructor() {
    this.tickTimer = 0;
    this.tickInterval = 3.0; // Evaluate every 3 seconds

    this.attackTimer = 0;
    this.nextAttackTime = 120; // First attack at 2 min
    this.attackWave = 0;

    this.buildPhase = 'economy'; // 'economy', 'military', 'attack'
    this.wantedBuildings = [];
    this.buildQueue = [];

    this.lastVillagerCount = 0;
    this.idleVillagerCycle = 0;

    // Resource targets for gathering
    this.gatherTargets = {
      food: null,
      wood: null,
      gold: null,
      stone: null,
    };
  }

  update(dt) {
    this.tickTimer -= dt;
    this.attackTimer += dt;

    if (this.tickTimer <= 0) {
      this.tickTimer = this.tickInterval;
      this._think();
    }

    // Periodic attack
    if (this.attackTimer >= this.nextAttackTime) {
      this.attackTimer = 0;
      this.attackWave++;
      // Next attack escalates
      this.nextAttackTime = 90 + this.attackWave * 30;
      this._launchAttack();
    }

    // Update age up
    updateAgeUp(AI_OWNER, dt);
  }

  _think() {
    const player = game.players[AI_OWNER];
    const res = player.resources;

    // === Assign idle villagers ===
    this._assignIdleVillagers();

    // === Build economy ===
    this._buildEconomy(player, res);

    // === Train military ===
    this._trainMilitary(player, res);

    // === Age up ===
    this._tryAgeUp(player, res);

    // === Defend ===
    this._defend();
  }

  _assignIdleVillagers() {
    const idleVillagers = [];
    game.getAllEntities().forEach(e => {
      if (e.isUnit && e.owner === AI_OWNER && e.type === 'villager' && e.isIdle()) {
        idleVillagers.push(e);
      }
    });

    if (idleVillagers.length === 0) return;

    const res = game.players[AI_OWNER].resources;

    for (const v of idleVillagers) {
      // Determine what to gather based on needs
      const task = this._choosGatherTask(v, res);
      if (task === 'build' && this.buildQueue.length > 0) {
        this._executeNextBuild(v);
      } else if (task === 'food') {
        this._sendToGather(v, 'food');
      } else if (task === 'wood') {
        this._sendToGather(v, 'wood');
      } else if (task === 'gold') {
        this._sendToGather(v, 'gold');
      } else if (task === 'stone') {
        this._sendToGather(v, 'stone');
      } else {
        this._sendToGather(v, 'food');
      }
    }
  }

  _choosGatherTask(v, res) {
    // Priority: build if queue, else balance resources
    if (this.buildQueue.length > 0) return 'build';

    // Count workers on each resource
    const workers = { food: 0, wood: 0, gold: 0, stone: 0 };
    game.getAllEntities().forEach(e => {
      if (!e.isUnit || e.owner !== AI_OWNER || e.type !== 'villager') return;
      if (e.gatherTarget) workers[e.gatherTarget.type]++;
      else if (e.farmTarget) workers.food++;
    });

    const player = game.players[AI_OWNER];
    const age = player.age;

    // Desired ratios based on age
    const desired = age === 0
      ? { food: 5, wood: 3, gold: 0, stone: 0 }
      : age === 1
        ? { food: 4, wood: 3, gold: 2, stone: 1 }
        : { food: 4, wood: 3, gold: 3, stone: 1 };

    // Find most needed resource
    let bestTask = null, bestNeed = -Infinity;
    for (const [type, want] of Object.entries(desired)) {
      if (want === 0) continue;
      const need = want - workers[type];
      if (need > bestNeed) { bestNeed = need; bestTask = type; }
    }

    return bestTask || 'food';
  }

  _sendToGather(villager, resType) {
    // Find a farm for food, or find resource tile
    if (resType === 'food') {
      // Check for farm
      let farm = null;
      game.getAllEntities().forEach(e => {
        if (!farm && e.isBuilding && e.type === 'farm' && e.owner === AI_OWNER && e.complete) {
          // Check if another villager is already farming here
          let inUse = false;
          game.getAllEntities().forEach(u => {
            if (u.isUnit && u.farmTarget === e.id) inUse = true;
          });
          if (!inUse) farm = e;
        }
      });
      if (farm) {
        villager.commandFarm(farm.id);
        return;
      }

      // Try bush
      const bush = game.map.findNearestResource(villager.tileCol, villager.tileRow, 'food', 25);
      if (bush) {
        villager.commandGather(bush.col, bush.row);
        return;
      }

      // No food source — try to build farm if possible
      const p = game.players[AI_OWNER];
      if (p.resources.wood >= 60) {
        this._queueBuild('farm');
      }
      return;
    }

    const tile = game.map.findNearestResource(villager.tileCol, villager.tileRow, resType, 30);
    if (tile) {
      villager.commandGather(tile.col, tile.row);
    }
  }

  _buildEconomy(player, res) {
    const age = player.age;
    const buildings = this._getAIBuildings();
    const bTypes = buildings.map(b => b.type);
    const villagers = this._getVillagers();

    // House if close to pop cap
    if (player.population >= player.popCap - 2) {
      if (!this._hasPendingBuild('house')) {
        this._queueBuild('house');
      }
    }

    // Core economy buildings
    const hasMill = bTypes.includes('mill');
    const hasLumberCamp = bTypes.includes('lumber_camp');
    const hasMiningCamp = bTypes.includes('mining_camp');

    if (!hasMill && !this._hasPendingBuild('mill') && villagers.length >= 2) {
      this._queueBuild('mill');
    }
    if (!hasLumberCamp && !this._hasPendingBuild('lumber_camp') && res.wood >= 120) {
      this._queueBuild('lumber_camp');
    }
    if (!hasMiningCamp && age >= 1 && !this._hasPendingBuild('mining_camp') && res.wood >= 120) {
      this._queueBuild('mining_camp');
    }

    // Farms (3 farms in dark age)
    const farmCount = bTypes.filter(t => t === 'farm').length;
    if (farmCount < 3 && res.wood >= 60 && !this._hasPendingBuild('farm')) {
      this._queueBuild('farm');
    }

    // Military buildings (feudal+)
    if (age >= 1) {
      if (!bTypes.includes('barracks') && !this._hasPendingBuild('barracks') && res.wood >= 175) {
        this._queueBuild('barracks');
      }
      if (!bTypes.includes('archery_range') && !this._hasPendingBuild('archery_range') && res.wood >= 175) {
        this._queueBuild('archery_range');
      }
      if (!bTypes.includes('stable') && !this._hasPendingBuild('stable') && res.wood >= 200) {
        this._queueBuild('stable');
      }
    }

    // Towers (feudal+)
    if (age >= 1) {
      const towerCount = bTypes.filter(t => t === 'tower').length;
      if (towerCount < 2 && res.wood >= 125 && res.stone >= 100 && !this._hasPendingBuild('tower')) {
        this._queueBuild('tower');
      }
    }

    // Castle (castle age)
    if (age >= 2) {
      if (!bTypes.includes('castle') && !this._hasPendingBuild('castle') && res.stone >= 650) {
        this._queueBuild('castle');
      }
      if (!bTypes.includes('siege_workshop') && !this._hasPendingBuild('siege_workshop') && res.wood >= 200) {
        this._queueBuild('siege_workshop');
      }
      if (!bTypes.includes('monastery') && !this._hasPendingBuild('monastery') && res.wood >= 175) {
        this._queueBuild('monastery');
      }
    }
  }

  _trainMilitary(player, res) {
    if (player.age === 0) return; // No military in dark age

    // Get military buildings
    const barracks = this._getBuilding('barracks');
    const archRange = this._getBuilding('archery_range');
    const stable = this._getBuilding('stable');
    const castle = this._getBuilding('castle');
    const siege = this._getBuilding('siege_workshop');

    const pop = player.population;
    const popCap = player.popCap;

    if (pop >= popCap - 1) return; // Wait for population room

    // Train from barracks
    if (barracks && barracks.trainingQueue.length < 3) {
      let unitType;
      if (player.age >= 3) unitType = 'champion';
      else if (player.age >= 2) unitType = 'pikeman';
      else unitType = 'spearman';
      barracks.trainUnit(unitType);
    }

    // Train from archery range
    if (archRange && archRange.trainingQueue.length < 3) {
      let unitType;
      if (player.age >= 3) unitType = 'arbalester';
      else if (player.age >= 2) {
        if (player.civ === 'britons') unitType = 'longbowman';
        else unitType = 'cavalry_archer';
      } else {
        unitType = 'skirmisher';
      }
      archRange.trainUnit(unitType);
    }

    // Train from stable
    if (stable && stable.trainingQueue.length < 2) {
      let unitType;
      if (player.age >= 3) unitType = 'paladin';
      else if (player.age >= 2) unitType = 'camel_rider';
      else unitType = 'light_cavalry';
      stable.trainUnit(unitType);
    }

    // Train unique units from castle
    if (castle && castle.trainingQueue.length < 3) {
      const uniqueUnit = player.civ === 'britons' ? 'longbowman' : 'throwing_axeman';
      castle.trainUnit(uniqueUnit);
    }

    // Monastery — train monks in castle age+
    const monastery = this._getBuilding('monastery');
    if (monastery && monastery.trainingQueue.length < 2 && player.age >= 2) {
      monastery.trainUnit('monk');
    }

    // Siege
    if (siege && siege.trainingQueue.length < 1 && this.attackWave >= 2) {
      if (player.age >= 3) siege.trainUnit('bombard_cannon');
      else if (player.age >= 2) siege.trainUnit('scorpion');
      else siege.trainUnit('battering_ram');
    }
  }

  _tryAgeUp(player, res) {
    if (player.agingUp) return;
    if (player.age >= AGE_DEFS.length - 1) return;

    const nextAge = player.age + 1;
    const cost = AGE_DEFS[nextAge].advanceCost;
    if (!cost) return;

    // Only age up if we have significantly more than required
    const readyFood = (res.food || 0) >= (cost.food || 0) * 1.1;
    const readyGold = (res.gold || 0) >= (cost.gold || 0) * 1.1;
    const readyWood = (res.wood || 0) >= (cost.wood || 0) * 1.1;

    // Also require minimum villagers
    const villagerCount = this._getVillagers().length;
    const minVillagers = player.age === 0 ? 6 : 10;

    if (readyFood && readyGold && readyWood && villagerCount >= minVillagers) {
      startAgeUp(AI_OWNER);
    }
  }

  _defend() {
    // Find enemies near AI buildings
    const aiBuildings = this._getAIBuildings().filter(b => b.complete);
    const enemies = [];
    game.getAllEntities().forEach(e => {
      if (!e.dead && e.owner !== AI_OWNER) enemies.push(e);
    });

    if (enemies.length === 0) return;

    // Check if any enemy is near an AI building
    let threatFound = false;
    for (const bldg of aiBuildings) {
      for (const enemy of enemies) {
        if (bldg.distTo(enemy.col, enemy.row) < 12) {
          threatFound = true;
          break;
        }
      }
      if (threatFound) break;
    }

    if (!threatFound) return;

    // Send idle military units to defend
    game.getAllEntities().forEach(e => {
      if (!e.isUnit || e.dead || e.owner !== AI_OWNER || e.type === 'villager') return;
      if (e.state === UnitState.IDLE) {
        // Find nearest enemy
        const enemy = this._findNearestEnemy(e, enemies);
        if (enemy && e.dist(enemy) < 20) {
          e.commandAttack(enemy.id);
        }
      }
    });
  }

  _launchAttack() {
    const militaryUnits = [];
    game.getAllEntities().forEach(e => {
      if (e.isUnit && !e.dead && e.owner === AI_OWNER && e.type !== 'villager') {
        militaryUnits.push(e);
      }
    });

    if (militaryUnits.length < 3) return; // Not enough to attack

    // Find player's town center or nearest building
    let target = null;
    game.getAllEntities().forEach(e => {
      if (!e.dead && e.owner === 0 && e.isBuilding) {
        if (!target || e.type === 'town_center') target = e;
      }
    });

    if (!target) {
      // Find player units
      game.getAllEntities().forEach(e => {
        if (!e.dead && e.owner === 0 && e.isUnit) {
          if (!target) target = e;
        }
      });
    }

    if (!target) return;

    // Send all military units to attack
    for (const u of militaryUnits) {
      u.commandAttackMove(target.col, target.row);
    }

    game.ui.showMessage('Enemy is attacking!', '#ff4444');
    game.audio.play('attack_warning');
  }

  // ===== BUILD QUEUE =====

  _queueBuild(type) {
    // Check if already queued
    if (this.buildQueue.includes(type)) return;
    this.buildQueue.push(type);
  }

  _hasPendingBuild(type) {
    return this.buildQueue.includes(type);
  }

  _executeNextBuild(villager) {
    if (this.buildQueue.length === 0) return;

    const type = this.buildQueue[0];
    const player = game.players[AI_OWNER];

    // Check if we can afford it
    const def = BUILDING_DEFS[type];
    if (!canAfford(AI_OWNER, def.cost)) return;

    // Find a good location
    const loc = this._findBuildLocation(type);
    if (!loc) {
      // Can't find location, skip this build
      this.buildQueue.shift();
      return;
    }

    this.buildQueue.shift();

    // Place building foundation
    const building = placeBuilding(type, loc.col, loc.row, AI_OWNER);
    if (!building) return;

    // Assign villager to build it
    villager.commandBuild(building.id);
  }

  _findBuildLocation(type) {
    // Find AI town center as reference
    let tc = null;
    game.getAllEntities().forEach(e => {
      if (!tc && e.isBuilding && e.type === 'town_center' && e.owner === AI_OWNER) tc = e;
    });

    if (!tc) return null;

    const def = BUILDING_DEFS[type];
    const size = def.size;

    // Try positions around town center
    const baseCol = tc.col;
    const baseRow = tc.row;

    // Spiral search
    for (let radius = 3; radius <= 15; radius++) {
      for (let dc = -radius; dc <= radius; dc++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
          const col = baseCol + dc;
          const row = baseRow + dr;
          if (_checkTilesClear(col, row, size)) {
            return { col, row };
          }
        }
      }
    }

    return null;
  }

  // ===== HELPERS =====

  _getAIBuildings() {
    const result = [];
    game.getAllEntities().forEach(e => {
      if (e.isBuilding && !e.dead && e.owner === AI_OWNER) result.push(e);
    });
    return result;
  }

  _getBuilding(type) {
    let found = null;
    game.getAllEntities().forEach(e => {
      if (!found && e.isBuilding && !e.dead && e.type === type && e.owner === AI_OWNER && e.complete) {
        found = e;
      }
    });
    return found;
  }

  _getVillagers() {
    const result = [];
    game.getAllEntities().forEach(e => {
      if (e.isUnit && !e.dead && e.owner === AI_OWNER && e.type === 'villager') result.push(e);
    });
    return result;
  }

  _getMilitary() {
    const result = [];
    game.getAllEntities().forEach(e => {
      if (e.isUnit && !e.dead && e.owner === AI_OWNER && e.type !== 'villager') result.push(e);
    });
    return result;
  }

  _findNearestEnemy(unit, enemies) {
    let best = null, bestDist = Infinity;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = unit.dist(e);
      if (d < bestDist) { bestDist = d; best = e; }
    }
    return best;
  }
}
