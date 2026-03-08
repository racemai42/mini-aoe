'use strict';

class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;

    // Mouse state
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.dragStart = null;
    this.dragBox = null;
    this.isDragging = false;
    this.DRAG_THRESHOLD = 6;

    // Keyboard state
    this.keys = {};

    // Build mode
    this.buildMode = null; // { type } or null

    // Control groups
    this.controlGroups = {};

    // Last selected idle villager ID
    this._lastIdleVillager = null;

    this._attach();
  }

  _attach() {
    const c = this.canvas;
    c.addEventListener('mousedown', e => this._onMouseDown(e));
    c.addEventListener('mousemove', e => this._onMouseMove(e));
    c.addEventListener('mouseup', e => this._onMouseUp(e));
    c.addEventListener('contextmenu', e => { e.preventDefault(); this._onRightClick(e); });
    c.addEventListener('wheel', e => this._onWheel(e));

    window.addEventListener('keydown', e => this._onKeyDown(e));
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });

    // Idle villager button
    const ivb = document.getElementById('idle-villager-btn');
    if (ivb) ivb.addEventListener('click', () => this._selectNextIdleVillager());

    // Minimap click
    const mm = document.getElementById('minimap-canvas');
    if (mm) mm.addEventListener('click', e => this._onMinimapClick(e));
  }

  _onMouseDown(e) {
    if (e.button !== 0) return;
    this.mouseDown = true;
    this.dragStart = { x: e.clientX, y: e.clientY };
    this.isDragging = false;
  }

  _onMouseMove(e) {
    this.mouseX = e.clientX;
    this.mouseY = e.clientY;

    if (this.mouseDown && this.dragStart) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      if (Math.sqrt(dx*dx + dy*dy) > this.DRAG_THRESHOLD) {
        this.isDragging = true;
        this.dragBox = {
          x1: Math.min(this.dragStart.x, e.clientX),
          y1: Math.min(this.dragStart.y, e.clientY),
          x2: Math.max(this.dragStart.x, e.clientX),
          y2: Math.max(this.dragStart.y, e.clientY),
        };
      }
    }
  }

  _onMouseUp(e) {
    if (e.button !== 0) return;
    this.mouseDown = false;

    if (this.buildMode) {
      // Place building
      const worldPos = this._screenToWorld(e.clientX, e.clientY);
      this._tryPlaceBuilding(worldPos);
      if (!e.shiftKey) this.buildMode = null;
      return;
    }

    if (this.isDragging && this.dragBox) {
      // Box select
      this._boxSelect(this.dragBox, e.shiftKey);
    } else {
      // Single click select
      this._clickSelect(e.clientX, e.clientY, e.shiftKey);
    }

    this.isDragging = false;
    this.dragBox = null;
    this.dragStart = null;
  }

  _onRightClick(e) {
    e.preventDefault();
    this.buildMode = null;

    const worldPos = this._screenToWorld(e.clientX, e.clientY);
    if (!worldPos) return;

    const col = Math.round(worldPos.col);
    const row = Math.round(worldPos.row);

    const selection = game.selection;
    if (selection.length === 0) return;

    // Determine right-click action based on target
    const clickedEntity = this._getEntityAt(e.clientX, e.clientY);

    for (const id of selection) {
      const entity = game.getEntity(id);
      if (!entity || entity.dead) continue;

      if (!entity.isUnit) continue;
      const unit = entity;

      if (clickedEntity) {
        if (clickedEntity.owner !== 0) {
          // Enemy — attack
          if (unit.stats.attack > 0) {
            unit.commandAttack(clickedEntity.id);
          }
        } else if (clickedEntity.isBuilding) {
          const bldg = clickedEntity;
          if (!bldg.complete && unit.stats.canBuild) {
            // Help construct
            unit.commandBuild(bldg.id);
          } else if (bldg.hp < bldg.maxHp && unit.stats.canBuild) {
            // Repair
            unit.commandRepair(bldg.id);
          } else if (bldg.type === 'farm' && unit.type === 'villager') {
            // Farm
            unit.commandFarm(bldg.id);
          } else {
            // Set rally point (for buildings)
            // or just move
            unit.commandMove(col, row);
          }
        }
      } else {
        // Click on terrain/resource
        const res = game.map.getResource(col, row);
        if (res && unit.type === 'villager') {
          unit.commandGather(col, row);
        } else {
          // Move command
          // Stagger positions for multiple units
          const idx = selection.indexOf(id);
          const offset = this._formationOffset(idx, selection.length);
          unit.commandMove(col + offset.col, row + offset.row);
        }
      }
    }

    game.audio.play('command');
  }

  _onWheel(e) {
    // Camera zoom (not implemented, but consume event)
    e.preventDefault();
  }

  _onKeyDown(e) {
    this.keys[e.code] = true;

    // Escape — cancel build mode, deselect
    if (e.code === 'Escape') {
      this.buildMode = null;
      if (!e.shiftKey) game.clearSelection();
      return;
    }

    // Stop selected units
    if (e.code === 'KeyS') {
      game.selection.forEach(id => {
        const e = game.getEntity(id);
        if (e && e.isUnit) e.commandStop();
      });
      return;
    }

    // Delete (destroy selected)
    if (e.code === 'Delete') {
      // Cancel any queued training
      game.selection.forEach(id => {
        const b = game.getEntity(id);
        if (b && b.isBuilding && b.trainingQueue.length > 0) {
          b.cancelTraining(0);
        }
      });
      return;
    }

    // Idle villager cycle
    if (e.code === 'Period') {
      this._selectNextIdleVillager();
      return;
    }

    // Control groups
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code[5]);
      if (!isNaN(n)) {
        if (e.ctrlKey) {
          // Assign control group
          this.controlGroups[n] = [...game.selection];
          e.preventDefault();
        } else {
          // Recall control group
          const group = this.controlGroups[n];
          if (group && group.length > 0) {
            const alive = group.filter(id => {
              const ent = game.getEntity(id);
              return ent && !ent.dead;
            });
            if (alive.length > 0) {
              game.selection = alive;
              game.ui.updateSelectionPanel();
              // Center camera on first unit
              const first = game.getEntity(alive[0]);
              if (first) game.centerCamera(first.col, first.row);
            }
          }
        }
      }
      return;
    }

    // Camera shortcuts handled in main update
  }

  update(dt) {
    this._updateCamera(dt);
    this._updateCursor();
  }

  _updateCursor() {
    // Change cursor based on what's under the mouse with current selection
    const canvas = this.canvas;
    
    if (this.buildMode) {
      canvas.style.cursor = 'crosshair';
      return;
    }

    const sel = game.selection;
    if (sel.length === 0) {
      canvas.style.cursor = 'default';
      return;
    }

    // Check what unit types are selected
    const firstEntity = game.getEntity(sel[0]);
    if (!firstEntity || firstEntity.dead) {
      canvas.style.cursor = 'default';
      return;
    }

    const hoveredEntity = this._getEntityAt(this.mouseX, this.mouseY);
    const worldPos = this._screenToWorld(this.mouseX, this.mouseY);

    if (firstEntity.isUnit) {
      const isVillager = firstEntity.type === 'villager';
      
      if (hoveredEntity) {
        if (hoveredEntity.owner !== firstEntity.owner) {
          // Enemy — attack cursor
          canvas.style.cursor = 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'><text y=\'20\' font-size=\'20\'>⚔️</text></svg>") 12 12, crosshair';
          return;
        }
        if (hoveredEntity.isBuilding) {
          const bldg = hoveredEntity;
          if (!bldg.complete && isVillager) {
            // Build cursor
            canvas.style.cursor = 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'><text y=\'20\' font-size=\'20\'>🔨</text></svg>") 12 12, pointer';
            return;
          }
          if (bldg.type === 'farm' && isVillager) {
            canvas.style.cursor = 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'><text y=\'20\' font-size=\'20\'>🌾</text></svg>") 12 12, pointer';
            return;
          }
        }
      }
      
      // Check terrain for villager gather cursors
      if (isVillager && worldPos) {
        const col = Math.round(worldPos.col);
        const row = Math.round(worldPos.row);
        const res = game.map.getResource(col, row);
        if (res) {
          const cursorMap = {
            food: 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'><text y=\'20\' font-size=\'20\'>🍖</text></svg>") 12 12, pointer',
            wood: 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'><text y=\'20\' font-size=\'20\'>🪓</text></svg>") 12 12, pointer',
            gold: 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'><text y=\'20\' font-size=\'20\'>⛏️</text></svg>") 12 12, pointer',
            stone: 'url("data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\'><text y=\'20\' font-size=\'20\'>⛏️</text></svg>") 12 12, pointer',
          };
          canvas.style.cursor = cursorMap[res.type] || 'pointer';
          return;
        }
      }
      
      // Default for units — move cursor
      canvas.style.cursor = 'default';
    } else {
      canvas.style.cursor = 'default';
    }
  }

  _updateCamera(dt) {
    const speed = 15 * dt; // tiles per second
    const cam = game.camera;
    const map = game.map;

    const SCROLL_MARGIN = 10;
    const W = game.canvas.width, H = game.canvas.height;

    let dx = 0, dy = 0;

    // Check if mouse is over a UI element — don't edge-scroll if so
    const overUI = this._isMouseOverUI();

    if (this.keys['KeyW'] || this.keys['ArrowUp'] || (!overUI && this.mouseY < SCROLL_MARGIN)) dy -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown'] || (!overUI && this.mouseY > H - SCROLL_MARGIN - 180)) dy += 1;
    if (this.keys['KeyA'] || this.keys['ArrowLeft'] || (!overUI && this.mouseX < SCROLL_MARGIN)) dx -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight'] || (!overUI && this.mouseX > W - SCROLL_MARGIN)) dx += 1;

    // Convert to world pixel movement
    const pxPerTile = TILE_W;
    cam.x += dx * pxPerTile * speed;
    cam.y += dy * (TILE_H / 2) * speed * 2;

    // Clamp camera
    const maxX = (map.width + map.height) * (TILE_W / 2) / 2;
    const maxY = (map.width + map.height) * (TILE_H / 2) / 2;
    cam.x = Math.max(-maxX / 2, Math.min(maxX, cam.x));
    cam.y = Math.max(-maxY / 2, Math.min(maxY, cam.y));
  }

  // ===== SELECTION =====

  _clickSelect(sx, sy, addToSelection) {
    const entity = this._getEntityAt(sx, sy);

    if (!entity) {
      if (!addToSelection) game.clearSelection();
      return;
    }

    if (addToSelection) {
      const idx = game.selection.indexOf(entity.id);
      if (idx >= 0) {
        game.selection.splice(idx, 1);
      } else {
        game.selection.push(entity.id);
      }
    } else {
      game.selection = [entity.id];
    }

    game.ui.updateSelectionPanel();
  }

  _boxSelect(box, addToSelection) {
    const { x1, y1, x2, y2 } = box;

    const newSelected = [];
    game.getAllEntities().forEach(e => {
      if (e.dead) return;
      // Player units only (or any?)
      if (e.owner !== 0) return;
      const sp = e.screenPos(game.camera.x, game.camera.y, game.canvas.width, game.canvas.height);
      if (sp.x >= x1 && sp.x <= x2 && sp.y >= y1 && sp.y <= y2) {
        newSelected.push(e.id);
      }
    });

    // Prefer units over buildings in box select
    const units = newSelected.filter(id => {
      const e = game.getEntity(id);
      return e && e.isUnit;
    });

    const toSelect = units.length > 0 ? units : newSelected;

    if (addToSelection) {
      game.selection = [...new Set([...game.selection, ...toSelect])];
    } else {
      game.selection = toSelect;
    }

    game.ui.updateSelectionPanel();
  }

  _getEntityAt(sx, sy) {
    // Find entity whose screen position is nearest to click
    let best = null, bestDist = Infinity;

    game.getAllEntities().forEach(e => {
      if (e.dead) return;
      // Only player-visible entities or player entities
      if (e.owner !== 0 && !game.fog.isVisible(e.tileCol, e.tileRow)) return;

      if (e.isBuilding) {
        // Buildings: check if click is inside the full isometric diamond footprint
        // including the wall height above it
        const cam = game.camera;
        const W = game.canvas.width, H = game.canvas.height;
        const map = game.map;
        
        // Get the 4 corners of the footprint on screen
        const top    = map.toScreen(e.col,          e.row,          cam.x, cam.y, W, H);
        const right  = map.toScreen(e.col + e.size, e.row,          cam.x, cam.y, W, H);
        const bottom = map.toScreen(e.col + e.size, e.row + e.size, cam.x, cam.y, W, H);
        const left   = map.toScreen(e.col,          e.row + e.size, cam.x, cam.y, W, H);
        
        const wallH = e.size * 18; // wall height in pixels (matches renderer)
        
        // Build a polygon: the roof diamond (shifted up by wallH) + the two visible side walls down to the base
        // Simplified: check if point is inside the bounding polygon
        // Polygon: top-wallH → right-wallH → right → bottom → left → left-wallH
        const poly = [
          { x: top.x,    y: top.y - wallH },
          { x: right.x,  y: right.y - wallH },
          { x: right.x,  y: right.y },
          { x: bottom.x, y: bottom.y },
          { x: left.x,   y: left.y },
          { x: left.x,   y: left.y - wallH },
        ];
        
        if (this._pointInPolygon(sx, sy, poly)) {
          // Use distance to center for priority (closer buildings win)
          const cx = (top.x + bottom.x) / 2;
          const cy = (top.y + bottom.y) / 2 - wallH / 2;
          const d = Math.sqrt((cx - sx)**2 + (cy - sy)**2);
          if (d < bestDist) {
            bestDist = d;
            best = e;
          }
        }
      } else {
        const sp = e.screenPos(game.camera.x, game.camera.y, game.canvas.width, game.canvas.height);
        const threshold = 16;
        const d = Math.sqrt((sp.x - sx)**2 + (sp.y - sy)**2);
        if (d < threshold && d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
    });

    return best;
  }

  _screenToWorld(sx, sy) {
    return game.map.fromScreen(sx, sy, game.camera.x, game.camera.y, game.canvas.width, game.canvas.height);
  }

  // ===== BUILD MODE =====

  setBuildMode(type) {
    this.buildMode = { type };
  }

  _tryPlaceBuilding(worldPos) {
    if (!worldPos) return;
    const col = Math.floor(worldPos.col);
    const row = Math.floor(worldPos.row);
    const type = this.buildMode.type;

    if (!canPlaceBuilding(type, col, row, 0)) {
      game.audio.play('error');
      return;
    }

    const building = placeBuilding(type, col, row, 0);
    if (building) {
      // Assign selected villagers to build it
      game.selection.forEach(id => {
        const e = game.getEntity(id);
        if (e && e.isUnit && e.type === 'villager') {
          e.commandBuild(building.id);
        }
      });
    }
  }

  getBuildGhostPos() {
    if (!this.buildMode) return null;
    const worldPos = this._screenToWorld(this.mouseX, this.mouseY);
    if (!worldPos) return null;
    return { col: Math.floor(worldPos.col), row: Math.floor(worldPos.row) };
  }

  // ===== MINIMAP =====

  _onMinimapClick(e) {
    const mm = document.getElementById('minimap-canvas');
    const rect = mm.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const scale = MAP_SIZE / 150;
    const worldCol = mx * scale;
    const worldRow = my * scale;

    // Center camera on this world position
    game.centerCamera(worldCol, worldRow);
  }

  // ===== HELPERS =====

  _pointInPolygon(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  _isMouseOverUI() {
    // Check if mouse is hovering over any UI overlay element
    const el = document.elementFromPoint(this.mouseX, this.mouseY);
    if (!el) return false;
    // If the element is the canvas, we're not over UI
    if (el === this.canvas) return false;
    // Check if it's inside the UI overlay or any HUD element
    const ui = document.getElementById('ui-overlay');
    if (ui && ui.contains(el)) return true;
    return false;
  }

  _formationOffset(idx, total) {
    if (total === 1) return { col: 0, row: 0 };
    const cols = Math.ceil(Math.sqrt(total));
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    return { col: c - Math.floor(cols / 2), row: r };
  }

  _selectNextIdleVillager() {
    const v = getNextIdleVillager(0, this._lastIdleVillager);
    if (v) {
      this._lastIdleVillager = v.id;
      game.selection = [v.id];
      game.centerCamera(v.col, v.row);
      game.ui.updateSelectionPanel();
    }
  }

  getBuildGhostValid() {
    if (!this.buildMode) return false;
    const pos = this.getBuildGhostPos();
    if (!pos) return false;
    return canPlaceBuilding(this.buildMode.type, pos.col, pos.row, 0);
  }
}
