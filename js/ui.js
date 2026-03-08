'use strict';

class UIManager {
  constructor() {
    this._messageQueue = [];
    this._messageTimer = 0;

    this._ageName = ['Dark Age', 'Feudal Age', 'Castle Age', 'Imperial Age'];
    this._lastIdleVillagerCount = -1;
    this._lastSelection = [];

    // DOM refs
    this.elFood = document.getElementById('res-food');
    this.elWood = document.getElementById('res-wood');
    this.elGold = document.getElementById('res-gold');
    this.elStone = document.getElementById('res-stone');
    this.elAgeName = document.getElementById('age-name');
    this.elAgeUpBtn = document.getElementById('age-up-btn');
    this.elAgeProgress = document.getElementById('age-progress');
    this.elPopCurrent = document.getElementById('pop-current');
    this.elPopMax = document.getElementById('pop-max');
    this.elTimeDisplay = document.getElementById('time-display');
    this.elIdleVillagerBtn = document.getElementById('idle-villager-btn');
    this.elIdleCount = document.getElementById('idle-count');
    this.elSelectionInfo = document.getElementById('selection-info');
    this.elSelectionUnits = document.getElementById('selection-units');
    this.elCommands = document.getElementById('commands');
    this.elTooltip = document.getElementById('tooltip');
    this.elAgeProgress = document.getElementById('age-progress');

    this.minimapCanvas = document.getElementById('minimap-canvas');

    // Build submenu state
    this._buildSubMenu = null;
  }

  show() {
    document.getElementById('ui-overlay').style.display = 'block';
  }

  update(dt) {
    this._updateResourceBar();
    this._updateSelectionPanel();
    this._updateIdleVillagers();
    this._updateTime();
    this._updateAgeUpButton();

    // Render minimap
    if (game.renderer) {
      game.renderer.renderMinimap(this.minimapCanvas);
    }

    // Messages
    if (this._messageQueue.length > 0) {
      this._messageTimer -= dt;
      if (this._messageTimer <= 0) {
        this._messageQueue.shift();
        this._messageTimer = 3;
      }
    }
  }

  _updateResourceBar() {
    const res = game.players[0].resources;
    this.elFood.textContent = Math.floor(res.food);
    this.elWood.textContent = Math.floor(res.wood);
    this.elGold.textContent = Math.floor(res.gold);
    this.elStone.textContent = Math.floor(res.stone);

    const p = game.players[0];
    this.elPopCurrent.textContent = p.population;
    this.elPopMax.textContent = p.popCap;

    // Pop warning color
    const popDisplay = document.getElementById('pop-display');
    if (p.population >= p.popCap) {
      popDisplay.style.color = '#ff6644';
    } else {
      popDisplay.style.color = '#ddd';
    }

    this.elAgeName.textContent = this._ageName[p.age] || 'Unknown Age';
  }

  _updateAgeUpButton() {
    const p = game.players[0];

    if (p.agingUp) {
      this.elAgeUpBtn.style.display = 'none';
      this.elAgeProgress.style.display = 'inline';
      const pct = Math.round((1 - p.ageUpTimer / (AGE_DEFS[p.age + (p.agingUp ? 0 : 1)]?.advanceTime || 130)) * 100);
      this.elAgeProgress.textContent = `Advancing... ${Math.max(0, Math.round(p.ageUpTimer))}s`;
      return;
    }

    this.elAgeProgress.style.display = 'none';

    const nextAge = p.age + 1;
    if (nextAge >= AGE_DEFS.length) {
      this.elAgeUpBtn.style.display = 'none';
      return;
    }

    const cost = AGE_DEFS[nextAge].advanceCost;
    if (!cost) { this.elAgeUpBtn.style.display = 'none'; return; }

    const canAffordIt = canAfford(0, cost);
    this.elAgeUpBtn.style.display = 'inline-block';
    this.elAgeUpBtn.style.opacity = canAffordIt ? '1' : '0.5';
    const costStr = Object.entries(cost).map(([k, v]) => `${v} ${k}`).join(', ');
    this.elAgeUpBtn.title = `Advance to ${AGE_DEFS[nextAge].name}\nCost: ${costStr}`;
  }

