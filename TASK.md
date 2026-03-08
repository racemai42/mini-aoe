# Task: Mini AoE Improvements

## 1. Mute all sounds by default
In `js/audio.js`, set `this._muted = true` in the constructor.

## 2. Fix building selection (Town Hall click bug)
In `js/input.js`, method `_getEntityAt()`:
- For buildings, the `screenPos()` returns the top-left corner position, NOT the center
- Fix: use `e.centerCol` and `e.centerRow` for buildings to compute screen position
- Change the building click threshold to account for the full isometric footprint
- Replace the simple distance check with a proper bounds check using the building's isometric diamond

Here's the fix approach:
```js
// In _getEntityAt, for buildings:
const sp = e.isBuilding 
  ? game.map.toScreen(e.centerCol, e.centerRow, game.camera.x, game.camera.y, game.canvas.width, game.canvas.height)
  : e.screenPos(game.camera.x, game.camera.y, game.canvas.width, game.canvas.height);
// And increase the threshold for buildings based on size * TILE_W/2
let threshold = e.isBuilding ? e.size * TILE_W / 2 : 16;
```

## 3. Add missing AoE2 units and buildings

### Missing Units to add (Age of Empires II style):

In UNIT_DEFS (js/civilizations.js), add:

- **Spearman** (Barracks, Feudal Age) — anti-cavalry infantry
  - hp:45, attack:3, meleeArmor:0, pierceArmor:0, range:1, speed:1.0, attackSpeed:3.0, los:4
  - cost: {food:35, wood:25}, trainTime:22, age:1
  - Bonus: vsCavalryBonus: 15 (new stat)
  - shape: 'square', color: '#dd5533'

- **Pikeman** (Barracks, Castle Age) — upgraded spearman
  - hp:55, attack:4, meleeArmor:0, pierceArmor:0, range:1, speed:1.0, attackSpeed:3.0, los:4
  - cost: {food:35, wood:25}, trainTime:22, age:2, upgradesFrom:'spearman'
  - vsCavalryBonus: 22
  - shape: 'square', color: '#cc4422'

- **Skirmisher** (Archery Range, Feudal Age) — anti-archer ranged
  - hp:30, attack:2, meleeArmor:0, pierceArmor:3, range:4, speed:1.2, attackSpeed:3.0, los:6
  - cost: {food:25, wood:35}, trainTime:22, age:1
  - projectile:true, vsArcherBonus: 3 (new stat)
  - shape: 'diamond', color: '#88bb44'

- **Cavalry Archer** (Archery Range, Castle Age) — mounted ranged
  - hp:50, attack:6, meleeArmor:0, pierceArmor:0, range:4, speed:1.8, attackSpeed:2.0, los:5
  - cost: {wood:40, gold:60}, trainTime:34, age:2
  - projectile:true
  - shape: 'horse', color: '#cc8800'

- **Light Cavalry** (Stable, Castle Age) — upgraded scout
  - hp:60, attack:7, meleeArmor:0, pierceArmor:2, range:1, speed:2.2, attackSpeed:2.0, los:8
  - cost: {food:80}, trainTime:30, age:2, upgradesFrom:'scout'
  - shape: 'horse', color: '#33ccff'

- **Camel Rider** (Stable, Castle Age) — anti-cavalry mounted
  - hp:100, attack:6, meleeArmor:0, pierceArmor:0, range:1, speed:1.8, attackSpeed:2.0, los:5
  - cost: {food:55, gold:60}, trainTime:22, age:2
  - vsCavalryBonus: 9
  - shape: 'horse', color: '#ddaa55'

- **Monk** (Monastery, Castle Age) — healer/converter
  - hp:30, attack:0, meleeArmor:0, pierceArmor:0, range:9, speed:0.7, attackSpeed:0, los:11
  - cost: {gold:100}, trainTime:51, age:2
  - canHeal:true, healRate: 1.5 (hp/s on friendly units in range 4)
  - shape: 'circle', color: '#ffdd88'

