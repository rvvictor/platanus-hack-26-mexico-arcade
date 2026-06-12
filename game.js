const W = 800;
const H = 600;
const CX = 400;
const CY = 335;
const SAVE_KEY = 'rocolapocalypse-cdmx-v1';
const BPM = 104;
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
  ['ROCOLA DE ORO', 0xf6ff00, 0xff2d95, 185],
  ['BALADA DEL CENTRO', 0x38ff88, 0xffb000, 165],
  ['METRO SONIDERO', 0x69a7ff, 0xff54d7, 208],
  ['NOCHE GARIBALDI', 0xff3344, 0x43f5ff, 139],
];
const MELO = [0, 4, 7, 12, 11, 7, 4, 2, 0, 5, 9, 12, 14, 12, 9, 7];
const PROG = [0, 9, 5, 7];
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
  this.glow = this.add.circle(CX, CY, 116, 0xf6ff00, 0.08).setDepth(1);
  this.rocola = this.add.image(CX, CY, 'rocola').setDepth(20);
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
  sc.mode = 'over';
  sc.physics.world.timeScale = 1;
  clearEnemies(sc);
  clearPowerups(sc);
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
  let hits = 0;
  const ring = sc.add.circle(p.s.x, p.s.y, 18).setStrokeStyle(good ? 7 : 4, good ? sc.song[1] : 0xffffff, good ? 0.95 : 0.55).setDepth(82);
  sc.tweens.add({ targets: ring, scale: rad / 18, alpha: 0, duration: 180, onComplete: () => ring.destroy() });
  const arc = sc.add.ellipse(p.s.x + p.dx * 42, p.s.y + p.dy * 18, good ? 96 : 74, good ? 42 : 32, good ? sc.song[2] : 0xffffff, good ? 0.28 : 0.16).setAngle(Phaser.Math.RadToDeg(Math.atan2(p.dy, p.dx))).setDepth(83);
  sc.tweens.add({ targets: arc, scaleX: 1.65, scaleY: 0.55, alpha: 0, duration: 150, onComplete: () => arc.destroy() });
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
  e.body.setSize(kind === 3 ? 62 : 30, kind === 3 ? 64 : 34);
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
    if (e.kind === 3) {
      dropPower(sc, e.x - 22, e.y, 0);
      dropPower(sc, e.x + 22, e.y, 1);
    } else if (e.kind === 1 && Math.random() < 0.28) {
      dropPower(sc, e.x, e.y, Math.random() < 0.55 ? 1 : 0);
    } else if (Math.random() < 0.08) {
      dropPower(sc, e.x, e.y, 0);
    }
    e.destroy();
  }
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
    }
  }
}

