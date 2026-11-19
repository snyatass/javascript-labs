# Spaceship — Labs 01–02

A small Canvas 2D game demonstrating the browser event loop, fixed-timestep simulation, JavaScript objects, and a Map-backed entity world.

## Requirements

- Node.js 22.12 or newer and npm

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To run the production build:

```sh
npm run build
npm run preview
```

## Checks

```sh
npm test
npm run check
```

## Lab 01 structure

- `src/loop.js` — `requestAnimationFrame`, clamped accumulator, fixed 60 Hz simulation, interpolation alpha, and frame statistics.
- `src/input.js` — keyboard state encapsulated in a closure.
- `src/sim/ship.js` — ship movement and controls.
- `src/sim/arena.js` — wrap-around arena boundaries.
- `src/render/` — DPR-aware resizable canvas and drawing/interpolation.

## Lab 02 structure

- `src/sim/vector.js`, `entity.js` — pure `Vector2` methods and the shared entity base class.
- `src/sim/world.js`, `collision.js` — `Map`-backed entity lifecycle and the circle-collision system.
- `src/sim/ship.js`, `bullet.js`, `asteroid.js`, `pickup.js`, `explosion.js` — game entities.
- `src/sim/behaviors.js` — composable homing behavior; `src/sim/game.js` — scoring, pickups, and respawn.
- `tests/` — loop, input, vector, entity, world, collision, and gameplay behavior tests.

## Event-loop experiments

Measurements below were collected on Windows in the VS Code embedded Chromium 150 browser (viewport 1388 × 699 CSS pixels, DPR 1.25). The automated browser delivered about 125 rAF callbacks per second in the timing test. Browser scheduling and rendering measurements vary by machine.

### 1. Synchronous 100 ms block

For every 60th render, temporarily run:

```js
const start = performance.now();
while (performance.now() - start < 100) {}
```

**Measurement:** a 100 ms busy-wait in the 60th rAF callback took 100 ms. The longest interval between consecutive rAF timestamps was 100 ms; adjacent intervals were about 3 ms, 3 ms, 100 ms, and 3.1 ms.

**What happens:** the main thread cannot process input, run another animation-frame callback, update the page, or paint while this synchronous loop occupies the call stack. The frame containing the block takes at least about 100 ms, so the HUD's frame-time value spikes and visible motion/input stutters. A promise, timer, or another callback on the same thread cannot work around the block because it cannot run until the current JavaScript returns. Remove the block after the experiment.

### 2. `setInterval` instead of `requestAnimationFrame`

Temporarily schedule `frame` with `setInterval(frame, 16)` instead of `requestAnimationFrame(frame)`. Observe the HUD for 10 seconds, then leave the page in a background tab for 5 seconds and return. Restore `requestAnimationFrame` after the experiment.

**Measurement over about 10 seconds:**

| Scheduler               |                   Callbacks | Mean interval | Interval standard deviation | Observed range |
| ----------------------- | --------------------------: | ------------: | --------------------------: | -------------: |
| `setInterval(..., 16)`  |    630 in 10.091 s (62.4/s) |     16.001 ms |                    0.654 ms |   13.9–18.0 ms |
| `requestAnimationFrame` | 1,249 in 10.001 s (124.9/s) |      8.013 ms |                    1.636 ms |    6.0–12.7 ms |

The attempted 5-second background-tab check did not actually hide the page in this embedded browser (`document.visibilityState` remained `visible`), so background timer throttling could not be measured here. Verify this part in a normal browser window; do not infer a background-tab result from this run.

**What happens:** a 16 ms interval requests 62.5 callbacks per second in theory, not 60 or the monitor's refresh rate. Timer delays and callback work introduce jitter, and callbacks are not synchronized to paint. Browsers throttle timers in background tabs. `requestAnimationFrame` is aligned with rendering and normally pauses when the page is hidden, avoiding unnecessary background work.

### 3. Variable timestep versus fixed timestep

Temporarily call `simulate(rawDelta)` once per rendered frame (without the accumulator), hold thrust for 5 seconds, and record the ship position. Compare an unthrottled run with a run using Chrome DevTools CPU throttling at 6×. Then restore the accumulator and repeat.

**Measurements:** both runs started at the arena center `(694, 349.5)` and ran for about 5 seconds with thrust held. With the actual CPU throttle set to 6× through the Chrome DevTools Protocol, the browser still delivered 1,576 frames at 1× and 1,574 at 6× (about 315 frames/s in both runs). The variable-step final positions were `(694, 388.9638)` and `(694, 388.9617)`, respectively, a difference of about `0.0021` px. This lightweight simulation did not become frame-rate-bound under the throttle, so the real-browser difference was too small to see.

