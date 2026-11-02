# Anatomy figures

Interactive engineering toys you can break. Poke them, push them past the limit, watch what happens.

**[▶ Gallery](https://dizzyfer.github.io/Anatomy/)**

| Figure | What it is |
|---|---|
| [Ex d flamepath](ex-d-flamepath/) · [play](https://dizzyfer.github.io/Anatomy/ex-d-flamepath/) | Pick a gas, set the flange gap, hit fire. Under MESG the box holds; over it, the bench goes up. |
| [Ex i: cable length](ex-i-spark/) · [play](https://dizzyfer.github.io/Anatomy/ex-i-spark/) | Set the barrier voltage, pay out cable, hit spark. ½CV² past the gas's MIE and Zone 1 goes up. |
| [Ex e: MDP and creepage](ex-e-terminals/) · [play](https://dizzyfer.github.io/Anatomy/ex-e-terminals/) | Load the terminals past the box's MDP and it cooks past T4; crank the voltage on a dirty surface and it tracks, or flashes over. |
| [Ex m: encapsulation](ex-m-potted/) · [play](https://dizzyfer.github.io/Anatomy/ex-m-potted/) | A relay sparks harmlessly inside the resin. Thin the pour, overheat the parts or pull the fuse, and the gas gets to the contacts. |
| [Ex t: dust and housekeeping](ex-t-dust/) · [play](https://dizzyfer.github.io/Anatomy/ex-t-dust/) | Months without cleaning bury a light until it smoulders and a bag cloud finds it; a missing plug lets conductive dust into a JB until it shorts and arcs. Primary, then secondary. |
| [Ex p: purge and pressure](ex-p-purge/) · [play](https://dizzyfer.github.io/Anatomy/ex-p-purge/) | Purge, pressurise, power. Skip the purge, bypass the interlock and open the door live, or take the purge air from inside the zone. |
| [How an LED works](led/) · [play](https://dizzyfer.github.io/Anatomy/led/) | mA in, volts, light and heat. CC vs CV, Vf bins, the heat path, thermal runaway, and a zoom into the die. |

All built with [**Anatomy**](https://github.com/wheresryan22/anatomy) by Ryan (wheresryan22), an open-source kit for interactive isometric figures. The drawing kit, isometric camera and WebGL layer are his work.

They're toys, not design tools.

## Adding a new figure

1. Make a folder, e.g. `my-thing/`, with its own `index.html` (and `src/`, `docs/` if needed).
2. Give its page footer a `../` link back to the gallery.
3. Add a card to the root `index.html` and a row to the table above.

It's live at `https://dizzyfer.github.io/Anatomy/my-thing/` as soon as Pages redeploys.

## Licence

MIT. See [LICENSE](LICENSE), which also carries Anatomy's MIT notice (the pages bundle its kit).
