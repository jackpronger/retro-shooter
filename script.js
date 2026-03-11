// ════════════════════════════════════════════════════════════
// [1] CONSTANTS & CONFIG
// ════════════════════════════════════════════════════════════
const CANVAS_W = 800;
const CANVAS_H = 600;
const TILE_SIZE = 32;
const PLAYER_SPEED = 190;
const BULLET_SPEED = 520;
const WALL = 10; // border wall thickness

// ════════════════════════════════════════════════════════════
// [2] UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function dist2(ax, ay, bx, by) { const dx=ax-bx, dy=ay-by; return dx*dx+dy*dy; }
function circleHit(ax,ay,ar, bx,by,br) { return dist2(ax,ay,bx,by) < (ar+br)*(ar+br); }
function randRange(lo, hi) { return lo + Math.random() * (hi - lo); }
function randInt(lo, hi) { return Math.floor(randRange(lo, hi+1)); }

function edgeSpawnPos() {
  const edge = randInt(0, 3);
  if (edge === 0) return { x: randRange(WALL+10, CANVAS_W-WALL-10), y: WALL+2 };
  if (edge === 1) return { x: randRange(WALL+10, CANVAS_W-WALL-10), y: CANVAS_H-WALL-2 };
  if (edge === 2) return { x: WALL+2,            y: randRange(WALL+10, CANVAS_H-WALL-10) };
  return              { x: CANVAS_W-WALL-2,    y: randRange(WALL+10, CANVAS_H-WALL-10) };
}

function outOfBounds(x, y, margin) {
  margin = margin || 20;
  return x < -margin || x > CANVAS_W+margin || y < -margin || y > CANVAS_H+margin;
}

function lerpColor(a, b, t) {
  // a and b are [r,g,b] arrays, returns css string
  const r = Math.round(a[0]+(b[0]-a[0])*t);
  const g = Math.round(a[1]+(b[1]-a[1])*t);
  const bl = Math.round(a[2]+(b[2]-a[2])*t);
  return `rgb(${r},${g},${bl})`;
}

// ════════════════════════════════════════════════════════════
// [3] INPUT SYSTEM
// ════════════════════════════════════════════════════════════
const keys = {};
const mouse = { x: CANVAS_W/2, y: CANVAS_H/2, down: false, clicked: false };

window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();

  // state transitions
  if (e.code === 'Enter' || e.code === 'Space') handleEnter();

  // weapon switch
  if (e.code === 'Digit1') tryEquipSlot(0);
  if (e.code === 'Digit2') tryEquipSlot(1);
  if (e.code === 'Digit3') tryEquipSlot(2);
  if (e.code === 'KeyR' && player) player.reloadWeapon();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

window.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left) * (CANVAS_W / rect.width);
  mouse.y = (e.clientY - rect.top)  * (CANVAS_H / rect.height);
});
window.addEventListener('mousedown', e => {
  if (e.button === 0) { mouse.down = true; mouse.clicked = true; }
});
window.addEventListener('mouseup', e => {
  if (e.button === 0) mouse.down = false;
});

// ════════════════════════════════════════════════════════════
// [4] WEAPON DEFINITIONS
// ════════════════════════════════════════════════════════════
const WEAPON_CFG = {
  PISTOL: {
    label:'PIST', damage:28, fireRate:2.5, auto:false,
    reserveAmmo:48, magSize:12, reloadTime:1.2,
    spread:0.03, pellets:1, bulletSpeed:520, bulletSize:4,
    bulletColor:'#ffe050', pickupColor:'#ffe050',
  },
  SHOTGUN: {
    label:'SHOT', damage:20, fireRate:1.1, auto:false,
    reserveAmmo:24, magSize:6, reloadTime:1.8,
    spread:0.36, pellets:6, bulletSpeed:420, bulletSize:4,
    bulletColor:'#ff9900', pickupColor:'#ff9900',
  },
  SMG: {
    label:'SMG ', damage:13, fireRate:10, auto:true,
    reserveAmmo:120, magSize:30, reloadTime:1.4,
    spread:0.10, pellets:1, bulletSpeed:500, bulletSize:3,
    bulletColor:'#80ffff', pickupColor:'#80ffff',
  },
  RAILGUN: {
    label:'RAIL', damage:95, fireRate:0.9, auto:false,
    reserveAmmo:8, magSize:1, reloadTime:1.6,
    spread:0.0, pellets:1, bulletSpeed:900, bulletSize:5,
    bulletColor:'#ff44ff', pickupColor:'#ff44ff',
  },
};

// ════════════════════════════════════════════════════════════
// [5] ENTITY CLASSES
// ════════════════════════════════════════════════════════════

