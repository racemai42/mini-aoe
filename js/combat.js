'use strict';

// Combat utilities — calculations used by both units and buildings

function calcDamage(attack, armor) {
  return Math.max(1, attack - armor);
}

function getMeleeArmor(entity) {
  if (entity.isBuilding) return 0;
  return entity.stats?.meleeArmor || 0;
}

function getPierceArmor(entity) {
  if (entity.isBuilding) return entity.stats?.pierceArmor || 3;
  return entity.stats?.pierceArmor || 0;
}

function isRangedAttack(unit) {
  return unit.stats && unit.stats.range > 1.5;
}

// Rock-paper-scissors modifiers
function getCombatBonus(attacker, defender) {
  const at = attacker.type;
  const dt = defender.type;
  let bonus = 0;

  // Cavalry bonus vs archers
  if ((at === 'scout' || at === 'knight') && (dt === 'archer' || dt === 'crossbowman' || dt === 'longbowman')) {
    bonus += 2;
  }
  // Archers bonus vs infantry
  if ((at === 'archer' || at === 'crossbowman' || at === 'longbowman') &&
      (dt === 'militia' || dt === 'man_at_arms' || dt === 'throwing_axeman')) {
    bonus += 2;
  }
  // Infantry bonus vs cavalry
  if ((at === 'militia' || at === 'man_at_arms') && (dt === 'scout' || dt === 'knight')) {
    bonus += 1;
  }

  return bonus;
}

// Global projectiles (from buildings and standalone effects)
const globalProjectiles = [];

function addGlobalProjectile(proj) {
  globalProjectiles.push(proj);
}

function updateProjectiles(dt) {
  for (let i = globalProjectiles.length - 1; i >= 0; i--) {
    const p = globalProjectiles[i];
    p.progress += dt / p.duration;
    if (p.progress >= 1) {
      globalProjectiles.splice(i, 1);
    }
  }

  // Update unit projectiles
  game.getAllEntities().forEach(e => {
    if (e.isUnit && e.projectiles) {
      for (let i = e.projectiles.length - 1; i >= 0; i--) {
        const p = e.projectiles[i];
        if (p.progress >= 1 && !p.resolved) {
          p.resolved = true;
          e.resolveProjectile(p);
        }
      }
    }
  });
}
