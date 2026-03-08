'use strict';

// Resource helpers

function canAfford(owner, cost) {
  const res = game.players[owner].resources;
  for (const [type, amount] of Object.entries(cost)) {
    if ((res[type] || 0) < amount) return false;
  }
  return true;
}

function deductCost(owner, cost) {
  const res = game.players[owner].resources;
  for (const [type, amount] of Object.entries(cost)) {
    res[type] = (res[type] || 0) - amount;
  }
}

function getAgeUpCost(currentAge) {
  const nextAge = currentAge + 1;
  if (nextAge >= AGE_DEFS.length) return null;
  return AGE_DEFS[nextAge].advanceCost;
}

function startAgeUp(owner) {
  const player = game.players[owner];
  const nextAge = player.age + 1;
  if (nextAge >= AGE_DEFS.length) return false;

  const cost = AGE_DEFS[nextAge].advanceCost;
  if (!cost) return false;
  if (!canAfford(owner, cost)) return false;
  if (player.agingUp) return false;

  deductCost(owner, cost);
  player.agingUp = true;
  player.ageUpTimer = AGE_DEFS[nextAge].advanceTime;
  return true;
}

function updateAgeUp(owner, dt) {
  const player = game.players[owner];
  if (!player.agingUp) return;

  player.ageUpTimer -= dt;
  if (player.ageUpTimer <= 0) {
    player.age++;
    player.agingUp = false;
    player.ageUpTimer = 0;

    const ageName = AGE_DEFS[player.age].name;
    game.ui.showMessage(`You have advanced to ${ageName}!`, owner === 0 ? '#ffd700' : '#ff6644');
    game.audio.play('age_up');
  }
}

// Find nearest drop-off building for a resource type
// Returns building entity or null
function findNearestDropOff(owner, resType, col, row) {
  let best = null, bestDist = Infinity;
  game.getAllEntities().forEach(e => {
    if (!e.isBuilding || e.dead || !e.complete || e.owner !== owner) return;
    const dropOffTypes = e.def.dropOff;
    if (!dropOffTypes || !dropOffTypes.includes(resType)) return;
    const d = e.distTo(col, row);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  });
  return best;
}

// Count idle villagers for a player
function countIdleVillagers(owner) {
  let count = 0;
  game.getAllEntities().forEach(e => {
    if (e.isUnit && e.owner === owner && e.type === 'villager' && e.isIdle()) count++;
  });
  return count;
}

// Get next idle villager
function getNextIdleVillager(owner, afterId) {
  const villagers = [];
  game.getAllEntities().forEach(e => {
    if (e.isUnit && e.owner === owner && e.type === 'villager' && e.isIdle()) {
      villagers.push(e);
    }
  });
  if (villagers.length === 0) return null;
  if (afterId === null || afterId === undefined) return villagers[0];
  const idx = villagers.findIndex(v => v.id === afterId);
  return villagers[(idx + 1) % villagers.length];
}
