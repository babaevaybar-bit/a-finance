# Browser Game Foundations

## Questions to Lock Down First

Before giving implementation advice, clarify as much of this as possible:

- Player fantasy: what should the player feel they are doing or becoming?
- Core verbs: move, dodge, shoot, solve, collect, build, talk, manage, or something else?
- Core loop: what input, feedback, reward, or failure happens in one short loop?
- Failure states: death, timeout, resource depletion, detection, mission failure, or another outcome?
- Target session length: 30-second prototype, 3-minute level, long-term progress, or repeatable challenge?
- Input model: keyboard/mouse, touch, gamepad, and whether mobile is required.
- Platform constraints: browser, React host, plain TS/Vite, static deployment, asset-size budget.

## Engine Selection

Keep the default conservative. Choose the smallest stack that fits the current game shape.

| Situation | Recommendation |
|---|---|
| 2D, sprites, tilemaps, platformers, top-down action, tactics, arcade prototypes | Phaser |
| Explicit 3D, WebGL-first, plain TypeScript / Vite, direct render-loop control | Three.js |
| 3D embedded in a React product, shared React state, DOM UI coordination | React Three Fiber |
| Renderer abstractions are the actual problem, or the goal is low-level rendering learning | raw WebGL |
| User specifically requests Babylon.js / PlayCanvas | Compare objectively, but do not default to them |

If the user did not explicitly ask for 3D, prefer Phaser 2D. It usually reaches a playable browser prototype faster.

## Architecture Principles

### 1. Separate simulation from rendering

Game rules, health, score, cooldowns, collision intent, and win/loss state belong to simulation. Phaser sprites, Three.js meshes, cameras, materials, and postprocessing belong to rendering.

This keeps gameplay testable, survives scene rebuilds, and lets UI read stable state instead of renderer internals.

### 2. Keep the input map explicit

Do not scatter input logic across scenes, components, and event callbacks. Define actions first, such as:

- `moveLeft` / `moveRight`
- `jump`
- `dash`
- `interact`
- `pause`

This makes keyboard, touch, and gamepad support easier and makes playtest feedback more precise.

### 3. Treat asset loading as a first-class system

Gameplay code should reference stable asset keys, not file paths spread across the codebase. An asset manifest should record:

- key
- type: image, spritesheet, tilemap, audio, glb, texture
- source path
- frame size or model scale
- whether the asset needs compression, preloading, or lazy loading

### 4. Define save / debug / performance boundaries early

Even prototypes need to know what persists, what debug data appears, and what performance target matters.

- Save: progress, level, score, settings, unlocked content
- Debug: FPS, hitboxes, entity counts, current state machine, asset loading state
- Performance: initial load size, target FPS, max entity count, mobile support

### 5. Use DOM HUDs by default

Text-heavy, button-heavy, and form-like UI should usually be DOM overlays. Canvas/WebGL renders the game world; DOM handles menus, HUDs, settings, instructions, and result screens.

## Recommended Module Boundaries

For Phaser 2D:

```text
src/
  game/
    simulation/
    content/
    input/
    assets/
  phaser/
    boot/
    scenes/
    view/
    adapters/
  ui/
    hud/
    menus/
    overlays/
```

For Three.js 3D:

```text
src/
  game/
    simulation/
    content/
    input/
    save/
  render/
    app/
    loaders/
    objects/
    materials/
    lights/
    post/
    adapters/
  physics/
  diagnostics/
  ui/
```

## Data Flow

Recommended flow:

1. The input layer collects keyboard, mouse, touch, or gamepad state.
2. The input map converts raw input into gameplay actions.
3. Simulation updates game state from actions and timestep.
4. Rendering reads state and updates sprites, meshes, cameras, and effects.
5. DOM UI reads state and shows HUDs, menus, and results.
6. QA records screenshots, performance metrics, and reproducible issues.

## Pre-Implementation Checklist

- Did you explain why Phaser, Three.js, or React Three Fiber fits?
- Is simulation independent from Phaser scenes or Three.js Object3D instances?
- Is input mapped centrally rather than scattered through callbacks?
- Are assets referenced by manifest keys?
- Does HUD default to the DOM layer?
- Is there a first playable validation path?