// ── Player ──────────────────────────────────────────────────
class Player {
  constructor() {
    this.x = CANVAS_W / 2;
    this.y = CANVAS_H / 2;
    this.r = 11;
    this.speed = PLAYER_SPEED;
    this.hp = 100;
    this.maxHp = 100;
    this.angle = 0;
    this.invTimer = 0;  // invincibility frames timer
    this.flashTimer = 0;

    // Weapon inventory: array of weapon state objects
    this.weapons = [ this._makeWeapon('PISTOL') ];
    this.weaponIdx = 0;
    this.active = true;
  }

  _makeWeapon(type) {
    const cfg = WEAPON_CFG[type];
    return {
      type, cfg,
      mag: cfg.magSize,
      reserve: cfg.reserveAmmo,
      cooldown: 0,
      reloading: false,
      reloadTimer: 0,
      muzzleFlash: 0,
    };
  }

  get weapon() { return this.weapons[this.weaponIdx]; }

  equipWeaponType(type) {
    // Check if already owned
    for (let i=0; i<this.weapons.length; i++) {
      if (this.weapons[i].type === type) {
        // Add ammo
        this.weapons[i].reserve = Math.min(this.weapons[i].cfg.reserveAmmo,
          this.weapons[i].reserve + this.weapons[i].cfg.magSize * 2);
        this.weaponIdx = i;
        updateHUD();
        return;
      }
    }
    // Find empty slot or replace current
    const newW = this._makeWeapon(type);
    if (this.weapons.length < 3) {
      this.weapons.push(newW);
      this.weaponIdx = this.weapons.length - 1;
    } else {
      this.weapons[this.weaponIdx] = newW;
    }
    updateHUD();
  }

  tryFireBullets() {
    const w = this.weapon;
    if (w.reloading) return [];
    if (w.cooldown > 0) return [];
    if (w.mag <= 0) {
      this.reloadWeapon();
      return [];
    }
    const cfg = w.cfg;
    const barrelEnd = this.r + 16;
    const bx = this.x + Math.cos(this.angle) * barrelEnd;
    const by = this.y + Math.sin(this.angle) * barrelEnd;
    const shots = [];
    for (let i = 0; i < cfg.pellets; i++) {
      const a = this.angle + (Math.random()-0.5) * cfg.spread;
      shots.push(new Bullet(bx, by, a, cfg.bulletSpeed, cfg.damage, true, cfg.bulletSize, cfg.bulletColor));
    }
    w.mag--;
    w.cooldown = 1 / cfg.fireRate;
    w.muzzleFlash = 0.07;
    if (w.mag <= 0 && w.reserve > 0) this.reloadWeapon();
    updateHUD();
    return shots;
  }

  reloadWeapon() {
    const w = this.weapon;
    if (w.reloading || w.reserve <= 0 || w.mag >= w.cfg.magSize) return;
    w.reloading = true;
    w.reloadTimer = w.cfg.reloadTime;
  }

  takeDamage(amount) {
    if (this.invTimer > 0) return;
    this.hp = Math.max(0, this.hp - amount);
    this.invTimer = 0.55;
    this.flashTimer = 0.55;
    updateHUD();
    if (this.hp <= 0) {
      this.active = false;
      spawnParticles(this.x, this.y, '#4af', 14, 4);
    }
  }

  addHealth(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    updateHUD();
  }

  addAmmo(amount) {
    const w = this.weapon;
    w.reserve = Math.min(w.cfg.reserveAmmo, w.reserve + amount);
    updateHUD();
  }

  update(delta) {
    // movement
    let dx=0, dy=0;
    if (keys['ArrowLeft']  || keys['KeyA']) dx -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
    if (keys['ArrowUp']    || keys['KeyW']) dy -= 1;
    if (keys['ArrowDown']  || keys['KeyS']) dy += 1;
    if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
    this.x = clamp(this.x + dx * this.speed * delta, WALL+this.r, CANVAS_W-WALL-this.r);
    this.y = clamp(this.y + dy * this.speed * delta, WALL+this.r, CANVAS_H-WALL-this.r);

    // aim
    this.angle = Math.atan2(mouse.y - this.y, mouse.x - this.x);

    // timers
    const w = this.weapon;
    if (w.cooldown > 0) w.cooldown -= delta;
    if (w.muzzleFlash > 0) w.muzzleFlash -= delta;
    if (w.reloading) {
      w.reloadTimer -= delta;
      if (w.reloadTimer <= 0) {
        const need = w.cfg.magSize - w.mag;
        const give = Math.min(need, w.reserve);
        w.mag += give;
        w.reserve -= give;
        w.reloading = false;
        updateHUD();
      }
    }
    if (this.invTimer > 0) this.invTimer -= delta;
    if (this.flashTimer > 0) this.flashTimer -= delta;

    // fire
    const autoFire = w.cfg.auto && mouse.down;
    const semiFire  = !w.cfg.auto && mouse.clicked;
    if (autoFire || semiFire) {
      const shots = this.tryFireBullets();
      for (const b of shots) bullets.push(b);
    }
  }

