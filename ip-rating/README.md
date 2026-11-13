# IP ratings

A little interactive toy about what the two numbers in an IP code mean, and why a box can pass one test and fail the next. Build an enclosure, put it through the dust chamber, the hoses and the dunk tank, and see what code it earns.

**[▶ Play with it](https://dizzyfer.github.io/Anatomy/ip-rating/)** · [light version](https://dizzyfer.github.io/Anatomy/ip-rating/light.html)

## What you can do

- **Build the box:** a good, pinched or missing gasket; lid screws torqued or hand tight; a sealed gland, a cable too thin for it, or an open entry; and a drain hole or not.
- **Run the tests:**
  - **Dust (5X / 6X):** a tank rises round the box and fills with talcum powder while a pump holds a vacuum inside it.
  - **Jet (X5) and big jet (X6):** the nozzle on the tripod sweeps the lid and the faces.
  - **Dunk (X7):** the tank fills and the box sits a metre under.
  - **Hot jet (X9):** the lance comes right up close, hot and at high pressure.
- **Watch what gets in:** in x-ray the box is glass, so you can see the drips, the bubbles from the leak in the tank, and the pool on the floor. After every test the lid opens for inspection.
- **Read the plate:** the rating on the side of the box updates as tests pass and fail. Change the build and every result is wiped.
- Hand-tight screws pass the dunk and fail the big jet. A drain hole does the opposite. That's why double markings like IP66/IP67 exist.

Keyboard: 1 to 5 = run a test, Space = next untested one, G = gasket, L = lid screws, C = cable entry, D = drain hole, S = slow-mo, X = x-ray.

## The numbers

Real: the IEC 60529 test conditions. IPX5 is a 6.3 mm nozzle at 12.5 L/min and IPX6 a 12.5 mm nozzle at 100 L/min, both from 2.5 to 3 m for at least 3 minutes. IPX7 is the lowest point 1 m under water for 30 minutes. IPX9 is 80 °C water at 80 to 100 bar from 100 to 150 mm. Dust is talcum powder with the enclosure under vacuum. Numerals 7, 8 and 9 don't cover the jet numbers, so both get marked.

Made up: how much gets in through each fault, the pass marks, and the scale (the nozzle and the water depth are drawn far closer than they are). Real tests aren't done live either. It's a toy, so don't rate anything off it.

## How it's built

Mark II: drawn in real 3D with a small WebGL2 renderer (`mk2/engine.mjs` in this repo: soft shadows, ambient occlusion, ink outlines, bloom, x-ray), on top of the camera and page conventions of [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22). Drag to rotate, pinch or ctrl-scroll to zoom, double click to reset the view. To rebuild, copy this repo's `mk2/` folder into an Anatomy checkout, drop `src/build.mjs` in as `examples/ip-rating/build.mjs` and run `node build.mjs` (`--light` for the light theme).
