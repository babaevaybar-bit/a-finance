<GAME>
* **Entrypoint — CRITICAL**: `index.html` always loads `src/main.tsx` (React root) — NEVER modify it. Initialize `Phaser.Game` inside `src/App.tsx` via `useEffect` with `initialized.current` guard. Game scenes and logic go under `src/game/`.
* **`index.html` body** — `src/index.css` already sets `overflow:hidden` and Tailwind Preflight zeroes body margin; do NOT add duplicate inline styles to `index.html`.
* **FORBIDDEN packages** (available in package.json but must NOT be used for 2D games): `pixi.js` (use Phaser 3), `framer-motion` / `gsap` (use Phaser Tween system), standalone `import 'matter-js'` (use Phaser's built-in `physics: { default: 'matter' }`).
* ALWAYS use Phaser 3 (+ rot-js for roguelikes). NEVER pure React game loop.
* Make full use of assets in manifest.json. Square orientation (800×800). Gravity: 0.

<GAME_TYPE_SELECTOR>
- Roguelike / Dungeon Crawler → `<ROGUELIKE_PATTERNS>` + `<GRID_MOVEMENT>`
- Sokoban / Push-puzzle → `<SOKOBAN_PATTERNS>` + `<GRID_MOVEMENT>`
- Minesweeper → `<MINESWEEPER_PATTERNS>`
- Tetris → `<TETRIS_PATTERNS>`
- Match-3 / Bejeweled → `<MATCH3_PATTERNS>`
- 2048 / Slide-merge → `<SLIDE_MERGE_PATTERNS>`
- Gomoku / Reversi / Board game → `<BOARD_GAME_PATTERNS>`
- Whack-a-mole → `<WHACK_PATTERNS>`
- Jigsaw puzzle → `<JIGSAW_PATTERNS>`
- Mahjong solitaire → `<MAHJONG_PATTERNS>`
</GAME_TYPE_SELECTOR>

<CONSTANTS_FILE>
```typescript
export const TILE_SIZE = 48; export const GRID_W = 16; export const GRID_H = 16;
export const LOCK_DELAY = 500;  // Tetris ms
export const BOARD_COLS = 10;   export const BOARD_ROWS = 20; // Tetris
export const MINE_COUNT = 40;   export const GRID_SIZE_2048 = 4;
export const MATCH_MIN = 3;     export const SCORE_PER_TILE = 10; export const COMBO_MULTI = 1.5;
```
</CONSTANTS_FILE>

<GRID_MOVEMENT>
**MANDATORY for roguelike/sokoban** — NEVER use `setVelocity` for grid-aligned entities.
```typescript
tryMove(dx, dy) {
  if (this.isMoving) return;
  const nx = this.player.gridX + dx, ny = this.player.gridY + dy;
  if (this.map[ny][nx] === WALL) return;
  this.isMoving = true; this.player.gridX = nx; this.player.gridY = ny;
  this.tweens.add({ targets: this.player, x: nx*TILE_SIZE+TILE_SIZE/2, y: ny*TILE_SIZE+TILE_SIZE/2,
    duration: 150, ease: 'Sine.inOut', onComplete: () => { this.isMoving=false; this.onMoveComplete(); } });
}
```
Store `{gridX,gridY}`; convert to world with `gridX * TILE_SIZE + TILE_SIZE/2`. Collision via array lookup, NOT physics.
Add `keyboard.addCapture('UP,DOWN,LEFT,RIGHT,SPACE')` to prevent browser scroll.
</GRID_MOVEMENT>

<ROGUELIKE_PATTERNS>
* **Map gen**: `new ROT.Map.Digger(w,h)`; `map.create((x,y,v)=>{ mapData[y][x]=v; })`. After gen, BFS-validate exit is reachable; regenerate if not.
* **Pathfinding**: cache A* path (`new ROT.Path.AStar`), recompute only when player moves. NEVER run every frame.
* **FOV**: `new ROT.FOV.PreciseShadowcasting`; recompute only on player move; store visible set.
* **Turn system**: player moves → `processEnemyTurns()` → `updateFOV()`.
</ROGUELIKE_PATTERNS>

<SOKOBAN_PATTERNS>
* **Push**: when moving into box cell, check cell-behind-box — if wall or another box, block move. Move box + player together via twin tweens.
* **Win**: `boxes.every(b => isTarget(b.gridX, b.gridY))`.
* **Undo**: before each move push `{playerX,playerY, boxes:[{x,y}...]}` snapshot. Pop on undo and restore positions instantly (no tween).
</SOKOBAN_PATTERNS>

<MINESWEEPER_PATTERNS>
* **Safe first click**: place mines AFTER first click, protecting a 3×3 area around clicked cell.
* **Numbers**: for each non-mine cell count mines in 8 neighbors.
* **Flood fill reveal**: if `adjacentMines===0`, recursively reveal 8 neighbors (BFS to avoid stack overflow).
* **Flag**: right-click or long-press (500ms `delayedCall`) to toggle.
</MINESWEEPER_PATTERNS>

<TETRIS_PATTERNS>
* **Pieces**: store as rotation array of shape matrices, e.g. I has 2 rotations `[[[1,1,1,1]], [[1],[1],[1],[1]]]`.
* **Collision check**: `shape.every((row,dy)=>row.every((c,dx)=>!c||isValid(piece.x+dx+ox, piece.y+dy+oy)))`.
* **Wall kick**: try offsets `[0,0],[1,0],[-1,0],[0,-1],[2,0],[-2,0]` in order on rotation fail.
* **Lock delay**: `delayedCall(LOCK_DELAY, lockPiece)`. Reset on each player move (max 15 resets).
* **Line clear scoring**: `[0,100,300,500,800][linesCleared] * level`. Splice row from board array, unshift empty row.
* **Ghost piece**: drop `currentPiece` down until collision, render at ghost Y with low alpha.
</TETRIS_PATTERNS>

<MATCH3_PATTERNS>
* **Swap**: tween both tiles simultaneously; if no match after swap, tween back.
* **Find matches**: scan all rows then columns for 3+ same-type runs; return set of `{x,y}`.
* **Cascade**: `while(hasMatches){ remove→applyGravity(await tween)→fillEmpty(await tween)→rescan }`. Track `combo++` per loop iteration for multiplier.
* **Input**: `pointerdown` records start; `pointerup` — drag dist < 10px = tap/select, else determine direction and swap.
</MATCH3_PATTERNS>

<SLIDE_MERGE_PATTERNS>
* **Normalize to "slide left"**: rotate board `n` times before sliding, rotate back after. `rotations={left:0,right:2,up:3,down:1}`.
* **Slide row**: filter zeros out, merge adjacent equals (each cell merges once), pad zeros to right.
* **Win**: `board.flat().includes(2048)`. **Lose**: board full AND no adjacent equal pairs.
* **Animate**: scale-pop tween on merged/new tiles.
</SLIDE_MERGE_PATTERNS>

<BOARD_GAME_PATTERNS>
* **Gomoku win**: check 4 directions from last placed stone; count consecutive same-color in both sides; win if total ≥ 5.
* **Reversi flip**: for each of 8 dirs, walk until own color found; all opponent pieces in between are flipped.
* **AI turn**: `time.delayedCall(300, aiMove)` for UX breathing room.
</BOARD_GAME_PATTERNS>

<WHACK_PATTERNS>
* **Spawn**: `time.addEvent({ delay: spawnInterval, loop:true })`. Each tick: pick random unoccupied hole, pop-up tween (`Back.Out`), auto-hide after `moleVisibleTime`.
* **Difficulty**: every 10s reduce both `spawnInterval` and `moleVisibleTime` (floor at 300ms / 500ms).
* **Hit**: `pointerdown` on mole — cancel auto-hide, slide back down tween, emit score delta.
</WHACK_PATTERNS>

<JIGSAW_PATTERNS>
* **Slice**: `RenderTexture.draw(texture, -col*pw, -row*ph)` to crop each piece. Scatter to random positions.
* **Snap**: on `dragend`, if distance to correct position < threshold, tween to exact position and `disableInteractive()`.
* **Z-order**: `setDepth(100)` on `dragstart`, restore on `dragend`.
</JIGSAW_PATTERNS>

<MAHJONG_PATTERNS>
* **Free tile**: (1) no tile on same layer overlapping it AND (2) not blocked on BOTH left and right.
* **Match**: same `type` string (flower/season tiles: same category match any). Selected tile highlights; second match removes pair with fade tween.
* **Wrong match**: shake tween on both tiles, deselect.
</MAHJONG_PATTERNS>

<MOBILE_CONTROLS>
```javascript
if (!this.game.device.os.desktop) {
  // Roguelike/Sokoban: virtual D-pad (4 rect buttons, min 60px) or swipe detection
  // Tetris: swipe left/right=move, swipe down=soft drop, tap=rotate
  // Match-3/Minesweeper: tap-based, no extra controls needed
  // Jigsaw/Mahjong: drag-based, pointer events handle naturally
}
```
</MOBILE_CONTROLS>

<AUDIO>
- Match-3: swap whoosh, match chime, cascade escalation. Tetris: move click, line clear zap, Tetris fanfare.
- 2048: slide swish, merge pop. Minesweeper: reveal click, flag place, explosion. Mahjong: tile click, shuffle.
- Trigger only after first interaction (autoplay policy).
</AUDIO>

<ZUSTAND_RULES>
All-Phaser UI is the default — manage all state inside scenes, no Zustand needed. Only add Zustand if React components outside the canvas must reflect game state (see SKILL.md shared rules).

If Zustand is used: call `useGameStore()` once at the top of the component and destructure all needed values — never call it inside JSX conditionals or `.map()`. Violating this causes a React hooks order crash.
</ZUSTAND_RULES>

<SCENE_LIFECYCLE>
* **NEVER register event listeners inside `update()`** — `update()` runs every frame; each `this.input.keyboard.on(...)` call stacks a new listener. After N frames, every keypress fires N callbacks. Register once in `create()`, remove in `shutdown()`.
* **Input locking for sequential games** (跳一跳, charge-and-release, turn-based): set `this.inputLocked = true` when an action begins; set `false` only after the action fully resolves (landing, animation complete). Guard ALL input handlers with `if (this.inputLocked) return`. Reset in `init()`.
* **Stone/piece size constraint**: `STONE_RADIUS` must satisfy `2 * STONE_RADIUS < CELL_SIZE * 0.9`. Derive `CELL_SIZE` from canvas size: `Math.floor(Math.min(W, H) / (GRID_SIZE + 1))`. Adjacent pieces must never overlap.
* **Save state completeness**: serialize ALL mutable state — position, HP, inventory, key/switch states, floor index. A save that omits any of these makes the restored session unwinnable.
* **`shutdown()` must be a class method** — call `this.time.removeAllEvents()`, mirror every `EventBus.on` with `EventBus.off`, and `this.tweens.killAll()`.
* **Reset game state on scene restart** — reinitialize all scene-local variables at the top of `init()` or `create()`, not only in the game-over handler.
* **Keep state inside the scene** — grid arrays, entity positions, and all counters live as scene-local properties; React's role is only to host the canvas container.
* **Tween visibility / input — CRITICAL** — `alpha=0` or `setVisible(false)` makes an object invisible but does NOT remove its input hit-area; pointer events still fire on transparent objects, silently intercepting taps intended for elements beneath. Always call `disableInteractive()` when hiding and `setInteractive()` when showing again.
</SCENE_LIFECYCLE>

<DATA_RENDER_SEPARATION>
**Grid games (Sokoban, 2048, maze, board games, Minesweeper) must strictly separate the data layer from the render layer.**
* **Data layer** — plain JS arrays/objects hold positions, state, and win conditions; no Phaser object references. All rule checks (valid move, win/loss, collision) query only the data layer.
* **Render layer** — Phaser sprites and text read from the data layer and call a single `renderFromData()` method to refresh visuals; they do not participate in logic.
* **Forbidden** — deriving grid positions from sprite `x/y` coordinates for win checks; storing board arrays in Zustand (large object diffs on every state change are expensive).
* **Level solvability** — hand-authored or procedurally generated maps must be validated with BFS/DFS to confirm the goal is reachable. A single wrong cell value (e.g. a wall cell set to 0) silently makes a level unsolvable.
</DATA_RENDER_SEPARATION>
</GAME>