  draw(ctx) {
    // flash white when invincible
    const flash = this.flashTimer > 0 && (Math.floor(this.flashTimer * 12) % 2 === 0);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // body
    ctx.fillStyle = flash ? '#ffffff' : '#3a8a3a';
    ctx.fillRect(-11, -11, 22, 22);

    // inner detail
    ctx.fillStyle = flash ? '#ddffdd' : '#2a6a2a';
    ctx.fillRect(-7, -7, 14, 14);

    // gun barrel
    ctx.fillStyle = flash ? '#ccc' : '#888';
    ctx.fillRect(8, -3, 14, 6);

    // muzzle flash
    const w = this.weapon;
    if (w.muzzleFlash > 0) {
      ctx.fillStyle = '#ffff80';
      ctx.fillRect(20, -4, 8, 8);
      ctx.fillStyle = '#ffff00';
      ctx.fillRect(22, -2, 5, 5);
    }

    ctx.restore();

    // crosshair at mouse
    drawCrosshair(ctx, mouse.x, mouse.y);
  }
}

// ── Enemy ────────────────────────────────────────────────────
const ENEMY_CFG = {
  GRUNT:   { hp:30,  speed:72,  r:10, damage:12, color:'#dd3333', scoreVal:100, fireRate:0   },
  FAST:    { hp:18,  speed:160, r:9,  damage:18, color:'#dd8822', scoreVal:150, fireRate:0   },
  TANK:    { hp:130, speed:44,  r:16, damage:20, color:'#882222', scoreVal:250, fireRate:0   },
  SHOOTER: { hp:35,  speed:55,  r:10, damage:10, color:'#882288', scoreVal:200, fireRate:1.5 },
};

class Enemy {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    const cfg = ENEMY_CFG[type];
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.speed = cfg.speed;
    this.r = cfg.r;
    this.damage = cfg.damage;
    this.color = cfg.color;
    this.scoreVal = cfg.scoreVal;
    this.fireRate = cfg.fireRate;
    this.fireCooldown = 1.0 + Math.random();
    this.wanderOff = (Math.random()-0.5) * 0.5;
    this.angle = 0;
    this.active = true;

    // SHOOTER strafe
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.strafeSwitchTimer = randRange(1.5, 3.0);

