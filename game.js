const W = 800;
const H = 600;
const CX = 400;
const CY = 318;
const SAVE_KEY = 'rocolapocalypse-cdmx-v1';
const BPM = 118;
const BEAT = 60000 / BPM;

const CABINET_KEYS = {
  P1_U: ['w'],
  P1_D: ['s'],
  P1_L: ['a'],
  P1_R: ['d'],
  P1_1: ['u'],
  P1_2: ['i'],
  P1_3: ['o'],
  P1_4: ['j'],
  P1_5: ['k'],
  P1_6: ['l'],
  P2_U: ['ArrowUp'],
  P2_D: ['ArrowDown'],
  P2_L: ['ArrowLeft'],
  P2_R: ['ArrowRight'],
  P2_1: ['r'],
  P2_2: ['t'],
  P2_3: ['y'],
  P2_4: ['f'],
  P2_5: ['g'],
  P2_6: ['h'],
  START1: ['Enter'],
  START2: ['2'],
};

const KEYBOARD_TO_ARCADE = {};
for (const a in CABINET_KEYS) {
  for (const k of CABINET_KEYS[a]) KEYBOARD_TO_ARCADE[normKey(k)] = a;
}

const held = Object.create(null);
const pressed = Object.create(null);

window.addEventListener('keydown', (e) => {
  const c = KEYBOARD_TO_ARCADE[normKey(e.key)];
  if (!c) return;
  if (!held[c]) pressed[c] = 1;
  held[c] = 1;
  e.preventDefault();
});

window.addEventListener('keyup', (e) => {
  const c = KEYBOARD_TO_ARCADE[normKey(e.key)];
  if (!c) return;
  held[c] = 0;
  e.preventDefault();
});

function normKey(k) {
  return k && k.length === 1 ? k.toLowerCase() : k;
}

function tap(k) {
  const v = pressed[k];
  pressed[k] = 0;
  return v;
}

function isDown(k) {
  return !!held[k];
}

function wipeTaps() {
  for (const k in pressed) pressed[k] = 0;
}

function store() {
  if (window.platanusArcadeStorage) return window.platanusArcadeStorage;
  return {
    async get(k) {
      try {
        const v = localStorage.getItem(k);
        return v ? { found: true, value: JSON.parse(v) } : { found: false, value: null };
      } catch (_) {
        return { found: false, value: null };
      }
    },
    async set(k, v) {
      localStorage.setItem(k, JSON.stringify(v));
    },
  };
}

function tone(sc, f, d, type, vol) {
  try {
    const ctx = sc.sound.context;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const n = ctx.currentTime;
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, n);
    g.gain.setValueAtTime(vol || 0.04, n);
    g.gain.exponentialRampToValueAtTime(0.001, n + (d || 0.07));
    o.connect(g);
    g.connect(ctx.destination);
    o.start(n);
    o.stop(n + (d || 0.07) + 0.02);
  } catch (_) {}
}

const SONGS = [
  ['CUMBIA RUSH', 0xf6ff00, 0xff2d95],
  ['PUNK DEPLOY', 0xff3344, 0x43f5ff],
  ['SONIDERO BOSS', 0x38ff88, 0xffb000],
  ['METRO NOCTURNO', 0x69a7ff, 0xff54d7],
];

new Phaser.Game({
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game-root',
  backgroundColor: '#07070f',
  physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: { preload, create, update },
});

function preload() {
  makeHero(this, 'p1', 0xeaff00, 0x0f1624);
  makeHero(this, 'p2', 0xff4fc3, 0x10151a);
  makeSuit(this, 'e0', 0xd51d2b, 0x23212b, 0);
  makeSuit(this, 'e1', 0xf04b36, 0x5b1920, 1);
  makeSuit(this, 'e2', 0xb20f45, 0x17171f, 2);
  makeBoss(this);
  makeRocola(this);
  dotTex(this);
}