- **Scorpion** (Siege Workshop, Castle Age) — anti-unit siege
  - hp:40, attack:12, meleeArmor:0, pierceArmor:7, range:7, speed:0.5, attackSpeed:3.6, los:7
  - cost: {wood:75, gold:75}, trainTime:30, age:2
  - projectile:true, pierce:true (hits multiple units in line — simplify as small aoe:0.5)
  - shape: 'rect', color: '#775544'

- **Trebuchet** (Castle, Castle Age) — long-range anti-building siege
  - hp:150, attack:200, meleeArmor:2, pierceArmor:8, range:16, minRange:5, speed:0.3, attackSpeed:10.0, los:18
  - cost: {wood:200, gold:200}, trainTime:50, age:2
  - projectile:true, vsBuildingBonus:200, aoe:0.5
  - shape: 'rect', color: '#886644'

### Missing Buildings to add:

- **Monastery** (Castle Age) — trains Monks
  - hp:1500, size:3, cost:{wood:175}, buildTime:40, age:2
  - produces:['monk']
  - color:'#997799'

- **Market** (Feudal Age) — resource trading (simplified: allows converting resources)
  - hp:1200, size:3, cost:{wood:175}, buildTime:60, age:1
  - For now just acts as gold drop-off point
  - dropOff:['gold'], color:'#aa8855'

- **Dock** (Dark Age) — trains fishing ships (simplified: just a water drop-off)
  - hp:1800, size:3, cost:{wood:150}, buildTime:35, age:0
  - For now: acts as food drop-off near water
  - dropOff:['food'], color:'#557799'

- **Palisade Wall** (Dark Age) — cheap wood wall
  - hp:250, size:1, cost:{wood:2}, buildTime:6, age:0
  - color:'#886644'

- **Gate** (Feudal Age) — passable wall segment (simplify as strong wall)
  - hp:2500, size:1, cost:{stone:30}, buildTime:70, age:1
  - color:'#999999'

### Update existing building produces arrays:
- barracks: add 'spearman', 'pikeman'
- archery_range: add 'skirmisher', 'cavalry_archer'  
- stable: add 'light_cavalry', 'camel_rider'
- castle: add 'trebuchet'
- siege_workshop: add 'scorpion'

### Implement vsCavalryBonus and vsArcherBonus
In units.js `_performAttack()`, check if target is cavalry type (scout/knight/light_cavalry/camel_rider/cavalry_archer) and add vsCavalryBonus damage. Same for vsArcherBonus vs archer types.

### Implement Monk healing
In units.js, add a HEALING state. Monks with canHeal auto-heal nearby damaged friendly units when idle. Add `_updateHealing(dt)` that finds nearest damaged friendly unit in range 4 and heals healRate HP/s.

### Add unit rendering for new shapes
In renderer.js `_drawUnitShape()`, the existing shapes handle most cases. Add a 'camel' variant for camel_rider (similar to horse but different color).

### Update AI (ai.js)
Add the new units to the AI's training priorities so AI also builds the new units.

## 4. Add Imperial Age (Age 3)

Add a 4th age to AGE_DEFS:
```js
{
  name: 'Imperial Age',
  advanceCost: { food: 1000, gold: 800 },
  advanceTime: 190,
}
```

Add Imperial Age units (optional, just a few):
- **Champion** (Barracks) — hp:70, attack:13, meleeArmor:1, pierceArmor:1, age:3, cost:{food:60,gold:20}
- **Arbalester** (Archery Range) — hp:40, attack:6, range:7, age:3, cost:{wood:25,gold:45}, upgradesFrom:'crossbowman'
- **Paladin** (Stable) — hp:180, attack:14, meleeArmor:2, pierceArmor:3, age:3, cost:{food:60,gold:75}
- **Bombard Cannon** (Siege Workshop) — hp:80, attack:40, range:12, minRange:5, age:3, cost:{wood:225,gold:225}

Update `_ageName` in ui.js to include 'Imperial Age'.

## Important constraints
- Vanilla JS only, no npm, no build step
- Keep all existing code working
- Test that town hall selection works after the fix
- All new units should be trainable from their respective buildings
- Make sure the AI can also train the new units

When completely finished, run this command to notify me:
openclaw system event --text "Done: Mini AoE — muted sounds, fixed building selection, added AoE2 units/buildings/Imperial Age" --mode now