    // FAST charge state
    this.chargeState = 'tracking';
    this.chargeTimer = randRange(2.0, 3.5);
    this.chargeAngle = 0;
  }

  takeDamage(amount) {
    this.hp -= amount;
    if (this.hp <= 0) { this.active = false; return true; }
    return false;
  }

  update(delta) {
    if (!player || !player.active) return;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const d  = Math.sqrt(dx*dx + dy*dy);
    const baseAngle = Math.atan2(dy, dx);
    this.angle = baseAngle;

    if (this.type === 'SHOOTER') {
      this._updateShooter(delta, d, baseAngle);
    } else if (this.type === 'FAST') {
      this._updateFast(delta, baseAngle);
    } else {
      // GRUNT and TANK: simple chase with wander
      const moveAngle = baseAngle + this.wanderOff;
      this.x += Math.cos(moveAngle) * this.speed * delta;
      this.y += Math.sin(moveAngle) * this.speed * delta;
    }

    // clamp to arena
    this.x = clamp(this.x, WALL+this.r, CANVAS_W-WALL-this.r);
    this.y = clamp(this.y, WALL+this.r, CANVAS_H-WALL-this.r);
  }

  _updateFast(delta, baseAngle) {
    if (this.chargeState === 'tracking') {
      this.chargeTimer -= delta;
      this.x += Math.cos(baseAngle + this.wanderOff) * this.speed * 0.4 * delta;
      this.y += Math.sin(baseAngle + this.wanderOff) * this.speed * 0.4 * delta;
      if (this.chargeTimer <= 0) {
        this.chargeState = 'charging';
        this.chargeAngle = baseAngle;
        this.chargeTimer = 0.45;
      }
    } else {
      this.x += Math.cos(this.chargeAngle) * this.speed * 2.8 * delta;
      this.y += Math.sin(this.chargeAngle) * this.speed * 2.8 * delta;
      this.chargeTimer -= delta;
      if (this.chargeTimer <= 0) {
        this.chargeState = 'tracking';
        this.chargeTimer = randRange(1.5, 3.0);
      }
    }
  }

  _updateShooter(delta, d, baseAngle) {
    const preferred = 200;
    let moveAngle;
    if (d < preferred) {
      // back away
      moveAngle = baseAngle + Math.PI;
    } else {
      // strafe laterally
      moveAngle = baseAngle + Math.PI/2 * this.strafeDir;
    }
    this.x += Math.cos(moveAngle) * this.speed * delta;
    this.y += Math.sin(moveAngle) * this.speed * delta;

    // switch strafe direction
    this.strafeSwitchTimer -= delta;
    if (this.strafeSwitchTimer <= 0) {
      this.strafeDir *= -1;
      this.strafeSwitchTimer = randRange(1.5, 3.0);
    }

    // fire
    this.fireCooldown -= delta;
    if (this.fireCooldown <= 0) {
      this.fireCooldown = 1 / this.fireRate;
      const a = Math.atan2(player.y - this.y, player.x - this.x);
      bullets.push(new Bullet(this.x, this.y, a, 220, this.damage, false, 5, '#ff4444'));
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // body
    ctx.fillStyle = this.color;
    const sz = this.r;
    ctx.fillRect(-sz, -sz, sz*2, sz*2);

    // eye dots
    ctx.fillStyle = '#000';
    const eo = sz * 0.4;
    ctx.fillRect(-eo-2, -sz*0.3, 4, 4);
    ctx.fillRect( eo-2, -sz*0.3, 4, 4);

    // TANK special: thick outline
    if (this.type === 'TANK') {
      ctx.strokeStyle = '#550000';
      ctx.lineWidth = 3;
      ctx.strokeRect(-sz, -sz, sz*2, sz*2);
    }

    // SHOOTER: antenna
    if (this.type === 'SHOOTER') {
      ctx.strokeStyle = '#ff88ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0,-sz); ctx.lineTo(0,-sz-8); ctx.stroke();
      ctx.fillStyle = '#ff88ff';
      ctx.fillRect(-2,-sz-10, 4, 4);
    }

    ctx.restore();

    // hp bar (world space, not rotated)
    const bw = this.r*2 + 4;
    const bx = this.x - bw/2;
    const by = this.y - this.r - 8;
    ctx.fillStyle = '#400';
    ctx.fillRect(bx, by, bw, 4);
    const ratio = this.hp / this.maxHp;
    ctx.fillStyle = ratio > 0.5 ? '#0c0' : ratio > 0.25 ? '#cc0' : '#c00';
    ctx.fillRect(bx, by, bw * ratio, 4);
  }
}

// ── Bullet ───────────────────────────────────────────────────
class Bullet {
  constructor(x, y, angle, speed, damage, fromPlayer, size, color) {
    this.x = x; this.y = y;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.damage = damage;
    this.fromPlayer = fromPlayer;
    this.size = size;
    this.color = color;
    this.active = true;
    this.life = 2.2;
    this.trail = [];
  }

  update(delta) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 4) this.trail.shift();
    this.x += this.vx * delta;
    this.y += this.vy * delta;
    this.life -= delta;
    if (this.life <= 0 || outOfBounds(this.x, this.y)) this.active = false;
  }

  draw(ctx) {
    // trail
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const alpha = (i+1) / this.trail.length * 0.4;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      const ts = Math.max(1, this.size * 0.6);
      ctx.fillRect(t.x - ts/2, t.y - ts/2, ts, ts);
    }
    ctx.globalAlpha = 1;

    // bullet glow
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
    ctx.shadowBlur = 0;
  }
}

// ── Pickup ───────────────────────────────────────────────────
const PICKUP_TYPES = {
  HEALTH:  { color: '#44ff44', label: 'HP' },
  AMMO:    { color: '#ffff44', label: 'AMO' },
  SHOTGUN: { color: '#ff9900', label: 'SHT' },
  SMG:     { color: '#80ffff', label: 'SMG' },
  RAILGUN: { color: '#ff44ff', label: 'RLG' },
};

class Pickup {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    this.r = 9;
    this.bobTimer = Math.random() * Math.PI * 2;
    this.lifetime = 14.0;
    this.active = true;
  }

  update(delta) {
    this.bobTimer += delta * 3;
    this.lifetime -= delta;
    if (this.lifetime <= 0) this.active = false;
  }

  draw(ctx) {
    const cfg = PICKUP_TYPES[this.type];
    const bobY = Math.sin(this.bobTimer) * 4;
    const fade = this.lifetime < 3 ? this.lifetime / 3 : 1;

    ctx.globalAlpha = fade;
    ctx.shadowColor = cfg.color;
    ctx.shadowBlur = 12;

    ctx.fillStyle = '#111';
    ctx.fillRect(this.x - this.r, this.y - this.r + bobY, this.r*2, this.r*2);
    ctx.fillStyle = cfg.color;
    ctx.fillRect(this.x - this.r+2, this.y - this.r+2 + bobY, this.r*2-4, this.r*2-4);

    // label
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.font = '7px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(cfg.label, this.x, this.y + 3 + bobY);
    ctx.textAlign = 'left';

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

// ════════════════════════════════════════════════════════════
// [6] ENEMY AI — separation force applied globally
// ════════════════════════════════════════════════════════════
function applySeparation() {
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i+1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx*dx+dy*dy);
      const minD = a.r + b.r + 2;
      if (d < minD && d > 0) {
        const push = (minD - d) / d * 0.55;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
      }
    }
  }
}

