'use strict';

// =============================================================================
//  GLOBAL GAME OBJECT — referenced by every other module
// =============================================================================
const game = {
  // Core systems
  map:      null,
  fog:      null,
  renderer: null,
  input:    null,
  ui:       null,
  audio:    null,
  ai:       null,

  // Canvas
  canvas: null,

  // State: 'menu' | 'playing' | 'won' | 'lost'
  state: 'menu',

  // Elapsed game time in seconds
  time: 0,

  // Isometric camera position (world pixels)
  camera: { x: 0, y: 0 },

  // Selected entity IDs
  selection: [],

  // Players: index 0 = human, index 1 = AI
  players: [],

  // Entity registry
  _entities: new Map(),

  // Statistics (for end-screen)
  stats: {
    unitsTrained:   0,
    unitsKilled:    0,
    buildingsBuilt: 0,
    resources:      { food: 0, wood: 0, gold: 0, stone: 0 },
  },

  // ---- Entity management ----

  addEntity(entity) {
    this._entities.set(entity.id, entity);
  },

  getEntity(id) {
    return this._entities.get(id) || null;
  },

  // Returns a snapshot array safe for iteration while mutating the map
  getAllEntities() {
    return Array.from(this._entities.values());
  },

  removeEntity(entity) {
    this._entities.delete(entity.id);
  },

  // ---- Selection ----

  clearSelection() {
    this.selection = [];
    if (this.ui) this.ui.updateSelectionPanel();
  },

  // ---- Camera ----

  // Center the camera on a world tile coordinate
  centerCamera(col, row) {
    this.camera.x = (col - row) * (TILE_W / 2);
    this.camera.y = (col + row) * (TILE_H / 2) - (this.canvas ? this.canvas.height / 4 : 0);
  },

  // ---- Projectiles ----

  addProjectile(proj) {
    addGlobalProjectile(proj);
  },

  // ---- Resource helpers ----

  findNearestDropOff(owner, resType, col, row) {
    return findNearestDropOff(owner, resType, col, row);
  },

  onResourceGathered(owner, type, amount) {
    if (owner === 0 && amount > 0) {
      this.stats.resources[type] = (this.stats.resources[type] || 0) + amount;
    }
  },

  // ---- Entity death callback ----

  onEntityKilled(entity, killer) {
    // Stats tracking
    if (entity.isUnit && killer && killer.owner === 0) {
      this.stats.unitsKilled++;
    }

    // Remove from selection
    const selIdx = this.selection.indexOf(entity.id);
    if (selIdx >= 0) {
      this.selection.splice(selIdx, 1);
      if (this.ui) this.ui.updateSelectionPanel();
    }

    // Decrement population
    if (entity.isUnit) {
      this.players[entity.owner].population = Math.max(0, this.players[entity.owner].population - 1);
    }

    // Reduce pop cap when a pop-providing building dies
    if (entity.isBuilding && entity.def && entity.def.popCap) {
      this.players[entity.owner].popCap = Math.max(0, this.players[entity.owner].popCap - entity.def.popCap);
    }

    // Win / lose detection
    if (entity.isBuilding && entity.type === 'town_center') {
      if (entity.owner === 0) {
        this._checkLoseCondition();
      } else {
        this._checkWinCondition();
      }
    }
  },

  _checkWinCondition() {
    // Win if AI has no town centers left
    let aiHasTownCenter = false;
    this._entities.forEach(e => {
      if (!e.dead && e.owner !== 0 && e.isBuilding && e.type === 'town_center') {
        aiHasTownCenter = true;
      }
    });
    if (!aiHasTownCenter) {
      this._endGame(true);
    }
  },

  _checkLoseCondition() {
    // Lose if player has no buildings at all
    let playerHasBuilding = false;
    this._entities.forEach(e => {
      if (!e.dead && e.owner === 0 && e.isBuilding) {
        playerHasBuilding = true;
      }
    });
    if (!playerHasBuilding) {
      setTimeout(() => this._endGame(false), 1500);
    }
  },

  _endGame(playerWon) {
    if (this.state !== 'playing') return;
    this.state = playerWon ? 'won' : 'lost';
    if (this.ui) {
      this.ui.showGameOver(playerWon, {
        time:           this.time,
        unitsTrained:   this.stats.unitsTrained,
        unitsKilled:    this.stats.unitsKilled,
        buildingsBuilt: this.stats.buildingsBuilt,
        resources:      this.stats.resources,
      });
    }
  },
};

// =============================================================================
//  START SCREEN — civ selection
// =============================================================================

let _selectedCiv = null;

function selectCiv(civName) {
  _selectedCiv = civName;
  document.querySelectorAll('.civ-card').forEach(el => el.classList.remove('selected'));
  const card = document.getElementById('civ-' + civName);
  if (card) card.classList.add('selected');
  document.getElementById('start-btn').disabled = false;
}

function startGame() {
  if (!_selectedCiv) return;
  document.getElementById('start-screen').style.display = 'none';
  _initGame(_selectedCiv);
}

// =============================================================================
//  INITIALIZATION
// =============================================================================

