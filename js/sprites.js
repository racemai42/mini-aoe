// Sprite loader for AoE2 building and unit PNGs
const SPRITES = {};
const UNIT_SPRITES = {};

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
})();
