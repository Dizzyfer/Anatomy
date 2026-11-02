# Ex t: dust and housekeeping

How dust-protected equipment fails in a real plant: slowly, through neglect, and then all at once.

**[▶ Play with it](https://dizzyfer.github.io/Anatomy/ex-t-dust/)** · [light version](https://dizzyfer.github.io/Anatomy/ex-t-dust/light.html) · [all figures](https://dizzyfer.github.io/Anatomy/)

![Coal dust smouldering on a floodlight](docs/thumb.jpg)

## The idea

Ex t does two jobs, and this shows one failure for each:

1. **Keep the outside cool enough.** The floodlight is marked T135 °C, but that only holds with up to 5 mm of dust on it. Leave the place uncleaned for months and the dust becomes a blanket: the light runs hotter underneath, and the thicker the layer, the lower the temperature it lights at. Eventually it **smoulders**.
2. **Keep the dust out.** The junction box is dust-tight, until a **blanking plug goes missing**. Dust drifts in and piles up round the terminals, and a loose terminal arcing in it sets it **burning inside the box**.

Neither of those goes bang on its own. What makes it go bang is normal work. This is a bag-tip station, so every bag tipped raises a cloud, which is why it's Zone 21. When the cloud drifts over the smouldering light or the burning box, it lights: that's the **primary**. The primary's blast throws everything that's settled on beams and ledges into the air, and that lights too: the **secondary**, the one that takes buildings. How big the secondary is depends entirely on how much dust was sitting around.

## What you can do

- **Dust:** coal, wood flour or sugar. Each has its own layer and cloud ignition temperatures. Coal smoulders easily but its cloud is hard to light; sugar is the other way round.
- **Since cleaned:** weeks without housekeeping, with the slider or by dragging up and down. Dust builds up on the light, the beam, the box and the floor. The notch marks where the light has 5 mm on it. **Let it go** runs the clock for you.
- **Light °C:** the temperature under the dust, against the light's T135 marking, the limit for this dust (the lower of ⅔ × cloud ignition temperature and the layer ignition temperature − 75 K), and where this layer lights.
- **JB:** sealed, or plug missing. The meter shows how full of dust it's getting.
- **TIP A BAG:** normal work, normal cloud. **CLEAN:** a vacuum, not an air hose.

Keyboard: up/down = weeks, Space = tip a bag, C = clean, P = plug, L = light, G = dust, S = slow-mo.

## The numbers

Real: the IEC 60079-14 dust rule (Tmax = the lower of ⅔ × cloud ignition temperature and 5 mm layer ignition temperature − 75 K, and the layer rule only covers up to 5 mm), and literature ignition temperatures (5 mm layer / cloud): coal 250 / 600 °C, wood flour 340 / 490 °C, sugar 480 / 490 °C.

Made up for the toy: how fast dust settles, how hot the light runs under it, how fast the box fills, and the timings. Real dust data comes from testing the actual dust. Don't design anything off it.

## How it's built

Built with [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22). To rebuild, drop `src/build.mjs` into Anatomy as `examples/ex-t-dust/build.mjs` and run `node build.mjs` (`--light` for the light theme).

MIT. See [LICENSE](../LICENSE).
