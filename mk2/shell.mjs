// Mark II page shell: the stage (WebGL canvas, label overlay, particle canvas, HUD, toolbar), the control panel styling,
// and the page wrapper. Uses the Anatomy kit's theme variables so both themes still come from one build.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const engineScript = () => readFileSync(join(HERE, "engine.mjs"), "utf8").replace(/^export /gm, "");
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ICON = {
  xray: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 16.5 6v8L10 17.5 3.5 14V6Z"/><path d="M3.5 6 10 9.5 16.5 6M10 9.5v8" opacity=".55"/></svg>',
  zin: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11"/></svg>',
  zout: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10h11"/></svg>',
  home: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 1 0 2-4.5"/><path d="M3.5 3.5v3h3"/></svg>',
  full: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 7.5v-4h4M16.5 7.5v-4h-4M3.5 12.5v4h4M16.5 12.5v4h-4"/></svg>',
};

export const MK_CSS = (W, H) => `
.iso{--mk-accent:#58b8ff;--mk-accent-ink:#06121c;--mk-danger:#ff6a3d;--mk-good:#3ddc84;--mk-warn:#ffb347;--mk-line:#ffffff17;--mk-panel:#ffffff08;--mk-panel-hi:#ffffff12;--mk-stage-a:#202329;--mk-stage-b:#0c0d0f}
.iso[data-theme="light"]{--mk-accent:#1769d6;--mk-accent-ink:#ffffff;--mk-danger:#d9431c;--mk-good:#1d9a5b;--mk-warn:#c77a0a;--mk-line:#0000001c;--mk-panel:#00000006;--mk-panel-hi:#0000000d;--mk-stage-a:#ffffff;--mk-stage-b:#e4e4df}
.mk-page{width:min(1080px,100% - 28px);margin:36px auto 80px}
.mk-top{display:flex;align-items:baseline;gap:14px;margin:0 2px 14px;font-family:var(--anatomy-mono)}
.mk-top a{color:var(--anatomy-muted);text-decoration:none;font-size:12px}.mk-top a:hover{color:var(--anatomy-strong)}
.mk-top h1{margin:0;font:600 22px/1.2 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--anatomy-strong);letter-spacing:-.01em}
.mk-top .mk-figno{font-size:12px;color:var(--mk-accent);letter-spacing:.08em;text-transform:uppercase}
.mk-top .mk-sub{font-size:12px;color:var(--anatomy-muted);letter-spacing:.06em;text-transform:uppercase;margin-left:auto;text-align:right}
.mk-fig{margin:0;display:grid;gap:14px}
.mk-stage{position:relative;aspect-ratio:${W}/${H};border-radius:14px;overflow:hidden;background:radial-gradient(120% 90% at 50% 58%,var(--mk-stage-a) 0%,var(--mk-stage-b) 78%);box-shadow:0 0 0 1px var(--mk-line),0 18px 50px -24px #000;touch-action:pan-y;cursor:grab;outline:none;user-select:none;-webkit-user-select:none}
.mk-stage:focus-visible{box-shadow:0 0 0 2px var(--mk-accent)}
.mk-stage.mk-drag{cursor:grabbing}
.mk-gl{position:absolute;inset:0;width:100%;height:100%;display:block}
.mk-over{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.fx-smoke{position:absolute;left:50%;top:50%;width:var(--mk-fw,100%);height:var(--mk-fh,100%);transform:translate(-50%,-50%);pointer-events:none}
.mk-hud{position:absolute;font-family:var(--anatomy-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-muted);pointer-events:none;line-height:1}
.mk-hud.tl{left:16px;top:15px}.mk-hud.tl b{color:var(--anatomy-strong);font-weight:600;margin-right:8px}
.mk-read{position:absolute;right:14px;top:11px;font-family:var(--anatomy-mono);font-size:12px;font-variant-numeric:tabular-nums;color:var(--anatomy-strong);background:var(--mk-panel-hi);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid var(--mk-line);border-radius:999px;padding:6px 12px;pointer-events:none;white-space:nowrap}
.mk-read:empty{display:none}
.mk-story{position:absolute;left:16px;right:16px;bottom:14px;max-width:640px;margin:0 auto;text-align:center;font:500 13.5px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--anatomy-strong);text-shadow:0 1px 2px var(--mk-stage-b),0 0 12px var(--mk-stage-b);pointer-events:none;text-wrap:balance}
.mk-tools{position:absolute;right:12px;bottom:12px;display:flex;flex-direction:column;gap:6px}
.mk-tools button{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;border:1px solid var(--mk-line);background:var(--mk-panel-hi);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:var(--anatomy-text);cursor:pointer;padding:0}
.mk-tools button:hover{color:var(--anatomy-strong);border-color:var(--anatomy-mid)}
.mk-tools button[aria-pressed="true"]{color:var(--mk-accent-ink);background:var(--mk-accent);border-color:var(--mk-accent)}
.mk-tools svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.mk-tools button[data-mk="xray"]{width:auto;padding:0 10px 0 8px;display:flex;gap:6px;font:600 11px var(--anatomy-mono);letter-spacing:.06em;text-transform:uppercase;position:absolute;right:42px;bottom:0;white-space:nowrap}
.mk-hint{position:absolute;left:50%;top:14px;transform:translateX(-50%);font:11px var(--anatomy-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--anatomy-muted);background:var(--mk-panel-hi);border:1px solid var(--mk-line);border-radius:999px;padding:5px 11px;pointer-events:none;transition:opacity .6s;white-space:nowrap}
.mk-used .mk-hint{opacity:0}
.mk-nogl::after{content:"This figure needs WebGL2, which this browser has switched off.";position:absolute;inset:0;display:grid;place-items:center;padding:24px;text-align:center;color:var(--anatomy-text);font:14px var(--anatomy-mono)}
.mk-co path{fill:none;stroke:var(--mk-accent);stroke-width:1;opacity:.85}.mk-co circle{fill:var(--mk-accent)}.mk-co text{font:600 calc(11px*var(--mk-ts,1)) var(--anatomy-mono);fill:var(--anatomy-strong);paint-order:stroke;stroke:var(--mk-stage-b);stroke-width:3px;stroke-linejoin:round}.mk-co text.sub{font-weight:400;font-size:calc(10px*var(--mk-ts,1));fill:var(--anatomy-text)}
.mk-lab{font:600 calc(11px*var(--mk-ts,1)) var(--anatomy-mono);fill:var(--anatomy-strong);paint-order:stroke;stroke:var(--mk-stage-b);stroke-width:3px;stroke-linejoin:round}
.mk-inset{position:absolute;left:14px;top:40px;border:1px solid var(--mk-line);border-radius:10px;overflow:hidden;pointer-events:none;background:var(--mk-panel-hi);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.mk-inset canvas{width:100%;height:100%;display:block}
.ctl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 26px;padding:16px 18px;border-radius:14px;background:var(--mk-panel);box-shadow:0 0 0 1px var(--mk-line);font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-text);align-content:start}
.ctl-row{display:flex;flex-wrap:wrap;gap:7px;align-items:center;min-height:38px}
.ctl-row.wide{grid-column:1/-1}
.ctl-label{flex:none;width:82px;text-transform:uppercase;letter-spacing:.09em;font-size:10.5px;color:var(--anatomy-muted)}
.ctl button{font:inherit;color:var(--anatomy-text);background:var(--mk-panel-hi);border:1px solid var(--mk-line);border-radius:9px;padding:7px 11px;cursor:pointer;line-height:1.2;text-align:left;min-height:34px;transition:background .12s,border-color .12s,color .12s,transform .05s}
.ctl button:hover{border-color:var(--anatomy-mid);color:var(--anatomy-strong)}
.ctl button:active{transform:translateY(1px)}
.ctl button:disabled{opacity:.45;cursor:default}
.ctl button[aria-pressed="true"]{color:var(--mk-accent-ink);background:var(--mk-accent);border-color:var(--mk-accent)}
.ctl button[aria-pressed="true"] small{color:inherit;opacity:.75}
.ctl button.danger{color:var(--mk-danger);border-color:color-mix(in srgb,var(--mk-danger) 55%,transparent)}
.ctl button.danger:hover{background:color-mix(in srgb,var(--mk-danger) 14%,transparent)}
.ctl button.danger[aria-pressed="true"]{background:var(--mk-danger);border-color:var(--mk-danger);color:#fff}
.ctl button small{display:block;font-size:10px;color:var(--anatomy-muted);margin-top:1px}
.ctl output{flex:none;min-width:96px;text-align:right;color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.slide{position:relative;flex:1;min-width:110px;display:flex;align-items:center}
.slide input{width:100%;margin:0;accent-color:var(--mk-accent);height:22px}
.meter{position:relative;flex:1;min-width:100px;height:8px;border-radius:5px;background:var(--mk-panel-hi);box-shadow:inset 0 0 0 1px var(--mk-line)}
.meter .fill{position:absolute;left:0;top:0;bottom:0;border-radius:5px;transition:width .12s linear;background:var(--mk-good)}
.meter .fill[data-state="warn"]{background:var(--mk-warn)}.meter .fill[data-state="bad"]{background:var(--mk-danger);box-shadow:0 0 10px var(--mk-danger)}.meter .fill[data-state="lit"]{background:var(--mk-accent)}
.mark{position:absolute;top:-5px;bottom:-5px;width:0;border-left:1.5px solid var(--mk-danger);pointer-events:none;opacity:.9}
.mark::after{content:attr(data-label);position:absolute;bottom:100%;left:-2px;font-size:9.5px;white-space:nowrap;color:var(--mk-danger);transform:translateY(-1px)}
#stats{flex:1;font-size:12px;color:var(--anatomy-text);line-height:1.55}#stats b{color:var(--anatomy-strong);font-weight:600}
.mk-cap{color:var(--anatomy-text);font-size:14px;line-height:1.65;max-width:76ch;margin:6px 2px 0}
.mk-keys{display:flex;flex-wrap:wrap;gap:6px 18px;color:var(--anatomy-muted);font-size:12.5px;margin:0 2px}
.mk-foot{font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-muted);margin:26px 2px 8px;line-height:1.65;max-width:100ch}
.mk-foot a{color:inherit}
.mk-fig:fullscreen{background:var(--anatomy-page);padding:12px;grid-template-columns:minmax(0,1fr) 340px;grid-template-rows:minmax(0,1fr);gap:12px;width:100vw;height:100vh;box-sizing:border-box}
.mk-fig:fullscreen .mk-stage{aspect-ratio:auto;height:100%}
.mk-fig:fullscreen .ctl{grid-template-columns:1fr;overflow:auto}
.mk-fig:fullscreen .mk-cap,.mk-fig:fullscreen .mk-keys{display:none}
@media (max-width:820px){.ctl{grid-template-columns:1fr}.mk-top .mk-sub{display:none}}
@media (max-width:820px) and (orientation:portrait){.mk-fig:fullscreen{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) 42vh}}
@media (max-width:560px){.mk-page{width:calc(100% - 16px);margin-top:18px}.mk-stage{border-radius:10px;aspect-ratio:1/1.08}.mk-story{font-size:12.5px;top:42px;bottom:auto;left:12px;right:12px}.mk-inset{top:auto;bottom:10px;left:10px}.mk-tools{flex-direction:row;right:10px;bottom:10px}.mk-tools button[data-mk="xray"]{position:static}.mk-hint{top:auto;bottom:56px;left:auto;right:10px;transform:none}.ctl{padding:12px}.ctl-label{width:64px}.ctl button small{display:none}.ctl output{min-width:78px}.mk-hud.tl span{display:none}.mk-read{font-size:11px;padding:5px 9px}.mk-tools button{width:30px;height:30px}.mk-tools button[data-mk="zin"],.mk-tools button[data-mk="zout"]{display:none}}
`;

