<GAME>
* **`index.html` body** — `src/index.css` already sets `overflow:hidden` and Tailwind Preflight zeroes body margin; do NOT add duplicate inline styles to `index.html`.
* **`#root` height — REQUIRED**: `#root` has no height by default; `h-full` chain breaks there. In `main.tsx`: `root.style.cssText = 'width:100%;height:100%'` before `createRoot`.
* Make full use of assets in manifest.json.

<FRAMEWORK_SELECTION>
UI-heavy games may use **either Phaser 3 or React** depending on the sub-type. Choose by content:

| Sub-type | Recommended framework | Reason |
|---|---|---|
| Match-3 / Card Game | Phaser 3 | animation-heavy, needs tween/particle system |
| Virtual Pet / Tamagotchi | Phaser 3 | sprite animations, stat bars, game loop |
| Idle / Clicker | Phaser 3 | tick loop, grid placement, offline earnings |
| Visual Novel / Dating Sim | Phaser 3 | typewriter, scene graph, bg swaps |
| Management Sim / Tycoon | Phaser 3 or React | prefer React when layout is mostly form/table UI |
| Card RPG / Deck-builder | React + Zustand | hand layout, drag-and-drop, complex state tree |
| Idle RPG / Gacha | React + Zustand | list-heavy UI, modal dialogs, no real-time canvas |
| Social / Daily-task App | React + Zustand | panels, sign-in, task lists — no canvas needed |

**Decision rule**: if the PRD has a canvas-based game view (sprite movement, real-time animation, physics), use Phaser 3. If the entire game is navigable pages, panels, and stat displays with no canvas, use React + Zustand.

**React implementation rules** (when React is chosen):
- State: Zustand for all shared game state; `localStorage` for persistence.
- Never use `useState + setInterval` as a game loop — use a Zustand action called from `useEffect` with proper cleanup.
- `useEffect` timers MUST return a cleanup: `return () => clearInterval(id)`.
- All interactive panels must be locally functional without network. Supabase may be used for optional sync; `localStorage` is the primary store.
- FORBIDDEN: `framer-motion` for game logic animations — use CSS transitions or Zustand-driven class toggling.

**Phaser implementation rules** (when Phaser is chosen):
- Initialize `Phaser.Game` inside `App.tsx` `useEffect` with `initialized.current` guard.
- FORBIDDEN: `pixi.js`, standalone `matter-js`, `framer-motion` / `gsap` (use Phaser Tween).
- FORBIDDEN: pure React `useState+setInterval` game loop replacing Phaser.
</FRAMEWORK_SELECTION>

<GAME_TYPE_SELECTOR>
- Match-3 / Card Game → `<MATCH3_CARD_PATTERNS>` (Phaser 3)
- Virtual Pet / Tamagotchi → `<VIRTUAL_PET_PATTERNS>` (Phaser 3)
- Idle / Clicker / City Builder → `<IDLE_PATTERNS>` (Phaser 3)
- Visual Novel / Dating Sim → `<VN_PATTERNS>` (Phaser 3)
- Management Sim / Tycoon → `<MANAGEMENT_PATTERNS>` (Phaser 3 or React)
- Dress-Up / Fashion → `<DRESS_UP_PATTERNS>` (Phaser 3)
- Card RPG / Gacha / Social / Daily-task → React + Zustand (see FRAMEWORK_SELECTION)
</GAME_TYPE_SELECTOR>

<CONSTANTS_FILE>
```typescript
export const GRID_SIZE=8; export const TILE_SIZE=64;
export const MATCH_MIN=3; export const COMBO_MULTI=1.5; export const SCORE_PER_TILE=10;
export const SWAP_DURATION=200; export const FALL_SPEED=300;
export const STAT_DECAY_INTERVAL=5000; export const INCOME_TICK=1000;
export const TYPEWRITER_SPEED=40; // ms per character
```
</CONSTANTS_FILE>

<MATCH3_CARD_PATTERNS>
* **Match-3 input**: `pointerdown` records start pos + tile. `pointerup` — dist < 10px = tap/select; else compute swipe direction and call `swapTiles`.
* **Cascade**: `while(hasMatches){ removeMatches→applyGravity(await)→fillEmpty(await)→rescan }`. Combo counter increments each loop; multiply score by `combo * COMBO_MULTI`.
* **Card z-order**: `card.setDepth(1000)` on dragstart; call `reorderHandDepth()` on dragend to restore index order.
* **Tween visibility**: tweening alpha to 0 does NOT remove hit-area — always call `disableInteractive()` when hiding.
* Portrait (540×960) for puzzle/card. Gravity: 0.
</MATCH3_CARD_PATTERNS>

