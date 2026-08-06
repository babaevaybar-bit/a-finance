<GAME>
* Entrypoint — CRITICAL: Use `src/main.tsx` (React root). ALWAYS use React Three Fiber. NEVER use Phaser 3 for 3D games.
* Make full use of assets in manifest.json. Landscape (1280×720 or fullscreen). No Phaser game loop.

<FRAMEWORK_SELECTION>
ONLY applies when "3D" is explicitly requested. FORBIDDEN — mix Phaser 3 + R3F in the same project.

| Stack | Packages |
|---|---|
| Renderer | @react-three/fiber ^9.x (REQUIRED v9+; FORBIDDEN v8) |
| Helpers | @react-three/drei ^10.x |
| Post FX | @react-three/postprocessing ^3.x |
| Physics | @react-three/rapier ^2.x |
| Animation | @react-spring/three + maath |
| State | zustand ^5.x |
| Audio | tone (Tone.js) |
| Character controller | ecctrl (available — use for FPS/third-person player controllers with Rapier) |
| 3D UI | @react-three/uikit (available — use for in-world 3D UI panels; React DOM overlay preferred for HUD) |

* **`index.html` body** — `src/index.css` already sets `overflow:hidden` and Tailwind Preflight zeroes body margin; the `<Canvas>` container uses Tailwind `w-screen h-screen` — do NOT add duplicate inline styles.
* **FORBIDDEN packages for 3D**: `phaser` (use R3F), `framer-motion` on RigidBody meshes (use `react-spring/three` for visual-only, `kinematicPosition` for physics-driven).
</FRAMEWORK_SELECTION>

<CANVAS_SETUP>
```tsx
// REQUIRED pattern — React UI outside <Canvas>, game scene inside <Suspense>
export default function App() {
  return (
    <div style={{ width:'100vw', height:'100vh', overflow:'hidden' }}>
      <HUD />  {/* React DOM overlay, NOT inside Canvas */}
      <Canvas shadows camera={{ fov:75, near:0.1, far:1000, position:[0,2,5] }}>
        {/* FORBIDDEN: fallback={null} — leaves black screen with no interactivity */}
        <Suspense fallback={<LoadingScreen />}>
          <GameScene />
        </Suspense>
      </Canvas>
    </div>
  )
}
```
* Application-level routing (landing → game → leaderboard): React Router is allowed. In-game scene transitions: conditional rendering or zustand state — NOT router.
* **React HUD pointer-events**: overlay containers must be `pointer-events-none`; only individual interactive elements opt back in with `pointer-events-auto`. NEVER put `pointer-events-none` on `<Canvas>` — it cuts R3F's raycaster and breaks all 3D click events. Social/multiplayer buttons with empty `onClick={() => {}}` are equivalent to not implementing the feature — provide local mock data instead.
</CANVAS_SETUP>

<PHYSICS_RAPIER>
* **RAPIER ANIMATION — CRITICAL**: NEVER use `useFrame` or `react-spring` to set `position`/`rotation` on a mesh inside `<RigidBody>` — physics engine overwrites it every frame. For programmatically moved objects use `type="kinematicPosition"` + `rigidBodyRef.current.setNextKinematicTranslation({x,y,z})`.
* Collision events: `onCollisionEnter` / `onCollisionExit` props on `<RigidBody>`.
* Trigger zones: `<RigidBody type="fixed" sensor onIntersectionEnter={...}>`.
* Wrap scene in `<Physics gravity={[0,-9.81,0]}>`.
</PHYSICS_RAPIER>

<USEFRAME_RULES>
* **`useFrame` IS NOT `useEffect` — CRITICAL**: NEVER register event listeners inside `useFrame` — R3F ignores its return value, leaking one new listener per frame.
  Register listeners in `useEffect(() => { window.addEventListener(...); return () => removeEventListener(...) }, [])`.