// ════════════════════════════════════════════════════════════
// [7] LEVEL CONFIGS
// ════════════════════════════════════════════════════════════
const LEVEL_CONFIGS = [
  // Level 1
  {
    waves: [
      { type:'GRUNT', count:5, interval:1.2 },
    ],
    bgColor: [10,20,10],
    gridColor: [15,35,15],
  },
  // Level 2
  {
    waves: [
      { type:'GRUNT', count:6, interval:0.9 },
      { type:'FAST',  count:3, interval:1.4 },
    ],
    bgColor: [10,15,25],
    gridColor: [15,22,38],
  },
  // Level 3
  {
    waves: [
      { type:'GRUNT',   count:6,  interval:0.8 },
      { type:'FAST',    count:3,  interval:1.0 },
      { type:'SHOOTER', count:3,  interval:1.5 },
    ],
    bgColor: [25,10,10],
    gridColor: [40,14,14],
  },
  // Level 4
  {
    waves: [
      { type:'GRUNT',   count:6,  interval:0.7 },
      { type:'FAST',    count:4,  interval:0.9 },
      { type:'SHOOTER', count:3,  interval:1.2 },
      { type:'TANK',    count:2,  interval:2.0 },
    ],
    bgColor: [20,10,28],
    gridColor: [32,15,45],
  },
];

function generateLevel(n) {
  // Level 5+ procedural
  const mult = n - 4;
  const waves = [
    { type:'GRUNT',   count: 6 + mult*2, interval:0.6 },
    { type:'FAST',    count: 4 + mult,   interval:0.8 },
    { type:'SHOOTER', count: 3 + mult,   interval:1.0 },
    { type:'TANK',    count: 2 + Math.floor(mult/2), interval:1.8 },
  ];
  const t = (mult % 4) / 3;
  const colors = [
    [[10,20,10],[20,10,10]],
    [[10,15,25],[20,10,28]],
    [[25,10,10],[10,20,10]],
    [[20,10,28],[10,15,25]],
  ];
  const ci = mult % colors.length;
  return {
    waves,
    bgColor: colors[ci][0],
    gridColor: colors[ci][1],
  };
}

function getLevelConfig(n) {
  if (n <= LEVEL_CONFIGS.length) return LEVEL_CONFIGS[n-1];
  return generateLevel(n);
}

// ════════════════════════════════════════════════════════════
// [8] GAME STATE & WORLD
// ════════════════════════════════════════════════════════════
let player = null;
let enemies = [];
let bullets  = [];
let pickups  = [];
let particles = [];

const G = {
  state: 'START',  // START | PLAYING | LEVEL_COMPLETE | GAME_OVER
  score: 0,
  hiScore: parseInt(localStorage.getItem('retroShooterHi') || '0'),
  level: 1,
};

// Wave management
let waveQueue = [];
let waveIdx = 0;
let waveSpawnCount = 0;
let waveSpawnTimer = 0;
let betweenWaveTimer = 0;
let levelCompleteTimer = 0;

function initLevel(n) {
  enemies = [];
  bullets = [];
  pickups = [];
  particles = [];

  const cfg = getLevelConfig(n);
  waveQueue = cfg.waves.map(w => Object.assign({}, w));
  waveIdx = 0;
  waveSpawnCount = waveQueue[0] ? waveQueue[0].count : 0;
  waveSpawnTimer = 0;
  betweenWaveTimer = 0;
}

function startGame() {
  G.score = 0;
  G.level = 1;
  player = new Player();
  initLevel(1);
  G.state = 'PLAYING';
  updateHUD();
}

function nextLevel() {
  G.level++;
  if (player) {
    player.x = CANVAS_W/2;
    player.y = CANVAS_H/2;
    // refill one mag worth of ammo as bonus
    const w = player.weapon;
    w.reserve = Math.min(w.cfg.reserveAmmo, w.reserve + w.cfg.magSize);
  }
  initLevel(G.level);
  G.state = 'PLAYING';
  updateHUD();
}

