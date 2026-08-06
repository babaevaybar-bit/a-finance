<GAME>
* **Entrypoint — CRITICAL**: `index.html` always loads `src/main.tsx` (React root) — NEVER modify it. Initialize `Phaser.Game` inside `src/App.tsx` via `useEffect` with `initialized.current` guard. Game scenes and logic go under `src/game/`.
* **`index.html` body** — `src/index.css` already sets `overflow:hidden` and Tailwind Preflight zeroes body margin; do NOT add duplicate inline styles to `index.html`.
* **FORBIDDEN packages** (available in package.json but must NOT be used for 2D games): `pixi.js` (use Phaser 3), `framer-motion` / `gsap` (use Phaser Tween system), standalone `import 'matter-js'` (use Phaser's built-in `physics: { default: 'matter' }`).
* ALWAYS use Phaser 3. NEVER pure React game loop.
* Make full use of assets in manifest.json. Landscape (960×640). Gravity: 0.

<GAME_TYPE_SELECTOR>
- Classic TD (free placement, enemy follows path) → `<CLASSIC_TD_PATTERNS>`
- PvZ lane-based TD (fixed lanes, drag-to-place plants, zombie wave per lane) → `<PVZ_LANE_PATTERNS>`
- Both share: `<WAVE_SPAWNING>`, `<PROJECTILE_SYSTEM>`, `<UPGRADE_SELL>`
</GAME_TYPE_SELECTOR>

<CONSTANTS_FILE>
```typescript
export const TILE_SIZE = 64;
export const TOWER_TYPES = {
  basic:  { damage:10, range:150, fireRate:1000, cost:50 },
  sniper: { damage:50, range:300, fireRate:2000, cost:100 },
  splash: { damage:15, range:120, fireRate:1500, cost:75, splashRadius:60 },
};
export const ENEMY_TYPES = {
  grunt: { hp:50,  speed:80,  reward:10 },
  tank:  { hp:200, speed:40,  reward:30 },
  fast:  { hp:30,  speed:160, reward:15 },
};
export const WAVE_INTERVAL=5000; export const STARTING_GOLD=200; export const STARTING_LIVES=20;
export const LANE_COUNT=5; export const SUN_GENERATE_INTERVAL=7000;
```
</CONSTANTS_FILE>

<CLASSIC_TD_PATTERNS>
* **Path following**: compute angle to next waypoint; `setVelocity(cos*speed, sin*speed)`. Advance waypoint when dist < 5px. Call `reachEnd()` when all waypoints consumed.
* **Tower targeting**: in tower update, clear `target` if inactive or out of range; scan enemies group for nearest in-range. Fire only when `canFire` flag is true (reset by `time.addEvent` loop).
* **Placement validation**: snap pointer to grid (`Math.floor(ptr.x / TILE_SIZE)`). Reject if cell is on path (`pathTiles Set`) or already has tower. Show green/red overlay + range circle on hover.
</CLASSIC_TD_PATTERNS>

<PVZ_LANE_PATTERNS>
* **Lane layout**: `LANE_Y(lane) = offsetY + lane * LANE_HEIGHT + LANE_HEIGHT/2`. Grid of boolean slots `[LANE_COUNT][GRID_COLS]`.
* **Sun resource**: `time.addEvent({ delay: SUN_GENERATE_INTERVAL, loop:true })` drops clickable sun from sky (auto-disappear after 7s). Sunflowers also produce sun on their own timer.
* **Plant placement**: tap seed card to select (check sun cost); tap empty slot to plant, deduct sun. Shovel mode: tap occupied slot to remove plant, refund 0%.
* **Zombie movement**: move leftward each frame (`x -= speed * delta/1000`). Stop and attack when a plant occupies the current column in same lane. `reachHome()` if `x < 0`.
* **Plant attack**: shooter plants fire at the closest zombie in the same lane with `x > plant.x`.
</PVZ_LANE_PATTERNS>

<WAVE_SPAWNING>
* **Phaser timer only** — NEVER `setTimeout` (drifts): `time.addEvent({ delay: spawnInterval, repeat: count-1, callback: spawnEnemy })`.
* **Wave complete**: check `enemies.countActive(true) === 0` after each enemy death.
* **Victory condition — REQUIRED**: after the last wave completes (all enemies dead + spawn timer done), transition to a VictoryScene or show a victory overlay. Define `MAX_WAVES` and check `this.currentWave >= MAX_WAVES && enemies.countActive(true) === 0`. A game with no reachable win state is unplayable.
* **Sun/resource balance**: verify the player can afford the cheapest action within the first 30–45 seconds. Formula: `cheapestCost / incomePerSecond ≤ 40s`. Default `SUN_GENERATE_INTERVAL = 7000ms` with cost-50 cheapest plant means 350s to first purchase — always too slow. Suggested: `SUN_GENERATE_INTERVAL = 5000` + `startingSun = 50`.
* **Between-wave countdown**: `time.addEvent({ delay:1000, repeat:... })` counting down on-screen. Provide "Send Early" button that cancels timer and starts next wave immediately.
</WAVE_SPAWNING>

<PROJECTILE_SYSTEM>
* **Object pool**: `physics.add.group({ maxSize:50, classType:Bullet })`. `physics.add.overlap(projectiles, enemies, onHit)`.
* **Predictive aim**: `timeToImpact = dist/BULLET_SPEED`; aim at `enemy.pos + velocity * timeToImpact`.
* **Splash**: on hit, iterate all enemies within `splashRadius` and deal damage. Show particle/circle effect.
</PROJECTILE_SYSTEM>

<UPGRADE_SELL>
* **Upgrade**: on tower click, show panel with upgrade cost and sell value. Apply stat bonuses (`damage`, `range`, `fireRate`) and swap texture to level variant. Max 3 levels.
* **Sell**: refund 60% of total spent gold (`Math.floor(totalCost * 0.6)`). Remove tower from grid array.
* **UI**: panel positioned near tower; hide on click-away or ESC.
</UPGRADE_SELL>

<MOBILE_CONTROLS>
```javascript
if (!this.game.device.os.desktop) {
  // Classic TD: bottom panel for tower cards (min 44px), tap to select, tap map to place/inspect
  // Pinch-to-zoom: track 2-pointer distance delta, apply to camera.zoom (clamp 0.5–2)
  // PvZ: seed card strip at top; drag-from-card to lane slot for intuitive placement
}
```
</MOBILE_CONTROLS>

<AUDIO>
- Different attack sounds per tower type. Enemy death sounds. Wave start/end announcements.
- PvZ: plant placement thud, sun collect chime, zombie groan, cherry bomb explosion.
- Upgrade confirmation ding, sell cash register sound.
- Trigger only after first interaction (autoplay policy).
</AUDIO>

<ZUSTAND_RULES>
All-Phaser UI is the default — manage all state inside scenes, no Zustand needed. Only add Zustand if React components outside the canvas must reflect game state (see SKILL.md shared rules).
</ZUSTAND_RULES>

<SCENE_LIFECYCLE>
* **`shutdown()` must be a class method** — in `shutdown()`: `this.time.removeAllEvents()`, mirror every `EventBus.on` with `EventBus.off`, `enemies.destroy(true)`, `projectiles.destroy(true)`, and `towers.forEach(t => world.removeCollider(t.collider))`.
* **Reset game state on scene restart** — reinitialize gold, lives, and wave counters at the top of `init()` or `create()`, not only in the settlement handler.
* **Keep state inside the scene** — all game state lives as scene-local properties; React's role is only to host the canvas container.
* **Tower / collider / timer ownership** — each tower holds a reference to its `rangeCollider`; call `world.removeCollider` before `tower.sprite.destroy()` on sell or level restart, otherwise the old collider keeps triggering attack callbacks.
* **`setDisplaySize` / `setScale` do not sync the physics body** — enemy sprites scaled by type (tank larger than grunt) must be followed by `body.setSize(w, h).setOffset(x, y)`, otherwise large enemies have a default-sized hitbox and projectiles miss.
* **Projectiles must not use `setCollideWorldBounds(true)`** — call `disableBody(true, true)` to return them to the pool when they leave the map; bouncing projectiles re-enter the play area and deal unintended damage.
* **Tween visibility / input — CRITICAL** — `alpha=0` or `setVisible(false)` makes an object invisible but does NOT remove its input hit-area; pointer events still fire on transparent objects, silently intercepting taps intended for elements beneath. Always call `disableInteractive()` when hiding and `setInteractive()` when showing again.
</SCENE_LIFECYCLE>

<PHASE_FSM>
**Wave / boss phases require an explicit finite state machine.**
* Define `type Phase = 'prepare' | 'wave' | 'boss' | 'transition' | 'victory'` and hold it in `this.phase`. All spawner, attack timer, and boss skill timer callbacks must guard with a phase check at entry.
* Phase transitions must be atomic — update `this.phase` first, then toggle timer and group active states.
* Wave end requires BOTH `enemies.countActive(true) === 0` AND the spawn timer finished — missing either leaves the final wave stuck.
* **Multiplayer warning** — Realtime APIs are message transports, not game protocols. Co-op tower defense needs an authority model (who is host), action queue, and room state machine; do not broadcast raw enemy positions every frame.
</PHASE_FSM>
</GAME>