<VIRTUAL_PET_PATTERNS>
* **Stat decay**: `this.time.addEvent({ delay: STAT_DECAY_INTERVAL, loop: true, callback: this.decayStats, callbackScope: this })`. Decrement hunger/happiness/energy each tick; if any reach 0, apply health penalty.
* **Growth stages**: `['egg','baby','child','teen','adult']`. Check `carePoints` thresholds in `decayStats()` or after each action; advance stage and swap sprite texture when threshold crossed.
* **Actions**: feed/play/sleep — each modifies stat values and increments `carePoints`. Guard energy check before play (`if (this.energy <= 0) return`).
* **Animation**: use Phaser sprite sheet animations (`this.anims.create`). Swap to action anim (`this.pet.play('eating')`) on interaction; on `animationcomplete` revert to idle (`this.pet.play('idle')`).
* **UI panels**: use `this.add.rectangle` + `this.add.text` for stat bars. Update bar width each tick: `statBar.setSize(maxWidth * (value / MAX_STAT), barHeight)`.
* **Save**: serialize `{stage, stats, carePoints, lastSave}` to `localStorage` in `shutdown()`. Restore in `create()`.
</VIRTUAL_PET_PATTERNS>

<IDLE_PATTERNS>
* **Tick**: `this.time.addEvent({ delay: INCOME_TICK, loop: true, callback: this.processTick, callbackScope: this })`. Each tick: `resources += calculateIncome(buildings, upgrades)`. Update HUD text in the same callback.
* **Offline earnings**: in `create()`, read `lastSave` from localStorage; compute `elapsed = (Date.now() - lastSave) / 1000`; award `elapsed * income * 0.5` (50% efficiency, max 8h). Show popup via `this.add.text` with a dismiss button.
* **Upgrade tree**: store upgrades as plain objects `{ id, requires[], multiplier, cost, purchased }`. Render upgrade buttons with `this.add.rectangle` + `this.add.text`; set `disableInteractive()` on unaffordable/locked buttons, restore on state change.
* **Grid placement**: store `grid[row][col]` as plain array in the scene. On cell tap, validate empty + sufficient gold, place building sprite at `col * TILE_SIZE + TILE_SIZE/2, row * TILE_SIZE + TILE_SIZE/2`.
* **Save**: `localStorage.setItem('idleSave', JSON.stringify({ resources, buildings, upgrades, lastSave: Date.now() }))` in `shutdown()`.
</IDLE_PATTERNS>

<VN_PATTERNS>
* **Script**: define as a plain object map `{ nodeId: { speaker, text, bg?, choices?, next?, effect? } }`. Store `currentNode` as a scene property.
* **Typewriter**: use `this.time.addEvent({ delay: TYPEWRITER_SPEED, repeat: text.length - 1, callback: () => { this.dialogueText.setText(text.slice(0, ++this.charIndex)) } })`. On `pointerdown` during animation: cancel the event and set full text immediately.
* **Branching**: `makeChoice(choiceIndex)` → call `node.choices[i].effect?.()` → set `this.currentNode = node.choices[i].next` → reset `charIndex` → load next node.
* **Background swap**: `this.cameras.main.fade(300, 0,0,0)` → on `camerafadeoutcomplete`: swap bg image texture (`bg.setTexture(newKey)`) → `this.cameras.main.fadeIn(300)`.
* **Dialogue box**: `this.add.rectangle` with semi-transparent fill at bottom of screen. Speaker name in a smaller box above. Use `setDepth` to layer above background.
* **Stats/Relationships**: store as plain scene properties. Gate dialogue paths with inline checks before setting `currentNode`.
* **Save**: serialize `{currentNode, stats, relationships, flags}` to `localStorage` in `shutdown()`.
</VN_PATTERNS>

<MANAGEMENT_PATTERNS>
* **Day/phase cycle**: store `phases = ['morning','afternoon','evening','night']` and `phaseIndex`. Advance with a "Next Phase" button; when past last phase, increment `day` and call `processEndOfDay()`.
* **End of day**: `gold += income - expenses`. Pick a random event from weighted array `[{id, chance, effect, text}]`; filter by `Math.random() < chance`, apply first match. Show event as a modal: `this.add.rectangle` overlay + `this.add.text` + confirm button.
* **Dashboard UI**: render stat bars as `this.add.rectangle` (background) + child `this.add.rectangle` (fill, updated by `setSize`). Update all bars in a single `refreshUI()` method called after any state change.
* **Staff/Assets**: store as array of objects `{id, name, level, income}`. "Hire" button appends to array and places a sprite. "Upgrade" finds by id, deducts cost, increments level, multiplies income, swaps texture.
</MANAGEMENT_PATTERNS>

