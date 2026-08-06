<GAME>
* When user requests to generate platformer, side-scrolling, endless runner, or action platformer games:
* **Entrypoint — CRITICAL**: `index.html` always loads `src/main.tsx` (React root) — NEVER modify it. Initialize `Phaser.Game` inside `src/App.tsx` via `useEffect` with `initialized.current` guard. Game scenes and logic go under `src/game/`.
* **`index.html` body** — `src/index.css` already sets `overflow:hidden` and Tailwind Preflight zeroes body margin; do NOT add duplicate inline styles to `index.html`.
* **FORBIDDEN packages** (available in package.json but must NOT be used for 2D games): `pixi.js` (use Phaser 3), `framer-motion` / `gsap` (use Phaser Tween system), standalone `import 'matter-js'` (use Phaser's built-in `physics: { default: 'matter' }`).
* Make full use of assets in manifest.json. Follow `<MANIFEST_FIRST>` rules from base prompt.

<FRAMEWORK_SELECTION>
This is a platformer game — ALWAYS use Phaser 3.
**FORBIDDEN** — never implement 2D games with pure React (`useState` + `setInterval` game loop).
</FRAMEWORK_SELECTION>

<PLATFORMER_SPECIFIC_DESIGN>
* **JUMP FEEL — CRITICAL FOR PLATFORMERS**:
  - **Variable-height jump**: Hold = higher (multiply velocity by 0.5 on release if moving up)
  - **Coyote time**: 100ms grace period after leaving edge where jump still works
  - **Jump buffering**: Register jump input 80ms before landing and execute on touch
  - **Fast-fall option**: Press down while airborne to fall faster
  - **Landing animation**: Brief squash on land (scale tween) for juice

* **CAMERA — CRITICAL**:
  - Use `startFollow(player, true, 0.1, 0.1)` with lerp for smooth movement
  - Add camera lead-ahead: `camera.followOffset.x = player.velocityX * 0.1` to show more space ahead
  - Set camera deadzone: `camera.setDeadzone(100, 50)` to reduce jitter
  - Always set camera bounds: `camera.setBounds(0, 0, levelWidth, levelHeight)`

* **LEVEL READABILITY**:
  - Color coding: platforms (neutral/brown), hazards (red/orange), collectibles (yellow/gold), interactive (blue/purple)

* Landscape orientation (800x600 or 1280x720). Gravity: 600-1200 (higher = snappier).
</PLATFORMER_SPECIFIC_DESIGN>

<CONSTANTS_FILE>
```typescript
// src/game/constants.ts — Platformer tuning
export const PLAYER_SPEED = 250; export const JUMP_VELOCITY = -450;
export const GRAVITY = 800; export const MAX_FALL_SPEED = 600;
export const COYOTE_TIME = 100; export const JUMP_BUFFER = 80;
export const ENEMY_SPEED = 80; export const TILE_SIZE = 32;
```
</CONSTANTS_FILE>

<PHYSICS_PATTERNS>
* **COLLISION BODY — fixed-ratio sizing**: the Arcade body is NOT a guessed pixel value and NOT the full frame. It is a **fixed fraction of the visible sprite**, sized in DISPLAY px, then converted to NATIVE frame px (because `setSize`/`setOffset` use native frame px and do NOT scale with `setScale`/`setDisplaySize`). Start from the SMALLEST sensible body — a slightly-too-small body costs nothing in a platformer (jumps feel generous) while a too-large body makes obstacles uncrossable (the recurring cat-vs-car failure).
  ```typescript
  // Fixed default ratios (display fraction of the sprite). Start as small as is playable.
  const PLAYER_BODY = { w: 0.4, h: 0.6 };    // player: narrow → forgiving jumps
  const OBSTACLE_BODY = { w: 0.45, h: 0.5 }; // jumpable ground obstacle: narrow is the point

  // `scale` is the value passed to setScale(), derived from a gameplay target:
  //   const TARGET_H = GAME_HEIGHT * 0.10; const scale = TARGET_H / sprite.height; // player ≈ 8–12% of screen
  // Convert display-fraction → native px, center horizontally, align to bottom (feet on ground):
  function sizeBody(sprite, ratio, scale, frameW, frameH) {
    const bodyW = (sprite.displayWidth  * ratio.w) / scale;   // native px
    const bodyH = (sprite.displayHeight * ratio.h) / scale;
    sprite.body.setSize(bodyW, bodyH);
    sprite.body.setOffset((frameW - bodyW) / 2, frameH - bodyH);  // centered, bottom-aligned
  }
  ```
  - Pickups / coins may go slightly LARGER (`0.8–1.0`) so they're easy to collect; player & jumpable obstacles stay at the minimal ratios above.
  - If a body still feels wrong, set Arcade `{ debug: true }` to SEE the boxes and adjust the ratio — never blind-guess pixel numbers. Disable debug before shipping.
  - Sprite assets often have transparent padding — bottom-aligning the body (above) puts feet on the ground regardless of padding.

* **PLAYER SETUP**:
  ```typescript
  this.player.setCollideWorldBounds(true); // keep on screen
  this.player.setBounce(0); // no bounce for tight control
  (this.player.body as Phaser.Physics.Arcade.Body).setMaxVelocityY(MAX_FALL_SPEED);
  ```

* **MOVEMENT PATTERN**:
  ```typescript
  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    // Horizontal
    if (this.cursors.left.isDown) this.player.setVelocityX(-PLAYER_SPEED);
    else if (this.cursors.right.isDown) this.player.setVelocityX(PLAYER_SPEED);
    else this.player.setVelocityX(0);
    // Ground check: BOTH touching.down AND blocked.down
    const isGrounded = body.touching.down || body.blocked.down;
    if (isGrounded) this.lastGroundedTime = this.time.now;
    // Jump with coyote time
    if (this.jumpPressed && (isGrounded || this.time.now - this.lastGroundedTime < COYOTE_TIME)) {
      this.player.setVelocityY(JUMP_VELOCITY); this.jumpPressed = false;
    }
    // Variable jump: release early = lower
    if (this.jumpReleased && body.velocity.y < 0) body.setVelocityY(body.velocity.y * 0.5);
  }
  ```

* **MOVING PLATFORMS — CRITICAL**:
  ```typescript
  // Tween: this.tweens.add({ targets: platform, x: endX, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.inOut' })
  // Platform MUST have: body.setImmovable(true) AND body.setAllowGravity(false)
  // Anti-slip: (platform.body as Phaser.Physics.Arcade.Body).setFriction(1, 0)
  // VERTICAL PLATFORMS: collide from top only — check player.y < platform.y in callback
  // FALLING PLATFORMS: delay 300ms, disable body, tween alpha down, destroy
  ```

* **ENEMY PATROL**:
  ```typescript
  // Simple back-and-forth
  if (this.enemy.x <= patrolStart) this.enemy.setVelocityX(ENEMY_SPEED);
  if (this.enemy.x >= patrolEnd) this.enemy.setVelocityX(-ENEMY_SPEED);
  // Kill by jumping on top: check player.body.velocity.y > 0 && player.y < enemy.y in overlap
  ```

* **WORLD BOUNDS & DEATH**:
  - `setCollideWorldBounds(true)` on PLAYER blocks bottom — use death threshold ABOVE bottom: `if (player.y > HEIGHT - 50) die()`
  - NEVER use `setCollideWorldBounds(true)` on enemies in pit levels — destroy in update(): `if (enemy.y > HEIGHT + 100) enemy.destroy()`
</PHYSICS_PATTERNS>

<MOBILE_CONTROLS>
```javascript
const isMobile = !this.game.device.os.desktop;
if (isMobile) {
  const width = this.game.config.width as number;
  const height = this.game.config.height as number;
  // Left/Right buttons
  this.add.rectangle(width * 0.1, height * 0.9, 80, 80, 0x333333, 0.5)
    .setInteractive().on('pointerdown', () => { this.mobileLeft = true })
    .on('pointerup', () => { this.mobileLeft = false });
  this.add.rectangle(width * 0.25, height * 0.9, 80, 80, 0x333333, 0.5)
    .setInteractive().on('pointerdown', () => { this.mobileRight = true })
    .on('pointerup', () => { this.mobileRight = false });
  // Jump button
  this.add.circle(width * 0.85, height * 0.85, 50, 0xff0000, 0.6)
    .setInteractive().on('pointerdown', () => { this.jumpPressed = true });
}
```
</MOBILE_CONTROLS>

<AUDIO>
- Jump sound on jump, landing thud on ground contact, coin chime on collect, death jingle on game over
- Use Phaser built-in audio. Trigger only after first interaction (autoplay policy).
</AUDIO>

<ZUSTAND_RULES>
All-Phaser UI is the default — manage all state inside scenes, no Zustand needed. Only add Zustand if React components outside the canvas must reflect game state (see SKILL.md shared rules).
</ZUSTAND_RULES>

<SCENE_LIFECYCLE>
* **`shutdown()` must be a class method** — `this.events.once('shutdown', ...)` does not fire on `scene.destroy()`, leaking listeners permanently. In `shutdown()`: call `this.time.removeAllEvents()`, mirror every `EventBus.on` with `EventBus.off`, and `group.destroy(true)`.
* **Reset game state on scene restart** — reinitialize all scene-local variables at the top of `init()` or `create()`, not only in the game-over handler (player may restart mid-session).
* **Keep state inside the scene** — all game state (score, lives, player stats) lives as scene-local properties; React's role is only to host the canvas container.
* **`setDisplaySize` / `setScale` do not sync the physics body** — always follow with explicit `body.setSize(w, h, false)` and `body.setOffset(x, y)` using fixed logical pixel values, never `sprite.width/height` (those still reflect original texture size after scaling).
* **Sprite assets often have transparent padding — offset to content bounds, not image bounds** — body bottom must align to the actual opaque pixel bottom of the asset, not the image edge. Formula: `offset_y = content_bottom_row + 1 - BODY_H`; `spawnY` so that `body_bottom = groundY`. Using image dimensions directly causes the character and obstacles to float above the ground on different levels.
* **Player hurt state must have an explicit exit transition** — set a `hurtTimer`; only restore to `idle`/`run` after it expires. Without an exit, the hurt animation locks forever and the player cannot move again.
* **Lethal obstacles use `overlap`, not `collider`** — `collider` applies physics impulse and pushes the player on top of the obstacle (game-over callback never fires); `overlap` only triggers the callback: `this.physics.add.overlap(player, obstacles, onHit, undefined, this)`.
* **Canvas container z-index** — never give `#game-container` a negative `z-index` to push it behind React elements; the canvas becomes invisible. Stack React overlays above the canvas with `position:absolute; z-index:10` instead, and use `pointer-events-none` on the overlay container.
* **`setCollideWorldBounds(true)` bounces on all four sides including the bottom** — for objects that should fall off-screen, check `y > HEIGHT + 50` in `update()` and destroy instead.
* **Timer / collider / group ownership** — enemies, pickups, and coins created dynamically must be cleaned up in `shutdown()` via `world.removeCollider(c)` and `group.destroy(true)`; rebuilding without clearing first causes old callbacks (damage, score) to fire repeatedly.
* **Tween visibility / input — CRITICAL** — `alpha=0` or `setVisible(false)` makes an object invisible but does NOT remove its input hit-area; pointer events still fire on transparent objects, silently intercepting taps intended for elements beneath. Always call `disableInteractive()` when hiding and `setInteractive()` when showing again.
</SCENE_LIFECYCLE>
</GAME>
