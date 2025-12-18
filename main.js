
// RealmShift main game script
(function () {
  document.addEventListener("DOMContentLoaded", () => {
    bootstrap();
  });

  function bootstrap() {
    const canvas = document.getElementById("game");
    if (!canvas) {
      showMissingCanvasError();
      throw new Error("Canvas element with id 'game' not found.");
    }
    const ctx = canvas.getContext("2d");

    // Debug overlay for on-page error visibility
    const debugOverlay = document.createElement("div");
    debugOverlay.id = "debug-overlay";
    debugOverlay.style.display = "none";
    document.body.appendChild(debugOverlay);

    function pushError(msg) {
      debugOverlay.textContent = msg;
      debugOverlay.style.display = "block";
    }

    window.onerror = function (message, source, lineno, colno, error) {
      pushError(`Error: ${message} at ${source}:${lineno}:${colno}`);
    };
    window.onunhandledrejection = function (event) {
      pushError(`Unhandled rejection: ${event.reason}`);
    };

    // Prevent scroll keys during gameplay
    window.addEventListener(
      "keydown",
      (e) => {
        const block = [" ", "arrowup", "arrowdown", "arrowleft", "arrowright"];
        if (block.includes(e.key.toLowerCase())) {
          e.preventDefault();
        }
      },
      { passive: false }
    );
    window.addEventListener("contextmenu", (e) => e.preventDefault());

    // Resize helpers
    function resizeCanvas() {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    // ===== Constants =====
    const SAVE_KEY = "realmshift_save";
    const SAVE_VERSION = 1;
    const TILE_SIZE = 32;
    const SHAKE_DECAY = 5;

    const TILE = {
      GRASS: "grass",
      PATH: "path",
      WATER: "water",
      WALL: "wall",
      TREE: "tree",
      STONE: "stone",
      ORE: "ore",
      HERB: "herb",
      D_FLOOR: "d_floor",
      D_WALL: "d_wall",
      DOOR: "door",
      LOCKED_DOOR: "locked_door",
      CHEST: "chest",
      CHEST_OPEN: "chest_open",
    };

    const ITEM_DEFS = {
      wood: { name: "Wood", type: "resource" },
      stone: { name: "Stone", type: "resource" },
      ore: { name: "Ore", type: "resource" },
      herb: { name: "Herb", type: "resource" },
      bottle: { name: "Bottle", type: "resource" },
      dungeon_key: { name: "Dungeon Key", type: "quest" },
      potion: { name: "Health Potion", type: "consumable", heal: 25 },
      basic_sword: { name: "Basic Sword", type: "weapon", damage: 12 },
      iron_sword: { name: "Iron Sword", type: "weapon", damage: 20 },
    };

    const RECIPES = [
      {
        name: "Basic Sword",
        creates: { basic_sword: 1 },
        requires: { wood: 2, stone: 1 },
        desc: "Wood + Stone -> Basic Sword",
      },
      {
        name: "Iron Sword",
        creates: { iron_sword: 1 },
        requires: { ore: 2, stone: 2 },
        desc: "Ore + Stone -> Better Sword",
      },
      {
        name: "Health Potion",
        creates: { potion: 1 },
        requires: { herb: 1, bottle: 1 },
        desc: "Herb + Bottle -> Heal 25",
      },
    ];

    const ENEMY_TYPES = {
      slime: { hp: 16, speed: 55, dmg: 8, color: "#6ee7b7", chase: 220, xp: 8 },
      rogue: { hp: 28, speed: 70, dmg: 12, color: "#f87171", chase: 240, xp: 14 },
      guardian: { hp: 40, speed: 60, dmg: 14, color: "#a78bfa", chase: 260, xp: 18 },
      boss: { hp: 200, speed: 65, dmg: 16, color: "#facc15", chase: 400, xp: 60 },
    };

    // ===== State =====
    const ui = grabUI();
    const game = {
      state: "menu", // menu | playing | paused | dead | victory | perk
      lastTime: 0,
      camera: { x: 0, y: 0 },
      world: null,
      enemies: [],
      projectiles: [],
      enemyProjectiles: [],
      loot: [],
      particles: [],
      floaters: [],
      doorUnlocked: false,
      bossDefeated: false,
      screenShake: 0,
    };

    const player = {
      x: 0,
      y: 0,
      w: 22,
      h: 22,
      speed: 140,
      hp: 100,
      maxHp: 100,
      stamina: 100,
      maxStamina: 100,
      staminaRegen: 25,
      invuln: 0,
      attackCooldown: 0,
      facing: { x: 1, y: 0 },
      inventory: {},
      hotbar: ["basic_sword", "potion", null, null, null, null],
      selectedSlot: 0,
      coins: 0,
      xp: 0,
      level: 1,
      damageBonus: 0,
      speedBonus: 0,
      perkPending: false,
    };

    const input = {
      up: false,
      down: false,
      left: false,
      right: false,
      interact: false,
      shift: false,
    };

    const mouse = { x: 0, y: 0 };
    // ===== UI Wiring =====
    buttons().start.onclick = () => {
      newGame();
      hideAllOverlays();
    };
    buttons().continue.onclick = () => {
      loadGame();
      hideAllOverlays();
    };
    buttons().resume.onclick = () => resumeGame();
    buttons().saveQuit.onclick = () => {
      saveGame();
      goToMenu();
    };
    buttons().quit.onclick = () => goToMenu();
    buttons().closeCraft.onclick = () => toggleCrafting(false);
    buttons().retry.onclick = () => {
      newGame();
      hideAllOverlays();
    };
    buttons().menu.onclick = () => goToMenu();
    buttons().playAgain.onclick = () => {
      newGame();
      hideAllOverlays();
    };
    buttons().victoryMenu.onclick = () => goToMenu();

    // Perk selection container
    const perkOptionsNode = document.getElementById("perk-options");

    // ===== Input handlers =====
    window.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left + game.camera.x;
      mouse.y = e.clientY - rect.top + game.camera.y;
    });

    window.addEventListener("mousedown", (e) => {
      if (game.state !== "playing") return;
      if (e.button === 0) queueAttack();
    });

    window.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      switch (k) {
        case "w":
        case "arrowup":
          input.up = true;
          break;
        case "s":
        case "arrowdown":
          input.down = true;
          break;
        case "a":
        case "arrowleft":
          input.left = true;
          break;
        case "d":
        case "arrowright":
          input.right = true;
          break;
        case " ":
        case "j":
          if (game.state === "playing") queueAttack();
          break;
        case "e":
          input.interact = true;
          if (game.state === "playing") handleInteract();
          break;
        case "c":
          toggleCrafting();
          break;
        case "escape":
          togglePause();
          break;
        case "shift":
          input.shift = true;
          break;
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
        case "6":
          setHotbarIndex(parseInt(k, 10) - 1);
          if (game.state === "playing") tryUseConsumable();
          break;
      }
    });

    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      switch (k) {
        case "w":
        case "arrowup":
          input.up = false;
          break;
        case "s":
        case "arrowdown":
          input.down = false;
          break;
        case "a":
        case "arrowleft":
          input.left = false;
          break;
        case "d":
        case "arrowright":
          input.right = false;
          break;
        case "e":
          input.interact = false;
          break;
        case "shift":
          input.shift = false;
          break;
      }
    });

    // ===== Game init =====
    if (hasValidSave()) {
      buttons().continue.style.display = "inline-block";
    }

    requestAnimationFrame(tick);
    // ====== Functions ======
    function grabUI() {
      return {
        start: document.getElementById("start-screen"),
        hud: document.getElementById("hud"),
        pause: document.getElementById("pause-screen"),
        crafting: document.getElementById("crafting-screen"),
        gameover: document.getElementById("gameover-screen"),
        victory: document.getElementById("victory-screen"),
        perk: document.getElementById("perk-screen"),
        health: document.getElementById("health"),
        stamina: document.getElementById("stamina"),
        zone: document.getElementById("zone"),
        coins: document.getElementById("coins"),
        weapon: document.getElementById("weapon"),
        hotbar: document.getElementById("hotbar"),
        recipes: document.getElementById("recipes"),
        xpfill: document.getElementById("xpfill"),
        xplabel: document.getElementById("xplabel"),
        continueBtn: document.getElementById("continue-btn"),
      };
    }

    function buttons() {
      return {
        start: document.getElementById("start-btn"),
        continue: document.getElementById("continue-btn"),
        resume: document.getElementById("resume-btn"),
        saveQuit: document.getElementById("savequit-btn"),
        quit: document.getElementById("quit-btn"),
        closeCraft: document.getElementById("close-craft"),
        retry: document.getElementById("retry-btn"),
        menu: document.getElementById("menu-btn"),
        playAgain: document.getElementById("playagain-btn"),
        victoryMenu: document.getElementById("victory-menu-btn"),
      };
    }

    function showMissingCanvasError() {
      const div = document.createElement("div");
      div.id = "error-overlay";
      div.innerHTML = "Fatal error: Missing <canvas id='game'> in index.html.<br/>Please add <canvas id=\"game\"></canvas> before loading main.js.";
      document.body.appendChild(div);
    }

    function randInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function clamp(v, min, max) {
      return Math.max(min, Math.min(max, v));
    }

    function distance(a, b) {
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      return Math.hypot(dx, dy);
    }

    function rectsOverlap(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    // ===== World generation =====
    function createTile(type, hp = 0) {
      return { type, hp };
    }

    function generateWorld() {
      const width = 70;
      const height = 45;
      const tiles = [];
      for (let y = 0; y < height; y++) {
        tiles[y] = [];
        for (let x = 0; x < width; x++) {
          tiles[y][x] = createTile(TILE.GRASS);
        }
      }
      // boundaries
      for (let x = 0; x < width; x++) {
        tiles[0][x] = createTile(TILE.WALL);
        tiles[height - 1][x] = createTile(TILE.WALL);
      }
      for (let y = 0; y < height; y++) {
        tiles[y][0] = createTile(TILE.WALL);
        tiles[y][width - 1] = createTile(TILE.WALL);
      }
      // village path
      for (let y = 15; y < 30; y++) {
        for (let x = 2; x < 18; x++) tiles[y][x] = createTile(TILE.PATH);
      }
      // lake
      for (let y = 8; y < 18; y++) {
        for (let x = 22; x < 32; x++) tiles[y][x] = createTile(TILE.WATER);
      }
      // scatter resources
      scatter(TILE.TREE, 70, 14, [16, 44], [5, 38]);
      scatter(TILE.STONE, 35, 16, [20, 44], [6, 40]);
      scatter(TILE.ORE, 16, 20, [25, 44], [8, 36]);
      scatter(TILE.HERB, 18, 8, [14, 50], [6, 40]);

      function scatter(type, count, hp, rangeX, rangeY) {
        for (let i = 0; i < count; i++) {
          const x = (rangeX ? randInt(rangeX[0], rangeX[1]) : randInt(2, width - 3)) | 0;
          const y = (rangeY ? randInt(rangeY[0], rangeY[1]) : randInt(2, height - 3)) | 0;
          if (tiles[y][x].type === TILE.GRASS) tiles[y][x] = createTile(type, hp);
        }
      }

      // Dungeon rectangle
      const dungeon = { x1: 48, x2: 68, y1: 10, y2: 34 };
      for (let y = dungeon.y1; y <= dungeon.y2; y++) {
        for (let x = dungeon.x1; x <= dungeon.x2; x++) {
          const edge = x === dungeon.x1 || x === dungeon.x2 || y === dungeon.y1 || y === dungeon.y2;
          tiles[y][x] = createTile(edge ? TILE.D_WALL : TILE.D_FLOOR);
        }
      }
      // Corridor
      for (let x = 44; x <= dungeon.x1; x++) {
        tiles[21][x] = createTile(TILE.PATH);
        tiles[22][x] = createTile(TILE.PATH);
      }
      const doorPos = { x: dungeon.x1, y: 21 };
      tiles[doorPos.y][doorPos.x] = createTile(TILE.LOCKED_DOOR);

      // Chests (one key chest, one reward chest)
      const chests = [
        { x: 30, y: 14, type: "key", opened: false },
        { x: 52, y: 30, type: "reward", opened: false },
      ];
      chests.forEach((c) => (tiles[c.y][c.x] = createTile(TILE.CHEST)));

      return { width, height, tiles, chests, doorPos, dungeon };
    }

    // ===== Inventory & crafting =====
    function addItem(id, qty = 1) {
      if (!ITEM_DEFS[id]) return;
      player.inventory[id] = (player.inventory[id] || 0) + qty;
      autoFillHotbar(id);
      refreshHotbar();
    }

    function autoFillHotbar(id) {
      if (ITEM_DEFS[id].type === "quest") return;
      const idx = player.hotbar.findIndex((s) => s === null);
      if (idx !== -1) player.hotbar[idx] = id;
    }

    function removeItems(cost) {
      for (const [id, qty] of Object.entries(cost)) {
        player.inventory[id] = Math.max(0, (player.inventory[id] || 0) - qty);
      }
    }

    function hasItems(cost) {
      return Object.entries(cost).every(([id, qty]) => (player.inventory[id] || 0) >= qty);
    }

    function getEquippedItem() {
      return player.hotbar[player.selectedSlot];
    }

    function setHotbarIndex(i) {
      if (i < 0 || i >= player.hotbar.length) return;
      player.selectedSlot = i;
      refreshHotbar();
    }

    function buildCraftingUI() {
      ui.recipes.innerHTML = "";
      RECIPES.forEach((recipe) => {
        const div = document.createElement("div");
        div.className = "recipe";
        const canMake = hasItems(recipe.requires);
        const reqText = Object.entries(recipe.requires)
          .map(([id, qty]) => `${ITEM_DEFS[id].name} x${qty}`)
          .join(", ");
        div.innerHTML = `<h4>${recipe.name}</h4>
          <p>${recipe.desc}</p>
          <p>Requires: ${reqText}</p>`;
        const btn = document.createElement("button");
        btn.textContent = canMake ? "Craft" : "Need materials";
        btn.disabled = !canMake;
        btn.onclick = () => {
          if (!hasItems(recipe.requires)) return;
          removeItems(recipe.requires);
          Object.entries(recipe.creates).forEach(([id, qty]) => addItem(id, qty));
          refreshHotbar();
          buildCraftingUI();
        };
        div.appendChild(btn);
        ui.recipes.appendChild(div);
      });
    }
    function toggleCrafting(force) {
      if (game.state !== "playing" && !ui.crafting.classList.contains("hidden")) return;
      const show = force !== undefined ? force : ui.crafting.classList.contains("hidden");
      if (show) {
        buildCraftingUI();
        ui.crafting.classList.remove("hidden");
      } else {
        ui.crafting.classList.add("hidden");
      }
    }

    // ===== Game start / save =====
    function newGame() {
      Object.assign(player, {
        x: TILE_SIZE * 8,
        y: TILE_SIZE * 20,
        w: 22,
        h: 22,
        speed: 140,
        hp: 100,
        maxHp: 100,
        stamina: 100,
        maxStamina: 100,
        staminaRegen: 25,
        invuln: 0,
        attackCooldown: 0,
        facing: { x: 1, y: 0 },
        inventory: {},
        hotbar: ["basic_sword", "potion", null, null, null, null],
        selectedSlot: 0,
        coins: 0,
        xp: 0,
        level: 1,
        damageBonus: 0,
        speedBonus: 0,
        perkPending: false,
      });
      addItem("wood", 3);
      addItem("stone", 2);
      addItem("herb", 1);
      addItem("bottle", 1);
      game.world = generateWorld();
      game.enemies = spawnEnemies(game.world, false);
      game.projectiles = [];
      game.enemyProjectiles = [];
      game.loot = [];
      game.particles = [];
      game.floaters = [];
      game.doorUnlocked = false;
      game.bossDefeated = false;
      game.state = "playing";
      ui.hud.classList.remove("hidden");
      hideAllOverlays();
      refreshHotbar();
      updateHud();
    }

    function hasValidSave() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const data = JSON.parse(raw);
        return data.version === SAVE_VERSION && data.player && data.world;
      } catch (e) {
        return false;
      }
    }

    function loadGame() {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        if (data.version !== SAVE_VERSION) throw new Error("Save version mismatch");
        Object.assign(player, data.player);
        player.invuln = 0;
        player.attackCooldown = 0;
        game.world = generateWorld();
        game.doorUnlocked = data.world.doorUnlocked;
        game.bossDefeated = data.world.bossDefeated;
        game.world.chests.forEach((c) => {
          if (data.world.openedChests?.some((p) => p.x === c.x && p.y === c.y)) {
            c.opened = true;
            game.world.tiles[c.y][c.x] = createTile(TILE.CHEST_OPEN);
          }
        });
        if (game.doorUnlocked) {
          const d = game.world.doorPos;
          game.world.tiles[d.y][d.x] = createTile(TILE.DOOR);
        }
        game.enemies = spawnEnemies(game.world, game.bossDefeated);
        game.projectiles = [];
        game.enemyProjectiles = [];
        game.loot = [];
        game.particles = [];
        game.floaters = [];
        game.state = "playing";
        hideAllOverlays();
        refreshHotbar();
        updateHud();
      } catch (e) {
        pushError("Failed to load save: " + e.message);
        buttons().continue.style.display = "none";
      }
    }

    function saveGame() {
      const openedChests = game.world.chests.filter((c) => c.opened).map((c) => ({ x: c.x, y: c.y }));
      const data = {
        version: SAVE_VERSION,
        player: {
          x: player.x,
          y: player.y,
          w: player.w,
          h: player.h,
          hp: player.hp,
          maxHp: player.maxHp,
          stamina: player.stamina,
          maxStamina: player.maxStamina,
          inventory: player.inventory,
          hotbar: player.hotbar,
          selectedSlot: player.selectedSlot,
          coins: player.coins,
          xp: player.xp,
          level: player.level,
          damageBonus: player.damageBonus,
          speedBonus: player.speedBonus,
        },
        world: {
          doorUnlocked: game.doorUnlocked,
          bossDefeated: game.bossDefeated,
          openedChests,
        },
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      ui.continueBtn.style.display = "inline-block";
    }

    // ===== Enemies =====
    function spawnEnemies(world, bossDead) {
      const arr = [];
      [
        { x: 26, y: 26, type: "slime" },
        { x: 35, y: 18, type: "slime" },
        { x: 36, y: 30, type: "rogue" },
      ].forEach((e) => arr.push(makeEnemy(e.x * TILE_SIZE + 16, e.y * TILE_SIZE + 16, e.type)));
      [
        { x: 50, y: 18, type: "guardian" },
        { x: 56, y: 24, type: "guardian" },
      ].forEach((e) => arr.push(makeEnemy(e.x * TILE_SIZE + 16, e.y * TILE_SIZE + 16, e.type)));
      if (!bossDead) {
        arr.push(makeEnemy(60 * TILE_SIZE + 16, 22 * TILE_SIZE + 16, "boss"));
      }
      return arr;
    }

    function makeEnemy(x, y, type) {
      const stats = ENEMY_TYPES[type];
      return {
        x,
        y,
        radius: 14,
        type,
        hp: stats.hp,
        state: "idle",
        wanderTimer: randInt(1, 3),
        invuln: 0,
        attackTimer: 0,
        target: null,
        knockback: { x: 0, y: 0 },
      };
    }

    function updateEnemies(dt) {
      for (const e of game.enemies) {
        if (e.hp <= 0) continue;
        const def = ENEMY_TYPES[e.type];
        e.invuln = Math.max(0, e.invuln - dt);
        e.attackTimer -= dt;
        let dir = { x: 0, y: 0 };
        const dist = distance(e, player);
        if (dist < def.chase) {
          dir.x = player.x - e.x;
          dir.y = player.y - e.y;
          const mag = Math.hypot(dir.x, dir.y) || 1;
          dir.x /= mag;
          dir.y /= mag;
        } else {
          e.wanderTimer -= dt;
          if (e.wanderTimer <= 0) {
            e.wanderTimer = randInt(2, 4);
            const angle = Math.random() * Math.PI * 2;
            e.target = { x: Math.cos(angle), y: Math.sin(angle) };
          }
          if (e.target) dir = { ...e.target };
        }

        // Apply knockback
        dir.x += e.knockback.x;
        dir.y += e.knockback.y;
        e.knockback.x *= 0.9;
        e.knockback.y *= 0.9;

        e.x += dir.x * def.speed * dt;
        e.y += dir.y * def.speed * dt;

        const tile = getTileAt(e.x, e.y);
        if (tile && isSolid(tile.type)) {
          e.x -= dir.x * def.speed * dt;
          e.y -= dir.y * def.speed * dt;
        }

        if (dist < e.radius + Math.max(player.w, player.h) * 0.5) {
          damagePlayer(def.dmg, 0.7);
        }

        if (e.type === "boss" && e.attackTimer <= 0 && dist < 420) {
          e.attackTimer = 2.2;
          fireBossProjectiles(e);
        }
      }
    }
    function fireBossProjectiles(enemy) {
      const shots = 5;
      for (let i = 0; i < shots; i++) {
        const spread = (i - (shots - 1) / 2) * 0.25;
        const dir = { x: player.x - enemy.x, y: player.y - enemy.y };
        const mag = Math.hypot(dir.x, dir.y) || 1;
        dir.x /= mag;
        dir.y /= mag;
        const angle = Math.atan2(dir.y, dir.x) + spread;
        const vx = Math.cos(angle);
        const vy = Math.sin(angle);
        game.enemyProjectiles.push({
          x: enemy.x,
          y: enemy.y,
          vx,
          vy,
          speed: 180,
          life: 2.5,
          dmg: 12,
        });
      }
    }

    // ===== Player actions =====
    function queueAttack() {
      performMelee();
    }

    function performMelee() {
      if (player.attackCooldown > 0) return;
      const item = ITEM_DEFS[getEquippedItem()];
      const dmg = (item?.damage || 10) + player.damageBonus;
      player.attackCooldown = 0.35;
      const aim = { x: mouse.x - player.x, y: mouse.y - player.y };
      const mag = Math.hypot(aim.x, aim.y) || 1;
      aim.x /= mag;
      aim.y /= mag;
      player.facing = { ...aim };
      const hitbox = { x: player.x + aim.x * 16 - 18, y: player.y + aim.y * 16 - 18, w: 36, h: 36 };
      resolveAttack(hitbox, dmg);
    }

    function resolveAttack(hitbox, dmg) {
      for (const e of game.enemies) {
        if (e.hp <= 0) continue;
        const rect = { x: e.x - 14, y: e.y - 14, w: 28, h: 28 };
        if (rectsOverlap(hitbox, rect)) {
          if (e.invuln <= 0) {
            e.hp -= dmg;
            e.invuln = 0.2;
            e.knockback.x += (e.x - player.x) * 0.02;
            e.knockback.y += (e.y - player.y) * 0.02;
            addFloater(`-${Math.round(dmg)}`, e.x, e.y, "#fca5a5");
            game.screenShake = Math.min(10, game.screenShake + 5);
            if (e.hp <= 0) onEnemyKilled(e);
          }
        }
      }

      const tiles = getTilesInRect(hitbox);
      tiles.forEach(({ x, y, tile }) => {
        if ([TILE.TREE, TILE.STONE, TILE.ORE, TILE.HERB].includes(tile.type)) {
          tile.hp -= dmg;
          if (tile.hp <= 0) {
            dropResource(tile.type, x, y);
            game.world.tiles[y][x] = createTile(TILE.GRASS);
          }
        }
      });
    }

    function dropResource(type, tx, ty) {
      const map = { [TILE.TREE]: "wood", [TILE.STONE]: "stone", [TILE.ORE]: "ore", [TILE.HERB]: "herb" };
      const id = map[type];
      if (!id) return;
      game.loot.push({
        x: tx * TILE_SIZE + TILE_SIZE / 2,
        y: ty * TILE_SIZE + TILE_SIZE / 2,
        id,
        qty: 1 + (Math.random() < 0.3 ? 1 : 0),
        coins: 0,
        rarity: "common",
      });
    }

    function tryUseConsumable() {
      const id = getEquippedItem();
      const def = ITEM_DEFS[id];
      if (!def || def.type !== "consumable") return;
      const qty = player.inventory[id] || 0;
      if (qty <= 0) return;
      if (id === "potion") {
        if (player.hp >= player.maxHp) return;
        player.hp = clamp(player.hp + def.heal, 0, player.maxHp);
        player.inventory[id] = qty - 1;
        addFloater("+Heal", player.x, player.y - 16, "#22c55e");
        refreshHotbar();
        updateHud();
      }
    }

    function onEnemyKilled(enemy) {
      const coins = randInt(3, 8);
      const xp = ENEMY_TYPES[enemy.type].xp || 6;
      game.loot.push({ x: enemy.x, y: enemy.y, id: null, qty: 0, coins, xp, rarity: "common" });
      if (Math.random() < 0.7) {
        const mats = ["wood", "stone", "ore", "herb"];
        const mid = mats[randInt(0, mats.length - 1)];
        game.loot.push({ x: enemy.x + 6, y: enemy.y + 6, id: mid, qty: randInt(1, 2), coins: 0, rarity: "common" });
      }
      if (enemy.type === "boss") {
        game.bossDefeated = true;
        setTimeout(() => showVictory(), 400);
      }
      addParticles(enemy.x, enemy.y, ENEMY_TYPES[enemy.type].color);
    }

    function addParticles(x, y, color) {
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = Math.random() * 50 + 40;
        game.particles.push({
          x,
          y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 0.6,
          color,
        });
      }
    }

    function addFloater(text, x, y, color) {
      game.floaters.push({ text, x, y, color, life: 0.8 });
    }

    // ===== Interaction =====
    function handleInteract() {
      for (const chest of game.world.chests) {
        if (chest.opened) continue;
        const dx = Math.abs(player.x - (chest.x * TILE_SIZE + 16));
        const dy = Math.abs(player.y - (chest.y * TILE_SIZE + 16));
        if (dx < 28 && dy < 28) {
          chest.opened = true;
          game.world.tiles[chest.y][chest.x] = createTile(TILE.CHEST_OPEN);
          openChest(chest);
          refreshHotbar();
          return;
        }
      }

      const d = game.world.doorPos;
      const dx = Math.abs(player.x - (d.x * TILE_SIZE + 16));
      const dy = Math.abs(player.y - (d.y * TILE_SIZE + 16));
      if (!game.doorUnlocked && dx < 32 && dy < 48) {
        if ((player.inventory["dungeon_key"] || 0) > 0) {
          player.inventory["dungeon_key"] -= 1;
          game.doorUnlocked = true;
          game.world.tiles[d.y][d.x] = createTile(TILE.DOOR);
          addFloater("Door unlocked!", player.x, player.y - 16, "#a7f3d0");
          saveGame();
          refreshHotbar();
        }
      }
    }

    function openChest(chest) {
      if (chest.type === "key") {
        addItem("dungeon_key", 1);
        addItem("ore", 2);
        addItem("bottle", 1);
        addFloater("Dungeon Key!", player.x, player.y - 18, "#facc15");
        saveGame();
        return;
      }
      // reward chest with rarity
      const roll = Math.random();
      let rarity = "common";
      if (roll > 0.9) rarity = "epic";
      else if (roll > 0.7) rarity = "rare";
      const colorMap = { common: "#e5e7eb", rare: "#60a5fa", epic: "#c084fc" };
      const lootTable = [
        { id: "ore", qty: randInt(1, 3) },
        { id: "potion", qty: 1 },
        { id: "herb", qty: randInt(1, 2) },
      ];
      lootTable.forEach((l) => addItem(l.id, l.qty));
      const coins = randInt(8, 15);
      player.coins += coins;
      addFloater(`${rarity} chest +${coins} coins`, player.x, player.y - 18, colorMap[rarity]);
    }
    // ===== Player update =====
    function updatePlayer(dt) {
      let moveX = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let moveY = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      let mag = Math.hypot(moveX, moveY);
      if (mag > 0) {
        moveX /= mag;
        moveY /= mag;
        player.facing = { x: moveX, y: moveY };
      }

      let speed = player.speed + player.speedBonus;
      const sprinting = (moveX !== 0 || moveY !== 0) && input.shift && player.stamina > 0;
      if (sprinting) {
        speed *= 1.25;
        player.stamina = Math.max(0, player.stamina - 35 * dt);
      } else {
        player.stamina = Math.min(player.maxStamina, player.stamina + player.staminaRegen * dt);
      }

      const nextX = player.x + moveX * speed * dt;
      if (!isBlocked(nextX, player.y)) player.x = nextX;
      const nextY = player.y + moveY * speed * dt;
      if (!isBlocked(player.x, nextY)) player.y = nextY;

      player.attackCooldown = Math.max(0, player.attackCooldown - dt);
      player.invuln = Math.max(0, player.invuln - dt);
    }

    function isBlocked(x, y) {
      const tile = getTileAt(x, y);
      return tile && isSolid(tile.type);
    }

    function damagePlayer(amount, invulnTime = 0.6) {
      if (player.invuln > 0 || game.state !== "playing") return;
      player.hp -= amount;
      player.invuln = invulnTime;
      game.screenShake = Math.min(10, game.screenShake + 8);
      addFloater(`-${Math.round(amount)}`, player.x, player.y - 12, "#f87171");
      if (player.hp <= 0) {
        player.hp = 0;
        showGameOver();
      }
    }

    // ===== Projectiles =====
    function updateProjectiles(dt) {
      const active = [];
      for (const p of game.projectiles) {
        p.life -= dt;
        p.x += p.vx * p.speed * dt;
        p.y += p.vy * p.speed * dt;
        if (p.life <= 0) continue;
        let hit = false;
        for (const e of game.enemies) {
          if (e.hp <= 0) continue;
          const rect = { x: e.x - 14, y: e.y - 14, w: 28, h: 28 };
          if (rectsOverlap({ x: p.x - 6, y: p.y - 6, w: 12, h: 12 }, rect)) {
            e.hp -= p.dmg;
            if (e.hp <= 0) onEnemyKilled(e);
            hit = true;
            break;
          }
        }
        if (!hit) active.push(p);
      }
      game.projectiles = active;
    }

    function updateEnemyProjectiles(dt) {
      const active = [];
      for (const p of game.enemyProjectiles) {
        p.life -= dt;
        p.x += p.vx * p.speed * dt;
        p.y += p.vy * p.speed * dt;
        if (p.life <= 0) continue;
        if (distance(p, player) < 16) {
          damagePlayer(p.dmg, 0.2);
          continue;
        }
        active.push(p);
      }
      game.enemyProjectiles = active;
    }

    // ===== Loot =====
    function updateLoot() {
      const remaining = [];
      for (const l of game.loot) {
        if (distance(l, player) < 24) {
          if (l.id) addItem(l.id, l.qty);
          if (l.coins) player.coins += l.coins;
          if (l.xp) gainXp(l.xp);
        } else {
          remaining.push(l);
        }
      }
      game.loot = remaining;
    }

    // ===== XP / Level =====
    function gainXp(amount) {
      player.xp += amount;
      addFloater(`+${amount} XP`, player.x, player.y - 18, "#38bdf8");
      checkLevelUp();
    }

    function xpToNext() {
      return 30 + (player.level - 1) * 20;
    }

    function checkLevelUp() {
      let needed = xpToNext();
      while (player.xp >= needed) {
        player.xp -= needed;
        player.level += 1;
        promptPerk();
        needed = xpToNext();
      }
    }

    function promptPerk() {
      if (game.state !== "playing") return;
      game.state = "perk";
      ui.perk.classList.remove("hidden");
      perkOptionsNode.innerHTML = "";
      const perks = [
        { name: "+10 Max HP", apply: () => { player.maxHp += 10; player.hp += 10; } },
        { name: "+3 Damage", apply: () => { player.damageBonus += 3; } },
        { name: "+15% Speed", apply: () => { player.speedBonus += player.speed * 0.15; } },
      ];
      const picks = perks.sort(() => Math.random() - 0.5).slice(0, 3);
      picks.forEach((p) => {
        const btn = document.createElement("button");
        btn.textContent = p.name;
        btn.onclick = () => {
          p.apply();
          ui.perk.classList.add("hidden");
          game.state = "playing";
          updateHud();
        };
        perkOptionsNode.appendChild(btn);
      });
    }

    // ===== Tiles =====
    function getTileAt(x, y) {
      const tx = Math.floor(x / TILE_SIZE);
      const ty = Math.floor(y / TILE_SIZE);
      if (!game.world || tx < 0 || ty < 0 || tx >= game.world.width || ty >= game.world.height) return null;
      return game.world.tiles[ty][tx];
    }

    function getTilesInRect(rect) {
      const tiles = [];
      const x1 = clamp(Math.floor(rect.x / TILE_SIZE), 0, game.world.width - 1);
      const y1 = clamp(Math.floor(rect.y / TILE_SIZE), 0, game.world.height - 1);
      const x2 = clamp(Math.floor((rect.x + rect.w) / TILE_SIZE), 0, game.world.width - 1);
      const y2 = clamp(Math.floor((rect.y + rect.h) / TILE_SIZE), 0, game.world.height - 1);
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          tiles.push({ x, y, tile: game.world.tiles[y][x] });
        }
      }
      return tiles;
    }

    function isSolid(type) {
      return (
        type === TILE.WALL ||
        type === TILE.WATER ||
        type === TILE.TREE ||
        type === TILE.STONE ||
        type === TILE.ORE ||
        type === TILE.HERB ||
        type === TILE.D_WALL ||
        type === TILE.LOCKED_DOOR ||
        type === TILE.CHEST
      );
    }
    // ===== HUD =====
    function updateHud() {
      ui.health.textContent = `HP: ${Math.round(player.hp)}/${player.maxHp}`;
      ui.stamina.textContent = `ST: ${Math.round(player.stamina)}/${player.maxStamina}`;
      ui.zone.textContent = `Zone: ${getZoneName(player.x, player.y)}`;
      ui.coins.textContent = `Coins: ${player.coins}`;
      const weaponId = getEquippedItem();
      ui.weapon.textContent = `Weapon: ${weaponId ? ITEM_DEFS[weaponId].name : "None"}`;
      const pct = clamp(player.xp / xpToNext(), 0, 1) * 100;
      ui.xpfill.style.width = `${pct}%`;
      ui.xplabel.textContent = `XP ${Math.floor(player.xp)} / ${xpToNext()} (Lv${player.level})`;
    }

    function refreshHotbar() {
      ui.hotbar.innerHTML = "";
      player.hotbar.forEach((id, idx) => {
        const slot = document.createElement("div");
        slot.className = "hotbar-slot";
        if (idx === player.selectedSlot) slot.classList.add("active");
        if (id) {
          const def = ITEM_DEFS[id];
          const qty = player.inventory[id] || 0;
          slot.innerHTML = `<div>${def.name}</div><div class="qty">x${qty || 1}</div>`;
        } else {
          slot.textContent = "Empty";
        }
        slot.onclick = () => setHotbarIndex(idx);
        ui.hotbar.appendChild(slot);
      });
    }

    function getZoneName(x, y) {
      const tx = x / TILE_SIZE;
      if (tx < 18) return "Village";
      if (tx < 45) return "Wilderness";
      return "Dungeon";
    }

    function hideAllOverlays() {
      ui.start.classList.add("hidden");
      ui.pause.classList.add("hidden");
      ui.gameover.classList.add("hidden");
      ui.victory.classList.add("hidden");
      ui.perk.classList.add("hidden");
    }

    function togglePause() {
      if (game.state === "playing") {
        game.state = "paused";
        ui.pause.classList.remove("hidden");
      } else if (game.state === "paused") {
        resumeGame();
      }
    }

    function resumeGame() {
      ui.pause.classList.add("hidden");
      game.state = "playing";
    }

    function goToMenu() {
      game.state = "menu";
      ui.start.classList.remove("hidden");
      ui.pause.classList.add("hidden");
      ui.hud.classList.add("hidden");
    }

    function showGameOver() {
      game.state = "dead";
      ui.gameover.classList.remove("hidden");
    }

    function showVictory() {
      game.state = "victory";
      ui.victory.classList.remove("hidden");
      saveGame();
    }

    // ===== Rendering =====
    function render() {
      if (!canvas || !ctx) return;
      if (!game.world) {
        ctx.fillStyle = "#0f131c";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const shakeX = (Math.random() - 0.5) * game.screenShake;
      const shakeY = (Math.random() - 0.5) * game.screenShake;
      const camX = clamp(player.x - canvas.width / 2, 0, game.world.width * TILE_SIZE - canvas.width);
      const camY = clamp(player.y - canvas.height / 2, 0, game.world.height * TILE_SIZE - canvas.height);
      game.camera.x = camX;
      game.camera.y = camY;

      ctx.save();
      ctx.translate(-camX + shakeX, -camY + shakeY);

      drawWorld();
      drawLoot();
      drawProjectiles();
      drawEnemies();
      drawPlayer();
      drawEnemyProjectiles();
      drawParticles(dtEstimate);
      drawFloaters(dtEstimate);

      ctx.restore();
    }

    function tileColor(type) {
      switch (type) {
        case TILE.GRASS:
          return "#1f3d2f";
        case TILE.PATH:
          return "#3f3f46";
        case TILE.WATER:
          return "#0ea5e9";
        case TILE.WALL:
          return "#0f172a";
        case TILE.TREE:
          return "#14532d";
        case TILE.STONE:
          return "#475569";
        case TILE.ORE:
          return "#9ca3af";
        case TILE.HERB:
          return "#16a34a";
        case TILE.D_FLOOR:
          return "#1f2937";
        case TILE.D_WALL:
          return "#0b1220";
        case TILE.CHEST:
        case TILE.CHEST_OPEN:
          return "#312e81";
        case TILE.LOCKED_DOOR:
          return "#7f1d1d";
        case TILE.DOOR:
          return "#14532d";
        default:
          return "#000";
      }
    }

    function drawWorld() {
      const startX = Math.floor(game.camera.x / TILE_SIZE) - 1;
      const startY = Math.floor(game.camera.y / TILE_SIZE) - 1;
      const endX = Math.ceil((game.camera.x + canvas.width) / TILE_SIZE) + 1;
      const endY = Math.ceil((game.camera.y + canvas.height) / TILE_SIZE) + 1;
      for (let y = startY; y <= endY; y++) {
        if (y < 0 || y >= game.world.height) continue;
        for (let x = startX; x <= endX; x++) {
          if (x < 0 || x >= game.world.width) continue;
          const tile = game.world.tiles[y][x];
          const screenX = x * TILE_SIZE;
          const screenY = y * TILE_SIZE;
          ctx.fillStyle = tileColor(tile.type);
          ctx.fillRect(screenX, screenY, TILE_SIZE, TILE_SIZE);

          if (tile.type === TILE.CHEST || tile.type === TILE.CHEST_OPEN) {
            ctx.fillStyle = tile.type === TILE.CHEST ? "#f59e0b" : "#9ca3af";
            ctx.fillRect(screenX + 6, screenY + 6, TILE_SIZE - 12, TILE_SIZE - 12);
          }
          if (tile.type === TILE.LOCKED_DOOR || tile.type === TILE.DOOR) {
            ctx.fillStyle = tile.type === TILE.DOOR ? "#16a34a" : "#dc2626";
            ctx.fillRect(screenX + 4, screenY, TILE_SIZE - 8, TILE_SIZE);
          }
        }
      }
    }

    function drawPlayer() {
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(player.x, player.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e0f2fe";
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(player.x + player.facing.x * 18, player.y + player.facing.y * 18);
      ctx.stroke();
    }

    function drawEnemies() {
      for (const e of game.enemies) {
        if (e.hp <= 0) continue;
        ctx.fillStyle = ENEMY_TYPES[e.type].color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111827";
        ctx.fillRect(e.x - 16, e.y - e.radius - 10, 32, 4);
        ctx.fillStyle = "#f43f5e";
        const pct = clamp(e.hp / ENEMY_TYPES[e.type].hp, 0, 1);
        ctx.fillRect(e.x - 16, e.y - e.radius - 10, 32 * pct, 4);
      }
    }

    function drawProjectiles() {
      ctx.fillStyle = "#a5f3fc";
      for (const p of game.projectiles) {
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      }
    }

    function drawEnemyProjectiles() {
      ctx.fillStyle = "#fbbf24";
      for (const p of game.enemyProjectiles) {
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
      }
    }

    function drawLoot() {
      ctx.font = "12px Segoe UI";
      ctx.textBaseline = "middle";
      for (const l of game.loot) {
        ctx.fillStyle = "#fef08a";
        ctx.fillRect(l.x - 8, l.y - 8, 16, 16);
        ctx.fillStyle = "#111827";
        ctx.fillText(l.id ? ITEM_DEFS[l.id].name[0] : "$", l.x - 4, l.y + 0.5);
      }
    }

    function drawParticles(dt) {
      ctx.fillStyle = "#fff";
      const next = [];
      for (const p of game.particles) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 30 * dt;
        if (p.life > 0) {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
          next.push(p);
        }
      }
      game.particles = next;
    }

    function drawFloaters(dt) {
      ctx.font = "12px Segoe UI";
      ctx.textBaseline = "middle";
      const next = [];
      for (const f of game.floaters) {
        f.life -= dt;
        f.y -= 20 * dt;
        if (f.life > 0) {
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y);
          next.push(f);
        }
      }
      game.floaters = next;
    }
    // ===== Game loop =====
    let dtEstimate = 0.016;
    function tick(timestamp) {
      const dt = Math.min(0.05, (timestamp - game.lastTime) / 1000 || 0.016);
      dtEstimate = dt;
      game.lastTime = timestamp;
      if (game.state === "playing") {
        updatePlayer(dt);
        updateEnemies(dt);
        updateProjectiles(dt);
        updateEnemyProjectiles(dt);
        updateLoot();
        updateHud();
        game.screenShake = Math.max(0, game.screenShake - SHAKE_DECAY * dt);
      }
      render();
      requestAnimationFrame(tick);
    }
  }
})();