  ageUp() {
    if (startAgeUp(0)) {
      this._updateAgeUpButton();
    }
  }

  _updateTime() {
    const t = game.time;
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    this.elTimeDisplay.textContent = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  }

  _updateIdleVillagers() {
    const count = countIdleVillagers(0);
    this.elIdleCount.textContent = count;
    this.elIdleVillagerBtn.style.display = count > 0 ? 'block' : 'none';
  }

  // Called when selection changes
  updateSelectionPanel() {
    this._updateSelectionPanel();
    this._updateCommandPanel();
  }

  _updateSelectionPanel() {
    const sel = game.selection;
    if (sel.length === 0) {
      this.elSelectionInfo.innerHTML = '';
      this.elSelectionUnits.innerHTML = '';
      this._updateCommandPanel();
      return;
    }

    // Check if selection changed
    const selKey = sel.join(',');
    const prevKey = this._lastSelection.join(',');
    if (selKey !== prevKey) {
      this._lastSelection = [...sel];
      this._updateCommandPanel();
    }

    if (sel.length === 1) {
      const e = game.getEntity(sel[0]);
      if (!e) return;
      this._renderSingleSelection(e);
    } else {
      this._renderMultiSelection(sel);
    }
  }

  _renderSingleSelection(e) {
    const hpPct = Math.round(e.hpFraction() * 100);
    const hpColor = hpPct > 50 ? '#4caf50' : hpPct > 25 ? '#ffcc00' : '#ff4444';

    let html = `<h3>${e.name}</h3>`;
    html += `<div class="hp-bar"><div class="hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>`;
    html += `<div class="stats">HP: ${Math.ceil(e.hp)}/${e.maxHp}`;

    if (e.isUnit) {
      const u = e;
      html += ` | Atk: ${u.stats.attack} | Arm: ${u.stats.meleeArmor}/${u.stats.pierceArmor}`;
      html += ` | Rng: ${u.stats.range} | Spd: ${u.stats.speed.toFixed(1)}</div>`;
      html += `<div class="stats">State: ${u.state}`;
      if (u.carrying && u.carrying.amount > 0) {
        html += ` | Carrying: ${u.carrying.amount} ${u.carrying.type}`;
      }
      html += '</div>';
    } else if (e.isBuilding) {
      const b = e;
      if (!b.complete) {
        html += ` | Building: ${Math.round(b.constructionProgress * 100)}%</div>`;
      } else {
        html += '</div>';
        if (b.trainingQueue.length > 0) {
          const item = b.trainingQueue[0];
          const def = UNIT_DEFS[item.type];
          const prog = b.getQueueProgress();
          html += `<div class="stats">Training: ${def.name} (${Math.round(prog * 100)}%)</div>`;
          html += '<div class="training-queue">';
          for (const qi of b.trainingQueue) {
            const qd = UNIT_DEFS[qi.type];
            html += `<div class="queue-item" title="${qd.name}">${qd.icon || '?'}`;
            html += `<div class="queue-progress" style="width:${qi === b.trainingQueue[0] ? Math.round(prog*100) : 0}%"></div>`;
            html += '</div>';
          }
          html += '</div>';
        }
      }
    }

    this.elSelectionInfo.innerHTML = html;
    this.elSelectionUnits.innerHTML = '';
  }

  _renderMultiSelection(sel) {
    this.elSelectionInfo.innerHTML = `<h3>${sel.length} units selected</h3>`;
    let html = '';
    for (const id of sel.slice(0, 30)) {
      const e = game.getEntity(id);
      if (!e) continue;
      const hpPct = Math.round(e.hpFraction() * 100);
      html += `<div class="unit-portrait" onclick="game.selection=[${id}];game.ui.updateSelectionPanel()" title="${e.name}">`;
      html += `<span style="font-size:0.75rem">${UNIT_DEFS[e.type]?.icon || '?'}</span>`;
      html += `<div class="mini-hp" style="width:${hpPct}%;background:${hpPct>50?'#4caf50':hpPct>25?'#ffcc00':'#ff4444'}"></div>`;
      html += '</div>';
    }
    this.elSelectionUnits.innerHTML = html;
  }