function create() {
  this.mode = 'title';
  this.best = { score: 0, combo: 0 };
  this.score = 0;
  this.combo = 1;
  this.bestCombo = 1;
  this.meter = 0;
  this.rocolaHp = 100;
  this.wave = 0;
  this.songIndex = 0;
  this.song = SONGS[0];
  this.beatStart = 0;
  this.nextBeat = 0;
  this.lastBeat = 0;
  drawWorld(this);

  this.fx = this.add.graphics().setDepth(80);
  this.hud = this.add.graphics().setDepth(75);
  this.glow = this.add.circle(CX, CY, 116, 0xf6ff00, 0.08).setDepth(1);
  this.rocola = this.add.image(CX, CY, 'rocola').setDepth(20);
  this.bars = [];
  for (let i = 0; i < 10; i++) {
    const b = this.add.rectangle(CX - 45 + i * 10, CY - 6, 5, 12, i % 2 ? 0xff2d95 : 0xf6ff00, 0.9).setDepth(21);
    this.bars.push(b);
  }

  this.players = [
    newPlayer(this, 0, 332, 356, 'p1'),
    newPlayer(this, 1, 468, 356, 'p2'),
  ];
  this.players[1].on = false;
  this.players[1].s.setVisible(false);
  this.players[1].s.body.enable = false;

  this.enemies = this.physics.add.group();
  this.floaters = [];
  makeTextUI(this);
  loadBest(this);
  showTitle(this);
}

function update(time, delta) {
  if (!this.lastClock) this.lastClock = time;
  this.dt = Math.min(delta || 16, 40) / 16.6667;
  pulseBeat(this, time);
  animateRocola(this, time);
  updateFloaters(this, time);

  if (this.mode === 'title') {
    if (tap('START1') || tap('P1_1')) startRun(this, time, false);
    if (tap('START2') || tap('P2_1')) startRun(this, time, true);
    wipeTaps();
    return;
  }

  if (this.mode === 'over') {
    if (tap('START1') || tap('START2') || tap('P1_1') || tap('P2_1')) startRun(this, time, !!this.players[1].on);
    wipeTaps();
    return;
  }

  if (!this.players[1].on && (tap('START2') || tap('P2_1'))) joinP2(this, true);

  for (const p of this.players) updatePlayer(this, p, time);
  updateEnemies(this, time);
  updateSpawner(this, time);
  drawHUD(this);
  wipeTaps();
}

function startRun(sc, time, p2) {
  sc.mode = 'play';
  sc.score = 0;
  sc.combo = 1;
  sc.bestCombo = 1;
  sc.comboUntil = 0;
  sc.meter = 0;
  sc.rocolaHp = 100;
  sc.wave = 0;
  sc.toSpawn = 0;
  sc.nextSpawn = time + 500;
  sc.waitWave = 0;
  sc.beatStart = time;
  sc.nextBeat = time;
  sc.lastBeat = time;
  sc.overBox.setVisible(false);
  sc.titleBox.setVisible(false);
  clearEnemies(sc);
  resetPlayer(sc, sc.players[0], 332, 360);
  joinP2(sc, p2);
  if (p2) resetPlayer(sc, sc.players[1], 468, 360);
  nextWave(sc, time);
  pop(sc, 'DEFEND THE ROCOLA', CX, 120, 0xf6ff00, 28);
  tone(sc, 130, 0.18, 'sawtooth', 0.06);
}

function joinP2(sc, on) {
  const p = sc.players[1];
  p.on = !!on;
  p.s.setVisible(!!on);
  p.s.body.enable = !!on;
  if (on) pop(sc, 'P2 JOINED', 520, 110, 0xff4fc3, 22);
}

function gameOver(sc, time) {
  sc.mode = 'over';
  sc.physics.world.timeScale = 1;
  clearEnemies(sc);
  sc.best.score = Math.max(sc.best.score || 0, sc.score);
  sc.best.combo = Math.max(sc.best.combo || 0, sc.bestCombo);
  saveBest(sc);
  sc.overScore.setText('SCORE ' + sc.score + '\nBEST ' + sc.best.score + '\nMAX COMBO x' + sc.bestCombo + '\n\nSTART = OTRA ROLA');
  sc.overBox.setVisible(true);
  pop(sc, 'ROCOLA DOWN', CX, 115, 0xff3344, 34);
  sc.cameras.main.shake(450, 0.025);
  tone(sc, 70, 0.4, 'sawtooth', 0.07);
}

function nextWave(sc, time) {
  sc.wave++;
  sc.songIndex = (sc.wave - 1) % SONGS.length;
  sc.song = SONGS[sc.songIndex];
  sc.toSpawn = 5 + sc.wave * 2 + (sc.players[1].on ? 2 : 0);
  sc.nextSpawn = time + 500;
  sc.waitWave = 0;
  pop(sc, sc.song[0], CX, 96, sc.song[1], 26);
  if (sc.wave % 4 === 0) spawnEnemy(sc, 3, time);
}

