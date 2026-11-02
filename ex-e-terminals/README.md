# Ex e: MDP and creepage

Ex e has no flamepath to save it. It works by never making a spark or a hot surface in the first place. This shows the two ways that goes wrong.

**[▶ Play with it](https://dizzyfer.github.io/Anatomy/ex-e-terminals/)** · [light version](https://dizzyfer.github.io/Anatomy/ex-e-terminals/light.html) · [all figures](https://dizzyfer.github.io/Anatomy/)

![Terminals cooking](docs/thumb.jpg)

## What you can do

- **Pick the gas:** diethyl ether (T4, lights at ~160 °C), carbon disulphide (T6, ~90 °C) or diesel (T3, ~240 °C).
- **Heat (MDP):** set how many circuits are populated and the current per circuit. Every circuit dissipates I²R. The Heat meter shows that against the box's maximum dissipated power. The Surface °C meter shows the box temperature against T4 (135 °C) and the gas's autoignition temperature.
  - Hit **ENERGISE** and the box warms up. Over MDP, the surface goes past T4. When it reaches the gas's autoignition temperature, the vapour lights itself on the hot metal. No spark needed.
  - Carbon disulphide lights at 90 °C, below what a T4 box is allowed to reach, so it goes up even with the box inside its MDP. Wrong T-class for the gas.
- **Insulation:** set the working voltage and pick a **Clean** or **Dusty & damp** surface.
  - **Creepage** (along the surface) hates dirt. Over the limit, leakage current creeps across the surface and cooks the plastic into a carbon track. Carbon conducts, so when the track bridges two terminals it shorts and arcs, and the arc lights the gas.
  - **Clearance** (through air) doesn't care how clean it is. Over the limit, it flashes over straight away.
- Drag up and down on the box for current, tap it to switch on and off. Slow-mo and Demo tour like the others.

Keyboard: up/down = amps, left/right = volts, +/- = circuits, D = dirty, Space = energise, S = slow-mo.

## The numbers

Real: T4 is 135 °C max surface. Autoignition temperatures: diethyl ether ~160 °C (T4), carbon disulphide ~90 °C (T6), diesel ~240 °C (T3).

Made up for the toy: 2.5 mΩ per circuit, a 10 W MDP that sits exactly at 135 °C, and the creepage (550 V clean, 230 V dirty) and clearance (800 V) limits. Real figures come off the box and terminal certificates and the IEC 60079-7 tables. Don't design anything off it.

## How it's built

Built with [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22). To rebuild, drop `src/build.mjs` into Anatomy as `examples/ex-e-terminals/build.mjs` and run `node build.mjs` (`--light` for the light theme).

MIT. See [LICENSE](../LICENSE).
