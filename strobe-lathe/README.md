# Stroboscopic effect

A little interactive toy about why a flickering light over a spinning machine is a safety problem and not just an annoyance. A lathe, a light, and a crash-test dummy who believes what it sees.

**[▶ Play with it](https://dizzyfer.github.io/Anatomy/strobe-lathe/)** · [light version](https://dizzyfer.github.io/Anatomy/strobe-lathe/light.html)

## What you can do

- **Set the spindle speed** from 0 to 3,000 rpm. The red notch on the slider is the speed where the chuck will look stopped under the light you've picked.
- **Pick the light:** a good driver (steady), a cheap one (100 Hz ripple, the full depth), or PWM dimming with its own rate and dimming level.
- **Watch the chuck:** it's drawn the way the eye gets it. A blur under steady light. Under pulsed light, ghost jaws, jaws creeping backwards or forwards, or jaws standing dead still.
- **The scope** shows the light's output over 40 ms, with a tick every time a jaw comes past. When the ticks line up with the pulses, the chuck freezes.
- **REACH IN:** the dummy only reaches in when the chuck looks stopped. If it's really stopped, nothing happens. If it only looks stopped, the dummy loses an arm, then its head, and goes over the top of the lathe.
- **X-ray** is the truth view: the headstock turns to glass and the chuck is drawn as the blur it really is. The tacho on top of the headstock tells the truth the whole time, too.

Keyboard: arrows = spindle speed (Shift for big steps), L = light, Space = reach in, S = slow-mo, X = truth view.

## The numbers

Real: the arithmetic. Under light pulsing at f hertz, a three-jaw chuck looks stopped at 20 × f rpm and its multiples (2,000 rpm under 100 Hz), and seems to turn slowly either side of that. Rectified 50 Hz mains ripples at 100 Hz. SVM is the stroboscopic visibility measure, for 80 Hz to 2 kHz: at 1 an average observer spots the effect half the time, and the EU ecodesign limit is 0.4.

Made up: how sharp each light makes the frozen image, the dummy's judgement, and what the lathe does to it. It's a toy, so don't specify a driver off it.

## How it's built

Mark II: drawn in real 3D with a small WebGL2 renderer (`mk2/engine.mjs` in this repo: soft shadows, ambient occlusion, ink outlines, bloom, x-ray), on top of the camera and page conventions of [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22). Drag to rotate, pinch or ctrl-scroll to zoom, double click to reset the view. To rebuild, copy this repo's `mk2/` folder into an Anatomy checkout, drop `src/build.mjs` in as `examples/strobe-lathe/build.mjs` and run `node build.mjs` (`--light` for the light theme).
