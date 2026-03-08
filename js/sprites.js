'use strict';

// SPRITES: preloaded building images keyed by building type
const SPRITES = {};

(function() {
  const SPRITE_TYPES = [
    'town_center', 'barracks', 'archery_range', 'stable', 'siege_workshop', 'castle',
    'house', 'mill', 'lumber_camp', 'mining_camp', 'market', 'monastery',
    'tower', 'dock', 'palisade_wall', 'gate', 'outpost',
  ];

  for (const type of SPRITE_TYPES) {
    const img = new Image();
    img.onload = function() {
      SPRITES[type] = img;
      console.log(`[sprites] loaded: ${type}`);
    };
    img.onerror = function() {
      console.warn(`[sprites] failed to load: ${type}`);
    };
    img.src = `static/sprites/${type}.png`;
  }
})();
