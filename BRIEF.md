# Mini Age of Empires - Web Edition

Build a playable mini real-time strategy game inspired by Age of Empires II, running entirely in the browser using HTML5 Canvas + vanilla JavaScript (no frameworks).

## Tech
- Single HTML file + JS + CSS (or small number of files)
- HTML5 Canvas for rendering (isometric 2D view)
- No external dependencies, no build step — just open index.html
- Procedural graphics (draw everything with canvas primitives — colored shapes, simple sprites)

## Core Mechanics

### Map
- Isometric tile-based map (64x64 or smaller)
- Terrain types: grass, water, forest (trees = wood), gold mines, stone mines, farm plots
- Fog of war (unexplored = black, explored but not visible = dimmed, visible = full)
- Minimap in corner

### Resources (4 types, like AoE2)
- **Food** — from foraging bushes, farms, fishing
- **Wood** — from chopping trees
- **Gold** — from gold mines
- **Stone** — from stone mines
- Display resource counts in top bar

### 2 Civilizations

**Britons:**
- Bonus: Shepherds work 25% faster, Town Centers cost -50% wood
- Unique unit: Longbowman (archer with +2 range)
- Team bonus: Archery ranges work 20% faster

**Franks:**
- Bonus: Cavalry +20% HP, farm upgrades free
- Unique unit: Throwing Axeman (infantry with ranged attack)
- Team bonus: Knights +2 line of sight

### Ages (simplified to 3)
1. **Dark Age** — basic buildings + villagers
2. **Feudal Age** — military buildings, basic military units
3. **Castle Age** — advanced units, unique units, siege

Advancing costs resources and takes time.

### Buildings

| Building | Age | Function |
|----------|-----|----------|
| Town Center | Dark | Produce villagers, age up, drop-off point |
| House | Dark | +5 population cap |
| Mill | Dark | Food drop-off, research farm upgrades |
| Lumber Camp | Dark | Wood drop-off |
| Mining Camp | Dark | Gold/Stone drop-off |
| Farm | Dark | Infinite slow food source (worked by villager) |
| Barracks | Feudal | Train infantry (Militia → Man-at-Arms) |
| Archery Range | Feudal | Train archers (Archer → Crossbowman) |
| Stable | Feudal | Train cavalry (Scout → Knight) |
| Castle | Castle | Train unique unit, research upgrades |
| Siege Workshop | Castle | Train siege (Battering Ram, Mangonel) |
| Wall / Gate | Feudal | Defensive structure |
| Tower | Feudal | Shoots arrows at enemies |

### Units

**Villager:**
- Can gather any resource, build, repair
- Weak in combat but can fight

**Military (Feudal):**
- Militia / Man-at-Arms (infantry, melee)
- Archer / Crossbowman (ranged)
- Scout Cavalry / Knight (fast, melee)

**Military (Castle):**
- Unique units (Longbowman / Throwing Axeman)
- Battering Ram (anti-building, slow)
- Mangonel (area damage, ranged)

### Combat
- Units have HP, attack, armor (melee + pierce), range, attack speed
- Rock-paper-scissors: Infantry > Cavalry bonus vs buildings, Cavalry > Archers, Archers > Infantry (loosely)
- Units auto-attack nearby enemies
- Attack-move command
- Garrison units in buildings for protection

### AI Opponent
- Simple but functional AI:
  - Gathers resources with villagers
  - Builds economy buildings
  - Ages up
  - Builds military buildings and trains army
  - Attacks player periodically (every few minutes, escalating)
  - Defends own base when attacked
- Difficulty: just one level, moderately challenging

### Controls
- **Left click** — select unit/building
- **Right click** — move/attack/gather (context-sensitive)
- **Drag select** — box select multiple units
- **Shift+click** — add to selection
- **Ctrl+number** — assign control group
- **Number key** — recall control group
- Keyboard shortcuts for buildings and units (displayed in UI)

### UI Layout
- **Top bar**: Resources (food/wood/gold/stone), population (current/max), age
- **Minimap**: Bottom-left corner, clickable to move camera
- **Selection panel**: Bottom-center, shows selected unit(s)/building info
- **Command panel**: Bottom-right, shows available actions (build, train, research)
- **Idle villager button**: Click to cycle through idle villagers

### Visual Style
- Isometric tiles (diamond shape)
- Buildings: colored geometric shapes with distinct silhouettes
- Units: small colored circles/shapes with team color, slightly different per unit type
- Trees: green triangles/circles
- Gold: yellow rocks
- Stone: gray rocks
- Water: blue animated tiles
- Player = blue team color, AI = red team color
- Health bars above damaged units/buildings

### Game Flow
1. Start screen: Choose civilization (Britons or Franks)
2. Generate random map with starting positions
3. Each player starts with: 1 Town Center, 3 Villagers, 1 Scout
4. Play until one player's buildings are all destroyed (or surrender)
5. Win/Lose screen with stats (units killed, resources gathered, time)

## Architecture
```
index.html          — entry point
css/style.css       — UI styling
js/
  main.js           — game loop, initialization
  renderer.js       — isometric canvas rendering, camera, minimap
  map.js            — tile map generation, pathfinding (A*)
  entity.js         — base entity class (units + buildings)
  units.js          — unit types, stats, behaviors
  buildings.js      — building types, stats, training queues
  resources.js      — resource management
  combat.js         — damage calculation, attack logic
  ai.js             — AI opponent logic
  input.js          — mouse/keyboard handling, selection
  ui.js             — HUD rendering (top bar, panels, minimap)
  fog.js            — fog of war
  civilizations.js  — civ bonuses and unique units
  pathfinding.js    — A* pathfinding on tile grid
  audio.js          — simple sound effects (optional, Web Audio API)
```

## Important Notes
- MUST be playable end-to-end: start game → gather → build → train → fight → win/lose
- Performance matters: 60fps with reasonable unit counts (up to ~100 units total)
- Pathfinding must work (A* with collision avoidance)
- The AI must actually play the game (not just sit there)
- Start simple, make it work, then polish
- NO external assets — everything is drawn with canvas
- Game should be FUN even if visually simple
