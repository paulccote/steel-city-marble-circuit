# Steel City Marble Circuit

A browser marble platformer in the spirit of Marble Blast, with every course
set somewhere real in Pittsburgh.

Roll a marble through the Duquesne Incline, out across the Sixth Street Bridge,
up the Cathedral of Learning, around the fountain at the Point, over Kennywood's
Jack Rabbit and down the Mount Washington city steps. Collect every gem, then
reach the pad. Beat par; then beat gold.

## Play

```
npm install
npm run dev
```

Then open the address it prints.

**Controls** — `W A S D` to roll, mouse to look, `Space` to jump, `Shift` to
brake, `E` to spend a powerup, `R` to restart, `Esc` to pause.

Append `?q=low`, `?q=medium` or `?q=high` to the URL to force a graphics tier.
`kablam.diag()` in the console reports your GPU, the render resolution, and
where frame time is actually going.

## What's in it

Six courses in teaching order, each built around a single idea and escalating
across three beats: rolling and climbing, the sustained curve, the measured jump
gap, gaining height, airtime, and finally ice.

## Physics

The marble is not a generic rigid body. It uses the Torque model the original
Marble Blast ran on: angular acceleration drives the marble, and friction at the
contact point is what converts spin into motion. That indirection is why the
marble feels heavy on a ramp, drifts on ice, and cannot exceed its rolling speed
by rolling alone.

The constants are the original datablock values, and the implementation is
verified against them in the browser — angular velocity converges to 74.8 rad/s
against a specified 75, and speed caps at exactly the specified 15 m/s.

| | |
|---|---|
| Max roll velocity | 15 m/s |
| Angular acceleration | 75 rad/s² |
| Gravity | 20 m/s² |
| Jump impulse | 7.5 m/s along the contact normal |
| Marble radius | 0.2 |
| Static / kinetic friction | 1.1 / 0.7 |

Collision is a swept sphere against a triangle soup over a uniform grid, with
continuous detection so a marble at full speed cannot tunnel a thin bridge deck.
Physics runs on a fixed 120 Hz step, decoupled from the frame rate.

## No assets

Every texture, normal map, sound effect and music cue is generated in code at
load time. The build is three files and makes zero asset requests, which is why
a course is playable about a second after the page opens.

## Build

```
npm run build      # -> dist/, three files, ~186 KB gzipped
npm run typecheck
```

Asset paths are relative, so `dist/` can be served from a domain root or a
subdirectory without reconfiguration.

## Credits

Inspired by Marble Blast Gold. No code or assets from that game are used here;
the physics constants were recovered from published open-source ports and
reimplemented.
