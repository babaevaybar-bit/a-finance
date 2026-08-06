# Game UI and Playtest QA

## Default UI Strategy

Render the game world in canvas or WebGL, and put text-heavy UI in the DOM. This gives better typography, responsive layout, accessibility, input fields, button states, and debugging.

Good DOM candidates:

- HUDs: health, score, timers, objectives, resources
- Menus: start, pause, settings, level select, results
- Overlays: tutorials, dialogue, failure, victory, confirmation
- Complex text: quest descriptions, item details, logs, leaderboards

## Protect the Playfield

During normal play, protect the player's view:

- The initial screen should make it clear how to start playing within a few seconds.
- Keep one primary persistent HUD cluster by default.
- Add at most one small secondary status cluster.
- Do not keep large permanent panels in the center playfield.
- Keep the lower-middle playfield mostly clear, especially for movement, platforming, and aiming games.
- Keep prompts transient and let them exit automatically.

## HUD Layout Guidance

Common 2D layout:

- Top-left: health, shield, resources
- Top-right: score, timer, objective
- Bottom-left / bottom-right: mobile virtual controls
- Top-center: short objective or wave information
- Bottom-center: transient interaction prompts only, not permanent text blocks

Low-chrome 3D layout:

- One compact objective chip
- One small status surface
- Short prompts for key interactions
- Long quests and settings in pause menus
- Target labels with distance, occlusion, and overlap handling

## Menus and Overlays

Cover the full state flow:

- Start screen: show the main verb and how to enter play.
- Pause screen: resume, restart, settings, exit.
- Failure screen: explain why the player failed and offer retry.
- Victory screen: show result, reward, or next level.
- Settings screen: volume, graphics, input hints, and essential accessibility options.

When an overlay appears, decide whether simulation pauses. If it does not pause, avoid covering content that requires immediate player response.

## Playtest Flow

Run each playable increment through this sequence:

1. Boot the game and confirm the first actionable screen.
2. Exercise the main verbs: move, jump, attack, interact, build, choose, or similar.
3. Trigger one success path and one failure path.
4. Capture representative screenshots: start, normal play, pressure state, pause, failure/victory.
5. Check the UI layer independently: text, buttons, obstruction, responsiveness.
6. Check the render layer independently: animation, camera, collision, effects, performance.
7. Report findings in severity order with reproduction steps.

## Screenshot Review Focus

When reviewing screenshots, do not only ask whether they look good. Check:

- Whether the player's next action is obvious
- Whether player, enemies, hazards, and goals are readable
- Whether HUDs block key play areas
- Whether text is readable on the target background
- Whether mobile or narrow screens squeeze the play area
- Whether failure, hit, and reward feedback are clear
- Whether 3D depth and target distance are understandable

## Browser QA Checklist

Basics:

- The game boots into a useful state
- First load is not a long blank screen
- Primary verbs respond reliably
- Pause, resume, and restart work
- Error states provide readable feedback

Viewport:

- Wide, narrow, and common laptop sizes work
- Canvas and DOM HUD align correctly
- Click areas remain correct after scaling
- Mobile orientation strategy is defined

2D:

- Sprites do not drift from their anchors
- Tilemap collision layers are correct
- Camera does not shake excessively
- Lower UI does not hide landing spots or movement direction

3D:

- Camera does not hide the main target
- Depth relationships are readable
- GLB loading failures show a message
- Turning off postprocessing helps isolate visual/performance issues
- WebGL context loss has a recovery or message path
- Low-performance devices have graphics or effects fallback

## Issue Report Template

```markdown
## Issue title

- Severity: blocker / high / medium / low
- Location: start screen / gameplay / pause screen / failure screen / specific level
- Reproduction steps:
  1. ...
  2. ...
  3. ...
- Expected result: ...
- Actual result: ...
- Screenshot or observation: ...
- Suggested fix: ...
```

## Common UI Problems

- The HUD has too much information and the player does not know where to look.
- Tutorials cover the object the player needs to interact with.
- 3D labels stack together without distance or occlusion handling.
- Failure screens say only “failed” without explaining the reason.
- Input state remains stuck after returning from pause.
- Mobile buttons conflict with browser edge gestures.
