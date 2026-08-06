<GAME>
* **Entrypoint — CRITICAL**: `index.html` always loads `src/main.tsx` (React root) — NEVER modify it. Initialize `Phaser.Game` inside `src/App.tsx` via `useEffect` with `initialized.current` guard. Game scenes and logic go under `src/game/`.
* **`index.html` body** — `src/index.css` already sets `overflow:hidden` and Tailwind Preflight zeroes body margin; do NOT add duplicate inline styles to `index.html`.
* **Phaser container div — CRITICAL**: NEVER add `flex`, `justify-center`, or `items-center` to the div passed as Phaser's `parent`. These classes interfere with `Scale.CENTER_BOTH`'s `margin: auto` centering and cause the canvas to render off-center. Use only `className="w-full h-full"` (or `w-full h-screen`).
* **FORBIDDEN packages** (available in package.json but must NOT be used for 2D games): `pixi.js` (use Phaser 3), `framer-motion` / `gsap` (use Phaser Tween system), standalone `import 'matter-js'` (use Phaser's built-in `physics: { default: 'matter' }`).
* ALWAYS use Phaser 3. NEVER pure React game loop.
* Make full use of assets in manifest.json.
* **Scene completeness — CRITICAL**: A game with a PRD must implement ALL pages listed in the PRD's page structure. Every named page (level select, pause, settings, victory, defeat) requires its own Scene with the exact buttons described. Never collapse multiple PRD pages into one Scene, and never omit a page because it seems minor.
* **Result screens must branch by outcome**: Victory and defeat are separate UI states — each requires its own button set as specified in the PRD (e.g. victory: "next level" + "back to level select"; defeat: "retry" + "back to level select"). Never use a single generic "return to menu" button for both.
* **HUD must reflect all upgradeable player stats**: Any stat the player can change at runtime (bomb count, explosion range, speed, HP, ammo, level) must have a corresponding HUD element that updates whenever the stat changes.
* **Pause must be a launched overlay Scene**: Use `scene.pause()` + `scene.launch('PauseScene')` so the game freezes visually. The pause Scene provides resume / restart / quit buttons. Never implement pause as a flag check inside `update()`.

<GAME_TYPE_SELECTOR>
- Bullet-Hell / Shooter / Twin-Stick → `<SHOOTER_PATTERNS>`
- Vampire Survivors / Auto-Attack → `<SURVIVOR_PATTERNS>`
- Snake / Worm → `<SNAKE_PATTERNS>`
- Bomberman → `<BOMBERMAN_PATTERNS>`
- Maze / Labyrinth → use rot-js `ROT.Map.EllerMaze`, arcade physics collision against wall layer
</GAME_TYPE_SELECTOR>

<CONSTANTS_FILE>
```typescript
export const PLAYER_SPEED = 300; export const PLAYER_HP = 3;
export const BULLET_SPEED = 500; export const FIRE_RATE = 150;
export const SNAKE_TICK = 150;   // ms per step
export const BOMB_FUSE = 2500;   export const BOMB_RANGE = 3;
export const XP_PER_LEVEL = 100; export const WAVE_DURATION = 30000;
```
</CONSTANTS_FILE>

<SHOOTER_PATTERNS>
* **Player movement**: reset velocity each frame; normalize diagonal (`vx *= 0.707` when both axes active).
* **Hitbox**: `body.setSize(16,16).setOffset(...)` — smaller than sprite to avoid cheap deaths.
* **Bullet pooling**: setup `physics.add.group({ maxSize: 200, runChildUpdate: true, defaultKey: 'texKey' })`; fire `pool.get()` then `bullet.enableBody(true, x, y, true, true)` (never `setActive+setVisible` alone — body stays disabled, velocity is ignored); recycle `bullet.disableBody(true, true)`.
* **Invincibility frames**: on hit, set flag, flash tween (`alpha 0.3, yoyo, repeat:7`), clear after 1500ms. **Knockback must be applied AFTER the invincibility flag is set** — if both happen in the same frame, a second hit can overwrite the velocity before the physics step, cancelling the effect.
* **`delta` unit — CRITICAL**: `update(time, delta)` receives `delta` in **milliseconds**, not seconds. For frame-rate-independent movement: `speed * delta / 1000`. A common bug is using `speed * delta` directly, which runs 1000× too fast.
* **Enemy patterns**: circular (`angle = i/N * 2π`), spiral (`baseAngle += 15°`), aimed (`Phaser.Math.Angle.Between`), telegraphed (warning 500ms before fire).
* **Scrolling bg**: `add.tileSprite`; `tilePositionY -= 2` in update.
* Portrait vertical scroller (540×960) or landscape twin-stick (960×540). Gravity: 0.
</SHOOTER_PATTERNS>

<SURVIVOR_PATTERNS>
* **Auto-attack**: Phaser timer fires every `weaponFireRate` ms; find nearest enemy (`Phaser.Math.Distance.Between`), fire at it. No manual fire input.
* **XP gems**: drop on death. In update, gems within `PICKUP_RADIUS` move toward player (`physics.moveToObject`); collect at dist < 20.
* **Level-up**: `scene.pause()` → launch overlay scene with 3 random upgrade cards → `scene.resume()` on pick.
* **Wave spawning at screen edge**: pick random side (0–3), spawn outside camera bounds + 50px margin. Spawn rate decreases each wave (`Math.max(200, 1500 - wave*100)`).
</SURVIVOR_PATTERNS>

<SNAKE_PATTERNS>
* **Model**: array of `{x,y}` grid positions. `unshift(newHead)` each tick; `pop()` tail unless food eaten.
* **Tick-based**: `time.addEvent({ delay: SNAKE_TICK, loop:true, callback: moveSnake })`. Never use `update()` velocity.
* **180° lock**: `if (dx === -dir.x && dy === -dir.y) return` before updating `pendingDir`.
* **Self-collision**: `snake.some(s => s.x===newHead.x && s.y===newHead.y)` → game over.
* **Render**: reuse sprite pool, set positions by index; rotate head sprite with `Math.atan2(dir.y, dir.x)`.
</SNAKE_PATTERNS>

<BOMBERMAN_PATTERNS>
* **Movement**: tween-based tile-by-tile (same pattern as grid_logic `tryMove`). NEVER `setVelocity`.
* **Bomb**: `time.delayedCall(BOMB_FUSE, explode)`. Pulse scale tween as fuse indicator.
* **Explosion**: iterate 4 directions for `BOMB_RANGE` tiles. Stop at `HARD_WALL`. Destroy `SOFT_WALL` (random item drop), stop. Check `bombGrid` for chain explosions. Damage entities in all blast cells.
* **Chain**: if `bombGrid[ey][ex]` is set during expansion, immediately call `explodeBomb(ex, ey)`.
</BOMBERMAN_PATTERNS>

<MOBILE_CONTROLS>
```javascript
if (!this.game.device.os.desktop) {
  // Shooter/Survivor: rexVirtualJoystick left + fire button right (auto-attack: skip fire btn)
  // Snake: pointermove swipe — if |dx|>|dy| set x-dir else y-dir, threshold 20px
  // Bomberman: 4 rect D-pad buttons + bomb circle button (min 44px each)
}
```
</MOBILE_CONTROLS>

<AUDIO>
- Shooter: short punchy fire sound at low volume (0.3) to avoid overlap; explosion variants by enemy size.
- Survivor: gem pickup chime, level-up fanfare.
- Snake: eat sound, death crunch.
- Bomberman: place click, fuse tick, explosion boom, wall crumble.
- Trigger only after first interaction (autoplay policy).
</AUDIO>

<ZUSTAND_RULES>
All-Phaser UI is the default — manage all state inside scenes, no Zustand needed. Only add Zustand if React components outside the canvas must reflect game state (see SKILL.md shared rules).
</ZUSTAND_RULES>

<SCENE_LIFECYCLE>
* **`shutdown()` must be a class method** — `this.events.once('shutdown', ...)` does not fire on `scene.destroy()`. In `shutdown()`: `this.time.removeAllEvents()`, mirror every `EventBus.on` with `EventBus.off`, and `group.destroy(true)`.
* **Reset game state on scene restart** — reinitialize all scene-local variables at the top of `init()` or `create()`, not only in the game-over handler.
* **Keep state inside the scene** — all game state lives as scene-local properties; React's role is only to host the canvas container.
* **`setDisplaySize` / `setScale` do not sync the physics body** — follow with `body.setSize(w, h).setOffset(x, y)`, otherwise hitbox and sprite size diverge and shot/collision detection breaks.
* **Timer / collider / group ownership** — remove colliders and events before rebuilding on restart; stacking old callbacks causes duplicate damage and score events.
* **Bullets must not use `setCollideWorldBounds(true)`** — this makes them bounce off walls instead of disappearing. Recycle via `disableBody(true, true)` when out of bounds, or use `body.onWorldBounds` + `world.on('worldbounds')`.
* **Tween visibility / input — CRITICAL** — `alpha=0` or `setVisible(false)` makes an object invisible but does NOT remove its input hit-area; pointer events still fire on transparent objects, silently intercepting taps intended for elements beneath. Always call `disableInteractive()` when hiding and `setInteractive()` when showing again.
</SCENE_LIFECYCLE>



<PHASE_FSM>
**Wave / boss multi-phase games require an explicit finite state machine.**
* Define a phase enum (`'idle' | 'wave' | 'boss' | 'transition' | 'victory'`) and store it in `this.phase`. All timer callbacks, spawners, and collider callbacks must guard with a phase check at entry.
* Phase transitions must be atomic — update `this.phase` first, then start/stop the relevant timers and groups. Never scatter the same condition check across multiple callbacks.
* Survivor-style wave end: requires BOTH `enemies.countActive(true) === 0` AND the spawn timer finished — missing either condition leaves an empty scene stuck in the `wave` phase.
* **Multiplayer warning** — Realtime APIs are message transports, not game protocols. If the PRD requires multiplayer but no real backend is available, implement a local AI/bot opponent instead of leaving buttons empty or showing connection errors.
* **Overlay scene transition** — if the game uses a React/HTML overlay for menus, call `this.scene.stop()` on the Phaser scene before navigating away; a running scene keeps its timers and physics active behind the overlay, causing ghost events on return.
</PHASE_FSM>
</GAME>