function handleEnter() {
  if (G.state === 'START') {
    startGame();
  } else if (G.state === 'LEVEL_COMPLETE') {
    nextLevel();
  } else if (G.state === 'GAME_OVER') {
    G.hiScore = Math.max(G.hiScore, G.score);
    localStorage.setItem('retroShooterHi', G.hiScore);
    G.state = 'START';
  }
}

function tryEquipSlot(idx) {
  if (!player || G.state !== 'PLAYING') return;
  if (idx < player.weapons.length) player.weaponIdx = idx;
  updateHUD();
}

function onEnemyDeath(enemy) {
  G.score += enemy.scoreVal;
  spawnParticles(enemy.x, enemy.y, enemy.color, 12, 3);
  updateHUD();

  // pickup drops
  const roll = Math.random();
  if (roll < 0.18) {
    pickups.push(new Pickup(enemy.x, enemy.y, 'HEALTH'));
  } else if (roll < 0.32) {
    pickups.push(new Pickup(enemy.x, enemy.y, 'AMMO'));
  } else if (roll < 0.42) {
    // weapon drop based on level
    const wTypes = ['SHOTGUN', 'SMG', 'RAILGUN'];
    const w = wTypes[Math.min(G.level-2, wTypes.length-1)];
    if (G.level >= 2) pickups.push(new Pickup(enemy.x, enemy.y, w));
  }
}

function applyPickup(p) {
  if (!player) return;
  if (p.type === 'HEALTH')  player.addHealth(40);
  else if (p.type === 'AMMO') player.addAmmo(player.weapon.cfg.magSize * 2);
  else player.equipWeaponType(p.type);
  p.active = false;
}

// ════════════════════════════════════════════════════════════
// [9] COLLISION DETECTION
// ════════════════════════════════════════════════════════════
function checkCollisions() {
  if (!player || !player.active) return;

  // Player bullets vs enemies
  for (const b of bullets) {
    if (!b.fromPlayer || !b.active) continue;
    for (const e of enemies) {
      if (!e.active) continue;
      if (circleHit(b.x, b.y, b.size/2, e.x, e.y, e.r)) {
        b.active = false;
        spawnParticles(b.x, b.y, e.color, 4, 2);
        if (e.takeDamage(b.damage)) {
          onEnemyDeath(e);
        }
        break;
      }
    }
  }

  // Enemy bullets vs player
  if (player.invTimer <= 0) {
    for (const b of bullets) {
      if (b.fromPlayer || !b.active) continue;
      if (circleHit(b.x, b.y, b.size/2, player.x, player.y, player.r)) {
        b.active = false;
        player.takeDamage(b.damage);
        updateHUD();
      }
    }
  }

  // Enemies touching player
  for (const e of enemies) {
    if (!e.active) continue;
    if (circleHit(e.x, e.y, e.r, player.x, player.y, player.r)) {
      player.takeDamage(e.damage * 0.55);
      // nudge enemy away
      const dx = e.x - player.x, dy = e.y - player.y;
      const d = Math.sqrt(dx*dx+dy*dy) || 1;
      e.x += dx/d * 4;
      e.y += dy/d * 4;
      updateHUD();
    }
  }

  // Player vs pickups
  for (const p of pickups) {
    if (!p.active) continue;
    if (circleHit(player.x, player.y, player.r+6, p.x, p.y, p.r)) {
      applyPickup(p);
    }
  }
}

// ════════════════════════════════════════════════════════════
// [10] PARTICLE SYSTEM
// ════════════════════════════════════════════════════════════
function spawnParticles(x, y, color, count, size) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = randRange(30, 140);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color,
      size: size + Math.random() * 2,
      life: randRange(0.3, 0.7),
      maxLife: 0,
    });
    particles[particles.length-1].maxLife = particles[particles.length-1].life;
  }
}

function updateParticles(delta) {
  for (const p of particles) {
    p.x += p.vx * delta;
    p.y += p.vy * delta;
    p.vx *= (1 - delta * 4);
    p.vy *= (1 - delta * 4);
    p.life -= delta;
  }
  particles = particles.filter(p => p.life > 0);
}

// ════════════════════════════════════════════════════════════
// [11] RENDERING PIPELINE
// ════════════════════════════════════════════════════════════

function drawBackground(ctx) {
  const cfg = getLevelConfig(G.level);
  const bg = cfg.bgColor;
  const gr = cfg.gridColor;

  ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // grid lines
  ctx.strokeStyle = `rgb(${gr[0]},${gr[1]},${gr[2]})`;
  ctx.lineWidth = 1;
  for (let x = 0; x <= CANVAS_W; x += TILE_SIZE) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke();
  }
  for (let y = 0; y <= CANVAS_H; y += TILE_SIZE) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
  }

  // border walls
  ctx.fillStyle = `rgb(${Math.min(bg[0]+30,60)},${Math.min(bg[1]+30,60)},${Math.min(bg[2]+30,60)})`;
  ctx.fillRect(0, 0, CANVAS_W, WALL);
  ctx.fillRect(0, CANVAS_H-WALL, CANVAS_W, WALL);
  ctx.fillRect(0, 0, WALL, CANVAS_H);
  ctx.fillRect(CANVAS_W-WALL, 0, WALL, CANVAS_H);
}