function updateSpawner(sc, time) {
  if (sc.toSpawn > 0 && time > sc.nextSpawn) {
    const r = Math.random();
    let kind = 0;
    if (sc.wave > 2 && r > 0.68) kind = 1;
    if (sc.wave > 3 && r > 0.84) kind = 2;
    spawnEnemy(sc, kind, time);
    sc.toSpawn--;
    sc.nextSpawn = time + Math.max(320, 900 - sc.wave * 45);
  }
  if (sc.toSpawn <= 0 && sc.enemies.getChildren().length === 0) {
    if (!sc.waitWave) sc.waitWave = time + 1300;
    if (time > sc.waitWave) nextWave(sc, time);
  }
}

function updatePlayer(sc, p, time) {
  if (!p.on) return;
  const L = p.id ? 'P2_L' : 'P1_L';
  const R = p.id ? 'P2_R' : 'P1_R';
  const U = p.id ? 'P2_U' : 'P1_U';
  const D = p.id ? 'P2_D' : 'P1_D';
  const A = p.id ? 'P2_1' : 'P1_1';
  const B = p.id ? 'P2_2' : 'P1_2';
  let x = (isDown(R) ? 1 : 0) - (isDown(L) ? 1 : 0);
  let y = (isDown(D) ? 1 : 0) - (isDown(U) ? 1 : 0);
  if (x || y) {
    const m = Math.hypot(x, y);
    x /= m;
    y /= m;
    p.dx = x;
    p.dy = y;
  }
  let sp = time < p.stun ? 0 : 190;
  if (time < p.dash) {
    x = p.dx;
    y = p.dy;
    sp = 480;
  }
  p.s.setVelocity(x * sp, y * sp);
  p.s.x = Phaser.Math.Clamp(p.s.x, 54, W - 54);
  p.s.y = Phaser.Math.Clamp(p.s.y, 190, H - 58);
  p.s.setDepth(p.s.y + 10);
  p.s.setFlipX(p.dx < 0);
  p.s.setAlpha(time < p.inv ? 0.65 + Math.sin(time * 0.08) * 0.2 : 1);
  if (tap(A)) attack(sc, p, time);
  if (tap(B) || tap(p.id ? 'P2_4' : 'P1_4')) skill(sc, p, time);
}

function attack(sc, p, time) {
  if (time < p.attack) return;
  p.attack = time + 210;
  const good = onBeat(sc, time);
  const ax = p.s.x + p.dx * 44;
  const ay = p.s.y + p.dy * 30;
  let hits = 0;
  sc.fx.fillStyle(good ? sc.song[1] : 0xffffff, good ? 0.32 : 0.18);
  sc.fx.fillEllipse(ax, ay, good ? 118 : 92, 56);
  sc.time.delayedCall(60, () => sc.fx.clear());
  for (const e of sc.enemies.getChildren()) {
    if (!e.active) continue;
    if (Phaser.Math.Distance.Between(ax, ay, e.x, e.y) < (good ? 86 : 68)) {
      hitEnemy(sc, e, good ? 2 : 1, p.dx, p.dy, time, good);
      hits++;
    }
  }
  if (hits) {
    addCombo(sc, hits + (good ? 1 : 0), time);
    sc.score += hits * (good ? 35 : 18) * sc.combo;
    sc.meter = Math.min(100, sc.meter + hits * (good ? 13 : 6));
    pop(sc, good ? 'PERFECT' : 'HIT', p.s.x, p.s.y - 46, good ? sc.song[1] : 0xffffff, good ? 22 : 15);
    tone(sc, good ? 720 : 420, 0.055, 'square', 0.05);
    sc.cameras.main.shake(good ? 85 : 45, good ? 0.008 : 0.004);
  } else {
    tone(sc, 170, 0.035, 'triangle', 0.025);
  }
}

function skill(sc, p, time) {
  if (time < p.skill) return;
  p.skill = time + 420;
  const good = onBeat(sc, time);
  if (sc.meter >= 100) {
    sc.meter = 0;
    superBlast(sc, p, time);
    return;
  }
  p.dash = time + 160;
  p.inv = time + 260;
  trail(sc, p.s.x, p.s.y, p.dx, p.dy, p.id ? 0xff4fc3 : 0xeaff00);
  if (good) {
    pop(sc, 'PARRY', p.s.x, p.s.y - 52, sc.song[1], 20);
    radialHit(sc, p.s.x, p.s.y, 105, 1, time, true);
    sc.meter = Math.min(100, sc.meter + 16);
    tone(sc, 980, 0.06, 'sine', 0.055);
  }
}

