<GAME>
* When user requests to generate brick-breaker, breakout, or Arkanoid-style games (paddle + ball + destructible bricks). ALWAYS use Phaser 3 — never a pure React (`useState` + `setInterval`) game loop.
* **Entrypoint — CRITICAL**: `index.html` always loads `src/main.tsx` (React root) — NEVER modify it. Initialize `Phaser.Game` inside `src/App.tsx` via `useEffect` with `initialized.current` guard. Game scenes and logic go under `src/game/`.
* **FORBIDDEN packages** (in package.json but must NOT be used for 2D games): `pixi.js` (use Phaser 3), `framer-motion` / `gsap` (use Phaser Tween), standalone `matter-js` (use Phaser's built-in physics).
* Make full use of assets in manifest.json. Follow `<MANIFEST_FIRST>` rules from base prompt.
* Portrait or landscape both work; gravity MUST be 0 (the ball is driven by velocity, not gravity).

<CONSTANTS_FILE>
```typescript
// src/game/constants.ts — Brick-breaker tuning
export const BALL_SPEED = 400;      export const BALL_SPEED_MAX = 700;  // ramp as level clears
export const PADDLE_SPEED = 500;    export const PADDLE_W = 120;
export const BRICK_ROWS = 6;        export const BRICK_COLS = 10;
export const BRICK_GAP = 4;         export const POWERUP_CHANCE = 0.15; // drop chance per brick
export const START_LIVES = 3;
```
</CONSTANTS_FILE>

<PHYSICS_PATTERNS>
* **PADDLE — must be PINNED, not merely immovable**: `setImmovable(true)` + `setAllowGravity(false)` is NOT enough. On a DYNAMIC Arcade body, `setImmovable` only stops the paddle from being pushed *as a collision target*; the bounce-separation impulse from a fast `setBounce(1)` ball (and worldbounds) still hands the paddle a y-velocity and **flings it off the floor ("挡板一碰就飞上去")**. The paddle must be PINNED every frame so it can ONLY move horizontally:
  ```typescript
  const PADDLE_Y = this.scale.height - 40; // fixed floor line, computed once in create()
  // create(): setImmovable + no gravity, move x via pointermove (clamp to screen), never by velocity.
  paddle.setImmovable(true); (paddle.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
  this.input.on('pointermove', p => { paddle.x = Phaser.Math.Clamp(p.x, halfW, this.scale.width - halfW); });
  // update(): hard-lock Y every frame. body.reset(x, y) re-syncs BOTH the body position and zeroes
  // velocity in one call — more robust than setting sprite.y alone (avoids a 1-frame position tear
  // when separation has already shoved the body).
  (paddle.body as Phaser.Physics.Arcade.Body).reset(paddle.x, PADDLE_Y);
  ```
  Do NOT give the paddle `setCollideWorldBounds(true)` and rely on it to stay put — that bounces it; locking Y in `update()` is the reliable mechanism.

* **BALL launch & anti-stall**:
  ```typescript
  this.physics.velocityFromAngle(angle, BALL_SPEED, ball.body.velocity); // angle in degrees, upward
  ball.setBounce(1).setCollideWorldBounds(true); // perfectly elastic; bottom wall handled separately (see life loss)
  // Anti-horizontal-stall: every bounce, if |vy| < 100 nudge it so the ball can't loop forever along a wall.
  if (Math.abs(ball.body.velocity.y) < 100) ball.body.velocity.y = ball.body.velocity.y < 0 ? -100 : 100;
  // Keep constant speed: after any bounce, renormalize to current BALL_SPEED.
  ```

* **PADDLE BOUNCE — control the angle, not just reflection**: the bounce angle MUST depend on WHERE the ball hits the paddle, or the game is unplayable (ball reflects at fixed angles forever). Use an overlap/collider callback:
  ```typescript
  const rel = Phaser.Math.Clamp((ball.x - paddle.x) / (paddle.width / 2), -1, 1); // -1 left edge .. +1 right edge
  const bounceAngle = -90 + rel * 60;  // straight up at center, ±60° at edges
  this.physics.velocityFromAngle(bounceAngle, this.currentBallSpeed, ball.body.velocity);
  ```

* **BRICKS — staticGroup + HP via data**: bricks never move — use `this.physics.add.staticGroup()` (NEVER `this.add.group()`, which has no body and silently no-ops in colliders). Multi-hit bricks track HP:
  ```typescript
  brick.setData('hp', hp);
  // on ball-brick collision callback:
  const hp = brick.getData('hp') - 1;
  if (hp <= 0) { brick.disableBody(true, true); this.bricksLeft--; maybeDropPowerup(brick.x, brick.y); }
  else { brick.setData('hp', hp); brick.setTexture(`brick_${hp}`); } // visual feedback per hit
  ```
  Lay out the grid from canvas size so it always fits: `brickW = (GAME_W - (BRICK_COLS+1)*BRICK_GAP) / BRICK_COLS`, place at cell center (Phaser origin is center).

* **LIFE LOSS — disable the bottom wall, detect the drop**: the ball MUST be able to fall off the bottom; bouncing on all four walls makes it immortal.
  ```typescript
  this.physics.world.setBoundsCollision(true, true, true, false); // left, right, top ON; bottom OFF
  ball.body.onWorldBounds = true;
  this.physics.world.on('worldbounds', (body) => { /* only top/side fire; bottom is off */ });
  // In update(): if (ball.y > GAME_H + 20) this.loseLife();  // ball passed the open bottom
  // loseLife: lives--; if 0 → game over; else reset ball onto paddle (sticky launch).
  ```

* **STICKY LAUNCH (start of life)**: park the ball on the paddle (`ball.body.setVelocity(0)`, follow paddle.x in `update()`), launch on tap/space. Without this the ball drops instantly at spawn and the player loses a life before they can react.

* **Register colliders AFTER objects exist** — never call `physics.add.collider(this.ball, this.bricks, ...)` while `this.ball`/`this.bricks` is still undefined. Build paddle, ball, and the brick group first, then register all colliders.
</PHYSICS_PATTERNS>

<POWERUPS_AND_PROGRESSION>
* **Power-up drops** (optional but expected): on brick destroy, `Math.random() < POWERUP_CHANCE` spawns a falling capsule (`setVelocityY(150)`, gravity still 0). Overlap with paddle applies the effect, then destroy the capsule. Common effects: wider paddle (`paddle.displayWidth *= 1.5` + reset timer), multi-ball, slow-ball, extra life. Every timed effect MUST store a timer and revert on expiry (a permanent "wide paddle" breaks difficulty).
* **MULTI-BALL** — keep balls in a `physics.add.group()` and iterate; life is lost only when the LAST ball drops (`if (this.balls.countActive() === 0) this.loseLife()`), never on the first. Recycle dropped balls with `group.killAndHide` / re-`enableBody`, don't `destroy` then leak.
* **LEVEL CLEAR** — when `this.bricksLeft === 0`: stop the ball, show a transition, then load the next layout (re-init bricks, reset ball to paddle, optionally `currentBallSpeed = Math.min(BALL_SPEED_MAX, currentBallSpeed * 1.1)`). Do NOT just `scene.restart()` — that wipes score/lives unless they're re-seeded from a store.
</POWERUPS_AND_PROGRESSION>

<MOBILE_CONTROLS>
```javascript
// Brick-breaker is pointer-driven on both desktop and mobile — no D-pad needed.
this.input.on('pointermove', (p) => {
  this.paddle.x = Phaser.Math.Clamp(p.x, this.paddle.displayWidth / 2, this.scale.width - this.paddle.displayWidth / 2);
});
this.input.on('pointerdown', () => this.launchBall()); // tap to launch a sticky ball
```
</MOBILE_CONTROLS>

<AUDIO>
- Paddle bounce blip, brick break crunch (vary pitch by row), power-up chime, life-loss thud, level-clear fanfare.
- Use Phaser built-in audio; trigger only after first interaction (autoplay policy).
</AUDIO>

<ZUSTAND_RULES>
All-Phaser UI is the default — manage score / lives / level inside the scene, no Zustand needed. Only add Zustand if React components outside the canvas must reflect game state (see SKILL.md shared rules). If used: call `useGameStore()` once at the top of the component and destructure — never inside JSX conditionals or `.map()` (React hooks-order crash).
</ZUSTAND_RULES>

<SCENE_LIFECYCLE>
* **TEXTURE keys & format — CRITICAL**: every texture key used in `create()` must be loaded in `preload()` — a missing key silently renders as a green checkerboard. Foreground art (paddle, ball, bricks, power-ups) MUST be PNG (JPEG has no alpha → opaque rectangle); JPEG only for full-screen backgrounds.
* **BALL body — `setCircle(r)` uses NATIVE frame px, NOT the displayed size**: a square body on a round ball causes phantom corner bounces, so use `setCircle`. But `setCircle(r)` is measured on the ORIGINAL texture and does NOT scale with `setDisplaySize`/`setScale`. The common bug: `ball.setDisplaySize(10,10); ball.setCircle(10)` on a 20×20 texture leaves the body radius 10 (diameter 20) while the ball LOOKS 10px wide — a 2× collision body that makes the ball bounce off thin air ("斜着乱飞"). Fix: keep the texture at its intended size (don't `setDisplaySize`) and `setCircle(frameW/2)`, OR pass `setCircle(displayRadius / scale)`. The body circle must visually match the rendered ball under Arcade `{ debug: true }`.
* **`shutdown()` must be a class method** — `this.events.once('shutdown', ...)` does not reliably fire on `scene.restart()`. In `shutdown()`: `this.time.removeAllEvents()`, `this.tweens.killAll()`, mirror every `EventBus.on` with `EventBus.off`, and `group.destroy(true)`.
* **Reset game state on scene restart** — reinitialize score, lives, level, `bricksLeft`, `currentBallSpeed` at the top of `init()` / `create()`, not only in the game-over handler.
* **Keep state inside the scene** — score, lives, level, brick counts live as scene-local properties; React only hosts the canvas container.
* **Physics callback guards** — `collider`/`overlap` callbacks fire straight from the engine, NOT gated by `update()`. After game-over add `if (this.isGameOver) return` at the top of each, or disable the body. `setActive(false)` alone does NOT stop callbacks.
* **Timer / collider / group ownership** — power-up timers, dynamically spawned balls, and colliders must be cleared in `shutdown()` (`world.removeCollider(c)`, `group.destroy(true)`); rebuilding without clearing fires stale callbacks (double damage, ghost balls).
* **After `destroy()`, null the reference** — a destroyed ball/brick leaves a dangling pointer; a later `if (this.ball)` check passes then crashes. Always `obj.destroy(); obj = null`.
* **Tween visibility / input — CRITICAL** — `alpha=0` / `setVisible(false)` hides an object but does NOT remove its input hit-area; pointer events still fire on transparent objects, intercepting taps. Call `disableInteractive()` when hiding, `setInteractive()` when showing.
</SCENE_LIFECYCLE>
</GAME>