function playSongBeat(sc) {
  const s = sc.musicStep++;
  const base = sc.song[3];
  const duck = sc.time.now < sc.duckUntil;
  const det = duck ? 0.97 + Math.random() * 0.06 : 1;
  const root = base * Math.pow(2, PROG[Math.floor(s / 4) % PROG.length] / 12);
  const note = base * Math.pow(2, MELO[s % MELO.length] / 12) * det;
  sc.musicVol = duck ? 0.18 : 1;
  songTone(sc, s % 4 === 0 ? 54 : 78, 0.075, 'sine', s % 4 === 0 ? 0.065 : 0.03);
  if (s % 4 === 1 || s % 4 === 3) songTone(sc, 156, 0.045, 'triangle', 0.032);
  if (s % 4 === 2) {
    songTone(sc, 210, 0.045, 'triangle', 0.03);
    songTone(sc, 420, 0.035, 'square', 0.012, 0.025);
  }
  songTone(sc, root * 0.5, 0.22, 'square', 0.034);
  if (s % 2 === 0) {
    for (let i = 0; i < 4; i++) songTone(sc, root * Math.pow(2, CHORD[i] / 12), 0.16, 'triangle', 0.019 - i * 0.002, 0.025 + i * 0.055);
  } else {
    songTone(sc, root * 1.5, 0.1, 'triangle', 0.014, 0.06);
  }
  songTone(sc, note, 0.13, 'sawtooth', 0.026, 0.035);
  if (s % 8 === 7) songTone(sc, note * 1.5, 0.12, 'triangle', 0.021, 0.14);
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

function animateRocola(sc, time) {
  const beatGlow = onBeat(sc, time) ? 0.18 : 0.08;
  const broken = time < sc.duckUntil;
  const power = Math.max(0.18, sc.musicVol || 1);
  sc.glow.setFillStyle(sc.song ? sc.song[1] : 0xf6ff00, beatGlow * power);
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
  sc.titleBox.add(sc.add.text(CX, 462, 'START1 = SOLO   START2 = CO-OP\nBTN1 onda circular   BTN2 dash/parry/special\nCuida tus corazones y que no bajen el volumen.', { fontFamily: 'monospace', fontSize: '17px', color: '#f7ffd8', align: 'center' }).setOrigin(0.5));

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
  s.body.setSize(26, 36);
  return { id, s, on: true, maxHp: 4, hp: 4, dx: id ? -1 : 1, dy: 0, attack: 0, skill: 0, dash: 0, stun: 0, inv: 0, boost: 0 };
}

function clearEnemies(sc) {
  for (const e of sc.enemies.getChildren()) e.destroy();
  sc.enemies.clear(true, true);
}

function clearPowerups(sc) {
  if (!sc.powerups) return;
  for (const p of sc.powerups.getChildren()) p.destroy();
  sc.powerups.clear(true, true);
}

function drawWorld(sc) {
  const g = sc.add.graphics().setDepth(-20);
  g.fillStyle(0x07070f).fillRect(0, 0, W, H);
  g.fillStyle(0x19081d).fillRect(0, 0, W, 92);
  g.lineStyle(3, 0xff4fc3, 0.38).lineBetween(0, 88, W, 64);
  g.lineStyle(3, 0xf6ff00, 0.35).lineBetween(0, 64, W, 92);
  for (let x = 18; x < W; x += 34) {
    g.fillStyle(x % 68 ? 0xff4fc3 : 0x43f5ff, 0.86).fillTriangle(x, 68, x + 18, 70, x + 9, 88);
  }
  g.fillStyle(0x0b1020).fillRect(0, 90, W, 170);
  for (let i = 0; i < 10; i++) {
    const bx = i * 88 - 20;
    g.fillStyle(i % 2 ? 0x0d1020 : 0x111a2c, 1).fillRect(bx, 118 + (i % 3) * 12, 54, 128);
    g.fillStyle(i % 3 ? 0xffdc5e : 0x43f5ff, 0.56);
    for (let y = 136; y < 238; y += 22) g.fillRect(bx + 14, y, 8, 12).fillRect(bx + 33, y + 4, 8, 10);
  }
  g.fillStyle(0x15182a).fillRect(64, 174, 210, 82);
  g.fillStyle(0x2d2740).fillRect(82, 142, 174, 116);
  g.fillStyle(0x0c0d18).fillRect(103, 178, 20, 78).fillRect(142, 178, 20, 78).fillRect(181, 178, 20, 78).fillRect(220, 178, 20, 78);
  g.fillStyle(0xf7ffd8, 0.78).fillCircle(169, 139, 50);
  g.fillStyle(0x0b1020).fillRect(107, 139, 124, 52);
  g.lineStyle(3, 0xffb000, 0.55).strokeCircle(169, 139, 48);
  g.lineStyle(2, 0xf7ffd8, 0.18);
  for (let r = 60; r < 126; r += 16) g.strokeCircle(169, 139, r);
  for (const x of [72, 728]) {
    g.fillStyle(0x0b1020).fillRect(x - 4, 285, 8, 148);
    g.fillStyle(0xffd56a, 0.35).fillCircle(x, 274, 32);
    g.fillStyle(0xffd56a, 0.85).fillCircle(x, 274, 9);
  }
  g.fillStyle(0x15182a).fillRect(586, 112, 34, 138);
  g.fillStyle(0x43f5ff, 0.6).fillTriangle(603, 60, 582, 112, 624, 112);
  g.fillStyle(0xff4fc3, 0.42).fillRect(598, 64, 10, 46);
  g.fillStyle(0x0a0f1a).fillRect(0, 246, W, 22);
  g.fillStyle(0x111018).fillRect(0, 250, W, 350);
  g.fillStyle(0x231228).fillRect(0, 470, W, 130);
  g.fillStyle(0x12141e).fillEllipse(CX, 394, 480, 164);
  g.lineStyle(3, 0xff4fc3, 0.26).strokeEllipse(CX, 394, 510, 184);
  g.lineStyle(3, 0xf6ff00, 0.2).strokeEllipse(CX, 394, 380, 130);
  g.lineStyle(2, 0x43f5ff, 0.3);
  for (let x = -160; x < W + 120; x += 90) g.lineBetween(x, H, x + 250, 250);
  g.lineStyle(1, 0xf6ff00, 0.18);
  for (let y = 282; y < H; y += 34) g.lineBetween(0, y, W, y);
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
  g.fillStyle(0x000000, 0.35).fillEllipse(22, 45, 32, 8);
  g.fillStyle(pants).fillRect(12, 25, 20, 16);
  g.fillStyle(color).fillRect(9, 18, 26, 14);
  g.fillStyle(mask).fillCircle(22, 12, 10);
  g.fillStyle(0xffd2a0).fillEllipse(22, 14, 11, 9);
  g.fillStyle(0xffffff).fillEllipse(17, 12, 5, 3).fillEllipse(27, 12, 5, 3);
  g.fillStyle(0x07070f).fillCircle(17, 12, 1.5).fillCircle(27, 12, 1.5);
  g.fillStyle(color).fillTriangle(12, 5, 20, 13, 12, 20).fillTriangle(32, 5, 24, 13, 32, 20);
  g.fillStyle(0xffd2a0).fillRect(3, 21, 8, 14).fillRect(34, 21, 8, 14);
  g.fillStyle(color).fillRect(1, 28, 10, 6).fillRect(34, 28, 10, 6);
  g.fillStyle(0x06060a).fillRect(13, 40, 7, 8).fillRect(25, 40, 7, 8);
  g.lineStyle(2, 0xffffff, 0.55).strokeRect(9, 18, 26, 14);
  g.generateTexture(key, 46, 50);
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
