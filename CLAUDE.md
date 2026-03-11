# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Game

Open `index.html` directly in a browser — no build step, no server, no dependencies. All game logic is self-contained in three files.

## Architecture

Single-page Canvas 2D game. All logic lives in `script.js` (~1150 lines), organized with numbered comment-header sections:

```
[1]  CONSTANTS & CONFIG      — canvas size, speeds, wall thickness
[2]  UTILITY FUNCTIONS       — clamp, circleHit, randRange, edgeSpawnPos
[3]  INPUT SYSTEM            — keys{} map + mouse{} object, event listeners
[4]  WEAPON DEFINITIONS      — WEAPON_CFG object literal (PISTOL/SHOTGUN/SMG/RAILGUN)
[5]  ENTITY CLASSES          — Player, Enemy, Bullet, Pickup
[6]  ENEMY AI                — applySeparation() separation force
[7]  LEVEL CONFIGS           — LEVEL_CONFIGS array (levels 1-4) + generateLevel(n) for 5+
[8]  GAME STATE & WORLD      — G{} object, entity arrays, wave state vars, startGame/nextLevel
[9]  COLLISION DETECTION     — checkCollisions() using circleHit for all entity pairs
[10] PARTICLE SYSTEM         — plain object array, spawnParticles(), updateParticles()
[11] RENDERING PIPELINE      — drawBackground → drawPickups → drawParticles → drawBullets → drawEnemies → drawPlayer → drawStateOverlay
[12] HUD UPDATE              — updateHUD() writes to DOM elements in index.html
[13] MAIN UPDATE / GAME LOOP — update(delta), updateWaveManager(delta)
[14] STATE MACHINE           — handleEnter() transitions; click listener delegates to handleEnter
[15] BOOT / INIT             — canvas/ctx setup, gameLoop RAF, window.onload
```

### Key Design Decisions

**Entity arrays are module-level**: `enemies`, `bullets`, `pickups`, `particles` are plain arrays filtered each frame with `.filter(e => e.active)`. Entities set `this.active = false` to mark themselves for removal.

**All collision is circle-circle**: `circleHit(ax,ay,ar, bx,by,br)` — every entity has a radius `r` field. Pickup collection uses `player.r + 6` as the magnet radius.

**Wave system**: `waveQueue[]` is a copy of the current level's waves array. `waveIdx` tracks the current wave; `waveSpawnCount` tracks remaining spawns. `betweenWaveTimer` adds a pause between waves. `allWavesDone()` returns true when `waveIdx >= waveQueue.length && waveSpawnCount === 0`.

**HUD is DOM, not canvas**: `index.html` has `#hud` absolutely positioned over the canvas. `updateHUD()` writes to those DOM elements directly. The canvas renders the crosshair and all game state overlays (START/LEVEL_COMPLETE/GAME_OVER) via `drawStateOverlay()`.

**Weapon state** is stored as plain objects inside `player.weapons[]` (not Weapon class instances). Each object holds `{ type, cfg, mag, reserve, cooldown, reloading, reloadTimer, muzzleFlash }`. `player.weapon` is a getter returning `player.weapons[player.weaponIdx]`.

**Level backgrounds**: Each level config has `bgColor` and `gridColor` as `[r,g,b]` arrays, used directly in `drawBackground()`. Level 5+ uses `generateLevel(n)` which cycles through color presets.

**Hi-score** is persisted to `localStorage` under the key `retroShooterHi`.

### Enemy Types (ENEMY_CFG)
| Key | Behavior |
|-----|----------|
| GRUNT | Direct chase with `wanderOff` angle offset |
| FAST | `_updateFast()` — slow tracking → charge burst state machine |
| TANK | Same chase as GRUNT, larger radius, high HP |
| SHOOTER | `_updateShooter()` — maintains 200px range, strafes, fires bullets every 1/fireRate seconds |

### Adding Content
- **New weapon**: add entry to `WEAPON_CFG`, add a `PICKUP_TYPES` entry with matching key, reference it in `onEnemyDeath()` drop list and level configs' allowed pickups.
- **New enemy type**: add entry to `ENEMY_CFG`, add an `_update<Type>()` method inside `Enemy.update()`, reference the new type in level configs or `generateLevel()`.
- **New level**: append to `LEVEL_CONFIGS` array; each entry needs `waves[]`, `bgColor`, and `gridColor`.

## Git Workflow

Commit after every meaningful change. Push to `origin/main` (GitHub: `jackpronger/retro-shooter`) after committing. Always write descriptive commit messages explaining *why*, not just what changed.