function superBlast(sc, p, time) {
  const ring = sc.add.circle(CX, CY, 35).setStrokeStyle(7, sc.song[1], 1).setDepth(70);
  sc.tweens.add({ targets: ring, scale: 13, alpha: 0, duration: 520, onComplete: () => ring.destroy() });
  radialHit(sc, CX, CY, 430, 4, time, true);
  sc.score += 400 * sc.combo;
  pop(sc, 'ULTIMA CANCION', CX, 142, sc.song[1], 30);
  sc.cameras.main.shake(360, 0.02);
  tone(sc, 120, 0.12, 'sawtooth', 0.06);
  sc.time.delayedCall(80, () => tone(sc, 240, 0.12, 'sawtooth', 0.055));
  sc.time.delayedCall(160, () => tone(sc, 480, 0.16, 'sawtooth', 0.05));
}

function radialHit(sc, x, y, r, dmg, time, good) {
  let n = 0;
  for (const e of sc.enemies.getChildren()) {
    if (!e.active) continue;
    const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
    if (d < r) {
      hitEnemy(sc, e, dmg, (e.x - x) / Math.max(1, d), (e.y - y) / Math.max(1, d), time, good);
      n++;
    }
  }
  if (n) addCombo(sc, n, time);
}

function updateEnemies(sc, time) {
  for (const e of sc.enemies.getChildren()) {
    if (!e.active) continue;
    e.setDepth(e.y + 6);
    if (time < e.stun) {
      e.setVelocity(e.body.velocity.x * 0.9, e.body.velocity.y * 0.9);
      continue;
    }
    const target = enemyTarget(sc, e);
    const dx = target.x - e.x;
    const dy = target.y - e.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    let vx = (dx / dist) * e.spd;
    let vy = (dy / dist) * e.spd;
    if (e.kind === 1 && time > e.act && dist < 330) {
      e.act = time + 1900;
      e.charge = time + 460;
      e.cvX = (dx / dist) * 330;
      e.cvY = (dy / dist) * 330;
      e.setTint(0xfff0aa);
      sc.time.delayedCall(160, () => e.clearTint());
    }
    if (e.kind === 3 && time > e.act) {
      e.act = time + 2100;
      if (Math.random() < 0.55) {
        e.charge = time + 560;
        e.cvX = (dx / dist) * 260;
        e.cvY = (dy / dist) * 260;
        e.setTint(0xffffff);
        sc.time.delayedCall(140, () => e.clearTint());
      } else {
        spawnEnemy(sc, Math.random() < 0.5 ? 0 : 2, time);
        pop(sc, 'REFUERZOS', e.x, e.y - 60, 0xff3344, 14);
      }
    }
    if (time < e.charge) {
      vx = e.cvX;
      vy = e.cvY;
    }
    e.setVelocity(vx, vy);
    if (Phaser.Math.Distance.Between(e.x, e.y, CX, CY) < (e.kind === 3 ? 92 : 58) && time > e.hitAt) {
      e.hitAt = time + (e.kind === 3 ? 650 : 850);
      hurtRocola(sc, e.kind === 2 ? 8 : e.kind === 3 ? 12 : 5, time);
    }
    for (const p of sc.players) {
      if (!p.on || time < p.inv) continue;
      if (Phaser.Math.Distance.Between(e.x, e.y, p.s.x, p.s.y) < (e.kind === 3 ? 58 : 34) && time > e.hitAt) {
        e.hitAt = time + 650;
        p.stun = time + 260;
        p.inv = time + 620;
        breakCombo(sc);
        pop(sc, 'OUCH', p.s.x, p.s.y - 42, 0xff3344, 16);
        sc.cameras.main.shake(90, 0.008);
      }
    }
  }
}

function enemyTarget(sc, e) {
  if (e.kind === 2) return { x: CX, y: CY };
  let best = { x: CX, y: CY };
  let bd = 99999;
  for (const p of sc.players) {
    if (!p.on) continue;
    const d = Phaser.Math.Distance.Between(e.x, e.y, p.s.x, p.s.y);
    if (d < bd) {
      bd = d;
      best = p.s;
    }
  }
  if (bd > 210 || e.kind === 3) return { x: CX, y: CY };
  return best;
}

