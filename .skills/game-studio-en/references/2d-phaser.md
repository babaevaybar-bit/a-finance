# Phaser 2D Implementation Guide

## Preferred Stack

- Phaser
- TypeScript
- Vite
- DOM HUD / DOM menus layered over the game canvas

The Phaser path fits most 2D browser games: sprite animation, tilemaps, platformers, top-down action, tactics games, lightweight physics, and fast gameplay prototypes.

## Recommended Directory Structure

```text
src/
  game/
    simulation/
      state.ts
      systems/
      entities/
    content/
      levels/
      tuning.ts
    input/
      inputMap.ts
    assets/
      manifest.ts
  phaser/
    boot/
      createGame.ts
    scenes/
      BootScene.ts
      PreloadScene.ts
      GameScene.ts
    view/
      sprites/
      cameras/
      effects/
    adapters/
      syncStateToScene.ts
  ui/
    hud/
    menus/
    overlays/
```

## Scene Responsibilities

Keep scenes thin:

- `BootScene`: initialize Phaser config, global plugins, and scaling rules.
- `PreloadScene`: load assets declared in the manifest and show loading state.
- `GameScene`: bind input, camera, render objects, and the simulation tick.
- Optional `UIScene`: only when Phaser-native UI is truly needed; text and menus should usually remain DOM.

Do not store long-lived gameplay rules, progression, objectives, inventory, or quest state inside scenes. Scenes can be destroyed and recreated; game state should survive that.

## Gameplay State and Render Objects

Recommended split:

- `game/simulation` owns pure data: position, velocity, health, state machines, score, cooldowns, level objectives.
- `phaser/view` owns Phaser objects: sprites, containers, tilemap layers, particles, cameras.
- `phaser/adapters` sync simulation state into render objects.

This prevents scene restarts from losing core state, keeps UI decoupled from Phaser internals, and avoids gameplay logic breaking when sprites are destroyed.

## Input Mapping

Define actions first, then bind keys:

```text
left/right/up/down → move vector
space / buttonA → primary action
shift / buttonB → dash or secondary action
E / tap target → interact
Esc / menu button → pause
```

For mobile, design virtual joysticks, touch buttons, and orientation behavior separately. Do not assume keyboard input is the whole input model.

## Camera Patterns

Common camera strategies:

- Fixed screen: puzzle, arcade, single-screen combat.
- Follow player: platformers and top-down action.
- Zone lock: room-based games, combat arenas, tactics boards.
- Directional look-ahead: show more space in the direction of movement.

Camera movement should protect gameplay readability. Avoid excessive shake, aggressive zoom, and HUD overlap.

## Common 2D Game Types

### Top-down action

- Tune movement feel, attack range, enemy telegraphs, and hit feedback first.
- Keep visible space in the player movement direction.
- Put limits on enemy counts and projectile counts.

### Platformers

- Tune jump height, input buffering, coyote time, gravity, and hitboxes first.
- Keep the area below the player visible so landing points are readable.
- Animation can lag behind feel, but input feedback cannot.

### Grid tactics

- Model simulation around grids, action points, turns, and status effects.
- Rendering should show paths, highlights, attack ranges, and unit animations.
- Use DOM panels for unit details, skill descriptions, and turn controls.

## Sprites and Tilemaps

- Use stable asset keys, not hardcoded file paths in gameplay code.
- Define sprite-sheet frame size, anchors, and animation names.
- Separate tilemap visual layers, collision layers, and trigger layers.
- Important collision boxes do not need to match the full sprite rectangle; tune them for gameplay feel.

## DOM HUDs and Menus

DOM HUDs are a good fit for:

- Health, score, timers, objectives
- Pause menus, settings, level select, result screens
- Text instructions, tutorial prompts, dialogue boxes

Layout principles:

- Keep the center playfield clear.
- Avoid persistent UI in the lower-middle playfield, especially for platformers and movement-heavy games.
- Prefer one primary HUD cluster instead of multiple permanent panels.

## First Playable Acceptance Check

A minimum prototype should validate:

- The page quickly reaches an actionable screen
- Player movement or the main verb responds reliably
- There is a clear objective or failure condition
- One success path and one failure path can be triggered
- Pause or restart is available
- HUD does not block critical play areas
- Canvas and DOM UI remain aligned after viewport changes