function drawPickups(ctx) {
  for (const p of pickups) p.draw(ctx);
}

function drawParticles(ctx) {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawBullets(ctx) {
  for (const b of bullets) b.draw(ctx);
}

function drawEnemies(ctx) {
  for (const e of enemies) e.draw(ctx);
}

function drawPlayer(ctx) {
  if (player && player.active) player.draw(ctx);
}

function drawCrosshair(ctx, x, y) {
  const sz = 10;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - sz, y); ctx.lineTo(x + sz, y);
  ctx.moveTo(x, y - sz); ctx.lineTo(x, y + sz);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI*2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawStateOverlay(ctx) {
  if (G.state === 'PLAYING') return;

  ctx.fillStyle = 'rgba(0,0,0,0.78)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.textAlign = 'center';

  if (G.state === 'START') {
    ctx.fillStyle = '#ffff00';
    ctx.font = 'bold 52px "Courier New"';
    ctx.fillText('RETRO SHOOTER', CANVAS_W/2, 160);

    ctx.fillStyle = '#88aaff';
    ctx.font = '18px "Courier New"';
    ctx.fillText('ARROW KEYS / WASD  —  Move', CANVAS_W/2, 240);
    ctx.fillText('MOUSE  —  Aim', CANVAS_W/2, 270);
    ctx.fillText('LEFT CLICK  —  Fire', CANVAS_W/2, 300);
    ctx.fillText('R  —  Reload     1 / 2 / 3  —  Switch Weapon', CANVAS_W/2, 330);

    ctx.fillStyle = '#00ff88';
    ctx.font = '26px "Courier New"';
    if (Math.sin(Date.now()/400) > 0) {
      ctx.fillText('PRESS ENTER OR CLICK TO START', CANVAS_W/2, 410);
    }

    ctx.fillStyle = '#888';
    ctx.font = '14px "Courier New"';
    ctx.fillText(`HI-SCORE: ${G.hiScore}`, CANVAS_W/2, 480);
  }

  if (G.state === 'LEVEL_COMPLETE') {
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 44px "Courier New"';
    ctx.fillText('LEVEL COMPLETE!', CANVAS_W/2, 220);

    ctx.fillStyle = '#ffff00';
    ctx.font = '24px "Courier New"';
    ctx.fillText(`SCORE: ${G.score}`, CANVAS_W/2, 290);

    ctx.fillStyle = '#fff';
    ctx.font = '20px "Courier New"';
    ctx.fillText(`LEVEL ${G.level+1} INCOMING...`, CANVAS_W/2, 340);

    ctx.fillStyle = '#aaf';
    ctx.font = '18px "Courier New"';
    if (Math.sin(Date.now()/400) > 0) {
      ctx.fillText('PRESS ENTER TO CONTINUE', CANVAS_W/2, 400);
    }
  }

  if (G.state === 'GAME_OVER') {
    ctx.fillStyle = '#ff2222';
    ctx.font = 'bold 52px "Courier New"';
    ctx.fillText('GAME OVER', CANVAS_W/2, 210);

    ctx.fillStyle = '#ffff00';
    ctx.font = '24px "Courier New"';
    ctx.fillText(`FINAL SCORE: ${G.score}`, CANVAS_W/2, 280);

    if (G.score > 0 && G.score >= G.hiScore) {
      ctx.fillStyle = '#00ff88';
      ctx.font = '22px "Courier New"';
      ctx.fillText('NEW HI-SCORE!', CANVAS_W/2, 320);
    }

    ctx.fillStyle = '#fff';
    ctx.font = '18px "Courier New"';
    if (Math.sin(Date.now()/400) > 0) {
      ctx.fillText('PRESS ENTER TO RESTART', CANVAS_W/2, 390);
    }
  }

  ctx.textAlign = 'left';
}

function render(ctx) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawBackground(ctx);
  drawPickups(ctx);
  drawParticles(ctx);
  drawBullets(ctx);
  drawEnemies(ctx);
  drawPlayer(ctx);
  drawStateOverlay(ctx);
}