  _updateCommandPanel() {
    const sel = game.selection;
    if (sel.length === 0) {
      this.elCommands.innerHTML = '';
      return;
    }

    const e = game.getEntity(sel[0]);
    if (!e) { this.elCommands.innerHTML = ''; return; }

    const buttons = [];

    if (e.isUnit) {
      if (e.type === 'villager') {
        buttons.push({ label: 'Build', icon: '🏗', key: 'B', action: () => this._showBuildMenu() });
        buttons.push({ label: 'Stop', icon: '⏹', key: 'S', action: () => game.selection.forEach(id => { const u=game.getEntity(id); if(u&&u.isUnit) u.commandStop(); }) });
      } else {
        buttons.push({ label: 'Stop', icon: '⏹', key: 'S', action: () => game.selection.forEach(id => { const u=game.getEntity(id); if(u&&u.isUnit) u.commandStop(); }) });
        buttons.push({ label: 'Atk Move', icon: '⚔', key: 'A', action: () => { game.input._buildMode = null; /* handled via right click */ } });
      }
    } else if (e.isBuilding && e.complete) {
      const trainable = e.getTrainableUnits ? e.getTrainableUnits() : [];
      for (const type of trainable) {
        const def = UNIT_DEFS[type];
        if (!def) continue;
        const costStr = Object.entries(def.cost).map(([k,v]) => `${v} ${k}`).join(', ');
        buttons.push({
          label: def.name,
          icon: def.icon || '?',
          cost: costStr,
          canAfford: canAfford(0, def.cost),
          action: () => {
            sel.forEach(id => {
              const b = game.getEntity(id);
              if (b && b.isBuilding && b.complete) b.trainUnit(type);
            });
          },
        });
      }
    }

    this.elCommands.innerHTML = '';
    for (const btn of buttons) {
      const el = document.createElement('div');
      el.className = 'cmd-btn' + (btn.canAfford === false ? ' disabled' : '');
      el.innerHTML = `<span class="icon">${btn.icon || ''}</span><span>${btn.label}</span>`;
      if (btn.cost) el.innerHTML += `<span class="cost">${btn.cost}</span>`;
      el.title = btn.label + (btn.cost ? `\nCost: ${btn.cost}` : '');
      el.addEventListener('click', btn.action);
      el.style.opacity = btn.canAfford === false ? '0.5' : '1';
      this.elCommands.appendChild(el);
    }
  }

  _showBuildMenu() {
    // Toggle between build categories
    if (this._buildSubMenu === 'main') {
      this._buildSubMenu = null;
      this._updateCommandPanel();
      return;
    }
    this._buildSubMenu = 'main';

    const player = game.players[0];
    const age = player.age;

    this.elCommands.innerHTML = '';

    // AoE2 categories: Civilian & Military
    const categories = [
      { key: 'civilian', label: 'Civilian', icon: '🏠', types: ['town_center','house','mill','lumber_camp','mining_camp','farm','market','dock','monastery','palisade_wall','gate'] },
      { key: 'military', label: 'Military', icon: '⚔️', types: ['barracks','archery_range','stable','castle','siege_workshop','tower'] },
    ];

    // Back button
    const backBtn = document.createElement('div');
    backBtn.className = 'cmd-btn';
    backBtn.innerHTML = '<span class="icon">←</span><span>Back</span>';
    backBtn.addEventListener('click', () => { this._buildSubMenu = null; this._updateCommandPanel(); });
    this.elCommands.appendChild(backBtn);

    for (const cat of categories) {
      // Check if any building in this category is available at current age
      const available = cat.types.filter(t => BUILDING_DEFS[t] && BUILDING_DEFS[t].age <= age);
      if (available.length === 0) continue;

      const el = document.createElement('div');
      el.className = 'cmd-btn';
      el.innerHTML = `<span class="icon">${cat.icon}</span><span>${cat.label}</span><span class="cost" style="font-size:0.5rem">${available.length} bldgs</span>`;
      el.addEventListener('click', () => { this._showBuildCategory(cat.key, cat.types); });
      this.elCommands.appendChild(el);
    }
  }

