# 3D Browser Runtime Guide

## Choose the 3D Branch First

Do not treat all 3D work as a generic WebGL guide. Identify the host first:

| Situation | Recommendation |
|---|---|
| Plain TypeScript / Vite, non-React, direct render-loop control | Three.js |
| 3D inside a React app, shared React state, declarative scene composition | React Three Fiber |
| Only 3D models, GLB, compression, or LOD are being discussed | Start with `assets.md` |
| User did not explicitly ask for 3D | Return to the Phaser 2D default |

## Three.js Path

Preferred stack:

- `three`
- TypeScript
- Vite
- GLB or glTF 2.0 assets
- `GLTFLoader`, `DRACOLoader`, `KTX2Loader`
- Rapier JS when physics is needed
- SpectorJS for GPU and frame debugging
- DOM overlays for HUDs, menus, and settings

Recommended modules:

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

Three.js is best when the project needs direct control over renderer, scene, camera, animation loop, asset loading, and debugging tools. Keep the render loop understandable, and avoid scattering business state into Mesh custom fields.

## React Three Fiber Path

Preferred stack:

- `@react-three/fiber`
- `three`
- `@react-three/drei`
- `@react-three/rapier`
- `@react-three/postprocessing`
- `@react-three/a11y` when interaction accessibility matters
- DOM overlays in the normal React tree

R3F is a good fit when:

- The 3D scene is part of a React product
- UI, settings, panels, and state already live in React
- Declarative scene composition and componentized models help the project

Avoid bypassing React lifecycle with widespread manual `new` / `dispose` patterns. If the project needs heavy imperative control, plain Three.js may be the better route.

## Cameras and Controls

Decide what gameplay job the camera has:

- Follow character: action, exploration, 3D platforming
- Fixed angle: board, display, light strategy
- Orbit controls: editor, model viewer, sandbox
- First-person / third-person: stricter collision, occlusion, and input handling

Camera QA should check:

- Whether the target is occluded
- Whether depth relationships are readable
- Whether fast motion causes discomfort
- Whether UI blocks reticles, targets, or paths
- Whether viewport changes still keep camera and HUD reasonable

## Loaders and Asset Boundaries

Use GLB or glTF 2.0 by default. Centralize loading concerns:

- DRACO / Meshopt geometry compression
- KTX2 / Basis texture compression
- Loading progress and error states
- Model names, animation clips, material reuse
- Runtime caching and disposal

Do not let gameplay components load scattered file paths directly. Use stable asset keys or a central manifest.

## Physics Boundaries

When physics is needed, distinguish:

- Gameplay collision: hits, triggers, movement blocking
- Presentation physics: debris, falling objects, swinging elements
- Character controller: slopes, steps, grounded checks, jumps

Most games should not use exact high-poly render meshes as collision. Prefer boxes, capsules, spheres, convex hulls, or hand-authored collision proxies.

## Low-Chrome 3D UI

Default to low-obstruction 3D UI:

- Keep the center playfield clear.
- Use one compact objective chip and one small status surface.
- Put long text, settings, inventory, and quest detail in DOM panels.
- Use transient prompts during combat or fast play.
- Handle distance, occlusion, and overlap for labels near 3D targets.

## WebGL Debugging and Performance

Debugging order:

1. Capture first, then guess.
2. Reduce the scene until the performance cliff is visible.
3. Disable postprocessing before rewriting core rendering.
4. Check the asset pipeline before blaming the renderer.
5. Treat context loss as a browser requirement, not an edge case.

Common checks:

- draw calls, triangles, texture sizes, material count
- shadow count, real-time light count, postprocessing chain
- oversized or uncompressed GLB files
- excessive animation mixers or physics steps
- per-frame object allocation causing GC stutter

## 3D Playable Acceptance Check

- First load shows progress or feedback rather than a blank screen.
- Camera reliably presents the main target.
- Primary input is readable and responsive.
- 3D content and DOM HUDs do not obstruct each other.
- Asset-loading failures show readable errors.
- WebGL context loss or low-performance devices have a recovery or fallback path.