<DRESS_UP_PATTERNS>
* **Layer model**: outfit is a plain object `Record<slot, textureKey|null>`. Render layer order: `['body','bottom','top','outerwear','shoes','hat','hair','accessory']`.
* **Character display**: one Phaser Image per slot, all positioned at the same anchor (center of character area). Assign `setDepth` by layer index. On equip: `slotSprite.setTexture(key).setVisible(true)`. On remove: `slotSprite.setVisible(false)`.
* **Wardrobe grid**: render item thumbnails as interactive Images. Filter `ALL_ITEMS` by `activeCategory`. Highlight equipped item by setting a tint (`setTint(0xffee88)`); clear tint on others. On tap: call `equipItem(slot, key)`.
* **Category tabs**: row of `this.add.rectangle` + `this.add.text` buttons. Active tab has distinct fill color. On tap: update `activeCategory` and re-render wardrobe grid (destroy old thumbnails, spawn new ones).
* **Save outfit**: `localStorage.setItem('outfits', JSON.stringify([...saved, {name, outfit, savedAt: Date.now()}]))` on save button tap.
</DRESS_UP_PATTERNS>

<PHASE_FSM>
**Management Sim, Idle, and Virtual Pet games require an explicit finite state machine (not applicable to Match-3, Card, Dress-Up).**
* Management: define a day-phase enum (`'morning' | 'afternoon' | 'evening' | 'night' | 'endOfDay'`) held in `this.phase`; never scatter phase strings across multiple callbacks.
* Idle: tick callbacks must check phase before applying income (e.g. pause earnings during upgrade animations) to prevent double-counting on phase transitions.
* Virtual Pet growth stage transitions (`egg → baby → …`) must be atomic — update `stage` first, then swap texture and reset animations; never split the condition check across the decay callback and the carePoints watcher.
* **Settlement must have a termination guard** — end-of-day logic (income − expenses, random events) must execute exactly once; guard with `if (this.phase === 'endOfDay') return` to prevent buttons or timers from triggering it twice.
</PHASE_FSM>

<SCENE_LIFECYCLE>
* **Local-first — REQUIRED** (all frameworks): game must be fully playable without network. Supabase may be used for persistence but must NOT block core gameplay. `localStorage` is the primary store; Supabase is optional sync. Guard every DB call with `if (!user) return` — never silent return.
* **No placeholder implementations** (all frameworks): never submit pages returning only "开发中", "TODO", or empty content. Every PRD page must have functional local content before finishing.
* **Async data guard** (all frameworks): never call a game function reading data populated by async operations before they complete. Guard with a `dataReady` flag or `await` the data before entering the scene/component.
* **Initial resource reachability** (all frameworks): the player must be able to perform the first meaningful action within 60 seconds. Verify `initialCurrency ≥ cheapestActionCost` OR a free income source fires within 60s.
* **Supabase Realtime null-check** (all frameworks): `payload.new` is `null` for DELETE events. Guard `if (!payload.new) return` — `Object.keys(null)` throws and silently kills the listener.

**[React] lifecycle rules**:
* `useEffect` timers/listeners MUST return a cleanup: `return () => clearInterval(id)`. React StrictMode double-invokes effects — without cleanup, two timers run simultaneously.
* Save to `localStorage` inside a `beforeunload` listener or on key state changes — not only on explicit "save" button click.

**[Phaser] lifecycle rules**:
* **Preloader must transition**: `Preloader.create()` must call `this.scene.start('NextScene')`. Full chain: Boot → Preloader → MainMenu → GameScene; every scene must call `this.scene.start()` at end of `create()`.
* **Scale container**: `scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, expandParent: false }` — `expandParent: true` (default) stretches past viewport and offsets canvas.
* `shutdown()` must be a class method — call `this.time.removeAllEvents()`, mirror every `EventBus.on` with `EventBus.off`.
* **Save on exit**: call `localStorage` save inside `shutdown()` — player may close tab mid-session.
* **Tween visibility / input — CRITICAL**: `alpha=0` or `setVisible(false)` does NOT remove input hit-area. Always call `disableInteractive()` when hiding and `setInteractive()` when showing again.
* **Phaser coords vs DOM coords**: particle emitters use Phaser world coordinates. Use `sprite.x, sprite.y` for emitter origin — never `event.clientX/Y` or `window.innerWidth/Height`.
</SCENE_LIFECYCLE>

