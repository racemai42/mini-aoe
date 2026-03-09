// Sprite loader for AoE2 building and unit PNGs
const SPRITES = {};
const UNIT_SPRITES = {};
const UNIT_WALK_SPRITES = {};

(function() {
  const buildings = [
    'town_center', 'barracks', 'archery_range', 'stable', 'siege_workshop', 'castle',
    'house', 'mill', 'lumber_camp', 'mining_camp', 'market', 'monastery',
    'tower', 'dock', 'palisade_wall', 'gate', 'outpost', 'farm'
  ];

  buildings.forEach(type => {
    const img = new Image();
    img.onload = () => { SPRITES[type] = img; };
    img.onerror = () => { console.warn(`[SPRITES] Failed to load building: ${type}`); };
    img.src = `static/sprites/${type}.png`;
  });

  const units = [
    'villager', 'militia', 'man_at_arms', 'spearman', 'pikeman', 'champion',
    'archer', 'crossbowman', 'longbowman', 'skirmisher', 'arbalester',
    'scout', 'knight', 'light_cavalry', 'cavalry_archer', 'camel_rider', 'paladin',
    'battering_ram', 'mangonel', 'scorpion', 'trebuchet', 'bombard_cannon',
    'monk', 'throwing_axeman'
  ];

  units.forEach(type => {
    const img = new Image();
    img.onload = () => { UNIT_SPRITES[type] = img; };
    img.onerror = () => { console.warn(`[SPRITES] Failed to load unit: ${type}`); };
    img.src = `static/sprites/unit_${type}.png`;
  });
  // Walk animation frames (10 frames per unit)
  const WALK_FRAME_COUNT = 10;
  const walkUnits = [
    'villager', 'militia', 'man_at_arms', 'spearman', 'pikeman', 'champion',
    'archer', 'crossbowman', 'longbowman', 'skirmisher', 'arbalester',
    'scout', 'knight', 'light_cavalry', 'cavalry_archer', 'camel_rider', 'paladin',
    'bombard_cannon', 'monk', 'throwing_axeman'
  ];

  walkUnits.forEach(type => {
    UNIT_WALK_SPRITES[type] = [];
    for (let i = 0; i < WALK_FRAME_COUNT; i++) {
      const img = new Image();
      img.onload = () => { UNIT_WALK_SPRITES[type][i] = img; };
      img.src = `static/sprites/walk_${type}_${i}.png`;
    }
  });
})();
