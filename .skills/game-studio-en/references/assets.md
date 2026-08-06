# Browser Game Asset Pipeline

## 2D Sprite Principles

Handle 2D animation assets as a complete pipeline, not as unrelated isolated frames.

Core principles:

- Start from one approved in-game seed frame.
- Generate the full animation strip, not separate one-off frames.
- Normalize the whole strip with one shared scale.
- Use one shared anchor, usually bottom-center.
- Preview before shipping to confirm timing, silhouette, and direction.

## Sprite Workflow

1. Approve the seed frame: it must already work in-game with the final view angle, scale, line density, and palette direction.
2. Expand the transparent canvas: leave enough motion space around the seed frame so arms, weapons, jumps, and effects are not clipped.
3. Generate the full strip in one pass: idle, run, attack, hurt, death, or other actions as separate strips.
4. Normalize consistently: slice the strip into fixed-size frames with one scale and one anchor.
5. Lock frame 01 back if needed: if the first frame must exactly match the shipped seed frame, replace it after normalization.
6. Render a preview: check timing, foot sliding, silhouette flicker, and anchor drift.
7. Test in-engine: play the animation in Phaser and confirm hitboxes match the visual frames.

## Sprite Spec Checklist

Record at least:

- Character or object name
- Action name: idle, run, jump, attack, hit, death, etc.
- Frame count
- Frame width and height
- FPS or per-frame duration
- Anchor, such as bottom-center
- Suggested collision box
- Whether the animation loops
- Key animation events: hit frame, landing frame, fire frame

## 3D Asset Principles

Use GLB or glTF 2.0 by default for browser 3D. Source files may come from Blender or another DCC tool, but runtime assets must be cleaned, compressed, validated, and loaded in the target runtime.

Do not treat “the model opens” as “the model is ready to ship.” Browser games also care about load size, texture formats, material count, animation names, pivots, scale, collision, and LOD.

## 3D GLB / glTF Workflow

1. Clean the source asset in the DCC tool: remove hidden junk, unused materials, duplicate meshes, and broken hierarchy.
2. Normalize scale and orientation: confirm units, character height, pivot, ground alignment, and forward direction.
3. Export GLB or glTF 2.0: include static meshes, skeletal animation, materials, and textures as needed.
4. Optimize with glTF Transform: prune, dedup, weld, resize, compress, inspect.
5. Choose compression strategy: DRACO or Meshopt for geometry; KTX2 / Basis for textures.
6. Prepare collision: prefer hand-authored proxies or simple primitives instead of high-poly mesh collision.
7. Plan LOD: large scenes, distant objects, or low-end devices need reduced-complexity models.
8. Test runtime loading: load in Three.js or R3F and check animation, material, scale, shadows, and performance.

## Textures and Materials

- Reuse materials instead of giving every small object its own material.
- Control texture sizes; prefer 512 / 1024, and reserve larger textures for heroes or close-ups.
- Prefer KTX2 / Basis compression for browser projects.
- Avoid excessive transparent materials and expensive shaders.
- Use meaningful names: `hero_body_mat`, `crate_baseColor`, `level01_wall_normal`.

## Collision and LOD

Collision should serve gameplay:

- Characters: capsule or box
- Bullets / pickups: sphere or box
- Terrain: simplified mesh or tile-based proxy
- Doors, walls, obstacles: box or convex hull

LOD should define:

- Distance thresholds
- Whether materials and textures also downgrade
- Whether animation simplifies at distance
- Whether transitions create visible popping

## Asset Naming

Use names that include the subject, action or purpose, and version:

```text
hero_run_v01
hero_attack_v02
enemy_slime_idle_v01
level01_wall_glb_v03
ui_icon_key_v01
```

Asset keys should remain stable while filenames can evolve. Gameplay code references keys; the manifest maps keys to paths.

## Acceptance Checklist

2D:

- Frame size is consistent
- Anchor is consistent
- No clipping or drift
- Key action frames are readable
- Silhouette is readable on target backgrounds
- The animation plays correctly in Phaser

3D:

- GLB / glTF loads in the runtime
- Scale, pivot, and orientation are correct
- Materials and textures are present
- File size fits the budget
- Collision matches gameplay needs
- LOD or compression does not damage visual quality
- Low-end or constrained modes remain acceptable