* **ZUSTAND IN `useFrame` — CRITICAL**: NEVER call zustand `set()` inside `useFrame` for continuous values — triggers 60fps React re-renders.
  - UI sync: throttle writes (≥100ms interval).
  - 3D-to-3D: `useStore.subscribe()` to mutate refs directly, no re-render.
* Store per-frame mutable values (position, velocity) in `useRef`, not zustand.
* Always consume `delta` — `useFrame((_state, delta) => {...})` for frame-rate-independent movement.
</USEFRAME_RULES>

<MATERIALS_AND_EFFECTS>
* **Materials**: `MeshRefractionMaterial` (crystals, single geometry), `MeshTransmissionMaterial` (glass/ice), `MeshWobbleMaterial` (organic), `MeshReflectorMaterial` (mirrors).
* **Minimum lighting baseline — REQUIRED**: every 3D scene must have at least `<ambientLight intensity={0.4}/>` + `<directionalLight position={[10,10,5]} intensity={1.2} castShadow/>`. `ambientLight` alone (intensity < 0.5) produces near-black unlit faces; `directionalLight` alone leaves back faces completely dark.
* **Shadows**: `<Canvas shadows>` + `<SoftShadows size={40} samples={16}/>` + `directionalLight castShadow` + `shadowMaterial` on ground.
* **Atmosphere**: `<Environment>`, `<Sky>`, `<Stars>`, `<Cloud>`, `<Caustics>`.
* **Post-processing**: wrap in `<EffectComposer>` — `<Bloom>`, `<DepthOfField>`, `<SSAO>`, `<Vignette>`.
* **R3F PARTICLE COUNT — CRITICAL**: Total `THREE.Points` particles ≤ 1500. `<Sparkles count>` ≤ 150; `<Stars count>` ≤ 3000. Reduce with `geometry.setDrawRange(0, n)` on slow frames — no buffer rebuild needed.
</MATERIALS_AND_EFFECTS>

<CLEANUP>
* Dispose GPU resources on unmount: `geometry.dispose(); material.dispose(); texture.dispose()`.
* FORBIDDEN — do NOT manually create `WebGLRenderer`; R3F manages it.
* `useGLTF.preload('/path')` at module level for preloading; drei cache handles disposal.
</CLEANUP>

<AUDIO>
* Use Tone.js for all 3D/R3F games. FORBIDDEN — mixing Tone.js + Phaser audio (dual AudioContext conflict).
* **AUTOPLAY POLICY — CRITICAL**: Gate `Tone.start()` behind first user gesture: `<button onClick={async () => { await Tone.start(); startGame() }}>`.
* Positional audio: Three.js `PositionalAudio` + `AudioListener` attached to camera.
</AUDIO>

<MOBILE_CONTROLS>
```tsx
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0
// Racing: gyroscope tilt — window.addEventListener('deviceorientation', ...)
// iOS 13+ requires: DeviceOrientationEvent.requestPermission?.()
// FPS/Third-person: left joystick (move) + right joystick (look) via nipplejs or custom pointer tracking
// touch-action:none on canvas container — prevents scroll interference
// Min tap target: 48×48px
```
FPS: avoid `PointerLockControls` on mobile — pointer lock API unsupported on most mobile browsers.
**FPS Pointer Lock — CRITICAL**: `PointerLockControls` does NOT activate automatically. Must call `controls.lock()` from a user gesture (click/keydown). Without it, the controls object exists but mouse movement has no effect. Pattern: `document.addEventListener('click', () => controls.lock())`.
</MOBILE_CONTROLS>

<ZUSTAND_RULES>
- Forbidden: positions, rotations, velocities, physics data, animation frames, input state.
- Allowed: `score`, `hp`, `level`, `gameStatus`, `weaponType`, `settings`.
- Emit deltas: `addScore: (n) => set(s => ({ score: s.score + n }))`.
</ZUSTAND_RULES>
</GAME>