function spawnEnemy(sc, kind, time) {
  const side = Phaser.Math.Between(0, 3);
  let x = side < 2 ? (side ? W + 45 : -45) : Phaser.Math.Between(60, W - 60);
  let y = side < 2 ? Phaser.Math.Between(210, H - 70) : (side === 2 ? 170 : H + 40);
  const tex = kind === 3 ? 'boss' : kind === 2 ? 'e2' : kind === 1 ? 'e1' : 'e0';
  const e = sc.physics.add.sprite(x, y, tex);
  sc.enemies.add(e);
  e.kind = kind;
  e.hp = kind === 3 ? 24 + sc.wave * 2 : kind === 1 ? 4 : kind === 2 ? 3 : 2 + Math.floor(sc.wave / 3);
  e.spd = (kind === 3 ? 48 : kind === 2 ? 92 : kind === 1 ? 76 : 62) + sc.wave * 2;
  e.stun = 0;
  e.hitAt = 0;
  e.act = time + Phaser.Math.Between(700, 1600);
  e.charge = 0;
  e.setDepth(y);
  e.body.setSize(kind === 3 ? 58 : 28, kind === 3 ? 64 : 34);
}

function hitEnemy(sc, e, dmg, dx, dy, time, good) {
  e.hp -= dmg;
  e.stun = time + (good ? 250 : 150);
  e.setVelocity(dx * (good ? 260 : 160), dy * (good ? 260 : 160));
  spark(sc, e.x, e.y, good ? sc.song[1] : 0xfff7d0);
  e.setTint(good ? sc.song[1] : 0xffffff);
  sc.time.delayedCall(80, () => {
    if (e.active) e.clearTint();
  });
  if (e.hp <= 0) {
    sc.score += (e.kind === 3 ? 500 : 45 + e.kind * 25) * sc.combo;
    pop(sc, e.kind === 3 ? 'BOSS KO' : '+' + (45 + e.kind * 25), e.x, e.y - 28, good ? sc.song[1] : 0xf6ff00, e.kind === 3 ? 24 : 14);
    burst(sc, e.x, e.y, e.kind === 3 ? 22 : 9, e.kind === 3 ? 0xff3344 : sc.song[1]);
    e.destroy();
  }
}

function hurtRocola(sc, dmg, time) {
  sc.rocolaHp -= dmg;
  breakCombo(sc);
  sc.rocola.setTint(0xff3344);
  sc.time.delayedCall(80, () => sc.rocola.clearTint());
  pop(sc, '-' + dmg, CX, CY - 86, 0xff3344, 18);
  sc.cameras.main.shake(120, 0.01);
  tone(sc, 90, 0.09, 'sawtooth', 0.05);
  if (sc.rocolaHp <= 0) gameOver(sc, time);
}

function addCombo(sc, n, time) {
  sc.combo += n;
  sc.bestCombo = Math.max(sc.bestCombo, sc.combo);
  sc.comboUntil = time + 1800;
}

function breakCombo(sc) {
  if (sc.combo > 5) pop(sc, 'COMBO BREAK', CX, 188, 0xff3344, 18);
  sc.combo = 1;
  sc.comboUntil = 0;
}

function onBeat(sc, time) {
  const p = (time - sc.beatStart) % BEAT;
  return Math.min(p, BEAT - p) < 92;
}

function pulseBeat(sc, time) {
  if (!sc.nextBeat) sc.nextBeat = time;
  while (time >= sc.nextBeat) {
    sc.lastBeat = sc.nextBeat;
    sc.nextBeat += BEAT;
    const c = sc.song ? sc.song[1] : 0xf6ff00;
    const r = sc.add.circle(CX, CY, 34).setStrokeStyle(4, c, 0.8).setDepth(4);
    sc.tweens.add({ targets: r, scale: 5.5, alpha: 0, duration: BEAT * 1.4, onComplete: () => r.destroy() });
    if (sc.mode === 'play') tone(sc, sc.nextBeat % 4 < 2 ? 92 : 128, 0.035, 'sine', 0.025);
  }
}

