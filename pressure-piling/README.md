# Pressure piling

A little interactive toy that shows why two flameproof compartments joined by an opening can be far worse than one. The explosion in the first compartment pumps unburnt gas into the second, the flame follows it through, and the second one goes off from a pressure it was never meant to start at.

**[▶ Play with it](https://dizzyfer.github.io/Anatomy/pressure-piling/)** · [light version](https://dizzyfer.github.io/Anatomy/pressure-piling/light.html)

## What you can do

- **Pick a gas:** methane, propane, ethylene or hydrogen.
- **Pick where the spark is:** the far end of the main compartment, right by the opening, or in the second compartment.
- **Set the opening:** from sealed, through a few millimetres, up to 40 mm.
- **Set the size of the second compartment:** from a tenth of the main one up to the same size. It grows and shrinks on the bench.
- **FIRE:** the shot replays in slow motion, and slows right down for the few milliseconds that matter. Watch the flame spread, the fog thicken in the second compartment as gas is packed into it, and the jet follow.
  - The scope shows both pressures against what one box on its own makes, what the enclosure was tested to, and where the cover lets go.
  - Small second compartment, middling opening, spark at the far end: the cover leaves.
  - Sealed, or lit right next to the opening: nothing much happens.
- **X-ray** is a cutaway: covers and front walls off, the walls either side of the opening turned to glass.

Keyboard: left and right = opening, up and down = second compartment, G = gas, I = ignition point, Space = fire, S = slow-mo, X = x-ray.

## The numbers

Real: pressure piling as IEC 60079-1 defines it, and the tell-tales the standard gives the test lab (results in a series differing by a factor of 1.5 or more, or a pressure rise time under 5 ms). The overpressure type test is 1.5 times the reference pressure. A gas explosion in a closed box from atmospheric makes roughly 7 to 8 bar.

Made up: everything else. The enclosure, the flame speeds, the flow through the opening, the pressure where the cover lets go and the fine opening that stops the flame all come from a lumped two-volume model tuned to show the shape of the thing. Pressures are gauge. It's a toy, so don't design anything off it.

## How it's built

Mark II: drawn in real 3D with a small WebGL2 renderer (`mk2/engine.mjs` in this repo: soft shadows, ambient occlusion, ink outlines, bloom, x-ray), on top of the camera and page conventions of [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22). Drag to rotate, pinch or ctrl-scroll to zoom, double click to reset the view. To rebuild, copy this repo's `mk2/` folder into an Anatomy checkout, drop `src/build.mjs` in as `examples/pressure-piling/build.mjs` and run `node build.mjs` (`--light` for the light theme).
