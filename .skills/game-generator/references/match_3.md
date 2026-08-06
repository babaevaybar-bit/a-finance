<GAME>
* **Entrypoint — CRITICAL**: `index.html` always loads `src/main.tsx` (React root) — NEVER modify it. Initialize `Phaser.Game` inside `src/App.tsx` via `useEffect` with `initialized.current` guard. Game scenes and logic go under `src/game/`.
* **`index.html` body** — `src/index.css` already sets `overflow:hidden` and Tailwind Preflight zeroes body margin; do NOT add duplicate inline styles to `index.html`.
* **FORBIDDEN packages** (available in package.json but must NOT be used for 2D games): `pixi.js` (use Phaser 3), `framer-motion` / `gsap` (use Phaser Tween system), standalone `import 'matter-js'` (use Phaser's built-in `physics: { default: 'matter' }`).
* ALWAYS use Phaser 3. NEVER pure React game loop.
* Make full use of assets in manifest.json. Portrait orientation (540×960). Gravity: 0.

<FRAMEWORK_SELECTION>
Match-3 games are animation-heavy — ALWAYS use Phaser 3.
**FORBIDDEN** — never implement with pure React (`useState` + `setInterval` game loop).
</FRAMEWORK_SELECTION>

<CONSTANTS_FILE>
```typescript
// src/game/constants.ts — Match-3 tuning
export const GRID_COLS = 8;        export const GRID_ROWS = 8;
export const TILE_SIZE = 64;       export const TILE_TYPES = 6;
export const MATCH_MIN = 3;        export const SCORE_PER_TILE = 10;
export const COMBO_MULTI = 1.5;    export const SCORE_PER_COMBO = 50;
export const SWAP_DURATION = 200;  export const FALL_SPEED = 300;   // ms per row
export const FILL_DELAY = 80;      // ms stagger between falling tiles
export const HINT_DELAY = 5000;    // ms idle before hint highlight
```
</CONSTANTS_FILE>

<GRID_INIT>
* **Board model**: 2D array `board[row][col]` stores tile type (int 0–N) and associated Phaser sprite.
* **Populate**: fill each cell with random type; re-roll if placing creates an immediate 3-in-a-row horizontally or vertically — guarantees no matches on start and a valid initial board.
* **Sprite layout**: `tileSprite.x = col * TILE_SIZE + TILE_SIZE/2 + offsetX`, `tileSprite.y = row * TILE_SIZE + TILE_SIZE/2 + offsetY`. Center tiles on their cell.
* **Background grid**: draw a static `graphics` checkerboard behind tiles for visual depth; use a slightly lighter and darker shade of the same color.
```typescript
initBoard() {
  for (let r = 0; r < GRID_ROWS; r++) {
    this.board[r] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      let type: number;
      do { type = Phaser.Math.Between(0, TILE_TYPES - 1); }
      while (this.wouldMatch(r, c, type));
      this.board[r][c] = this.spawnTile(r, c, type);
    }
  }
}
wouldMatch(r: number, c: number, type: number): boolean {
  return (c >= 2 && this.board[r][c-1]?.type === type && this.board[r][c-2]?.type === type)
      || (r >= 2 && this.board[r-1][c]?.type === type && this.board[r-2][c]?.type === type);
}
```
</GRID_INIT>

<INPUT_HANDLING>
* **Select + swipe**: `pointerdown` records `{startX, startY, col, row}` of tapped tile; highlight selection.
* **pointerup** — if drag dist < 10px = tap (toggle selection; swap two selected tiles if second tap); else compute swipe direction (4-dir: largest |dx| vs |dy|) and call `trySwap(row, col, dr, dc)`.
* **trySwap**: swap board data + tween both tiles simultaneously to each other's position; if `findMatches()` returns empty set, tween back and cancel.
* **Lock input during animation**: set `this.inputLocked = true` before any tween; release in final tween `onComplete`.
```typescript
this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
  if (this.inputLocked) return;
  this.dragStart = { x: ptr.x, y: ptr.y, col: this.ptrToCol(ptr.x), row: this.ptrToRow(ptr.y) };
});
this.input.on('pointerup', (ptr: Phaser.Input.Pointer) => {
  if (this.inputLocked || !this.dragStart) return;
  const dx = ptr.x - this.dragStart.x, dy = ptr.y - this.dragStart.y;
  if (Math.abs(dx) < 10 && Math.abs(dy) < 10) { this.handleTap(this.dragStart.row, this.dragStart.col); return; }
  const [dr, dc] = Math.abs(dx) > Math.abs(dy) ? [0, dx > 0 ? 1 : -1] : [dy > 0 ? 1 : -1, 0];
  this.trySwap(this.dragStart.row, this.dragStart.col, dr, dc);
  this.dragStart = null;
});
```
</INPUT_HANDLING>

<MATCH_DETECTION>
* **Scan rows then columns**: collect runs of 3+ same-type; return unified `Set<string>` of `"r,c"` keys to avoid duplicates.
* **L/T shapes**: cells in both a horizontal and vertical run are included in the same match set — triggers special tile creation.
* **Minimum 3**: runs of exactly 3 = normal clear; 4 = striped tile; 5+ or L/T = bomb/color-burst tile.
```typescript
findMatches(): Set<string> {
  const matched = new Set<string>();
  // Rows
  for (let r = 0; r < GRID_ROWS; r++) {
    let run = 1;
    for (let c = 1; c <= GRID_COLS; c++) {
      if (c < GRID_COLS && this.board[r][c]?.type === this.board[r][c-1]?.type) { run++; }
      else { if (run >= MATCH_MIN) for (let k = c-run; k < c; k++) matched.add(`${r},${k}`); run = 1; }
    }
  }
  // Columns
  for (let c = 0; c < GRID_COLS; c++) {
    let run = 1;
    for (let r = 1; r <= GRID_ROWS; r++) {
      if (r < GRID_ROWS && this.board[r][c]?.type === this.board[r-1][c]?.type) { run++; }
      else { if (run >= MATCH_MIN) for (let k = r-run; k < r; k++) matched.add(`${k},${c}`); run = 1; }
    }
  }
  return matched;
}
```
</MATCH_DETECTION>

<CASCADE_SYSTEM>
* **Cascade loop**: fully async — each phase awaits all tweens before proceeding. Use `Promise.all` on tween collections.
* **Order**: remove matched tiles → apply gravity (tiles fall into empty cells column by column) → fill empty top cells with new random tiles dropping from above → rescan; repeat while matches exist.
* **Combo**: increment `combo` counter once per cascade iteration; apply `COMBO_MULTI^(combo-1)` to score for that round.
* **Gravity stagger**: delay each tile's fall tween by `col_index * FILL_DELAY` for a natural waterfall effect.
```typescript
async runCascade() {
  this.inputLocked = true;
  let combo = 0;
  let matched = this.findMatches();
  while (matched.size > 0) {
    combo++;
    const scoreGain = matched.size * SCORE_PER_TILE * Math.pow(COMBO_MULTI, combo - 1);
    EventBus.emit('score-gained', { scoreDelta: Math.round(scoreGain) });
    if (combo > 1) EventBus.emit('combo', { combo });
    await this.removeTiles(matched);
    await this.applyGravity();
    await this.fillEmpty();
    matched = this.findMatches();
  }
  this.inputLocked = false;
  this.checkDeadlock();
}
```
</CASCADE_SYSTEM>

<GRAVITY_AND_FILL>
* **applyGravity**: for each column, collect non-null tiles bottom-to-top; reposition them to fill from the bottom; tween each to its new y position.
* **fillEmpty**: count empty cells per column; spawn new tiles above the grid (negative y) for each empty slot; tween them down to their target row. Stagger by `colIndex * FILL_DELAY` ms.
* **Board sync**: update `board[r][c]` to reflect new positions BEFORE tweening — never let board data and sprite positions diverge.
```typescript
async applyGravity(): Promise<void> {
  return new Promise(resolve => {
    const tweens: Phaser.Tweens.Tween[] = [];
    for (let c = 0; c < GRID_COLS; c++) {
      let emptyRow = GRID_ROWS - 1;
      for (let r = GRID_ROWS - 1; r >= 0; r--) {
        if (this.board[r][c]) {
          if (emptyRow !== r) {
            this.board[emptyRow][c] = this.board[r][c];
            this.board[r][c] = null;
            tweens.push(this.tweens.add({ targets: this.board[emptyRow][c]!.sprite,
              y: this.rowToY(emptyRow), duration: FALL_SPEED, ease: 'Quad.easeIn' }));
          }
          emptyRow--;
        }
      }
    }
    if (tweens.length === 0) { resolve(); return; }
    tweens[tweens.length - 1].on('complete', resolve);
  });
}
```
</GRAVITY_AND_FILL>

<SPECIAL_TILES>
* **Striped tile** (match-4): created when a run of exactly 4 is cleared. Horizontal run → vertical stripe (clears entire column on activation); vertical run → horizontal stripe (clears entire row).
* **Bomb tile** (match-5 or L/T shape): clears a 3×3 area around it on activation.
* **Color-burst tile** (5-in-a-row): clears all tiles of the same color as the tile it is swapped with.
* **Activation**: when a special tile is part of a match OR is swapped directly, trigger its effect before removing it.
* **Visual indicator**: use tint, animated sprite, or particle aura to distinguish special tiles from normal tiles. Never rely on color alone.
* **Chain reactions**: special tile effects can create new matches — run through the cascade loop after each effect resolves.
</SPECIAL_TILES>

<OBJECTIVES_AND_PROGRESSION>
* **Level goals**: define per level as one or more of: `{ type:'score', target:5000 }`, `{ type:'collect', tileType:2, count:20 }`, `{ type:'clear', row:7 }` (break ice/stone blockers in that row).
* **Move limit**: display remaining moves in HUD; decrement on each valid swap; trigger game-over check when moves reach 0.
* **Blockers**: ice (requires 1 adjacent match to melt), stone (requires 2), locked tiles (cannot be swapped until adjacent match breaks the lock). Store blocker state in the board cell alongside tile type.
* **Difficulty curve**: increase `TILE_TYPES` (more colors = harder), reduce move count, add more blockers per level.
* **Win condition**: check after each cascade ends (`runCascade` completes). Emit `level-complete` or `game-over` via EventBus.
</OBJECTIVES_AND_PROGRESSION>

<HINT_SYSTEM>
* After `HINT_DELAY` ms of player inactivity (reset on any `pointerdown`), highlight a valid swap by pulsing both tiles with a scale tween (`yoyo: true, repeat: -1`).
* **Find valid swap**: iterate all cells; try all 4 neighbors; simulate swap in a copy of the board; run `findMatches()`; return first pair found.
* **Deadlock**: if no valid swap exists, shuffle all tiles (Fisher-Yates on flat array, re-seed board) with a shatter + reassemble tween sequence. Show "Board shuffled!" text.
</HINT_SYSTEM>

<SCALE_TWEEN_PITFALLS>
**Symptom**: tiles zoom in to 1.1× or above on init or after a match and never return to normal scale.

* **Hint tween not destroyed before elimination (most common)** — the hint pulse runs `repeat:-1, yoyo:true` indefinitely. If the hinted tile is swapped or removed without killing the tween first, it fights the removal tween and locks scale at an intermediate value. Store the tween in `hintTween`; call `clearHint()` (`hintTween.destroy(); hintTween = null`) at the top of every `pointerdown` and `trySwap` call.
* **Multiple tweens stacked without `killTweensOf`** — selection highlight (scale 1.1) and `Back.Out` pop-in overshoot (~1.15) leave the sprite at a non-1 scale. Adding a removal tween on top produces unpredictable results. Always call `this.tweens.killTweensOf(sprite)` before applying any new scale/alpha tween.
* **`spawnTile` not resetting scale explicitly** — reused sprites retain their previous scale; `Back.Out` then starts from a non-zero value and overshoots further. Call `sprite.setScale(0)` and `sprite.setAlpha(1)` before the pop-in tween.
* **`fillEmpty` resolves on the last tween only** — `tweens[last].on('complete', resolve)` leaves earlier columns still in the `Back.Out` overshoot phase when the cascade rescans. Tiles at overshoot scale are mis-detected as matched, triggering a new removal tween on top of the unfinished pop-in. Use `Promise.all` to wait for every column before the next `findMatches()` call.
</SCALE_TWEEN_PITFALLS>

<VISUAL_POLISH>
* **Tile pop-in**: spawn new tiles at `scale:0`, tween to `scale:1` with `Back.Out` ease.
* **Match removal**: scale to 0 + fade out simultaneously (`scale:0, alpha:0`) over 150ms before removing sprite.
* **Particle burst**: emit 4–6 particles per tile color on match removal (use `ParticleEmitter` with short lifespan 400ms).
* **Score popup**: `add.text` at match center with `+N` score, tween `y -= 40, alpha: 0` over 600ms then destroy.
* **Combo banner**: large centered text showing `COMBO x3!` with scale-in / fade-out tween on combos ≥ 2.
* **Screen shake**: `cameras.main.shake(150, 0.008)` on large matches (5+) or bomb explosions.
* **Background animation**: slow parallax layers or looping tween on background elements for depth.
</VISUAL_POLISH>

<MOBILE_CONTROLS>
```javascript
// Touch is native for match-3 — no extra virtual controls needed.
// REQUIRED: min 44px tap targets (TILE_SIZE >= 44).
// Support both tap-tap-select and swipe-to-swap — test both flows.
// Pinch gesture on canvas: detect 2-pointer distance delta for optional zoom (clamp 0.8–1.2).
// Prevent default browser scroll: this.input.setDefaultCursor('pointer');
//   and in HTML: <body style="touch-action:none; overflow:hidden">
```
</MOBILE_CONTROLS>

<AUDIO>
- Swap: short whoosh sound (0.4 volume).
- Match clear: bright chime; use pitch shift (+1 semitone per combo level) for escalating cascade feel.
- No-match (swap-back): low "thunk" sound.
- Special tile activation: distinct sound per type (electric zap for stripe, explosion for bomb, sparkle sweep for color-burst).
- Level complete: short fanfare. Game over: descending tones.
- BGM: looping ambient/puzzle track at low volume (0.25).
- Trigger ALL audio only after first `pointerdown` (autoplay policy).
</AUDIO>

<ZUSTAND_RULES>
All-Phaser UI is the default — manage all state inside scenes, no Zustand needed. Only add Zustand if React components outside the canvas must reflect game state (see SKILL.md shared rules).
</ZUSTAND_RULES>

<SCENE_LIFECYCLE>
* **Preloader must transition — CRITICAL**: `Preloader.create()` must end with `this.scene.start('GameScene')`. Omitting it leaves Phaser stuck on Preloader; the game canvas shows nothing.
* **Scene data handoff**: when transitioning levels with `this.scene.start('GameScene', { level: n })`, the target scene MUST read the data in `init(data)` and store it before `create()` runs. Never use a module-level variable for current level — it is not reset on `scene.restart()`.
* **`shutdown()` must be a class method** — call `this.time.removeAllEvents()`, mirror every `EventBus.on` with `EventBus.off`, and `this.tweens.killAll()` to stop in-progress tweens before the scene is torn down.
* **`scene.restart` reuses the same instance** — `init()` is the only entry that runs on every restart; reset ALL runtime-mutated fields there: `inputLocked = false` (most critical — leaving it `true` silently locks all input forever), `dragStart = null`, `selectedTile = null`, `hintTween = null`, `hintTimer = null`, particle emitter refs, score, moves, combo, `board[][]`. Never rely on class-field initializers surviving a restart.
* **EventBus registration must be idempotent** — `create()` runs on every restart; always `EventBus.off(event, cb, this)` before `EventBus.on(event, cb, this)` to prevent listener accumulation and duplicate event responses.
* **Canvas centering** — `Scale.FIT + CENTER_BOTH` requires a fixed-size parent. Never use `inset-0` on `#game-container` (unbounded parent → Phaser renders at `(0,0)`, centering has no effect). Use a fixed `width/height` wrapper and flex-center it in the outer div.
* **Keep state inside the scene** — `board[][]`, `inputLocked`, tile sprites, and all counters live as scene-local properties; React's role is only to host the canvas container.
* **Tween visibility / input — CRITICAL** — `alpha=0` or `setVisible(false)` makes an object invisible but does NOT remove its input hit-area; pointer events still fire on transparent objects, silently intercepting taps intended for elements beneath. Always call `disableInteractive()` when hiding and `setInteractive()` when showing again.
</SCENE_LIFECYCLE>
</GAME>