function animateRocola(sc, time) {
  const beatGlow = onBeat(sc, time) ? 0.18 : 0.08;
  sc.glow.setFillStyle(sc.song ? sc.song[1] : 0xf6ff00, beatGlow);
  sc.rocola.y = CY + Math.sin(time * 0.006) * 3;
  for (let i = 0; i < sc.bars.length; i++) {
    const b = sc.bars[i];
    b.height = 10 + Math.abs(Math.sin(time * 0.008 + i)) * 30 + (onBeat(sc, time) ? 12 : 0);
    b.y = CY - 7 - b.height * 0.18;
    b.fillColor = i % 2 ? sc.song[2] : sc.song[1];
  }
  if (sc.mode === 'play' && sc.combo > 1 && sc.comboUntil && time > sc.comboUntil) breakCombo(sc);
}

function drawHUD(sc) {
  sc.hud.clear();
  sc.hud.fillStyle(0x07070f, 0.72).fillRect(0, 0, W, 70);
  bar(sc.hud, 22, 18, 210, 12, sc.rocolaHp / 100, 0xff3344, 0x361016);
  bar(sc.hud, 22, 42, 210, 10, sc.meter / 100, sc.song[1], 0x17231a);
  sc.scoreText.setText('SCORE ' + sc.score);
  sc.waveText.setText(sc.song[0] + '  WAVE ' + sc.wave);
  sc.comboText.setText(sc.combo > 1 ? 'COMBO x' + sc.combo : '');
  sc.bestText.setText('BEST ' + (sc.best.score || 0));
}

function bar(g, x, y, w, h, p, c, bg) {
  g.fillStyle(bg, 1).fillRect(x, y, w, h);
  g.fillStyle(c, 1).fillRect(x, y, Math.max(0, Math.min(1, p)) * w, h);
  g.lineStyle(1, 0xf7ffd8, 0.45).strokeRect(x, y, w, h);
}

function makeTextUI(sc) {
  const f = { fontFamily: 'monospace', fontSize: '18px', color: '#f7ffd8', fontStyle: 'bold' };
  sc.scoreText = sc.add.text(584, 14, 'SCORE 0', f).setDepth(90);
  sc.waveText = sc.add.text(260, 16, '', { ...f, fontSize: '15px', color: '#eaff00' }).setDepth(90);
  sc.comboText = sc.add.text(400, 43, '', { ...f, fontSize: '20px', color: '#ff4fc3' }).setOrigin(0.5, 0).setDepth(90);
  sc.bestText = sc.add.text(706, 42, 'BEST 0', { ...f, fontSize: '14px', color: '#9edbff' }).setDepth(90);

  sc.titleBox = sc.add.container(0, 0).setDepth(130);
  sc.titleBox.add(sc.add.rectangle(CX, CY, W, H, 0x07070f, 0.82));
  sc.titleBox.add(sc.add.text(CX, 116, 'ROCOLAPOCALYPSE', { fontFamily: 'monospace', fontSize: '48px', color: '#eaff00', fontStyle: 'bold' }).setOrigin(0.5));
  sc.titleBox.add(sc.add.text(CX, 164, 'CDMX: LA ULTIMA CANCION', { fontFamily: 'monospace', fontSize: '22px', color: '#ff4fc3', fontStyle: 'bold' }).setOrigin(0.5));
  sc.titleBox.add(sc.add.text(CX, 462, 'START1 = SOLO   START2 = CO-OP\nJOY + BTN1 golpea   BTN2 dash/parry/special\nDefiende la rocola. Perfect beats dan mas combo.', { fontFamily: 'monospace', fontSize: '17px', color: '#f7ffd8', align: 'center' }).setOrigin(0.5));

  sc.overBox = sc.add.container(0, 0).setDepth(135).setVisible(false);
  sc.overBox.add(sc.add.rectangle(CX, CY, W, H, 0x050507, 0.84));
  sc.overBox.add(sc.add.text(CX, 150, 'GAME OVER', { fontFamily: 'monospace', fontSize: '48px', color: '#ff3344', fontStyle: 'bold' }).setOrigin(0.5));
  sc.overScore = sc.add.text(CX, 242, '', { fontFamily: 'monospace', fontSize: '22px', color: '#f7ffd8', align: 'center', fontStyle: 'bold' }).setOrigin(0.5, 0);
  sc.overBox.add(sc.overScore);
}

function showTitle(sc) {
  sc.titleBox.setVisible(true);
  drawHUD(sc);
}

async function loadBest(sc) {
  const r = await store().get(SAVE_KEY);
  if (r.found && r.value && typeof r.value.score === 'number') sc.best = r.value;
  if (sc.bestText) sc.bestText.setText('BEST ' + (sc.best.score || 0));
}

