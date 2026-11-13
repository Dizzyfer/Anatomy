# Espresso machine

A little interactive toy about what actually changes when you fiddle with an espresso machine, and about the small pressure vessel hiding behind the shiny front. No engineering value. Coffee first.

**[▶ Play with it](https://dizzyfer.github.io/Anatomy/espresso/)** · [light version](https://dizzyfer.github.io/Anatomy/espresso/light.html)

## What you can do

- **Dial it in:** grind (1 fine to 10 coarse), dose, pump pressure and water temperature, then **PULL A SHOT**. The timer on the machine and the scale under the glass run while it pours.
- **Read the shot:** a dialled-in shot runs dark, then caramel, then blond, and lands in the green bands on the shot time and extraction meters. Too coarse and it gushes out pale and sour. Too fine and the pump sits at full pressure while the puck chokes and drips.
- **Tamp it crooked** and the water finds a crack and goes through that instead of the coffee: it sprays, runs fast and tastes sour and bitter at once. Too much pressure on a very fine puck does the same.
- **X-ray** turns the case to glass and cuts the portafilter open: copper boiler, pump, pressurestat, safety valve, and the water going down through the puck.
- **Break the boiler:** stick the pressurestat on and the element never switches off. The gauge climbs past the red line until the safety valve lifts and dumps steam out of the top. Jam the valve as well and the boiler leaves through the roof.

Keyboard: left/right = grind, up/down = pump pressure, T = tamp, B = boiler fault, Space = pull a shot, X = x-ray.

## The numbers

Real: the classic recipe. About 9 bar at the puck, water at 90 to 96 °C, 20 to 30 seconds, roughly 1 part coffee to 2 parts drink (18 g in, 36 g out), and 18 to 22 % of the dry coffee extracted: sour and thin below that, bitter above. A steam boiler runs at about 1.0 to 1.3 bar on a pressurestat, the gauge is red-lined at 2 bar, and a safety valve sits on top (1.8 bar is a common setting).

Made up: every number the toy computes. How fast each grind flows, how much it extracts, when it channels, and the 3 bar the boiler lets go at. Taste is a lookup, not chemistry, and shots run four times faster than real ones. It's a toy, so don't dial in your grinder off it.

## How it's built

Mark II: drawn in real 3D with a small WebGL2 renderer (`mk2/engine.mjs` in this repo: soft shadows, ambient occlusion, ink outlines, bloom, x-ray), on top of the camera and page conventions of [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22). Drag to rotate, pinch or ctrl-scroll to zoom, double click to reset the view. To rebuild, copy this repo's `mk2/` folder into an Anatomy checkout, drop `src/build.mjs` in as `examples/espresso/build.mjs` and run `node build.mjs` (`--light` for the light theme).
