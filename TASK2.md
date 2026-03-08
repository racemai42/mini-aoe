# Task: Replace building rendering with AoE2 sprites

## Context
Sprite PNGs are in `static/sprites/` with transparent backgrounds. Each building type has a corresponding PNG:
- town_center.png, barracks.png, archery_range.png, stable.png, siege_workshop.png, castle.png
- house.png, mill.png, lumber_camp.png, mining_camp.png, market.png, monastery.png
- tower.png, dock.png, palisade_wall.png, gate.png, outpost.png

## What to do

### 1. Create a sprite loader in `js/sprites.js`
- Preload all building sprite PNGs at game start
- Export a `SPRITES` object: `{ town_center: Image, barracks: Image, ... }`
- Each Image should be loaded before game starts rendering
- Add `<script src="js/sprites.js"></script>` to index.html BEFORE renderer.js

### 2. Modify `js/renderer.js` — `_drawBuilding()` and `_drawBuildingShape()`
- If `SPRITES[bldg.type]` exists and is loaded, draw the sprite image instead of the procedural Canvas drawing
- Use `ctx.drawImage()` positioned so the sprite's bottom-center aligns with the building's isometric footprint center
- Scale the sprite to fit the building's isometric footprint width (use `bldg.size * TILE_W` as target width, maintain aspect ratio)
- Keep the procedural drawing as fallback for buildings without sprites
- Keep the selection highlight, HP bar, construction progress — those should still draw ON TOP of the sprite
- Keep the team color overlay (semi-transparent colored diamond on the roof area)
- Remove the `_drawTownCenterDetailed()` method (no longer needed since we use sprites)

### 3. Sprite positioning
- The sprites are isometric renders. Their visual "ground" is at the bottom-center of the image
- Position: sprite bottom-center should align with `corners.bottom` (the front corner of the isometric diamond)
- Width: scale to `bldg.size * TILE_W` pixels
- This means for a size-4 building (town_center), width = 4 * 64 = 256px

### 4. Construction state
- When building is under construction (`!bldg.complete`), draw the sprite at reduced opacity (0.3 + 0.7 * constructionProgress)
- This gives a "ghostly" appearance during construction

### 5. Fog of war
- For FOG.EXPLORED buildings, draw sprite at 50% opacity (already handled by ctx.globalAlpha)

### 6. Farm special case
- Farm doesn't have a sprite (it's flat on the ground). Keep the existing procedural diamond drawing for farms.

## Important
- Do NOT modify the sprite files
- Do NOT break any existing game functionality
- Keep the building selection, HP bars, construction progress overlays working
- The `_drawBuildingDecoration()` method should still work as fallback for buildings without sprites
- Load sprites asynchronously — game should still work if sprites haven't loaded yet (fall back to procedural)

## When done
Run: `cd /tmp/mini-aoe && git add -A && git commit -m "feat: AoE2 building sprites" && git push`