function saveBest(sc) {
  store().set(SAVE_KEY, { score: sc.best.score || 0, combo: sc.best.combo || 0 });
}

function pop(sc, txt, x, y, col, size) {
  const t = sc.add.text(x, y, txt, { fontFamily: 'monospace', fontSize: (size || 16) + 'px', color: '#' + col.toString(16).padStart(6, '0'), fontStyle: 'bold', stroke: '#050507', strokeThickness: 4 }).setOrigin(0.5).setDepth(120);
  sc.floaters.push(t);
  sc.tweens.add({ targets: t, y: y - 34, alpha: 0, duration: 850, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
}

function updateFloaters(sc) {
  sc.floaters = sc.floaters.filter((f) => f.active);
}

function spark(sc, x, y, c) {
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const p = sc.add.image(x, y, 'dot').setTint(c).setDepth(100).setScale(Phaser.Math.FloatBetween(1, 2.4));
    sc.tweens.add({ targets: p, x: x + Math.cos(a) * Phaser.Math.Between(18, 48), y: y + Math.sin(a) * Phaser.Math.Between(12, 34), alpha: 0, duration: 260, onComplete: () => p.destroy() });
  }
}

function burst(sc, x, y, n, c) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const p = sc.add.rectangle(x, y, Phaser.Math.Between(3, 8), Phaser.Math.Between(3, 10), i % 2 ? c : 0xf6ff00).setDepth(99);
    sc.tweens.add({ targets: p, x: x + Math.cos(a) * Phaser.Math.Between(35, 95), y: y + Math.sin(a) * Phaser.Math.Between(28, 80), angle: Phaser.Math.Between(-260, 260), alpha: 0, duration: 620, onComplete: () => p.destroy() });
  }
}

function trail(sc, x, y, dx, dy, c) {
  for (let i = 0; i < 4; i++) {
    const r = sc.add.rectangle(x - dx * i * 12, y - dy * i * 12, 24, 32, c, 0.18).setDepth(40);
    sc.tweens.add({ targets: r, alpha: 0, scaleX: 1.8, duration: 180 + i * 30, onComplete: () => r.destroy() });
  }
}

function resetPlayer(sc, p, x, y) {
  p.s.setPosition(x, y);
  p.s.setVelocity(0, 0);
  p.dx = p.id ? -1 : 1;
  p.dy = 0;
  p.attack = 0;
  p.skill = 0;
  p.dash = 0;
  p.stun = 0;
  p.inv = 0;
}

function newPlayer(sc, id, x, y, tex) {
  const s = sc.physics.add.sprite(x, y, tex);
  s.body.setSize(24, 34);
  return { id, s, on: true, dx: id ? -1 : 1, dy: 0, attack: 0, skill: 0, dash: 0, stun: 0, inv: 0 };
}

function clearEnemies(sc) {
  for (const e of sc.enemies.getChildren()) e.destroy();
  sc.enemies.clear(true, true);
}

function drawWorld(sc) {
  const g = sc.add.graphics().setDepth(-20);
  g.fillStyle(0x07070f).fillRect(0, 0, W, H);
  for (let i = 0; i < 12; i++) {
    g.fillStyle(i % 2 ? 0x0d1020 : 0x101827, 1).fillRect(i * 70, 90 + (i % 3) * 15, 48, 130 + (i % 4) * 28);
    g.fillStyle(i % 3 ? 0xffdc5e : 0x43f5ff, 0.65);
    for (let y = 110; y < 245; y += 24) g.fillRect(i * 70 + 12, y, 9, 13);
  }
  g.fillStyle(0x111018).fillRect(0, 250, W, 350);
  g.fillStyle(0x1e1420).fillRect(0, 470, W, 130);
  g.lineStyle(2, 0x43f5ff, 0.3);
  for (let x = -160; x < W + 120; x += 90) g.lineBetween(x, H, x + 250, 250);
  g.lineStyle(1, 0xf6ff00, 0.18);
  for (let y = 282; y < H; y += 34) g.lineBetween(0, y, W, y);
  g.fillStyle(0xff4fc3, 1).fillRect(34, 142, 130, 30);
  g.fillStyle(0x43f5ff, 1).fillRect(626, 130, 122, 30);
  sc.add.text(99, 146, 'TACOS', { fontFamily: 'monospace', fontSize: '18px', color: '#07070f', fontStyle: 'bold' }).setOrigin(0.5).setDepth(-10);
  sc.add.text(687, 134, 'METRO', { fontFamily: 'monospace', fontSize: '18px', color: '#07070f', fontStyle: 'bold' }).setOrigin(0.5).setDepth(-10);
  for (let y = 0; y < H; y += 4) {
    g.fillStyle(0x000000, 0.15).fillRect(0, y, W, 2);
  }
}

