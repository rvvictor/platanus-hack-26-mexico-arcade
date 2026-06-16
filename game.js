const W = 800;
const H = 600;
const CX = 400;
const CY = 335;
const SAVE_KEY = 'rocolapocalypse-cdmx-v1';
const BPM = 126;
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

function tone(sc, f, d, type, vol, delay) {
  try {
    const ctx = sc.sound.context;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const n = ctx.currentTime + (delay || 0);
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

function songTone(sc, f, d, type, vol, delay) {
  tone(sc, f, d, type, (vol || 0.03) * (sc.musicVol || 1), delay);
}

const SONGS = [
  ['ROCOLA CUMBION', 0xf6ff00, 0xff2d95, 220],
  ['SONIDERO NEON', 0x38ff88, 0xffb000, 196],
  ['METRO FIESTA', 0x69a7ff, 0xff54d7, 247],
  ['NOCHE GARIBALDI', 0xff3344, 0x43f5ff, 175],
];
const MELO = [0, 7, 9, 12, 14, 12, 9, 7, 5, 9, 12, 16, 14, 12, 9, 5];
const PROG = [0, 5, 9, 7];
const CHORD = [0, 4, 7, 12];

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
  makeBackdrop(this);
  makeLuchador(this, 'p1', 0xeaff00, 0x0f1624, 0xff3344);
  makeLuchador(this, 'p2', 0xff4fc3, 0x10151a, 0x43f5ff);
  makeNopal(this, 'e0', 0x38d66f, 0x0f6136, 0);
  makeNopal(this, 'e1', 0x9cff47, 0x126d42, 1);
  makeCalaca(this, 'e2');
  makeBoss(this);
  makeRocola(this);
  makePickupTex(this);
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
  this.musicVol = 1;
  this.duckUntil = 0;
  this.musicStep = 0;
  drawWorld(this);
  makeAmbience(this);

  this.fx = this.add.graphics().setDepth(80);
  this.hud = this.add.graphics().setDepth(75);
  this.glow = this.add.circle(CX, CY, 130, 0xf6ff00, 0.08).setDepth(1);
  this.rocolaAura = this.add.ellipse(CX, CY + 52, 190, 86, 0x43f5ff, 0.07).setDepth(2);
  this.rocola = this.add.image(CX, CY, 'rocola').setDepth(20).setScale(1.05);
  this.beatTarget = this.add.circle(CX, CY - 100, 9, 0xf7ffd8, 0.28).setDepth(22);
  this.beatNeedle = this.add.circle(CX, CY - 100, 6, 0xf6ff00, 0.95).setDepth(23);
  this.bars = [];
  for (let i = 0; i < 10; i++) {
    const b = this.add.rectangle(CX - 45 + i * 10, CY - 6, 5, 12, i % 2 ? 0xff2d95 : 0xf6ff00, 0.9).setDepth(21);
    this.bars.push(b);
  }

  this.players = [
    newPlayer(this, 0, 320, 392, 'p1'),
    newPlayer(this, 1, 480, 392, 'p2'),
  ];
  this.players[1].on = false;
  this.players[1].s.setVisible(false);
  this.players[1].s.body.enable = false;

  this.enemies = this.physics.add.group();
  this.powerups = this.physics.add.group();
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
  animateScene(this, time);
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

  if (this.mode === 'name') {
    updateNameEntry(this);
    wipeTaps();
    return;
  }

  if (!this.players[0].on && this.players[1].on && (tap('START1') || tap('P1_1'))) joinP1(this);
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
  sc.musicVol = 1;
  sc.duckUntil = 0;
  sc.musicStep = 0;
  sc.beatStart = time;
  sc.nextBeat = time;
  sc.lastBeat = time;
  sc.overBox.setVisible(false);
  sc.titleBox.setVisible(false);
  clearEnemies(sc);
  clearPowerups(sc);
  joinPlayer(sc, sc.players[0], 320, 392);
  joinP2(sc, p2);
  nextWave(sc, time);
  pop(sc, 'DEFEND THE ROCOLA', CX, 120, 0xf6ff00, 28);
  tone(sc, 130, 0.18, 'sawtooth', 0.06);
}

function joinPlayer(sc, p, x, y, msg) {
  p.on = true;
  p.s.setVisible(true);
  p.s.body.enable = true;
  resetPlayer(sc, p, x, y);
  if (msg) pop(sc, msg, x, y - 64, p.id ? 0xff4fc3 : 0xeaff00, 18);
}

function joinP1(sc) {
  joinPlayer(sc, sc.players[0], 320, 392, 'P1 REGRESA');
}

function joinP2(sc, on) {
  const p = sc.players[1];
  if (on) {
    joinPlayer(sc, p, 480, 392, 'P2 JOINED');
  } else {
    p.on = false;
    p.s.setVisible(false);
    p.s.body.enable = false;
  }
}

function gameOver(sc, time) {
  sc.mode = 'name';
  sc.physics.world.timeScale = 1;
  clearEnemies(sc);
  clearPowerups(sc);
  sc.best.score = Math.max(sc.best.score || 0, sc.score);
  sc.best.combo = Math.max(sc.best.combo || 0, sc.bestCombo);
  sc.name = ['A', 'A', 'A'];
  sc.namePos = 0;
  sc.nameSaved = false;
  updateOverText(sc);
  sc.overBox.setVisible(true);
  pop(sc, 'ROCOLA DOWN', CX, 115, 0xff3344, 34);
  sc.cameras.main.shake(450, 0.025);
  tone(sc, 70, 0.4, 'sawtooth', 0.07);
}

function updateNameEntry(sc) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (tap('P1_L') || tap('P2_L')) sc.namePos = (sc.namePos + 2) % 3;
  if (tap('P1_R') || tap('P2_R')) sc.namePos = (sc.namePos + 1) % 3;
  let i = abc.indexOf(sc.name[sc.namePos]);
  if (tap('P1_U') || tap('P2_U')) sc.name[sc.namePos] = abc[(i + 1) % 26];
  if (tap('P1_D') || tap('P2_D')) sc.name[sc.namePos] = abc[(i + 25) % 26];
  if (tap('P1_1') || tap('P2_1')) {
    if (sc.namePos < 2) sc.namePos++;
    else saveName(sc);
  }
  if (tap('START1') || tap('START2')) saveName(sc);
  updateOverText(sc);
}

function saveName(sc) {
  if (sc.nameSaved) return;
  sc.nameSaved = true;
  sc.mode = 'over';
  const n = sc.name.join('');
  const list = (sc.best.leaders || []).concat([{ n, s: sc.score, c: sc.bestCombo }]);
  list.sort((a, b) => b.s - a.s);
  sc.best.leaders = list.slice(0, 5);
  sc.best.score = Math.max(sc.best.score || 0, sc.score);
  sc.best.combo = Math.max(sc.best.combo || 0, sc.bestCombo);
  saveBest(sc);
  updateOverText(sc);
  tone(sc, 880, 0.1, 'triangle', 0.06);
}

