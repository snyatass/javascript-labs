# Spaceship — Lab 01

A small Canvas 2D game demonstrating the browser event loop and a fixed-timestep game loop. Fly the ship with **W / Up** (thrust) and **A / Left**, **D / Right** (turn).

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

## Structure

- `src/loop.js` — `requestAnimationFrame`, clamped accumulator, fixed 60 Hz simulation, interpolation alpha, and frame statistics.
- `src/input.js` — keyboard state encapsulated in a closure.
- `src/sim/ship.js` — DOM-independent ship state and pure `integrate(ship, input, dt)`.
- `src/sim/arena.js` — wrap-around arena boundaries.
- `src/render/` — DPR-aware resizable canvas and drawing/interpolation.
- `tests/` — tests for loop timing, input state, physics, wrapping, and interpolation.

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

## Submission

Create and push the required tag after committing the project:

```sh
git tag -a lab-01 -m "Lab 01 complete"
git push origin lab-01
```
