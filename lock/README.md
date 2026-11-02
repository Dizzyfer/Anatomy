# How a lock gets picked

A pin tumbler lock cut in half lengthways, with a pick and a tension wrench in the keyway. Use the key, or drag the pins up yourself and pick it.

**[▶ Play with it](https://dizzyfer.github.io/Anatomy/lock/)** · [light version](https://dizzyfer.github.io/Anatomy/lock/light.html) · [all figures](https://dizzyfer.github.io/Anatomy/)

![Picking, one pin set](docs/thumb.jpg)

## How it works

1. **The shear line.** The plug can't turn because pin stacks (key pin below, driver pin above, spring on top) cross the gap between the plug and the housing.
2. **The key** lifts each stack so the gap between its key pin and driver pin sits exactly on the shear line. Then nothing crosses it and the plug turns.
3. **Picking** works because nothing's machined perfectly. Put a little turning force on the plug and one pin binds before the others. Lift it until its gap reaches the shear line and the driver catches on the plug's ledge: a set pin. Then the next one binds.

## Ways to get it wrong

- **No tension:** pins just spring up and down and nothing sets.
- **Too much tension:** the binding pin jams and won't lift.
- **Too far, too fast:** an overset. The key pin goes up past the shear line and jams. Drop the tension and start again.
- **Security pins:** spool-shaped drivers catch early and give a false set. Ease the tension so the plug counter-rotates, and lift a touch more.

## What you can do

- **Drag a pin up** on the lock itself, or pick it with the pin buttons and the Lift slider. **Tension** on the wrench.
- **Pins:** standard or security. **Rake it**, use **the key** or **the wrong key**, **New lock** (new pin lengths and binding order).
- Slow-mo and Demo tour like the others.

Keyboard: ← → = pin, ↑ ↓ = lift, T / G = more / less tension, R = rake, K = key, N = new lock, S = slow-mo.

## The numbers

There aren't really any. The mechanism is real: pin stacks across a shear line, binding from machining tolerance, setting, oversetting, spool pins and false sets, raking. Every dimension, tolerance and how much tension is too much is made up. Only pick locks you own.

## How it's built

Built with [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22). To rebuild, drop `src/build.mjs` into Anatomy as `examples/lock/build.mjs` and run `node build.mjs` (`--light` for the light theme).