export function stageHtml({ W, H, label, keysHelp, fig, title, extra = "", xray = true }) {
  return `<div class="mk-stage fx-stage" tabindex="0" role="group" aria-label="${esc(keysHelp || title)}">
<svg class="mk-over" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><g data-part="scene"></g></svg>
<canvas class="fx-smoke" aria-hidden="true"></canvas>${extra}
<div class="mk-hud tl" aria-hidden="true"><b>${esc(fig)}</b><span>${esc(title)}</span></div>
<div class="mk-read" data-readout aria-live="off"></div>
<div class="mk-hint" aria-hidden="true">Drag to rotate</div>
<div class="mk-story" id="shot" aria-live="polite"></div>
<div class="mk-tools">${xray ? `<button type="button" data-mk="xray" aria-pressed="false" title="X-ray: see inside (X)">${ICON.xray}X-ray</button>` : ""}<button type="button" data-mk="zin" title="Zoom in">${ICON.zin}</button><button type="button" data-mk="zout" title="Zoom out">${ICON.zout}</button><button type="button" data-mk="home" title="Reset the view (double click)">${ICON.home}</button><button type="button" data-mk="full" title="Full screen">${ICON.full}</button></div>
</div>`;
}

export function pageMk2({ k, title, fig, hint, theme, W, H, stage, controls, caption, keys = [], foot, script, css = "" }) {
  const keyHtml = keys.length ? `<div class="mk-keys">${keys.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : "";
  const body = `<header class="mk-top"><a href="../" aria-label="All figures">&larr; Anatomy</a><span class="mk-figno">${esc(fig)}</span><h1>${esc(title)}</h1><span class="mk-sub">${esc(hint || "")}</span></header>
<figure class="mk-fig" data-mk-full>${stage}${controls}</figure>
${caption ? `<p class="mk-cap">${esc(caption)}</p>` : ""}${keyHtml}${foot}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} · Anatomy</title><style>${k.ISO_CSS}
*{box-sizing:border-box}html{color-scheme:dark}body[data-theme="light"]{color-scheme:light}
body{margin:0;background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
${MK_CSS(W, H)}${css}</style></head><body class="iso" data-theme="${theme}"><main class="mk-page">${body}</main><script type="module">${script.replace(/<\/(script)/gi, "<\\/$1")}</script></body></html>`;
}

export function footHtml({ real, made, slug, theme }) {
  const other = theme === "light" ? ["index.html", "Dark version"] : ["light.html", "Light version"];
  return `<p class="mk-foot">A toy, not a simulator. <b>Real:</b> ${real} <b>Made up:</b> ${made}<br>Built with <a href="https://github.com/wheresryan22/anatomy">Anatomy</a> by Ryan (MIT). · <a href="${other[0]}">${other[1]}</a> · <a href="../">More figures</a> · <a href="https://github.com/Dizzyfer/Anatomy/tree/main/${slug}">Source</a></p>`;
}
