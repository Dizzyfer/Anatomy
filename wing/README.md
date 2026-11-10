# Aeroplane wing

A 787-size wing on a stand, with real potential flow round a slice of it. Fly it slow until it stalls, pull g until it snaps, or dive it past the flutter speed.

**[▶ Play with it](https://dizzyfer.github.io/Anatomy/wing/)** · [light version](https://dizzyfer.github.io/Anatomy/wing/light.html) · [all figures](https://dizzyfer.github.io/Anatomy/)

![The wing at 2.5 g, bending up, with the flow inset](docs/thumb.jpg)

## How it works

1. **Lift is turning air down.** Tilt the wing to the oncoming air and the flow over the top speeds up and drops in pressure, the flow underneath pushes up, and the air leaves the trailing edge heading down. Lift = ½ρV²S·CL.
2. **No equal transit time.** The yellow lines in the inset are air released together. The top half reaches the back first. The inset is real potential flow (a Joukowski aerofoil with the Kutta condition).
3. **Stall.** Lift goes with speed squared, so slow down and the angle of attack goes up until the flow can't follow the top surface. It separates, churns, and the lift collapses. Flaps and slats push the stall out; ice brings it in.
4. **Bending.** The wing's a cantilever: the top skin is squashed (blue), the bottom stretched (red), the root carries the lot. The tip goes up several metres.
5. **The rules.** Limit load 2.5 g (14 CFR 25.337). Ultimate is 1.5 × limit (25.303) and has to hold for three seconds. No flutter beyond the dive speed (25.629).
6. **Flutter.** Too fast and the air feeds energy into the wing's own bending and twisting. Every swing gets bigger.

## What you can do

- **Speed** and **angle of attack** sliders, or **hold** 1 g, 2.5 g, 4 g or -1 g.
- **Flaps + slats**, **ice**, a **gust**, and a **fatigue crack** in the bottom skin.
- Meters for lift (g and kN), drag and L/D, bending against ultimate with the tip deflection, and flutter.
- The root's cut face shows the wing box, with the skins coloured by stress. Tip vortices trail off the end.
- New wing, Slow-mo and Demo tour.

Keyboard: left/right = speed, up/down = angle of attack, F = flaps, G = gust, I = ice, S = slow-mo.

## The numbers

Real: the lift equation, stall, induced drag, the inset's potential flow, the wing as a cantilever, flutter, and the certification rules above. Real tests: the 787's ultimate load test ([28 March 2010, 150 %, tips up about 7.6 m](https://www.reinforcedplastics.com/content/news/boeing-completes-787-ultimate-load-wing-test)) and the 777-9 test wing that failed at 148 % in 2019 ([MiGFlug](https://migflug.com/afterburner/?p=30696032)).

Made up for the toy: the aeroplane's numbers, the flutter speed, the stall and separation model, the crack, and where it breaks.

## How it's built

Built with [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22). To rebuild, drop `src/build.mjs` and `src/solid.mjs` into Anatomy as `examples/wing/` and run `node build.mjs` (`--light` for the light theme).