function _initGame(playerCiv) {
  const canvas = document.getElementById('game-canvas');
  game.canvas = canvas;

  // Size canvas to window
  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // --- Map ---
  game.map = new GameMap(MAP_SIZE, MAP_SIZE);
  game.map.init(Math.floor(Math.random() * 0x7fffffff));

  // --- Fog of War ---
  game.fog = new FogOfWar(MAP_SIZE, MAP_SIZE);

  // --- Players ---
  const aiCiv = (playerCiv === 'britons') ? 'franks' : 'britons';
  game.players = [
    {
      civ:       playerCiv,
      resources: { food: 200, wood: 200, gold: 0, stone: 0 },
      population: 0,
      popCap:     0,
      age:        0,
      agingUp:    false,
      ageUpTimer: 0,
    },
    {
      civ:       aiCiv,
      resources: { food: 200, wood: 200, gold: 0, stone: 0 },
      population: 0,
      popCap:     0,
      age:        0,
      agingUp:    false,
      ageUpTimer: 0,
    },
  ];

  // --- Audio (must be before entity placement so placeBuilding can call audio.play) ---
  game.audio = new AudioManager();

  // --- Spawn starting entities ---
  _spawnStartingEntities();

  // --- Core systems ---
  game.renderer = new Renderer(canvas);
  game.ui       = new UIManager();
  game.ai       = new AIController();

  // Input last (so all other game state exists first)
  game.input = new InputHandler(canvas);

  // Show HUD overlay
  game.ui.show();

  // State
  game.state = 'playing';
  game.time  = 0;

  // Center camera on player's town center
  const playerTC = _findFirstBuilding(0, 'town_center');
  if (playerTC) {
    game.centerCamera(playerTC.col + playerTC.size / 2, playerTC.row + playerTC.size / 2);
  }

  // Reveal player's starting area in fog
  const revCol = playerTC ? playerTC.col + 2 : 8;
  const revRow = playerTC ? playerTC.row + 2 : 8;
  game.fog.revealArea(revCol, revRow, 10);

  // --- Game loop ---
  let lastTime = performance.now();

  function loop(now) {
    if (game.state === 'won' || game.state === 'lost') return;

    const rawDt = (now - lastTime) / 1000;
    lastTime = now;
    const dt = Math.min(rawDt, 0.1); // cap to avoid spiral-of-death on tab switch

    _update(dt);
    _render(dt);

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
}

// =============================================================================
//  STARTING ENTITIES
// =============================================================================

function _spawnStartingEntities() {
  // Place player base in top-left quadrant, AI in bottom-right
  const half = Math.floor(MAP_SIZE / 2);

  const playerCol = 5;
  const playerRow = 5;
  const aiCol     = MAP_SIZE - 14;
  const aiRow     = MAP_SIZE - 14;

  // Clear terrain around bases so buildings can be placed
  game.map.clearArea(playerCol + 2, playerRow + 2, 8);
  game.map.clearArea(aiCol + 2,     aiRow + 2,     8);

  // Player town center (4x4)
  placeCompletedBuilding('town_center', playerCol, playerRow, 0);

  // AI town center (4x4)
  placeCompletedBuilding('town_center', aiCol, aiRow, 1);

  // Starting units — stagger them around the TC
  const pOff = [
    { c: 5, r: 1 }, { c: 5, r: 2 }, { c: 5, r: 3 }, { c: 7, r: 2 },
  ];
  const aOff = [
    { c: 5, r: 1 }, { c: 5, r: 2 }, { c: 5, r: 3 }, { c: 7, r: 2 },
  ];

  createUnit('villager', playerCol + pOff[0].c, playerRow + pOff[0].r, 0);
  createUnit('villager', playerCol + pOff[1].c, playerRow + pOff[1].r, 0);
  createUnit('villager', playerCol + pOff[2].c, playerRow + pOff[2].r, 0);
  createUnit('scout',    playerCol + pOff[3].c, playerRow + pOff[3].r, 0);

  createUnit('villager', aiCol + aOff[0].c, aiRow + aOff[0].r, 1);
  createUnit('villager', aiCol + aOff[1].c, aiRow + aOff[1].r, 1);
  createUnit('villager', aiCol + aOff[2].c, aiRow + aOff[2].r, 1);
  createUnit('scout',    aiCol + aOff[3].c, aiRow + aOff[3].r, 1);
}

// =============================================================================
//  UPDATE
// =============================================================================

function _update(dt) {
  game.time += dt;

  // Update all entities; collect the dead
  const dead = [];
  game.getAllEntities().forEach(e => {
    e.update(dt);
    if (e.dead) dead.push(e);
  });

  // Remove dead entities from the registry
  for (const e of dead) {
    game._entities.delete(e.id);
  }

  // Resolve projectile hits (after entity updates so targets still exist this frame)
  updateProjectiles(dt);

  // Fog of war
  game.fog.update();

  // AI tick
  if (game.ai) game.ai.update(dt);

  // Player age-up timer
  updateAgeUp(0, dt);

  // Camera scroll from keyboard / mouse edge
  if (game.input) game.input.update(dt);

  // HUD
  if (game.ui) game.ui.update(dt);
}

// =============================================================================
//  RENDER
// =============================================================================

function _render(dt) {
  game.renderer.render(dt);
}

// =============================================================================
//  HELPERS
// =============================================================================

function _findFirstBuilding(owner, type) {
  for (const e of game._entities.values()) {
    if (e.isBuilding && e.owner === owner && e.type === type) return e;
  }
  return null;
}
