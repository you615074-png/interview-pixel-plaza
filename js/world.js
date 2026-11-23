/* 像素广场：地图、角色移动、碰撞、房间标签、互动与对话。
 * 素材（均为 Kenney 官方 CC0 包）：Tiny Town、Tiny Dungeon、Roguelike Pack。 */
const World = (function () {
  const TILE = 16, COLS = 20, ROWS = 12;
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;
  ctx.imageSmoothingEnabled = false;

  const stageEl = document.getElementById('stage');
  const labelsEl = document.getElementById('labels');
  const promptEl = document.getElementById('prompt');
  const dialogEl = document.getElementById('dialog');
  const dlgName = document.getElementById('dlg-name');
  const dlgText = document.getElementById('dlg-text');

  // 三张素材表。Tiny Town / Tiny Dungeon 每格 16px；Roguelike 每格 16px + 1px 间距（步长 17）。
  const SHEETS = {
    tt: { src: 'assets/tiny-town-tilemap.png', stride: 16, img: new Image() },
    td: { src: 'assets/tiny-dungeon-tilemap.png', stride: 16, img: new Image() },
    rl: { src: 'assets/roguelike-sheet.png', stride: 17, img: new Image() }
  };

  // 精灵坐标 (列, 行)
  const SPR = {
    grass: { s: 'tt', c: 0, r: 0 },
    cobble: { s: 'rl', c: 5, r: 3 },        // 广场棕色石板
    cobbleAlt: { s: 'rl', c: 8, r: 3 },
    stone: { s: 'rl', c: 6, r: 3 },         // 灰色石板小路
    sign: { s: 'tt', c: 11, r: 6 },
    treeG: [[4, 0], [4, 1], [4, 2]],
    treeO: [[3, 0], [3, 1], [3, 2]],
    red: [[[4, 4], [5, 4], [6, 4]], [[4, 5], [5, 5], [6, 5]], [[4, 6], [5, 6], [6, 6]]],
    blue: [[[0, 4], [1, 4], [2, 4]], [[0, 5], [1, 5], [2, 5]], [[0, 6], [1, 6], [2, 6]]],
    flowerW: { s: 'rl', c: 2, r: 9 },       // 白花草地
    flowerP: { s: 'rl', c: 3, r: 10 },
    flowerR: { s: 'rl', c: 2, r: 6 },       // 红花草地
    awningTL: { s: 'rl', c: 10, r: 0 }, awningTR: { s: 'rl', c: 11, r: 0 },
    awningBL: { s: 'rl', c: 10, r: 1 }, awningBR: { s: 'rl', c: 11, r: 1 },
    fire: { s: 'rl', c: 14, r: 8 },         // 篝火
    crate: { s: 'rl', c: 13, r: 7 },        // 木箱
    bench: { s: 'rl', c: 10, r: 4 }         // 木桌 / 长凳
  };
  const CHAR = {
    player: [1, 7],   // Tiny Dungeon
    teacher: [3, 7],
    guide: [0, 9],
    curator: [1, 8]
  };

  // 建筑：c/r 为左上角格子；屋顶在第 r 行，墙在 r+1，地基在 r+2，门在地基中间，门前一格是互动位置
  const BUILDINGS = [
    { key: 'board', c: 3, r: 1, style: 'red', door: [4, 3] },
    { key: 'hall', c: 12, r: 1, style: 'blue', door: [13, 3] },
    { key: 'report', c: 15, r: 6, style: 'red', door: [16, 8] },
    { key: 'showcase', c: 1, r: 5, style: 'blue', door: [2, 7] }
  ];
  const TREES = [[0, 2], [0, 8], [18, 2], [19, 5], [18, 9], [17, 11], [13, 10], [16, 3], [7, 4]];
  const SIGN = { c: 7, r: 6 };
  // 实体（有碰撞、会按纵向排序绘制）
  const OBJECTS = [
    { sprite: SPR.bench, c: 10, r: 4, solid: true },
    { sprite: SPR.crate, c: 12, r: 8, solid: true },
    { sprite: SPR.fire, c: 19, r: 7, solid: true }
  ];
  const NPCS = [
    { key: 'teacher', c: 9, r: 4, sprite: CHAR.teacher, sheet: 'td' },
    { key: 'guide', c: 13, r: 7, sprite: CHAR.guide, sheet: 'td' },
    { key: 'curator', c: 6, r: 11, sprite: CHAR.curator, sheet: 'td' }
  ];
  // 草地上的花丛与市集棚（不挡路，只做装饰）
  const DECOR = [
    { sprite: SPR.flowerW, c: 17, r: 5 }, { sprite: SPR.flowerP, c: 18, r: 6 }, { sprite: SPR.flowerR, c: 17, r: 6 },
    { sprite: SPR.flowerP, c: 12, r: 10 }, { sprite: SPR.flowerW, c: 14, r: 9 }, { sprite: SPR.flowerR, c: 4, r: 10 },
    { sprite: SPR.flowerW, c: 3, r: 11 }, { sprite: SPR.flowerP, c: 9, r: 0 }, { sprite: SPR.flowerR, c: 8, r: 10 },
    { sprite: SPR.flowerW, c: 15, r: 11 }, { sprite: SPR.flowerP, c: 6, r: 0 }
  ];
  const AWNING = { c: 7, r: 0 };

  // 碰撞网格
  const solid = new Uint8Array(COLS * ROWS);
  const setSolid = (c, r) => { if (c >= 0 && r >= 0 && c < COLS && r < ROWS) solid[r * COLS + c] = 1; };
  BUILDINGS.forEach(b => { for (let dr = 1; dr <= 2; dr++) for (let dc = 0; dc < 3; dc++) setSolid(b.c + dc, b.r + dr); });
  TREES.forEach(([c, r]) => setSolid(c, r));
  OBJECTS.forEach(o => { if (o.solid) setSolid(o.c, o.r); });
  setSolid(SIGN.c, SIGN.r);
  NPCS.forEach(n => setSolid(n.c, n.r));

  // 地面：棕色石板广场，南侧灰色小路，其余为草地
  function groundAt(c, r) {
    if (c >= 6 && c <= 13 && r >= 5 && r <= 8) return (c * 7 + r * 3) % 3 ? SPR.cobbleAlt : SPR.cobble;
    if ((c === 9 || c === 10) && r >= 9) return SPR.stone;
    return SPR.grass;
  }

  // 互动点：tile 为「站在哪里可以互动」（NPC 用其自身格子，距离判断）
  const INTERACTS = [
    { key: 'board', tile: [4, 4], run: () => UI.openCareers() },
    { key: 'hall', tile: [13, 4], run: () => UI.openHall() },
    { key: 'report', tile: [16, 9], run: () => UI.openReport() },
    { key: 'showcase', tile: [2, 8], run: () => UI.openShowcase() },
    { key: 'sign', tile: [7, 7], run: () => UI.openData() },
    { key: 'teacher', tile: [9, 4], run: () => say('周老师', TALK.teacher) },
    { key: 'guide', tile: [13, 7], run: () => say('小助手', TALK.guide) },
    { key: 'curator', tile: [6, 11], run: () => say('展馆讲解员', TALK.curator) }
  ];
  const TALK = {
    teacher: [
      '欢迎来到面试广场。我是周老师，这里是 AI 双向模拟面试的场地。',
      '每个房间门口都有木牌，写着它是做什么的。先去「职业公告板」挑一个岗位，看清每条任职要求。',
      '进「模拟面试室」，你可以当候选人，也可以当面试官。两种视角最后都会汇到同一张证据表上。',
      '「报告馆」里有总分、证据对照表和两种视角的结论。不知道去哪里？按顶部的「广场导览」。'
    ],
    guide: [
      '操作很简单：方向键 / WASD 移动，E 或空格键互动，Esc 关闭面板。手机上用屏幕下方的按钮。',
      '想换身份？顶部的「切换视角」可以切换。候选人要回答问题；面试官要判断回答里的证据够不够。',
      '所有岗位数据都标注了来源：复盘样本与模拟补充分开标。详情见「数据说明」木牌。'
    ],
    curator: [
      '欢迎来到成果展馆。这里是项目目前已经完成的部分。',
      '复盘总结是从真实的面试复盘里提炼出来的几条通用经验，个人信息已经去掉。',
      '最后是网站的完成进度：已经上线的模块都列在这里。'
    ]
  };

  // 玩家
  const player = { x: 9 * TILE, y: 8 * TILE, flip: false, moving: false, t: 0 };
  const keys = {};
  const touchDir = { up: false, down: false, left: false, right: false };
  let nearest = null;

  /* ---------- 房间标签（DOM 叠加在画布上，位置按格子换算成百分比） ---------- */
  const pct = (px, total) => (px / total) * 100;
  function addLabel(cls, x, y, html) {
    const el = document.createElement('div');
    el.className = 'room-sign ' + cls;
    el.style.left = pct(x, canvas.width) + '%';
    el.style.top = pct(y, canvas.height) + '%';
    el.innerHTML = html;
    labelsEl.appendChild(el);
  }
  function buildLabels() {
    labelsEl.innerHTML = '';
    BUILDINGS.forEach(b => {
      const room = ROOMS[b.key];
      // 门前一格的下一行放木牌，不挡住站在门口的角色
      addLabel('', (b.c + 1.5) * TILE, (b.r + 4) * TILE,
        `<b>${room.name}</b><span>${room.short}</span>`);
    });
    addLabel('', (SIGN.c + 0.5) * TILE, (SIGN.r + 2) * TILE, `<b>${ROOMS.sign.name}</b><span>${ROOMS.sign.short}</span>`);
    NPCS.forEach(n => addLabel('npc', (n.c + 0.5) * TILE, (n.r - 0.9) * TILE, `<b>${ROOMS[n.key].name}</b>`));
  }

  /* ---------- 对话 ---------- */
  let talkQueue = null, talkIdx = 0, typing = null, typedFull = '';
  function say(name, lines) {
    talkQueue = lines.slice();
    talkIdx = 0;
    dlgName.textContent = name;
    dialogEl.hidden = false;
    typeLine(talkQueue[0]);
  }
  function typeLine(text) {
    clearInterval(typing);
    typedFull = text;
    let i = 0;
    dlgText.textContent = '';
    typing = setInterval(() => {
      i += 2;
      dlgText.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typing);
    }, 28);
  }
  function advanceTalk() {
    if (typing && dlgText.textContent.length < typedFull.length) {
      clearInterval(typing);
      dlgText.textContent = typedFull;
      return;
    }
    talkIdx++;
    if (talkIdx >= talkQueue.length) closeTalk();
    else typeLine(talkQueue[talkIdx]);
  }
  function closeTalk() {
    clearInterval(typing);
    dialogEl.hidden = true;
    talkQueue = null;
  }
  const talking = () => !!talkQueue;

  /* ---------- 移动与碰撞 ---------- */
  function blocked(x, y) {
    const x0 = x + 4, x1 = x + 11.99, y0 = y + 10, y1 = y + 15.99;
    const c0 = Math.floor(x0 / TILE), c1 = Math.floor(x1 / TILE);
    const r0 = Math.floor(y0 / TILE), r1 = Math.floor(y1 / TILE);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
      if (solid[r * COLS + c]) return true;
    }
    return false;
  }
  function currentDir() {
    let dx = 0, dy = 0;
    if (keys.ArrowLeft || keys.a || keys.A || touchDir.left) dx -= 1;
    if (keys.ArrowRight || keys.d || keys.D || touchDir.right) dx += 1;
    if (keys.ArrowUp || keys.w || keys.W || touchDir.up) dy -= 1;
    if (keys.ArrowDown || keys.s || keys.S || touchDir.down) dy += 1;
    return { dx, dy };
  }
  function update(dt) {
    if (UI.blocking()) { player.moving = false; return; }
    let { dx, dy } = currentDir();
    player.moving = !!(dx || dy);
    if (!player.moving) return;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
    const speed = 0.062 * dt;
    if (dx < 0) player.flip = true;
    if (dx > 0) player.flip = false;
    const nx = player.x + dx * speed;
    if (!blocked(nx, player.y)) player.x = nx;
    const ny = player.y + dy * speed;
    if (!blocked(player.x, ny)) player.y = ny;
    player.t += dt;
  }

  /* ---------- 互动 ---------- */
  function feetCenter() { return { x: player.x + 8, y: player.y + 12 }; }
  function findNearest() {
    const p = feetCenter();
    let best = null, bestD = 26;
    INTERACTS.forEach(it => {
      const d = Math.hypot(it.tile[0] * TILE + 8 - p.x, it.tile[1] * TILE + 8 - p.y);
      if (d < bestD) { bestD = d; best = it; }
    });
    return best;
  }
  function promptText(it) {
    const room = ROOMS[it.key];
    if (NPCS.some(n => n.key === it.key)) return `按 E / A · 和${room.name}说话`;
    return `按 E / A · 进入${room.name}：${room.short}`;
  }
  function interact() {
    if (talking()) { advanceTalk(); return; }
    if (UI.blocking()) return;
    const it = findNearest();
    if (it) it.run();
  }

  /* ---------- 绘制 ---------- */
  function spr(sheetKey, c, r, x, y, flip) {
    const sh = SHEETS[sheetKey];
    const sx = c * sh.stride, sy = r * sh.stride;
    x = Math.round(x); y = Math.round(y);
    if (flip) {
      ctx.save();
      ctx.translate(x + TILE, y);
      ctx.scale(-1, 1);
      ctx.drawImage(sh.img, sx, sy, TILE, TILE, 0, 0, TILE, TILE);
      ctx.restore();
    } else {
      ctx.drawImage(sh.img, sx, sy, TILE, TILE, x, y, TILE, TILE);
    }
  }
  const drawCell = (cell, x, y, flip) => spr(cell.s, cell.c, cell.r, x, y, flip);

  function drawGround() {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) drawCell(groundAt(c, r), c * TILE, r * TILE);
    DECOR.forEach(d => drawCell(d.sprite, d.c * TILE, d.r * TILE));
    // 市集棚（2×2）
    drawCell(SPR.awningTL, AWNING.c * TILE, AWNING.r * TILE);
    drawCell(SPR.awningTR, (AWNING.c + 1) * TILE, AWNING.r * TILE);
    drawCell(SPR.awningBL, AWNING.c * TILE, (AWNING.r + 1) * TILE);
    drawCell(SPR.awningBR, (AWNING.c + 1) * TILE, (AWNING.r + 1) * TILE);
  }
  function drawBuilding(b) {
    const set = SPR[b.style];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const [c, r] = set[row][col];
      spr('tt', c, r, (b.c + col) * TILE, (b.r + row) * TILE);
    }
  }
  function drawTree(c, r, i) {
    const t = i % 2 ? SPR.treeO : SPR.treeG;
    for (let k = 0; k < 3; k++) spr('tt', t[k][0], t[k][1], c * TILE, (r - 2 + k) * TILE);
  }

  function render(ts) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGround();

    const items = [];
    BUILDINGS.forEach(b => items.push({ y: (b.r + 3) * TILE, draw: () => drawBuilding(b) }));
    TREES.forEach(([c, r], i) => items.push({ y: (r + 1) * TILE, draw: () => drawTree(c, r, i) }));
    items.push({ y: (SIGN.r + 1) * TILE, draw: () => spr('tt', SPR.sign.c, SPR.sign.r, SIGN.c * TILE, SIGN.r * TILE) });
    OBJECTS.forEach(o => items.push({ y: (o.r + 1) * TILE, draw: () => drawCell(o.sprite, o.c * TILE, o.r * TILE) }));
    NPCS.forEach(n => items.push({
      y: (n.r + 1) * TILE,
      draw: () => {
        const bob = Math.sin(ts / 600 + n.c) > 0.6 ? -1 : 0;
        spr(n.sheet, n.sprite[0], n.sprite[1], n.c * TILE, n.r * TILE + bob, false);
      }
    }));
    items.push({
      y: player.y + TILE,
      draw: () => {
        const bob = player.moving ? (Math.floor(player.t / 120) % 2 ? -1 : 0) : 0;
        spr('td', CHAR.player[0], CHAR.player[1], player.x, player.y + bob, player.flip);
      }
    });
    items.sort((a, b) => a.y - b.y).forEach(i => i.draw());

    if (nearest) {
      const [c, r] = nearest.tile;
      ctx.strokeStyle = 'rgba(255,230,140,0.95)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(c * TILE + 0.5, r * TILE + 0.5, TILE - 1, TILE - 1);
      ctx.setLineDash([]);
    }
  }

  function updatePrompt() {
    if (talking() || UI.blocking()) { promptEl.hidden = true; nearest = null; return; }
    nearest = findNearest();
    if (nearest) {
      promptEl.hidden = false;
      promptEl.textContent = promptText(nearest);
    } else {
      promptEl.hidden = true;
    }
  }

  let last = 0;
  function loop(ts) {
    const dt = Math.min(50, last ? ts - last : 16);
    last = ts;
    update(dt);
    updatePrompt();
    render(ts);
    requestAnimationFrame(loop);
  }

  /* ---------- 输入 ---------- */
  function bindInput() {
    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'Escape') { if (talking()) closeTalk(); else UI.close(); return; }
      if (e.key === 'e' || e.key === 'E' || e.key === ' ' || e.key === 'Enter') {
        if (!e.repeat) interact();
        return;
      }
      keys[e.key] = true;
    });
    window.addEventListener('keyup', e => { keys[e.key] = false; });
    window.addEventListener('blur', () => Object.keys(keys).forEach(k => keys[k] = false));

    document.querySelectorAll('[data-dir]').forEach(btn => {
      const dir = btn.dataset.dir;
      const on = e => { e.preventDefault(); touchDir[dir] = true; };
      const off = () => { touchDir[dir] = false; };
      btn.addEventListener('pointerdown', on);
      btn.addEventListener('pointerup', off);
      btn.addEventListener('pointerleave', off);
      btn.addEventListener('pointercancel', off);
    });
    document.getElementById('btn-act').addEventListener('click', () => interact());
    dialogEl.addEventListener('click', () => { if (talking()) advanceTalk(); });
    canvas.addEventListener('click', () => { if (nearest && !talking() && !UI.blocking()) interact(); });
  }

  /* ---------- 启动：三张素材都加载完成后开始 ---------- */
  let ready = 0;
  function init() {
    buildLabels();
    bindInput();
    requestAnimationFrame(loop);
  }
  Object.values(SHEETS).forEach(sh => {
    sh.img.onload = () => { if (++ready === Object.keys(SHEETS).length) init(); };
    sh.img.onerror = () => { promptEl.hidden = false; promptEl.textContent = '素材加载失败，请检查 assets 目录'; };
    sh.img.src = sh.src;
  });

  return { say, talking, closeTalk };
})();
