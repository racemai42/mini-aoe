// Sprite loader for AoE2 building PNGs
const SPRITES = {};
const SPRITES_LOADED = {};

(function() {
  const buildings = [
    'town_center', 'barracks', 'archery_range', 'stable', 'siege_workshop', 'castle',
    'house', 'mill', 'lumber_camp', 'mining_camp', 'market', 'monastery',
    'tower', 'dock', 'palisade_wall', 'gate', 'outpost'
  ];

  buildings.forEach(type => {
    const img = new Image();
    img.onload = () => {
      SPRITES[type] = img;
      SPRITES_LOADED[type] = true;
    };
    img.onerror = () => {
      console.warn(`[SPRITES] Failed to load: ${type}`);
    };
    img.src = `static/sprites/${type}.png`;
  });
})();