function dotTex(sc) {
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0xffffff).fillCircle(4, 4, 4);
  g.generateTexture('dot', 8, 8);
  g.destroy();
}

function makeHero(sc, key, color, pants) {
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0x000000, 0.35).fillEllipse(20, 43, 28, 7);
  g.fillStyle(pants).fillRect(11, 24, 18, 16);
  g.fillStyle(color).fillRect(9, 17, 22, 12);
  g.fillStyle(0xffca94).fillCircle(20, 12, 8);
  g.fillStyle(0x151515).fillRect(12, 5, 16, 5);
  g.fillStyle(0xffffff).fillRect(15, 11, 3, 2).fillRect(22, 11, 3, 2);
  g.fillStyle(color).fillRect(5, 21, 5, 13).fillRect(30, 21, 5, 13);
  g.fillStyle(0x06060a).fillRect(12, 39, 6, 7).fillRect(23, 39, 6, 7);
  g.lineStyle(2, 0xffffff, 0.55).strokeRect(9, 17, 22, 12);
  g.generateTexture(key, 40, 48);
  g.destroy();
}

function makeSuit(sc, key, suit, dark, type) {
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0x000000, 0.32).fillEllipse(19, 41, 28, 7);
  g.fillStyle(dark).fillRect(9, 19, 20, 20);
  g.fillStyle(suit).fillTriangle(9, 19, 19, 31, 29, 19).fillRect(9, 23, 20, 14);
  g.fillStyle(0xffc18b).fillCircle(19, 12, 8);
  g.fillStyle(0x161616).fillRect(10, 6, 18, 5);
  g.fillStyle(type === 2 ? 0xff4fc3 : 0xffffff).fillRect(14, 12, 4, 2).fillRect(21, 12, 4, 2);
  g.fillStyle(0x07070f).fillRect(17, 22, 4, 12);
  if (type === 1) g.fillStyle(0x5b3620).fillRect(26, 26, 10, 10);
  if (type === 2) g.fillStyle(0x43f5ff).fillRect(5, 24, 5, 14);
  g.generateTexture(key, 38, 46);
  g.destroy();
}

function makeBoss(sc) {
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0x000000, 0.38).fillEllipse(42, 78, 64, 12);
  g.fillStyle(0x240b18).fillRect(18, 25, 48, 48);
  g.fillStyle(0xff3344).fillTriangle(18, 25, 42, 52, 66, 25).fillRect(18, 42, 48, 30);
  g.fillStyle(0xffc18b).fillCircle(42, 17, 15);
  g.fillStyle(0x08080d).fillRect(25, 5, 34, 9);
  g.fillStyle(0xffffff).fillRect(32, 16, 7, 3).fillRect(46, 16, 7, 3);
  g.fillStyle(0xf6ff00).fillRect(38, 37, 8, 27);
  g.lineStyle(3, 0xff4fc3, 0.7).strokeRect(18, 25, 48, 48);
  g.generateTexture('boss', 84, 88);
  g.destroy();
}

function makeRocola(sc) {
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0x080812).fillRect(14, 32, 92, 98);
  g.fillStyle(0x18102b).fillCircle(60, 32, 46);
  g.fillStyle(0x18102b).fillRect(14, 32, 92, 100);
  g.lineStyle(5, 0xf6ff00, 1).strokeCircle(60, 34, 38);
  g.lineStyle(4, 0xff4fc3, 1).strokeRect(25, 54, 70, 30);
  g.fillStyle(0x43f5ff, 0.9).fillRect(33, 62, 54, 14);
  g.fillStyle(0xff4fc3).fillCircle(60, 103, 18);
  g.fillStyle(0x07070f).fillCircle(60, 103, 9);
  g.lineStyle(3, 0x43f5ff, 1).strokeRect(32, 92, 56, 30);
  g.fillStyle(0xf6ff00).fillRect(37, 99, 6, 15).fillRect(50, 96, 6, 18).fillRect(63, 101, 6, 13).fillRect(76, 94, 6, 20);
  g.generateTexture('rocola', 120, 140);
  g.destroy();
}
