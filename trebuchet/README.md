# Trebuchet

A little interactive toy about how a trebuchet throws: a falling box, a long arm, and a sling that has to let go at exactly the right moment. There is a castle wall 200 metres away. No engineering value, just siege warfare.

**[▶ Play with it](https://dizzyfer.github.io/Anatomy/trebuchet/)** · [light version](https://dizzyfer.github.io/Anatomy/trebuchet/light.html)

## What you can do

- **Set the counterweight** from 1 to 14 tonnes. The red mark on the slider is what the arm is good for. Go past it and find out.
- **Set the sling length.** A longer sling throws harder but lets go later, so it has to be tuned with the release.
- **Set when it lets go:** the angle of the sling to the arm at the moment the ring slips off the pin. Early, and the load goes up, or backwards. Late, and it goes into the ground in front of you.
- **Pick the load:** a 100 kg stone, a burning barrel, or a cow.
- **LOOSE** and see where it comes down: into the wall (blocks come out and whatever was above them drops), short, bounced into the foot of the wall, over the wall into the keep, backwards through your own tent, or straight up and back down on your own trebuchet.
- **Breach the wall:** knock a column out all the way to the ground. Rebuild puts the wall, the tent and the field back.
- **X-ray** is the tracer: a multiple exposure of the arm and sling through the swing, and the path the load took.

Keyboard: left/right = counterweight (Shift for big steps), up/down = sling, Q/E = let go earlier/later, 1 to 3 = load, Space = loose, R = rebuild, X = tracer.

## The numbers

Real: the swing. The arm and the sling are solved step by step as a two-part pendulum driven by the falling counterweight, with the load sliding along a trough until the sling lifts it. So the way the throw changes with counterweight, sling length and release point is how a trebuchet behaves, including the ways it goes wrong.

Made up: the numbers. The counterweight is fixed to the arm (real ones usually hang from it), and there is no air drag or friction, so it out-throws a real machine. The arm's 10 tonne limit, the weights, how the wall takes a hit, and the cow are invented. The field is squashed so the castle fits: the wall is 200 m away but drawn about four times closer than the machine's scale. It's a toy, so don't besiege anything off it.

## How it's built

Mark II: drawn in real 3D with a small WebGL2 renderer (`mk2/engine.mjs` in this repo: soft shadows, ambient occlusion, ink outlines, bloom, x-ray), on top of the camera and page conventions of [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22). Drag to rotate, pinch or ctrl-scroll to zoom, double click to reset the view. To rebuild, copy this repo's `mk2/` folder into an Anatomy checkout, drop `src/build.mjs` in as `examples/trebuchet/build.mjs` and run `node build.mjs` (`--light` for the light theme).
