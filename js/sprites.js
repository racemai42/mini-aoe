// Sprite loader for AoE2 building and unit PNGs
const SPRITES = {};
const UNIT_SPRITES = {};
const UNIT_WALK_SPRITES = {};  // [type][direction][frameIdx] = Image
const WORK_SPRITES = {};       // [workType][frameIdx] = Image

(function() {
  const buildings = [
    'town_center', 'barracks', 'archery_range', 'stable', 'siege_workshop', 'castle',
    'house', 'mill', 'lumber_camp', 'mining_camp', 'market', 'monastery',
    'tower', 'dock', 'palisade_wall', 'gate', 'outpost', 'farm'
  ];

  buildings.forEach(type => {
    const img = new Image();
    img.onload = () => { SPRITES[type] = img; };
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
    img.src = `static/sprites/unit_${type}.png`;
  });

  // Walk sprites: 8 directions × 8 frames per direction
  const WALK_FRAME_COUNT = 8;
  const WALK_DIR_COUNT = 8;
  const walkUnits = [
    'villager', 'militia', 'man_at_arms', 'spearman', 'pikeman', 'champion',
    'archer', 'crossbowman', 'longbowman', 'skirmisher', 'arbalester',
    'scout', 'knight', 'light_cavalry', 'cavalry_archer', 'camel_rider', 'paladin',
    'bombard_cannon', 'monk', 'throwing_axeman'
  ];

  walkUnits.forEach(type => {
    UNIT_WALK_SPRITES[type] = {};
    for (let d = 0; d < WALK_DIR_COUNT; d++) {
      UNIT_WALK_SPRITES[type][d] = [];
      for (let f = 0; f < WALK_FRAME_COUNT; f++) {
        const img = new Image();
        img.onload = ((dd, ff) => () => {
          UNIT_WALK_SPRITES[type][dd][ff] = img;
        })(d, f);
        img.src = `static/sprites/walk_${type}_d${d}_${f}.png`;
      }
    }
  });

  // Work sprites for villagers: 8 frames each
  const WORK_FRAME_COUNT = 8;
  const workTypes = ['woodcutter', 'mine', 'farm', 'build', 'forage'];

  workTypes.forEach(wt => {
    WORK_SPRITES[wt] = [];
    for (let f = 0; f < WORK_FRAME_COUNT; f++) {
      const img = new Image();
      img.onload = ((ff) => () => {
        WORK_SPRITES[wt][ff] = img;
      })(f);
      img.src = `static/sprites/work_${wt}_${f}.png`;
    }
  });
})();

// Helper: get direction index (0-7) from movement delta
// 0=S, 1=SW, 2=W, 3=NW, 4=N, 5=SE, 6=E, 7=NE
function getSpriteDirection(dx, dy) {
  // In isometric: positive dcol = SE, positive drow = SW
  // dx/dy here are in col/row space
  const angle = Math.atan2(dy, dx); // radians
  // Convert to 8 directions
  // atan2 returns: right=0, down=π/2, left=±π, up=-π/2
  // Map to AoE directions:
  // E(6)=0, SE(5)=π/4, S(0)=π/2, SW(1)=3π/4, W(2)=π, NW(3)=-3π/4, N(4)=-π/2, NE(7)=-π/4
  const deg = ((angle * 180 / Math.PI) + 360) % 360;
  // 0=E, 45=SE, 90=S, 135=SW, 180=W, 225=NW, 270=N, 315=NE
  const dirMap = [6, 5, 0, 1, 2, 3, 4, 7]; // maps 0-7 octants to sprite dirs
  const octant = Math.round(deg / 45) % 8;
  return dirMap[octant];
}