function nextWave(sc, time) {
  sc.wave++;
  sc.songIndex = (sc.wave - 1) % SONGS.length;
  sc.song = SONGS[sc.songIndex];
  sc.toSpawn = 6 + sc.wave * 2 + (sc.players[1].on ? 3 : 0);
  sc.nextSpawn = time + 500;
  sc.waitWave = 0;
  pop(sc, sc.song[0], CX, 96, sc.song[1], 26);
  if (sc.wave % 4 === 0) spawnEnemy(sc, 3, time);
}

function updateSpawner(sc, time) {
  if (sc.toSpawn > 0 && time > sc.nextSpawn) {
    const r = Math.random();
    let kind = 0;
    if (sc.wave > 1 && r > 0.6) kind = 1;
    if (sc.wave > 2 && r > 0.82) kind = 2;
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
  let sp = time < p.stun ? 0 : (time < p.boost ? 245 : 195);
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
  pickupCheck(sc, p, time);
}

function attack(sc, p, time) {
  if (time < p.attack) return;
  p.attack = time + (time < p.boost ? 160 : 230);
  const good = onBeat(sc, time);
  const rad = (good ? 102 : 78) + (time < p.boost ? 24 : 0);
  const dmg = (good ? 2 : 1) + (time < p.boost ? 1 : 0);
  const ang = Math.atan2(p.dy, p.dx);
  let hits = 0;
  const ring = sc.add.circle(p.s.x, p.s.y, 18).setStrokeStyle(good ? 7 : 4, good ? sc.song[1] : 0xffffff, good ? 0.95 : 0.55).setDepth(82);
  sc.tweens.add({ targets: ring, scale: rad / 18, alpha: 0, duration: 220, onComplete: () => ring.destroy() });
  const arc = sc.add.ellipse(p.s.x + p.dx * 54, p.s.y + p.dy * 24, good ? 138 : 104, good ? 58 : 42, good ? sc.song[2] : 0xffffff, good ? 0.34 : 0.2).setAngle(Phaser.Math.RadToDeg(ang)).setDepth(83);
  sc.tweens.add({ targets: arc, scaleX: 1.8, scaleY: 0.44, alpha: 0, duration: 180, onComplete: () => arc.destroy() });
  const slash = sc.add.rectangle(p.s.x + p.dx * 70, p.s.y + p.dy * 30, good ? 136 : 102, good ? 12 : 8, good ? 0xf6ff00 : sc.song[2], 0.8).setAngle(Phaser.Math.RadToDeg(ang)).setDepth(84);
  sc.tweens.add({ targets: slash, x: slash.x + p.dx * 36, y: slash.y + p.dy * 20, scaleY: 0.2, alpha: 0, duration: 135, onComplete: () => slash.destroy() });
  const ghost = sc.add.image(p.s.x - p.dx * 10, p.s.y - 6, p.s.texture.key).setDepth(81).setAlpha(0.45).setTint(good ? sc.song[1] : 0xffffff).setFlipX(p.s.flipX);
  sc.tweens.add({ targets: ghost, x: ghost.x - p.dx * 28, y: ghost.y - 10, alpha: 0, scale: 1.28, duration: 180, onComplete: () => ghost.destroy() });
  for (let i = 0; i < (good ? 8 : 5); i++) {
    const a = ang + Phaser.Math.FloatBetween(-0.65, 0.65);
    const q = sc.add.circle(p.s.x + p.dx * 28, p.s.y + p.dy * 18, Phaser.Math.Between(2, good ? 6 : 4), i % 2 ? sc.song[1] : sc.song[2], 0.9).setDepth(85);
    sc.tweens.add({ targets: q, x: q.x + Math.cos(a) * Phaser.Math.Between(42, 104), y: q.y + Math.sin(a) * Phaser.Math.Between(24, 70), alpha: 0, scale: 0.2, duration: 240, onComplete: () => q.destroy() });
  }
  sc.fx.fillStyle(good ? sc.song[1] : 0xffffff, good ? 0.18 : 0.1);
  sc.fx.fillCircle(p.s.x, p.s.y, rad);
  sc.time.delayedCall(45, () => sc.fx.clear());
  for (const e of sc.enemies.getChildren()) {
    if (!e.active) continue;
    const d = Phaser.Math.Distance.Between(p.s.x, p.s.y, e.x, e.y);
    if (d < rad) {
      hitEnemy(sc, e, dmg, (e.x - p.s.x) / Math.max(1, d), (e.y - p.s.y) / Math.max(1, d), time, good);
      hits++;
    }
  }
  if (hits) {
    addCombo(sc, hits + (good ? 1 : 0), time);
    sc.score += hits * (good ? 35 : 18) * sc.combo;
    sc.meter = Math.min(100, sc.meter + hits * (good ? 13 : 6));
    if (good) {
      sc.rocolaHp = Math.min(100, sc.rocolaHp + hits * 0.8);
      sc.musicVol = Math.max(sc.musicVol, sc.rocolaHp / 100);
    }
    pop(sc, good ? 'ROLA HIT' : 'GOLPE', p.s.x, p.s.y - 46, good ? sc.song[1] : 0xffffff, good ? 22 : 15);
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
  for (let i = 0; i < 4; i++) {
    const r = sc.add.circle(CX, CY, 42 + i * 18).setStrokeStyle(3, i % 2 ? sc.song[2] : 0xf6ff00, 0.72).setDepth(71);
    sc.tweens.add({ targets: r, scale: 4.8 + i * 0.8, alpha: 0, duration: 360 + i * 90, onComplete: () => r.destroy() });
  }
  radialHit(sc, CX, CY, 430, 4, time, true);
  sc.score += 400 * sc.combo;
  sc.rocolaHp = Math.min(100, sc.rocolaHp + 12);
  pop(sc, 'ULTIMA CANCION', CX, 142, sc.song[1], 30);
  pop(sc, 'ROCOLA +12', CX, CY - 92, 0x38ff88, 17);
  hitStop(sc, 110, 0.35);
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

function dropPower(sc, x, y, type) {
  const p = sc.physics.add.sprite(x, y, type ? 'boost' : 'heart');
  p.kind = type;
  p.life = sc.time.now + 7500;
  p.setDepth(95);
  p.setVelocity(Phaser.Math.Between(-45, 45), Phaser.Math.Between(-75, -35));
  sc.powerups.add(p);
}

function pickupCheck(sc, p, time) {
  for (const u of sc.powerups.getChildren()) {
    if (!u.active) continue;
    if (time > u.life) {
      u.destroy();
      continue;
    }
    u.angle += 3;
    u.y += Math.sin(time * 0.01) * 0.15;
    if (Phaser.Math.Distance.Between(p.s.x, p.s.y, u.x, u.y) < 34) {
      if (u.kind) {
        p.boost = time + 6000;
        sc.meter = Math.min(100, sc.meter + 35);
        pop(sc, 'SONIDERO BOOST', p.s.x, p.s.y - 52, sc.song[2], 16);
      } else if (p.hp < p.maxHp) {
        p.hp++;
        pop(sc, 'VIDA +1', p.s.x, p.s.y - 52, 0x38ff88, 16);
      } else {
        sc.rocolaHp = Math.min(100, sc.rocolaHp + 12);
        pop(sc, 'ROCOLA +12', CX, CY - 86, 0x38ff88, 16);
      }
      tone(sc, u.kind ? 860 : 520, 0.08, 'triangle', 0.055);
      u.destroy();
    }
  }
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
      warn(sc, e, e.cvX, e.cvY, 0xf6ff00, 430);
      e.setTint(0xfff0aa);
      sc.time.delayedCall(160, () => e.clearTint());
    }
    if (e.kind === 3 && time > e.act) {
      e.act = time + 2100;
      if (Math.random() < 0.55) {
        e.charge = time + 560;
        e.cvX = (dx / dist) * 260;
        e.cvY = (dy / dist) * 260;
        warn(sc, e, e.cvX, e.cvY, 0xff3344, 540);
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
    if (e.hpBar) {
      e.hpBg.setPosition(e.x, e.y - 64);
      e.hpBar.setPosition(e.x - 31 + Math.max(0, e.hp / e.hpMax) * 31, e.y - 64);
      e.hpBar.width = Math.max(0, 62 * e.hp / e.hpMax);
    }
    if (touchRocola(e) && time > e.hitAt) {
      e.hitAt = time + (e.kind === 3 ? 650 : 850);
      hurtRocola(sc, e.kind === 2 ? 8 : e.kind === 3 ? 12 : 5, time);
    }
    for (const p of sc.players) {
      if (!p.on || time < p.inv) continue;
      if (Phaser.Math.Distance.Between(e.x, e.y, p.s.x, p.s.y) < e.rad + p.rad && time > e.hitAt) {
        e.hitAt = time + 650;
        hurtPlayer(sc, p, time);
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
  let y = side < 2 ? Phaser.Math.Between(245, H - 70) : (side === 2 ? -55 : H + 55);
  const tex = kind === 3 ? 'boss' : kind === 2 ? 'e2' : kind === 1 ? 'e1' : 'e0';
  const e = sc.physics.add.sprite(x, y, tex);
  sc.enemies.add(e);
  e.kind = kind;
  e.hp = kind === 3 ? 26 + sc.wave * 2 : kind === 1 ? 4 : kind === 2 ? 3 : 2 + Math.floor(sc.wave / 3);
  e.spd = (kind === 3 ? 50 : kind === 2 ? 98 : kind === 1 ? 92 : 68) + sc.wave * 2;
  e.stun = 0;
  e.hitAt = 0;
  e.act = time + Phaser.Math.Between(700, 1600);
  e.charge = 0;
  e.setDepth(y);
  e.rad = kind === 3 ? 43 : kind === 2 ? 24 : kind === 1 ? 27 : 23;
  e.body.setSize(kind === 3 ? 66 : kind === 2 ? 26 : 32, kind === 3 ? 70 : kind === 2 ? 36 : 38);
  if (kind === 3) {
    e.hpMax = e.hp;
    e.hpBg = sc.add.rectangle(x, y - 64, 66, 7, 0x22060a, 0.9).setDepth(121);
    e.hpBar = sc.add.rectangle(x, y - 64, 62, 4, 0xff3344, 0.95).setDepth(122);
    pop(sc, 'JEFE NOPAL', CX, 116, 0xff3344, 26);
  }
}

function touchRocola(e) {
  const x = (e.x - CX) / (e.kind === 3 ? 105 : 82);
  const y = (e.y - CY) / (e.kind === 3 ? 104 : 86);
  return x * x + y * y < 1;
}

function warn(sc, e, dx, dy, c, d) {
  const len = Math.hypot(dx, dy);
  const a = Phaser.Math.RadToDeg(Math.atan2(dy, dx));
  const l = sc.add.rectangle(e.x + dx / 2, e.y + dy / 2, len, e.kind === 3 ? 8 : 5, c, e.kind === 3 ? 0.32 : 0.24).setAngle(a).setDepth(45);
  const r = sc.add.circle(e.x, e.y, e.kind === 3 ? 44 : 28).setStrokeStyle(3, c, 0.65).setDepth(46);
  sc.tweens.add({ targets: [l, r], alpha: 0, duration: d, onComplete: () => { l.destroy(); r.destroy(); } });
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
  if (good) hitStop(sc, 28, 0.55);
  if (e.hp <= 0) {
    hitStop(sc, e.kind === 3 ? 95 : 48, 0.38);
    sc.score += (e.kind === 3 ? 500 : 45 + e.kind * 25) * sc.combo;
    pop(sc, e.kind === 3 ? 'BOSS KO' : '+' + (45 + e.kind * 25), e.x, e.y - 28, good ? sc.song[1] : 0xf6ff00, e.kind === 3 ? 24 : 14);
    burst(sc, e.x, e.y, e.kind === 3 ? 22 : 9, e.kind === 3 ? 0xff3344 : sc.song[1]);
    if (e.kind === 3) {
      dropPower(sc, e.x - 22, e.y, 0);
      dropPower(sc, e.x + 22, e.y, 1);
    } else if (e.kind === 1 && Math.random() < 0.28) {
      dropPower(sc, e.x, e.y, Math.random() < 0.55 ? 1 : 0);
    } else if (Math.random() < 0.08) {
      dropPower(sc, e.x, e.y, 0);
    }
    if (e.hpBar) {
      e.hpBar.destroy();
      e.hpBg.destroy();
    }
    e.destroy();
  }
}

function hitStop(sc, d, s) {
  sc.physics.world.timeScale = s;
  sc.time.delayedCall(d, () => {
    if (sc.mode !== 'over' && sc.mode !== 'name') sc.physics.world.timeScale = 1;
  });
}

function hurtPlayer(sc, p, time) {
  p.hp--;
  p.stun = time + 300;
  p.inv = time + 900;
  p.s.setVelocity(-p.dx * 220, -p.dy * 120);
  breakCombo(sc);
  pop(sc, p.hp > 0 ? 'CORAZON -1' : 'KO', p.s.x, p.s.y - 42, 0xff3344, 16);
  sc.cameras.main.shake(100, 0.008);
  tone(sc, 110, 0.08, 'sawtooth', 0.05);
  if (p.hp <= 0) {
    p.on = false;
    p.s.setVisible(false);
    p.s.body.enable = false;
    if (!sc.players.some((pl) => pl.on)) gameOver(sc, time);
    else pop(sc, (p.id ? 'P2' : 'P1') + ' START = REVIVE', CX, 106, p.id ? 0xff4fc3 : 0xeaff00, 16);
  }
}

function hurtRocola(sc, dmg, time) {
  sc.rocolaHp -= dmg;
  sc.duckUntil = time + 1600;
  breakCombo(sc);
  sc.rocola.setTint(0xff3344);
  sc.time.delayedCall(80, () => sc.rocola.clearTint());
  pop(sc, 'VOL DOWN', CX, CY - 100, 0xff3344, 18);
  pop(sc, '-' + dmg, CX, CY - 76, 0xfff0aa, 16);
  sc.cameras.main.shake(120, 0.01);
  tone(sc, 90, 0.09, 'sawtooth', 0.05);
  tone(sc, 45, 0.18, 'sawtooth', 0.04, 0.05);
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
    if (sc.mode === 'play') {
      playSongBeat(sc);
      if (sc.musicStep % 2 === 0) musicPop(sc);
      if (sc.musicStep % 4 === 0) stageBurst(sc);
    }
  }
}

function playSongBeat(sc) {
  const s = sc.musicStep++;
  const base = sc.song[3];
  const duck = sc.time.now < sc.duckUntil;
  const hype = Math.min(5, Math.max(0, sc.wave - 1));
  const det = duck ? 0.97 + Math.random() * 0.06 : 1;
  const root = base * Math.pow(2, PROG[Math.floor(s / 4) % PROG.length] / 12);
  const note = base * Math.pow(2, (MELO[(s + hype) % MELO.length] + (hype > 3 && s % 2 ? 12 : 0)) / 12) * det;
  sc.musicVol = duck ? 0.18 : 1;
  songTone(sc, s % 4 === 0 ? 54 : 86 + hype * 7, 0.07, 'sine', s % 4 === 0 ? 0.07 + hype * 0.006 : 0.032);
  songTone(sc, 6400 + hype * 380, 0.025, 'square', 0.01 + hype * 0.002, 0.02);
  songTone(sc, 7600 + hype * 420, 0.018, 'square', 0.007 + hype * 0.0015, BEAT / 2000);
  if (hype > 1) songTone(sc, 5200 + hype * 250, 0.016, 'square', 0.006 + hype * 0.001, BEAT / 4000);
  if (s % 4 === 1 || s % 4 === 3) songTone(sc, 170 + hype * 10, 0.05, 'triangle', 0.038 + hype * 0.003);
  if (s % 4 === 2) {
    songTone(sc, 230, 0.045, 'triangle', 0.034);
    songTone(sc, 460, 0.035, 'square', 0.016, 0.025);
  }
  songTone(sc, root * 0.5, 0.16, 'square', 0.04 + hype * 0.003);
  songTone(sc, root * 0.75, 0.08, 'sawtooth', 0.018 + hype * 0.002, BEAT / 3000);
  if (s % 2 === 0) {
    for (let i = 0; i < 4; i++) songTone(sc, root * Math.pow(2, (CHORD[i] + (hype > 2 && i === 3 ? 12 : 0)) / 12), 0.13, i % 2 ? 'sine' : 'triangle', 0.021 - i * 0.002 + hype * 0.0015, 0.02 + i * 0.04);
  } else {
    songTone(sc, root * 1.5, 0.085, 'triangle', 0.016, 0.04);
    songTone(sc, root * 2, 0.065, 'sine', 0.011 + hype * 0.0015, 0.11);
  }
  songTone(sc, note, 0.105, 'sawtooth', 0.031 + hype * 0.003, 0.025);
  songTone(sc, note * 2, 0.035, 'square', 0.01 + hype * 0.0015, 0.09);
  if (hype > 2 && s % 2 === 1) songTone(sc, note * 3, 0.032, 'square', 0.009, 0.135);
  if (s % 8 === 7) songTone(sc, note * 1.5, 0.12, 'triangle', 0.024 + hype * 0.002, 0.13);
}

function musicPop(sc) {
  const c = sc.musicStep % 4 ? sc.song[1] : sc.song[2];
  const x = CX + Phaser.Math.Between(-60, 60);
  const y = CY - 56 + Phaser.Math.Between(-8, 10);
  const n = sc.add.container(x, y).setDepth(72);
  n.add(sc.add.ellipse(0, 10, 12, 8, c, 0.9));
  n.add(sc.add.rectangle(6, -5, 3, 27, c, 0.9));
  n.add(sc.add.rectangle(13, -18, 16, 4, c, 0.75));
  sc.tweens.add({ targets: n, y: y - Phaser.Math.Between(44, 72), x: x + Phaser.Math.Between(-34, 34), angle: Phaser.Math.Between(-12, 12), alpha: 0, duration: 780, ease: 'Sine.easeOut', onComplete: () => n.destroy() });
}

function stageBurst(sc) {
  const hype = Math.min(5, Math.max(0, sc.wave - 1));
  for (let i = 0; i < 10 + hype * 3; i++) {
    const side = i % 2 ? -1 : 1;
    const x = CX + side * Phaser.Math.Between(70, 210 + hype * 18);
    const y = CY + Phaser.Math.Between(-46, 74);
    const p = sc.add.circle(x, y, Phaser.Math.Between(2, 5 + hype), i % 3 ? sc.song[1] : sc.song[2], 0.68 + hype * 0.04).setDepth(68);
    sc.tweens.add({ targets: p, y: y - Phaser.Math.Between(26, 74 + hype * 12), x: x + side * Phaser.Math.Between(10, 54 + hype * 8), scale: 0.2, alpha: 0, duration: 470 + hype * 35, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
  }
}

function animateRocola(sc, time) {
  const beatGlow = onBeat(sc, time) ? 0.18 : 0.08;
  const broken = time < sc.duckUntil;
  const power = Math.max(0.18, sc.musicVol || 1);
  sc.glow.setFillStyle(sc.song ? sc.song[1] : 0xf6ff00, beatGlow * power);
  sc.rocolaAura.setFillStyle(sc.song ? sc.song[2] : 0x43f5ff, (onBeat(sc, time) ? 0.16 : 0.055) * power);
  sc.rocolaAura.scaleX = 1 + Math.sin(time * 0.004) * 0.05;
  sc.rocolaAura.scaleY = 1 + (onBeat(sc, time) ? 0.16 : 0);
  const ph = ((time - sc.beatStart) % BEAT) / BEAT * Math.PI * 2 - Math.PI / 2;
  sc.beatNeedle.setPosition(CX + Math.cos(ph) * 100, CY + Math.sin(ph) * 100);
  sc.beatNeedle.setFillStyle(onBeat(sc, time) ? sc.song[1] : sc.song[2], onBeat(sc, time) ? 1 : 0.72);
  sc.beatTarget.setFillStyle(onBeat(sc, time) ? sc.song[1] : 0xf7ffd8, onBeat(sc, time) ? 0.6 : 0.22);
  sc.beatTarget.setScale(onBeat(sc, time) ? 1.45 : 1);
  sc.rocola.y = CY + Math.sin(time * 0.006) * 3 + (broken ? Math.sin(time * 0.09) * 2 : 0);
  sc.rocola.angle = broken ? Math.sin(time * 0.11) * 2 : 0;
  for (let i = 0; i < sc.bars.length; i++) {
    const b = sc.bars[i];
    b.height = (10 + Math.abs(Math.sin(time * 0.008 + i)) * 30 + (onBeat(sc, time) ? 12 : 0)) * power;
    b.y = CY - 7 - b.height * 0.18;
    b.fillColor = i % 2 ? sc.song[2] : sc.song[1];
    b.alpha = broken && i % 3 === 0 ? 0.25 : 0.9;
  }
  if (sc.mode === 'play' && sc.combo > 1 && sc.comboUntil && time > sc.comboUntil) breakCombo(sc);
}

function drawHUD(sc) {
  sc.hud.clear();
  sc.hud.fillStyle(0x07070f, 0.72).fillRect(0, 0, W, 70);
  if (sc.mode === 'play' && sc.rocolaHp < 36) {
    const a = (36 - sc.rocolaHp) / 36;
    sc.hud.lineStyle(5, 0xff3344, 0.25 + a * 0.5).strokeRect(5, 5, W - 10, H - 10);
    sc.hud.fillStyle(0xff3344, 0.035 + a * 0.05).fillRect(0, 70, W, H - 70);
  }
  bar(sc.hud, 22, 18, 210, 12, sc.rocolaHp / 100, 0xff3344, 0x361016);
  bar(sc.hud, 22, 42, 210, 10, sc.meter / 100, sc.song[1], 0x17231a);
  sc.scoreText.setText('SCORE ' + sc.score);
  sc.waveText.setText(sc.song[0] + '  WAVE ' + sc.wave);
  sc.comboText.setText(sc.combo > 1 ? 'COMBO x' + sc.combo : '');
  sc.bestText.setText('BEST ' + (sc.best.score || 0));
  for (const p of sc.players) {
    if (p.id && !p.on) continue;
    const x0 = p.id ? 664 : 262;
    for (let i = 0; i < p.maxHp; i++) {
      sc.hud.fillStyle(i < p.hp ? (p.id ? 0xff4fc3 : 0xeaff00) : 0x2a2330, 1).fillCircle(x0 + i * 16, 55, 5);
    }
  }
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
  sc.titleBox.add(sc.add.rectangle(CX, CY, W, H, 0x07070f, 0.38));
  sc.titleBox.add(sc.add.text(CX, 116, 'ROCOLAPOCALYPSE', { fontFamily: 'monospace', fontSize: '48px', color: '#eaff00', fontStyle: 'bold' }).setOrigin(0.5));
  sc.titleBox.add(sc.add.text(CX, 164, 'CDMX: LA ULTIMA CANCION', { fontFamily: 'monospace', fontSize: '22px', color: '#ff4fc3', fontStyle: 'bold' }).setOrigin(0.5));
  sc.titleBox.add(sc.add.text(CX, 428, 'OBJETIVO: defiende la rocola y sobrevive cada rola.\nJOY mueve   BTN1 golpe luchador   BTN2 dash/parry/super\nCorazones curan. Discos dan boost. Golpea al ritmo.\nSTART1 solo   START2 coop', { fontFamily: 'monospace', fontSize: '16px', color: '#f7ffd8', align: 'center', lineSpacing: 6 }).setOrigin(0.5));

  sc.overBox = sc.add.container(0, 0).setDepth(135).setVisible(false);
  sc.overBox.add(sc.add.rectangle(CX, CY, W, H, 0x050507, 0.84));
  sc.overBox.add(sc.add.text(CX, 150, 'GAME OVER', { fontFamily: 'monospace', fontSize: '48px', color: '#ff3344', fontStyle: 'bold' }).setOrigin(0.5));
  sc.overScore = sc.add.text(CX, 220, '', { fontFamily: 'monospace', fontSize: '18px', color: '#f7ffd8', align: 'center', fontStyle: 'bold', lineSpacing: 4 }).setOrigin(0.5, 0);
  sc.overBox.add(sc.overScore);
}

function showTitle(sc) {
  sc.titleBox.setVisible(true);
  drawHUD(sc);
}

async function loadBest(sc) {
  const r = await store().get(SAVE_KEY);
  if (r.found && r.value && typeof r.value.score === 'number') {
    sc.best = {
      score: r.value.score || 0,
      combo: r.value.combo || 0,
      leaders: Array.isArray(r.value.leaders) ? r.value.leaders.filter((x) => x && typeof x.s === 'number' && typeof x.n === 'string').slice(0, 5) : [],
    };
  }
  if (sc.bestText) sc.bestText.setText('BEST ' + (sc.best.score || 0));
}

function saveBest(sc) {
  store().set(SAVE_KEY, { score: sc.best.score || 0, combo: sc.best.combo || 0, leaders: sc.best.leaders || [] });
}

function boardText(sc) {
  const l = sc.best.leaders || [];
  if (!l.length) return 'LEADERBOARD\n---';
  return 'LEADERBOARD\n' + l.map((x, i) => i + 1 + '. ' + x.n + '  ' + x.s).join('\n');
}

function updateOverText(sc) {
  const tag = sc.name ? sc.name.map((x, i) => (i === sc.namePos && sc.mode === 'name' ? '[' + x + ']' : ' ' + x + ' ')).join('') : '';
  const msg = sc.mode === 'name' ? '\n\nINICIALES ' + tag + '\nJOY cambia  BTN1 avanza  START guarda' : '\n\nSTART = OTRA ROLA';
  sc.overScore.setText('SCORE ' + sc.score + '\nBEST ' + sc.best.score + '\nMAX COMBO x' + sc.bestCombo + '\n\n' + boardText(sc) + msg);
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
  p.hp = p.maxHp;
  p.boost = 0;
  p.attack = 0;
  p.skill = 0;
  p.dash = 0;
  p.stun = 0;
  p.inv = 0;
}

function newPlayer(sc, id, x, y, tex) {
  const s = sc.physics.add.sprite(x, y, tex);
  s.body.setSize(30, 42);
  return { id, s, on: true, maxHp: 4, hp: 4, rad: 24, dx: id ? -1 : 1, dy: 0, attack: 0, skill: 0, dash: 0, stun: 0, inv: 0, boost: 0 };
}

function clearEnemies(sc) {
  for (const e of sc.enemies.getChildren()) {
    if (e.hpBar) {
      e.hpBar.destroy();
      e.hpBg.destroy();
    }
    e.destroy();
  }
  sc.enemies.clear(true, true);
}

function clearPowerups(sc) {
  if (!sc.powerups) return;
  for (const p of sc.powerups.getChildren()) p.destroy();
  sc.powerups.clear(true, true);
}

function makeBackdrop(sc) {
  const t = sc.textures.createCanvas('backdrop', W, H);
  const c = t.getContext();
  let g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#110020');
  g.addColorStop(0.35, '#07162a');
  g.addColorStop(0.72, '#120816');
  g.addColorStop(1, '#020207');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  for (let i = 0; i < 7; i++) {
    c.save();
    c.translate(CX, 94);
    c.rotate((-0.75 + i * 0.25));
    g = c.createLinearGradient(0, 0, 0, 360);
    g.addColorStop(0, i % 2 ? 'rgba(255,45,149,.22)' : 'rgba(67,245,255,.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(-12, 0, 24, 370);
    c.restore();
  }
  for (let i = 0; i < 44; i++) {
    c.beginPath();
    c.fillStyle = i % 3 ? 'rgba(255,240,170,.35)' : 'rgba(67,245,255,.28)';
    c.arc(Math.random() * W, 8 + Math.random() * 170, 1 + Math.random() * 3.5, 0, Math.PI * 2);
    c.fill();
  }
  c.save();
  c.shadowColor = '#ffbf38';
  c.shadowBlur = 32;
  c.fillStyle = 'rgba(255,190,70,.22)';
  c.beginPath();
  c.ellipse(CX, 165, 190, 74, 0, 0, Math.PI * 2);
  c.fill();
  c.shadowBlur = 18;
  c.strokeStyle = 'rgba(255,210,90,.72)';
  c.lineWidth = 5;
  c.beginPath();
  c.moveTo(CX, 64);
  c.lineTo(CX, 232);
  c.stroke();
  c.lineWidth = 8;
  c.strokeStyle = 'rgba(247,255,216,.62)';
  c.beginPath();
  c.moveTo(CX, 142);
  c.lineTo(CX, 246);
  c.stroke();
  c.fillStyle = 'rgba(255,190,70,.92)';
  c.beginPath();
  c.moveTo(CX, 26);
  c.lineTo(CX - 24, 64);
  c.lineTo(CX + 24, 64);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(255,210,90,.68)';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(CX - 14, 78);
  c.bezierCurveTo(CX - 80, 102, CX - 90, 142, CX - 134, 162);
  c.moveTo(CX + 14, 78);
  c.bezierCurveTo(CX + 80, 102, CX + 90, 142, CX + 134, 162);
  c.stroke();
  c.fillStyle = 'rgba(247,255,216,.55)';
  c.fillRect(CX - 42, 246, 84, 13);
  c.fillRect(CX - 60, 262, 120, 10);
  c.restore();
  for (let i = 0; i < 2; i++) {
    const y = 205 + i * 26;
    g = c.createLinearGradient(0, y, W, y);
    g.addColorStop(0, 'rgba(255,45,149,0)');
    g.addColorStop(.5, i ? 'rgba(246,255,0,.36)' : 'rgba(67,245,255,.34)');
    g.addColorStop(1, 'rgba(255,45,149,0)');
    c.fillStyle = g;
    c.fillRect(0, y, W, 4);
  }
  g = c.createRadialGradient(CX, 410, 40, CX, 410, 380);
  g.addColorStop(0, 'rgba(255,45,149,.22)');
  g.addColorStop(.45, 'rgba(67,245,255,.08)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 250, W, 350);
  t.refresh();
}

function drawWorld(sc) {
  sc.add.image(0, 0, 'backdrop').setOrigin(0).setDepth(-30);
  const g = sc.add.graphics().setDepth(-20);
  g.fillStyle(0x05070d, 0.34).fillRect(0, 246, W, 22);
  for (let x = 18; x < W; x += 34) {
    g.fillStyle(x % 68 ? 0xff4fc3 : 0x43f5ff, 0.72).fillTriangle(x, 68, x + 18, 70, x + 9, 88);
  }
  for (const x of [88, 712]) {
    g.fillStyle(0x0b1020, 0.9).fillRect(x - 4, 285, 8, 148);
    g.fillStyle(0xffd56a, 0.22).fillCircle(x, 274, 34);
    g.fillStyle(0xffd56a, 0.82).fillCircle(x, 274, 8);
  }
  g.fillStyle(0x111018, 0.72).fillRect(0, 250, W, 350);
  g.fillStyle(0x2a102a).fillRect(0, 456, W, 144);
  g.fillStyle(0x12141e, 0.9).fillEllipse(CX, 398, 560, 184);
  g.fillStyle(0xff4fc3, 0.1).fillEllipse(CX, 398, 440, 130);
  g.lineStyle(5, 0xff4fc3, 0.3).strokeEllipse(CX, 398, 560, 184);
  g.lineStyle(3, 0xf6ff00, 0.26).strokeEllipse(CX, 398, 420, 134);
  g.lineStyle(2, 0x43f5ff, 0.32);
  for (let x = -160; x < W + 120; x += 90) g.lineBetween(x, H, x + 250, 250);
  g.lineStyle(1, 0xf6ff00, 0.2);
  for (let y = 282; y < H; y += 34) g.lineBetween(0, y, W, y);
  for (let r = 94; r < 320; r += 42) {
    g.lineStyle(2, r % 84 ? 0x43f5ff : 0xff4fc3, 0.11).strokeEllipse(CX, 398, r * 1.75, r * 0.58);
  }
  for (let i = 0; i < 22; i++) {
    const x = Phaser.Math.Between(20, 780);
    const y = Phaser.Math.Between(486, 586);
    g.fillStyle(i % 2 ? 0xff4fc3 : 0x43f5ff, 0.12).fillCircle(x, y, Phaser.Math.Between(2, 8));
  }
  for (let y = 0; y < H; y += 4) {
    g.fillStyle(0x000000, 0.15).fillRect(0, y, W, 2);
  }
}

function makeAmbience(sc) {
  sc.floorGlow = sc.add.ellipse(CX, 405, 520, 170, SONGS[0][1], 0.08).setDepth(-3);
  sc.domeGlow = sc.add.circle(169, 139, 86, 0xffb000, 0.08).setDepth(-8);
  sc.halo = sc.add.circle(CX, CY, 150).setStrokeStyle(3, SONGS[0][2], 0.2).setDepth(2);
  sc.marquee = sc.add.rectangle(CX, 268, 210, 8, SONGS[0][1], 0.42).setDepth(6);
  sc.sweep = sc.add.rectangle(CX, 90, 24, 290, SONGS[0][2], 0.08).setOrigin(0.5, 0).setDepth(-5);
  sc.sweep2 = sc.add.rectangle(CX, 88, 18, 300, SONGS[0][1], 0.06).setOrigin(0.5, 0).setDepth(-5);
  sc.disco = sc.add.circle(CX, 82, 28, 0xf7ffd8, 0.18).setDepth(-3);
  sc.rays = [];
  for (let i = 0; i < 6; i++) {
    const r = sc.add.rectangle(CX, 102, 10, 250, i % 2 ? 0xff4fc3 : 0x43f5ff, 0.04).setOrigin(0.5, 0).setDepth(-4);
    sc.rays.push(r);
  }
  sc.petals = [];
  for (let i = 0; i < 16; i++) {
    const p = sc.add.ellipse(80 + i * 44, 310 + (i % 5) * 42, 10, 4, i % 2 ? 0xffb000 : 0xf6ff00, 0.34).setDepth(12);
    sc.petals.push([p, i]);
  }
  sc.tiles = [];
  for (let y = 374; y < 490; y += 28) {
    for (let x = 144; x < 680; x += 58) {
      const t = sc.add.rectangle(x, y, 38, 18, (x + y) % 2 ? 0xff4fc3 : 0x43f5ff, 0.045).setDepth(-2);
      sc.tiles.push([t, (x + y) % 7]);
    }
  }
  sc.metro = sc.add.container(-260, 224).setDepth(-6);
  const train = sc.add.rectangle(0, 0, 260, 38, 0xf07a22, 0.95);
  const stripe = sc.add.rectangle(0, -8, 260, 6, 0x43f5ff, 0.85);
  sc.metro.add([train, stripe]);
  for (let i = -105; i <= 105; i += 35) sc.metro.add(sc.add.rectangle(i, 1, 21, 16, 0xf7ffd8, 0.82));
  sc.metro.add(sc.add.rectangle(-138, 0, 8, 34, 0x22242f, 1));
  sc.crowd = [];
  for (let i = 0; i < 24; i++) {
    const x = 45 + i * 31 + (i % 2) * 8;
    const y = 246 + (i % 3) * 7;
    const c = i % 3 === 0 ? 0xff4fc3 : i % 3 === 1 ? 0x43f5ff : 0xf6ff00;
    const head = sc.add.circle(x, y - 12, 5, c, 0.55).setDepth(3);
    const body = sc.add.rectangle(x, y, 7, 18, c, 0.35).setDepth(3);
    sc.crowd.push([head, body, i]);
  }
  sc.lights = [];
  for (let i = 0; i < 5; i++) {
    const l = sc.add.rectangle(110 + i * 145, 94, 22, 170, i % 2 ? 0xff4fc3 : 0x43f5ff, 0.06).setOrigin(0.5, 0).setDepth(-4);
    l.angle = i % 2 ? 18 : -18;
    sc.lights.push(l);
  }
}

function animateScene(sc, time) {
  if (!sc.floorGlow) return;
  sc.floorGlow.setFillStyle(sc.song[1], onBeat(sc, time) ? 0.16 : 0.06);
  sc.floorGlow.scaleX = 1 + Math.sin(time * 0.003) * 0.04;
  sc.domeGlow.setFillStyle(sc.song[2], onBeat(sc, time) ? 0.13 : 0.055);
  sc.halo.setStrokeStyle(onBeat(sc, time) ? 5 : 2, sc.song[2], onBeat(sc, time) ? 0.42 : 0.16);
  sc.halo.setScale(1 + Math.sin(time * 0.004) * 0.06);
  sc.sweep.angle = Math.sin(time * 0.0017) * 38;
  sc.sweep2.angle = Math.cos(time * 0.0014) * 44;
  sc.sweep.fillColor = sc.song[2];
  sc.sweep2.fillColor = sc.song[1];
  sc.disco.setFillStyle(onBeat(sc, time) ? sc.song[1] : 0xf7ffd8, onBeat(sc, time) ? 0.34 : 0.16);
  for (let i = 0; i < sc.rays.length; i++) {
    sc.rays[i].angle = i * 60 + time * 0.018;
    sc.rays[i].fillColor = i % 2 ? sc.song[1] : sc.song[2];
    sc.rays[i].alpha = 0.035 + (onBeat(sc, time) ? 0.04 : 0);
  }
  for (const a of sc.petals) {
    const p = a[0];
    p.x = 80 + a[1] * 44 + Math.sin(time * 0.0015 + a[1]) * 32;
    p.y = 310 + (a[1] % 5) * 42 + Math.cos(time * 0.0018 + a[1]) * 18;
    p.angle += 0.8 + a[1] * 0.03;
    p.alpha = 0.22 + (onBeat(sc, time) ? 0.18 : 0) + (a[1] % 3) * 0.035;
  }
  sc.marquee.fillColor = onBeat(sc, time) ? sc.song[1] : sc.song[2];
  sc.marquee.alpha = 0.24 + (onBeat(sc, time) ? 0.42 : 0.08);
  for (const a of sc.tiles) {
    const t = a[0];
    const hot = (a[1] + Math.floor(time / BEAT)) % 5 === 0;
    t.fillColor = hot ? sc.song[1] : sc.song[2];
    t.alpha = hot ? 0.16 : 0.035;
  }
  sc.metro.x += 1.35 * sc.dt;
  if (sc.metro.x > W + 250) sc.metro.x = -290;
  sc.metro.alpha = 0.62 + Math.sin(time * 0.006) * 0.1;
  for (const l of sc.lights) {
    l.fillColor = Math.random() < 0.015 ? sc.song[2] : sc.song[1];
    l.alpha = 0.04 + (onBeat(sc, time) ? 0.06 : 0) + Math.random() * 0.02;
  }
  for (const c of sc.crowd) {
    const bob = Math.sin(time * 0.007 + c[2]) * 3 + (onBeat(sc, time) ? 2 : 0);
    c[0].y = 234 + (c[2] % 3) * 7 + bob;
    c[1].y = 246 + (c[2] % 3) * 7 + bob;
    c[0].alpha = c[1].alpha = sc.mode === 'play' ? 0.35 + Math.min(sc.combo, 20) * 0.015 : 0.32;
  }
}

function dotTex(sc) {
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0xffffff).fillCircle(4, 4, 4);
  g.generateTexture('dot', 8, 8);
  g.destroy();
}

function makeLuchador(sc, key, color, pants, mask) {
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0x000000, 0.34).fillEllipse(29, 59, 46, 10);
  g.fillStyle(mask, 0.45).fillTriangle(11, 20, 29, 33, 5, 48).fillTriangle(47, 20, 29, 33, 53, 48);
  g.fillStyle(pants).fillRoundedRect(16, 29, 26, 23, 5);
  g.fillStyle(color).fillRoundedRect(12, 21, 34, 21, 6);
  g.fillStyle(0xf7ffd8, 0.95).fillTriangle(20, 23, 29, 41, 38, 23);
  g.fillStyle(mask).fillCircle(29, 14, 13);
  g.fillStyle(color).fillTriangle(12, 5, 24, 15, 13, 25).fillTriangle(46, 5, 34, 15, 45, 25);
  g.fillStyle(0xffd2a0).fillEllipse(29, 16, 14, 11);
  g.fillStyle(0xffffff).fillEllipse(23, 13, 6, 3).fillEllipse(35, 13, 6, 3);
  g.fillStyle(0x07070f).fillCircle(23, 13, 1.5).fillCircle(35, 13, 1.5);
  g.lineStyle(2, color, 0.95).strokeCircle(29, 14, 12);
  g.lineStyle(2, 0xf7ffd8, 0.78).lineBetween(29, 4, 29, 25).lineBetween(17, 15, 41, 15);
  g.fillStyle(0xffd2a0).fillRoundedRect(2, 26, 11, 19, 5).fillRoundedRect(45, 26, 11, 19, 5);
  g.fillStyle(color).fillRoundedRect(0, 36, 14, 8, 3).fillRoundedRect(44, 36, 14, 8, 3);
  g.fillStyle(0xffb000).fillRect(14, 42, 30, 5);
  g.fillStyle(0xf7ffd8).fillRect(26, 41, 6, 7);
  g.fillStyle(pants).fillRoundedRect(16, 48, 9, 12, 3).fillRoundedRect(33, 48, 9, 12, 3);
  g.fillStyle(mask).fillRoundedRect(13, 57, 14, 6, 3).fillRoundedRect(31, 57, 14, 6, 3);
  g.lineStyle(2, 0xffffff, 0.48).strokeRoundedRect(12, 21, 34, 21, 6);
  g.lineStyle(2, 0x07070f, 0.38).lineBetween(16, 30, 42, 30).lineBetween(19, 49, 24, 60).lineBetween(38, 49, 33, 60);
  g.generateTexture(key, 58, 66);
  g.destroy();
}

function makePickupTex(sc) {
  let g = sc.make.graphics({ add: false });
  g.fillStyle(0xff3344).fillCircle(10, 9, 6).fillCircle(18, 9, 6).fillTriangle(5, 11, 23, 11, 14, 25);
  g.lineStyle(2, 0xf7ffd8, 0.8).strokeCircle(10, 9, 6).strokeCircle(18, 9, 6);
  g.generateTexture('heart', 28, 28);
  g.destroy();
  g = sc.make.graphics({ add: false });
  g.fillStyle(0xffb000).fillCircle(14, 14, 12);
  g.fillStyle(0x07070f).fillCircle(14, 14, 6);
  g.lineStyle(3, 0x43f5ff, 1).strokeCircle(14, 14, 10);
  g.fillStyle(0xf6ff00).fillRect(12, 2, 4, 24).fillRect(2, 12, 24, 4);
  g.generateTexture('boost', 28, 28);
  g.destroy();
}

function makeNopal(sc, key, green, dark, type) {
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0x000000, 0.34).fillEllipse(22, 43, 34, 8);
  g.fillStyle(dark).fillEllipse(21, 22, 24, 34);
  g.fillStyle(green).fillEllipse(21, 20, 20, 31);
  g.fillStyle(green).fillEllipse(type ? 8 : 7, 25, 13, 24).fillEllipse(type ? 35 : 34, 24, 13, 24);
  g.fillStyle(0xfff4a8).fillCircle(16, 15, 2).fillCircle(26, 15, 2);
  g.fillStyle(0x07070f).fillRect(15, 21, 12, 3);
  g.fillStyle(0xff4fc3).fillCircle(13, 30, 2).fillCircle(29, 29, 2);
  g.fillStyle(0xf6ff00).fillTriangle(11, 5, 31, 5, 21, 0);
  if (type) {
    g.fillStyle(0xff3344).fillTriangle(31, 16, 43, 21, 31, 27);
    g.fillStyle(0xffb000).fillRect(2, 33, 14, 6);
  }
  g.generateTexture(key, 46, 50);
  g.destroy();
}

function makeCalaca(sc, key) {
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0x000000, 0.34).fillEllipse(20, 42, 31, 8);
  g.fillStyle(0xf7ffd8).fillCircle(20, 14, 12);
  g.fillStyle(0xf7ffd8).fillRect(9, 17, 22, 20);
  g.fillStyle(0x07070f).fillCircle(15, 13, 4).fillCircle(25, 13, 4).fillRect(17, 20, 6, 3);
  g.fillStyle(0xff4fc3).fillCircle(15, 13, 2).fillCircle(25, 13, 2);
  g.fillStyle(0x43f5ff).fillRect(7, 23, 6, 14).fillRect(28, 23, 6, 14);
  g.fillStyle(0xff3344).fillRect(12, 29, 16, 10);
  g.fillStyle(0xf6ff00).fillRect(12, 5, 16, 4).fillTriangle(11, 5, 29, 5, 20, 0);
  g.generateTexture(key, 40, 46);
  g.destroy();
}

function makeBoss(sc) {
  const g = sc.make.graphics({ add: false });
  g.fillStyle(0x000000, 0.38).fillEllipse(42, 78, 70, 12);
  g.fillStyle(0x0d5e37).fillEllipse(42, 39, 48, 68);
  g.fillStyle(0x38ff88).fillEllipse(42, 36, 40, 60);
  g.fillStyle(0x38ff88).fillEllipse(15, 43, 24, 46).fillEllipse(70, 43, 24, 46);
  g.fillStyle(0xf7ffd8).fillCircle(32, 28, 4).fillCircle(52, 28, 4);
  g.fillStyle(0x07070f).fillRect(30, 43, 25, 5);
  g.fillStyle(0xff4fc3).fillCircle(23, 55, 3).fillCircle(60, 56, 3).fillCircle(42, 20, 3);
  g.fillStyle(0xff3344).fillTriangle(21, 8, 63, 8, 42, 0);
  g.fillStyle(0xf6ff00).fillRect(25, 7, 34, 6);
  g.lineStyle(3, 0xff4fc3, 0.7).strokeEllipse(42, 38, 50, 70);
  g.generateTexture('boss', 84, 88);
  g.destroy();
}

function makeRocola(sc) {
  const t = sc.textures.createCanvas('rocola', 150, 178);
  const c = t.getContext();
  c.shadowColor = 'rgba(0,0,0,.6)';
  c.shadowBlur = 10;
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.beginPath();
  c.ellipse(75, 164, 54, 9, 0, 0, Math.PI * 2);
  c.fill();
  let g = c.createLinearGradient(30, 28, 120, 156);
  g.addColorStop(0, '#41205d');
  g.addColorStop(.42, '#120824');
  g.addColorStop(1, '#050507');
  c.shadowColor = '#ff2d95';
  c.shadowBlur = 18;
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(75, 10);
  c.bezierCurveTo(132, 10, 128, 76, 124, 92);
  c.lineTo(136, 158);
  c.lineTo(14, 158);
  c.lineTo(26, 92);
  c.bezierCurveTo(22, 76, 18, 10, 75, 10);
  c.closePath();
  c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = '#f6ff00';
  c.lineWidth = 5;
  c.stroke();
  c.shadowColor = '#43f5ff';
  c.shadowBlur = 16;
  c.strokeStyle = '#43f5ff';
  c.lineWidth = 5;
  c.beginPath();
  c.arc(75, 58, 42, Math.PI * .1, Math.PI * .9, true);
  c.stroke();
  c.strokeStyle = '#ff2d95';
  c.lineWidth = 4;
  c.beginPath();
  c.arc(75, 58, 30, 0, Math.PI * 2);
  c.stroke();
  c.fillStyle = '#050507';
  c.beginPath();
  c.arc(75, 58, 17, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#f6ff00';
  c.beginPath();
  c.arc(75, 58, 6, 0, Math.PI * 2);
  c.fill();
  c.shadowBlur = 8;
  c.fillStyle = '#43f5ff';
  c.fillRect(39, 94, 72, 15);
  c.fillStyle = '#050507';
  c.fillRect(42, 97, 66, 9);
  c.shadowBlur = 0;
  for (let i = 0; i < 10; i++) {
    const h = 8 + (i * 17) % 26;
    c.fillStyle = i % 2 ? '#43f5ff' : '#ff2d95';
    c.fillRect(39 + i * 7, 146 - h, 4, h);
  }
  c.strokeStyle = 'rgba(255,255,255,.26)';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(45, 28);
  c.lineTo(104, 132);
  c.stroke();
  t.refresh();
}