  _showBuildCategory(catKey, types) {
    const player = game.players[0];
    const age = player.age;

    const availableBuildings = types
      .filter(t => BUILDING_DEFS[t] && BUILDING_DEFS[t].age <= age)
      .map(t => [t, BUILDING_DEFS[t]]);

    this.elCommands.innerHTML = '';

    // Back to categories
    const backBtn = document.createElement('div');
    backBtn.className = 'cmd-btn';
    backBtn.innerHTML = '<span class="icon">←</span><span>Back</span>';
    backBtn.addEventListener('click', () => { this._showBuildMenu(); });
    this.elCommands.appendChild(backBtn);

    for (const [type, def] of availableBuildings) {
      const cost = def.cost;
      const costStr = Object.entries(cost).map(([k,v]) => {
        let actualV = v;
        if (type === 'town_center' && k === 'wood' && player.civ === 'britons') {
          actualV = Math.floor(v * CIVS.britons.bonuses.tcWoodCostMultiplier);
        }
        return `${actualV}${k[0]}`;
      }).join(' ');
      const affordable = canAfford(0, cost);

      const el = document.createElement('div');
      el.className = 'cmd-btn';
      el.style.opacity = affordable ? '1' : '0.5';
      el.innerHTML = `<span class="icon">${def.icon || '🏠'}</span><span style="font-size:0.6rem">${def.name}</span><span class="cost">${costStr}</span>`;
      el.title = `${def.name}\nCost: ${costStr}\n${def.description || ''}`;

      el.addEventListener('click', () => {
        if (!affordable) { game.audio.play('error'); return; }
        game.input.setBuildMode(type);
        this._buildSubMenu = null;
        this._updateCommandPanel();
      });

      this.elCommands.appendChild(el);
    }
  }

  // Show floating message
  showMessage(text, color) {
    this._messageQueue.push({ text, color: color || '#fff' });
    if (this._messageQueue.length === 1) {
      this._messageTimer = 3;
    }
    this._renderMessages();
  }

  _renderMessages() {
    let el = document.getElementById('game-messages');
    if (!el) {
      el = document.createElement('div');
      el.id = 'game-messages';
      el.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:50;text-align:center;pointer-events:none;';
      document.body.appendChild(el);
    }

    el.innerHTML = this._messageQueue.slice(0, 3).map(m =>
      `<div style="background:rgba(0,0,0,0.7);color:${m.color};padding:6px 16px;border-radius:6px;margin:4px;font-weight:bold;font-size:0.9rem">${m.text}</div>`
    ).join('');
  }

  showGameOver(playerWon, stats) {
    const el = document.getElementById('gameover-screen');
    const title = document.getElementById('gameover-title');
    const statsEl = document.getElementById('gameover-stats');

    el.style.display = 'flex';
    title.textContent = playerWon ? 'Victory!' : 'Defeat';
    title.style.color = playerWon ? '#ffd700' : '#ff4444';

    const t = Math.floor(stats.time);
    const m = Math.floor(t / 60), s = t % 60;
    statsEl.innerHTML = `
      <div>Time: ${m}:${s.toString().padStart(2,'0')}</div>
      <div>Units Trained: ${stats.unitsTrained}</div>
      <div>Units Killed: ${stats.unitsKilled}</div>
      <div>Buildings Built: ${stats.buildingsBuilt}</div>
      <div>Resources Gathered: ${Object.entries(stats.resources).map(([k,v]) => `${Math.floor(v)} ${k}`).join(', ')}</div>
    `;
  }
}
