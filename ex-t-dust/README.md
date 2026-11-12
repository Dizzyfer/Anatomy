# Ex t: dust and housekeeping

How dust-protected equipment fails in a real plant: slowly, through neglect, and then all at once.

**[▶ Play with it](https://dizzyfer.github.io/Anatomy/ex-t-dust/)** · [light version](https://dizzyfer.github.io/Anatomy/ex-t-dust/light.html) · [all figures](https://dizzyfer.github.io/Anatomy/)

![Coal dust smouldering on a floodlight](docs/thumb.jpg)

## The idea

Ex t does two jobs, and each piece of kit here shows one of them failing.

1. **The light has to stay cool enough.** It's marked T135 °C, but that only holds with up to 5 mm of dust on it. Leave the place uncleaned for months and the dust becomes a blanket: the light runs hotter underneath, and the thicker the layer, the lower the temperature it lights at. Eventually the layer **smoulders**. That doesn't go bang on its own. Normal work does: this is a bag-tip station, so every bag raises a cloud (that's why it's Zone 21), and when a cloud drifts into the smoulder, it lights.
2. **The junction box has to keep dust out.** Lose a **blanking plug** and dust drifts in.
   - If it's non-conductive (group IIIB, like coal or wood flour) it's still wrong, but it won't short anything.
   - If it's **conductive (group IIIC, like aluminium)** it piles up round the terminals until it bridges two live ones. The short arcs, blasts the dust inside the box into a cloud and lights it, and the flame comes out of the plug hole. No bag needed. That's why IIIC kit has to be dust-tight.

Either way that's the **primary**. Its blast throws everything that's settled on beams and ledges into the air, and that lights too: the **secondary**, the one that takes buildings. How big the secondary is depends entirely on how much dust was sitting around.

## What you can do

- **Dust:** coal or wood flour (IIIB, non-conductive; each has its own layer ignition temperature, and coal smoulders far more easily), or aluminium (IIIC, conductive).
- **Since cleaned:** weeks without housekeeping, with the slider or by dragging up and down. Dust builds up on the light, the beam, the box and the floor. The notch marks where the light has 5 mm on it. **Let it go** runs the clock for you.
- **Light °C:** the temperature under the dust, against the light's T135 marking, the limit for this dust (the lower of ⅔ × cloud ignition temperature and the layer ignition temperature − 75 K), and where this layer lights.
- **JB:** sealed, or plug missing. The meter shows how full of dust it's getting, and where conductive dust bridges the terminals.
- **TIP A BAG:** normal work, normal cloud. **CLEAN:** a vacuum, not an air hose.

Keyboard: up/down = weeks, Space = tip a bag, C = clean, P = plug, L = light, G = dust, S = slow-mo.

## The numbers

Real: dust groups (IIIA fibres, IIIB non-conductive, IIIC conductive), the IEC 60079-14 dust rule (Tmax = the lower of ⅔ × cloud ignition temperature and 5 mm layer ignition temperature − 75 K, and the layer rule only covers up to 5 mm), and literature ignition temperatures (5 mm layer / cloud): coal 250 / 600 °C, wood flour 340 / 490 °C. Aluminium's ignition temperatures swing by hundreds of degrees with particle size, so none are claimed; in the box it's lit by an arc anyway.

Made up for the toy: how fast dust settles, how hot the light runs under it, how fast the box fills, and the timings. Real dust data comes from testing the actual dust. Don't design anything off it.

## How it's built

Mark II: drawn in real 3D with a small WebGL2 renderer (`mk2/engine.mjs` in this repo: soft shadows, ambient occlusion, ink outlines, bloom, x-ray), on top of the camera and page conventions of [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22). Drag to rotate, pinch or ctrl-scroll to zoom, double click to reset the view. To rebuild, copy this repo's `mk2/` folder into an Anatomy checkout, drop `src/build.mjs` in as `examples/ex-t-dust/build.mjs` and run `node build.mjs` (`--light` for the light theme).