To make the numerical effect clear, a controlled 5-second replay used 60 Hz and 10 Hz frame schedules (50 frames at 10 Hz, i.e. one-sixth as many rendered frames). At 10 Hz, the fixed-step result was `(694, 389.6283)` while the variable-step result was `(694, 395.9472)`, a `6.3189` px difference. At 60 Hz both produced `(694, 389.6283)`. This controlled replay is not presented as the DevTools measurement; it isolates how changing `dt` changes the trajectory.

**What happens:** a variable timestep feeds different `dt` values into the physics under different frame schedules. Numerical integration therefore follows a different trajectory; a long frame can also make motion unstable. The fixed-step accumulator advances the simulation in 1/60-second increments regardless of render rate, while the renderer interpolates between simulation states.

## Lab 02 — Objects, prototypes, and `this`

### Play

- **W / Up** — thrust; **A / Left**, **D / Right** — turn.
- **Space** — fire; **Shift + Space** — fire a homing shot.
- Fly over a green **S** pickup for a shield or a yellow **R** pickup for rapid fire.
- Shoot asteroids and the red enemy ship to score. Collisions damage the player; a destroyed player respawns after two seconds.

### Entity model

`Vector2` contains pure vector operations. `Entity` owns identity, position, velocity, radius, and shared update behavior. `Ship`, `Bullet`, `Asteroid`, `Pickup`, and `Explosion` extend it directly; there is no second inheritance level. `World` stores entities in a `Map`, supports iteration and `ofKind()`, defers removals until the end of each step, and delegates circle-pair detection to `collision.js`.

The ship's health is a private `#hp` field exposed through `get hp()`. Bullets have a TTL and inherit the ship's velocity. Asteroids drift and bounce; bullets can damage asteroids or enemy ships. A destroyed entity creates short-lived explosion particles. Player death starts a two-second timer; score is displayed in the HUD.

### Fixing the `this` bug

Passing a method as a callback loses its receiver:

```js
button.addEventListener("click", ship.fire); // The event system supplies the button as `this`.
```

`Ship.fire()` reads private fields, so calling it with the button as `this` throws a `TypeError`. The keyboard handler in `src/main.js` uses a closure instead: `event => game.player?.fire(game.world, ...)`; the method is called as a member of its ship. Other fixes are `ship.fire.bind(ship, game.world)` for a fixed ship/world pair (creates a bound function and must be refreshed if the ship changes) or a class-field arrow that captures `this` (one function per instance). The closure is also needed here to read Shift for homing shots. A shared prototype method plus a small closure keeps one method implementation and makes the receiver explicit.

### Composition instead of a deeper class tree

A hierarchy for the current behaviors might grow into `Entity → MovingEntity → HomingMovingEntity → HomingBullet` and `Entity → MovingEntity → HomingMovingEntity → HomingAsteroid`, beside separate branches for ships and stationary pickups. A pickup is not a ship, and “homing” is a behavior that can be reused by different entity kinds; encoding these combinations as subclasses quickly creates parallel branches and duplicated behavior.

Instead, entities keep a `Map` of optional components. `HomingBehavior` is attached to asteroids and homing bullets, while `Pickup` stays a stationary `Entity` with an effect value (`shield` or `rapid`). The movement, collision, and rendering code can therefore act on entity kind or component presence without adding inheritance levels.

### Prototype console experiment

```js
const a = { hello: () => "hello" };
const b = Object.create(a);
b.hello(); // "hello": b delegates to a; the method was not copied.
a.hello = () => "changed";
b.hello(); // "changed": lookup follows the prototype chain.

class A {
  method() {
    return this;
  }
}
const a1 = new A();
const method = a1.method;
method(); // undefined in a module (strict mode); the call site has no receiver.
method.call(a1) === a1; // true: explicit binding.

({ 1: "x" })[1]; // "x": object keys are strings.
new Map([[1, "x"]]).get("1"); // undefined: Map keeps key types distinct.
```

The same lost-receiver case is demonstrated by the `Ship.fire` test. For a `Map`, numeric key `1` and string key `"1"` are different keys.

## Submission

Create and push the required tag after committing the project:

```sh
git tag -a lab-02 -m "Lab 02 entity model"
git push --follow-tags origin main
```