<MOBILE_CONTROLS>
```javascript
if (!this.game.device.os.desktop) {
  // All sub-types: min 44px tap targets for all buttons and interactive elements
  // use onPointerDown (not onClick) for low-latency response
  // Idle/Management: larger finger-friendly grid cells (min TILE_SIZE 60px on mobile)
  // VN: full-screen tap area to advance dialogue
  // Dress-Up: drag-and-drop with pointer events; item thumbnails min 60×60px
}
```
</MOBILE_CONTROLS>

<AUDIO>
- Match-3: swap whoosh, match chime, combo escalation. Card flip sound.
- Virtual pet: feed munch, happy chirp, sad whimper.
- Idle: coin chime on purchase, level-up fanfare.
- VN: per-scene BGM (`this.sound.play('bgm', { loop: true })`), choice click SFX.
- Management: cash register on income, day-end bell, event alert sting.
- **[Phaser]** Use Phaser built-in audio API. Trigger only after first `pointerdown` (autoplay policy).
- **[React]** Use `<audio>` element or Web Audio API. Gate playback behind first user interaction.
</AUDIO>

<ZUSTAND_RULES>
**[Phaser]** All-Phaser UI is the default — manage all state inside scenes, no Zustand needed. Only add Zustand if React components outside the canvas must reflect game state.

**[React]** Use Zustand for all shared game state. Define slices per concern (resources, inventory, progress). Persist to `localStorage` via `persist` middleware.

**`persist` + Phaser hydration gate — REQUIRED when using `persist` middleware with Phaser**: `localStorage` rehydration is async; Phaser must NOT start before the store is hydrated or the scene reads stale/empty initial state.
```typescript
// store: expose hydration flag
onRehydrateStorage: () => (state) => { state?.setHasHydrated(true) }

// Phaser mount component: gate on hasHydrated
const hasHydrated = useGameStore(s => s._hasHydrated);
useEffect(() => {
  if (!hasHydrated || initialized.current) return;
  initialized.current = true;
  startGame('game-container');
}, [hasHydrated]);
if (!hasHydrated) return <div className="w-full h-full" />;
```
</ZUSTAND_RULES>

<REACT_PHASER_OVERLAY>
**[Phaser only]** When React UI (HUD, modals, panels) overlaps a Phaser canvas, pointer-events must be partitioned explicitly — never rely on z-index alone.

**Rule**: canvas receives all pointer events by default (Phaser input system depends on them). React overlay containers must be `pointer-events-none`; only individual interactive elements opt back in with `pointer-events-auto`.
```tsx
{/* Overlay container — transparent to pointer, does not block canvas */}
<div className="absolute inset-0 pointer-events-none z-10">
  <div>{/* display-only content */}</div>
  <button className="pointer-events-auto">Action</button>
</div>
```
**NEVER** apply `pointer-events: none` to the canvas element itself — this cuts Phaser's event source and breaks all in-scene input (`pointerdown`, drag, interactive objects).

**Decorative pseudo-elements** (`::before` / `::after`, Tailwind `before:` / `after:`) positioned over interactive areas must always include `pointer-events-none` (`before:pointer-events-none`); they have no default and silently intercept all clicks beneath them.
</REACT_PHASER_OVERLAY>

<EVENTBUS_RULES>
**Browser environment**: never `import { EventEmitter } from 'events'` — Node.js built-in modules (`events`, `path`, `fs`) are externalized by Vite and throw at runtime. Implement a minimal browser-native emitter or use `eventemitter3`:
```typescript
type Listener = (...args: any[]) => void;
class EventEmitter {
  private _map: Record<string, Listener[]> = {};
  on(e: string, fn: Listener) { (this._map[e] ??= []).push(fn); }
  off(e: string, fn: Listener) { this._map[e] = (this._map[e] ?? []).filter(l => l !== fn); }
  emit(e: string, ...args: any[]) { (this._map[e] ?? []).forEach(fn => fn(...args)); }
  removeAllListeners(e?: string) { if (e) delete this._map[e]; else this._map = {}; }
}
export const EventBus = new EventEmitter();
```

**`window.dispatchEvent` cross-component sync**: every component that reads state driven by a custom event **must add its own listener** — emitting from one side without listening on the other leaves the receiving component's local state permanently stale.
</EVENTBUS_RULES>
</GAME>