// ════════════════════════════════════════════════════════════
// [12] HUD UPDATE
// ════════════════════════════════════════════════════════════
function updateHUD() {
  const hudLevel = document.getElementById('hud-level');
  const hudEnemies = document.getElementById('hud-enemies');
  const hudScore = document.getElementById('hud-score');
  const hpBar = document.getElementById('hud-hp-bar');
  const hpText = document.getElementById('hud-hp-text');
  const hudAmmo = document.getElementById('hud-ammo');
  const hudWeaponName = document.getElementById('hud-weapon-name');

  hudLevel.textContent = `LVL ${G.level}`;
  hudScore.textContent = `SCORE: ${G.score}`;

  const totalEnemies = enemies.length + waveSpawnCount +
    waveQueue.slice(waveIdx+1).reduce((s,w) => s+w.count, 0);
  hudEnemies.textContent = `ENEMIES: ${totalEnemies}`;

  if (!player) return;

  const ratio = player.hp / player.maxHp;
  hpBar.style.width = (ratio * 100) + '%';
  hpBar.style.background = ratio > 0.5 ? '#0c0' : ratio > 0.25 ? '#cc0' : '#c20';
  hpText.textContent = `${player.hp}/${player.maxHp}`;

  const w = player.weapon;
  const ammoStr = w.reloading ? 'RELOADING...' : `${w.mag} / ${w.reserve}`;
  hudAmmo.textContent = ammoStr;
  hudWeaponName.textContent = w.type;

  for (let i=0; i<3; i++) {
    const slot = document.getElementById(`slot-${i}`);
    if (!slot) continue;
    if (i < player.weapons.length) {
      slot.textContent = WEAPON_CFG[player.weapons[i].type].label;
      slot.className = 'weapon-slot' + (i === player.weaponIdx ? ' active' : '');
    } else {
      slot.textContent = '---';
      slot.className = 'weapon-slot';
    }
  }
}

// ════════════════════════════════════════════════════════════
// [13] MAIN UPDATE / GAME LOOP
// ════════════════════════════════════════════════════════════
function updateWaveManager(delta) {
  if (waveIdx >= waveQueue.length) return; // all waves sent

  if (betweenWaveTimer > 0) {
    betweenWaveTimer -= delta;
    return;
  }

  if (waveSpawnCount > 0) {
    waveSpawnTimer -= delta;
    if (waveSpawnTimer <= 0) {
      const wave = waveQueue[waveIdx];
      const pos = edgeSpawnPos();
      enemies.push(new Enemy(pos.x, pos.y, wave.type));
      waveSpawnCount--;
      waveSpawnTimer = wave.interval;
      updateHUD();
    }
  } else {
    // Current wave done spawning — move to next
    waveIdx++;
    if (waveIdx < waveQueue.length) {
      waveSpawnCount = waveQueue[waveIdx].count;
      waveSpawnTimer = 0;
      betweenWaveTimer = 2.5;
    }
  }
}

function allWavesDone() {
  return waveIdx >= waveQueue.length && waveSpawnCount === 0;
}

function update(delta) {
  if (G.state !== 'PLAYING') {
    // still animate particles on overlays
    updateParticles(delta);
    return;
  }

  // Player
  if (player && player.active) {
    player.update(delta);
  } else if (player && !player.active) {
    G.state = 'GAME_OVER';
    G.hiScore = Math.max(G.hiScore, G.score);
    localStorage.setItem('retroShooterHi', G.hiScore);
    updateHUD();
    return;
  }

  // Waves
  updateWaveManager(delta);

  // Enemies
  for (const e of enemies) e.update(delta);
  applySeparation();

  // Bullets
  for (const b of bullets) b.update(delta);

  // Pickups
  for (const p of pickups) p.update(delta);

  // Particles
  updateParticles(delta);

  // Collision
  checkCollisions();

  // Filter inactive
  bullets   = bullets.filter(b => b.active);
  enemies   = enemies.filter(e => e.active);
  pickups   = pickups.filter(p => p.active);

  // Level complete?
  if (allWavesDone() && enemies.length === 0) {
    G.state = 'LEVEL_COMPLETE';
  }

  // Periodically refresh HUD enemy count
  updateHUD();

  // Consume single-frame click
  mouse.clicked = false;
}

// ════════════════════════════════════════════════════════════
// [14] STATE MACHINE — handled inline in handleEnter() and update()
// ════════════════════════════════════════════════════════════

// Click on canvas to trigger enter for start/gameover/levelcomplete
window.addEventListener('click', () => {
  if (G.state !== 'PLAYING') handleEnter();
});

// ════════════════════════════════════════════════════════════
// [15] BOOT / INIT
// ════════════════════════════════════════════════════════════
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

let lastTime = 0;

function gameLoop(timestamp) {
  const delta = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;

  update(delta);
  render(ctx);

  requestAnimationFrame(gameLoop);
}

window.addEventListener('load', () => {
  updateHUD();
  requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(gameLoop); });
});
