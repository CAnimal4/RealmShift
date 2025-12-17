(function () {
  // ===== Canvas and UI setup =====
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const ui = {
    start: document.getElementById("start-screen"),
    hud: document.getElementById("hud"),
    pause: document.getElementById("pause-screen"),
    crafting: document.getElementById("crafting-screen"),
    gameover: document.getElementById("gameover-screen"),
    victory: document.getElementById("victory-screen"),
    health: document.getElementById("health"),
    stamina: document.getElementById("stamina"),
    zone: document.getElementById("zone"),
    hotbar: document.getElementById("hotbar"),
    recipes: document.getElementById("recipes"),
    continueBtn: document.getElementById("continue-btn"),
  };

  const buttons = {
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

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  // ===== Constants & static data =====
  const TILE_SIZE = 32;
  const SAVE_KEY = "realmshift_save";

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
    basic_sword: { name: "Basic Sword", type: "weapon", damage: 16 },
    iron_sword: { name: "Iron Sword", type: "weapon", damage: 26 },
    bow: { name: "Bow", type: "ranged", damage: 14 },
    potion: { name: "Health Potion", type: "consumable", heal: 25 },
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
      desc: "Ore + Stone -> Strong Sword",
    },
    {
      name: "Bow",
      creates: { bow: 1 },
      requires: { wood: 3, ore: 1 },
      desc: "Wood + Ore -> Bow (ranged)",
    },
    {
      name: "Health Potion",
      creates: { potion: 1 },
      requires: { herb: 1, bottle: 1 },
      desc: "Herb + Bottle -> Heal 25",
    },
  ];

  const ENEMY_TYPES = {
    slime: { hp: 16, speed: 55, dmg: 8, color: "#6ee7b7", chase: 220 },
    rogue: { hp: 28, speed: 70, dmg: 12, color: "#f87171", chase: 240 },
    guardian: { hp: 40, speed: 60, dmg: 14, color: "#a78bfa", chase: 260 },
    boss: { hp: 160, speed: 65, dmg: 16, color: "#facc15", chase: 400 },
  };

  // ===== Mutable game state =====
  const game = {
    state: "menu", // menu | playing | paused | dead | victory
    lastTime: 0,
    camera: { x: 0, y: 0 },
    world: null,
    enemies: [],
    projectiles: [],
    enemyProjectiles: [],
    loot: [],
    doorUnlocked: false,
    bossDefeated: false,
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
    hotbar: [null, null, null, null, null, null],
    selectedSlot: 0,
  };

  // ===== Input handling =====
  const input = {
    up: false,
    down: false,
    left: false,
    right: false,
    interact: false,
    shift: false,
  };

  const mouse = { x: 0, y: 0 };

  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left + game.camera.x;
    mouse.y = e.clientY - rect.top + game.camera.y;
  });

  window.addEventListener("contextmenu", (e) => e.preventDefault());

  window.addEventListener("mousedown", (e) => {
    if (game.state !== "playing") return;
    if (e.button === 0) queueAttack();
    if (e.button === 2) queueRanged();
  });

  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    switch (e.key.toLowerCase()) {
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
      case "f":
        if (game.state === "playing") queueRanged();
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
        setHotbarIndex(parseInt(e.key, 10) - 1);
        break;
    }
  });

  window.addEventListener("keyup", (e) => {
    switch (e.key.toLowerCase()) {
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

  // ===== UI events =====
  buttons.start.onclick = () => {
    newGame();
    hideAllOverlays();
  };
  buttons.continue.onclick = () => {
    loadGame();
    hideAllOverlays();
  };
  buttons.resume.onclick = () => resumeGame();
  buttons.saveQuit.onclick = () => {
    saveGame();
    goToMenu();
  };
  buttons.quit.onclick = () => goToMenu();
  buttons.closeCraft.onclick = () => toggleCrafting(false);
  buttons.retry.onclick = () => {
    newGame();
    hideAllOverlays();
  };
  buttons.menu.onclick = () => goToMenu();
  buttons.playAgain.onclick = () => {
    newGame();
    hideAllOverlays();
  };
  buttons.victoryMenu.onclick = () => goToMenu();

  // ===== World generation =====
  // Handcrafted map with village, wilderness, dungeon.
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

    // Boundary walls
    for (let x = 0; x < width; x++) {
      tiles[0][x] = createTile(TILE.WALL);
      tiles[height - 1][x] = createTile(TILE.WALL);
    }
    for (let y = 0; y < height; y++) {
      tiles[y][0] = createTile(TILE.WALL);
      tiles[y][width - 1] = createTile(TILE.WALL);
    }

    // Village path
    for (let y = 15; y < 30; y++) {
      for (let x = 2; x < 18; x++) {
        tiles[y][x] = createTile(TILE.PATH);
      }
    }

    // Lake in wilderness
    for (let y = 8; y < 18; y++) {
      for (let x = 22; x < 32; x++) {
        tiles[y][x] = createTile(TILE.WATER);
      }
    }

    // Scatter resource tiles
    function scatter(type, count, hp = 12, rangeX, rangeY) {
      for (let i = 0; i < count; i++) {
        const x = (rangeX ? randInt(rangeX[0], rangeX[1]) : randInt(2, width - 3)) | 0;
        const y = (rangeY ? randInt(rangeY[0], rangeY[1]) : randInt(2, height - 3)) | 0;
        if (tiles[y][x].type === TILE.GRASS) tiles[y][x] = createTile(type, hp);
      }
    }
    scatter(TILE.TREE, 70, 14, [16, 44], [5, 38]);
    scatter(TILE.STONE, 35, 16, [20, 44], [6, 40]);
    scatter(TILE.ORE, 16, 20, [25, 44], [8, 36]);
    scatter(TILE.HERB, 18, 8, [14, 50], [6, 40]);

    // Dungeon layout
    const dungeon = { x1: 48, x2: 68, y1: 10, y2: 34 };
    for (let y = dungeon.y1; y <= dungeon.y2; y++) {
      for (let x = dungeon.x1; x <= dungeon.x2; x++) {
        const edge = x === dungeon.x1 || x === dungeon.x2 || y === dungeon.y1 || y === dungeon.y2;
        tiles[y][x] = createTile(edge ? TILE.D_WALL : TILE.D_FLOOR);
      }
    }

    // Corridor into dungeon
    for (let x = 44; x <= dungeon.x1; x++) {
      tiles[21][x] = createTile(TILE.PATH);
      tiles[22][x] = createTile(TILE.PATH);
    }

    // Locked door at entrance
    const doorPos = { x: dungeon.x1, y: 21 };
    tiles[doorPos.y][doorPos.x] = createTile(TILE.LOCKED_DOOR, 0);

    // Chests
    const chests = [
      {
        x: 30,
        y: 14,
        loot: [
          { id: "dungeon_key", qty: 1 },
          { id: "ore", qty: 2 },
          { id: "bottle", qty: 2 },
        ],
        opened: false,
      },
      {
        x: 52,
        y: 30,
        loot: [
          { id: "potion", qty: 2 },
          { id: "ore", qty: 2 },
        ],
        opened: false,
      },
    ];
    chests.forEach((c) => {
      tiles[c.y][c.x] = createTile(TILE.CHEST);
    });

    return { width, height, tiles, chests, doorPos, dungeon };
  }

  // ===== Helpers =====
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

  // ===== Inventory =====
  function addItem(id, qty = 1) {
    if (!ITEM_DEFS[id]) return;
    player.inventory[id] = (player.inventory[id] || 0) + qty;
    // Autofill hotbar slot if empty and not a quest item
    const idx = player.hotbar.findIndex((s) => s === null && ITEM_DEFS[id].type !== "quest");
    if (idx !== -1) player.hotbar[idx] = id;
    refreshHotbar();
  }

  function removeItems(cost) {
    for (const [id, qty] of Object.entries(cost)) {
      player.inventory[id] = Math.max(0, (player.inventory[id] || 0) - qty);
    }
    refreshHotbar();
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

  // ===== Crafting UI =====
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
        buildCraftingUI();
      };
      div.appendChild(btn);
      ui.recipes.appendChild(div);
    });
  }

  function toggleCrafting(force) {
    if (game.state !== "playing" && ui.crafting.classList.contains("hidden") === false) return;
    const show = force !== undefined ? force : ui.crafting.classList.contains("hidden");
    if (show) {
      buildCraftingUI();
      ui.crafting.classList.remove("hidden");
    } else {
      ui.crafting.classList.add("hidden");
    }
  }

  // ===== Game init / save-load =====
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
      invuln: 0,
      attackCooldown: 0,
      facing: { x: 1, y: 0 },
      inventory: {},
      hotbar: ["basic_sword", "potion", null, null, null, null],
      selectedSlot: 0,
    });
    addItem("wood", 3);
    addItem("stone", 2);
    addItem("herb", 1);
    addItem("bottle", 1);
    game.world = generateWorld();
    game.enemies = spawnEnemies(game.world);
    game.projectiles = [];
    game.enemyProjectiles = [];
    game.loot = [];
    game.doorUnlocked = false;
    game.bossDefeated = false;
    game.state = "playing";
    ui.hud.classList.remove("hidden");
    ui.start.classList.add("hidden");
    ui.gameover.classList.add("hidden");
    ui.victory.classList.add("hidden");
    ui.pause.classList.add("hidden");
    ui.crafting.classList.add("hidden");
    refreshHotbar();
    updateHud();
  }

  function loadGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      Object.assign(player, data.player);
      player.invuln = 0;
      player.attackCooldown = 0;
      game.world = generateWorld();
      game.doorUnlocked = data.doorUnlocked;
      game.bossDefeated = data.bossDefeated;
      game.world.chests.forEach((c) => {
        if (data.openedChests?.some((p) => p.x === c.x && p.y === c.y)) {
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
      game.state = "playing";
      hideAllOverlays();
      refreshHotbar();
      updateHud();
    } catch (e) {
      console.error("Failed to load save", e);
      newGame();
    }
  }

  function saveGame() {
    const openedChests = game.world.chests.filter((c) => c.opened).map((c) => ({ x: c.x, y: c.y }));
    const data = {
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
      },
      doorUnlocked: game.doorUnlocked,
      bossDefeated: game.bossDefeated,
      openedChests,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    ui.continueBtn.style.display = "inline-block";
  }

  // ===== Enemies =====
  function spawnEnemies(world, bossDead = false) {
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
    };
  }

  // Simple AI: chase when close, wander when far.
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
      game.enemyProjectiles.push({ x: enemy.x, y: enemy.y, vx, vy, speed: 180, life: 2.5, dmg: 12 });
    }
  }

  // ===== Player actions =====
  function queueAttack() {
    performMelee();
  }

  function queueRanged() {
    const item = ITEM_DEFS[getEquippedItem()];
    if (item?.type === "ranged") performRanged(item);
  }

  function performMelee() {
    if (player.attackCooldown > 0) return;
    const item = ITEM_DEFS[getEquippedItem()];
    const dmg = item?.damage || 10;
    player.attackCooldown = 0.35;
    const aim = { x: mouse.x - player.x, y: mouse.y - player.y };
    const mag = Math.hypot(aim.x, aim.y) || 1;
    aim.x /= mag;
    aim.y /= mag;
    player.facing = { ...aim };
    const hitbox = { x: player.x + aim.x * 16 - 18, y: player.y + aim.y * 16 - 18, w: 36, h: 36 };
    resolveAttack(hitbox, dmg);
  }

  function performRanged(itemDef) {
    if (player.attackCooldown > 0) return;
    player.attackCooldown = 0.5;
    const dir = { x: mouse.x - player.x, y: mouse.y - player.y };
    const mag = Math.hypot(dir.x, dir.y) || 1;
    dir.x /= mag;
    dir.y /= mag;
    player.facing = { ...dir };
    game.projectiles.push({ x: player.x, y: player.y, vx: dir.x, vy: dir.y, speed: 260, life: 1.8, dmg: itemDef.damage || 10 });
  }

  function resolveAttack(hitbox, dmg) {
    for (const e of game.enemies) {
      if (e.hp <= 0) continue;
      const rect = { x: e.x - 14, y: e.y - 14, w: 28, h: 28 };
      if (rectsOverlap(hitbox, rect)) {
        if (e.invuln <= 0) {
          e.hp -= dmg;
          e.invuln = 0.2;
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
    game.loot.push({ x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2, id, qty: 1 + (Math.random() < 0.3 ? 1 : 0) });
  }

  function onEnemyKilled(enemy) {
    const drops = ["wood", "stone", "ore", "herb", "potion"];
    const id = drops[randInt(0, drops.length - 1)];
    game.loot.push({ x: enemy.x, y: enemy.y, id, qty: id === "potion" ? 1 : randInt(1, 2) });
    if (enemy.type === "boss") {
      game.bossDefeated = true;
      setTimeout(() => showVictory(), 400);
    }
  }

  // ===== Interaction (chests, locked door) =====
  function handleInteract() {
    for (const chest of game.world.chests) {
      if (chest.opened) continue;
      const dx = Math.abs(player.x - (chest.x * TILE_SIZE + 16));
      const dy = Math.abs(player.y - (chest.y * TILE_SIZE + 16));
      if (dx < 28 && dy < 28) {
        chest.opened = true;
        chest.loot.forEach((l) => addItem(l.id, l.qty));
        game.world.tiles[chest.y][chest.x] = createTile(TILE.CHEST_OPEN);
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
        refreshHotbar();
      }
    }
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

    let speed = player.speed;
    const sprinting = (moveX !== 0 || moveY !== 0) && input.shift && player.stamina > 0;
    if (sprinting) {
      speed *= 1.4;
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
        addItem(l.id, l.qty);
      } else {
        remaining.push(l);
      }
    }
    game.loot = remaining;
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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const camX = clamp(player.x - canvas.width / 2, 0, game.world.width * TILE_SIZE - canvas.width);
    const camY = clamp(player.y - canvas.height / 2, 0, game.world.height * TILE_SIZE - canvas.height);
    game.camera.x = camX;
    game.camera.y = camY;

    ctx.save();
    ctx.translate(-camX, -camY);

    drawWorld();
    drawLoot();
    drawProjectiles();
    drawEnemies();
    drawPlayer();
    drawEnemyProjectiles();

    ctx.restore();
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
      ctx.fillText(ITEM_DEFS[l.id].name[0], l.x - 4, l.y + 0.5);
    }
  }

  // ===== Game loop =====
  function tick(timestamp) {
    const dt = Math.min(0.05, (timestamp - game.lastTime) / 1000);
    game.lastTime = timestamp;
    if (game.state === "playing") {
      updatePlayer(dt);
      updateEnemies(dt);
      updateProjectiles(dt);
      updateEnemyProjectiles(dt);
      updateLoot();
      updateHud();
    }
    render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ===== Startup =====
  if (localStorage.getItem(SAVE_KEY)) ui.continueBtn.style.display = "inline-block";

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === "playing") togglePause();
  });
})();
