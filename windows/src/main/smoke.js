import { app } from "electron";

// A check of the whole app, run instead of the user's session when
// DESKCHARM_SMOKE names a scratch folder for its data: every window made see-
// through and click-through, so nothing shows or gets in the way, then every
// power set off in turn and watched until it's done. With DESKCHARM_DEMO set,
// the double-click powers take a pretend window. Prints PASS/FAIL lines and quits.

const wait = ms => new Promise(r => setTimeout(r, ms));

export async function run(get) {
  let failures = 0;
  const check = (name, ok, extra = "") => {
    if (!ok) failures++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  [${extra}]` : ""}`);
  };
  const js = code => get().charmWin.webContents.executeJavaScript(code, true);

  for (let i = 0; i < 150; i++) {
    try { if (await js("!!window.__deskcharm?.overlay?.frontCtx && !!window.__deskcharm.image")) break; } catch { /* still loading */ }
    await wait(100);
  }
  check("charm page loaded with its art, overlay window attached", await js("!!window.__deskcharm?.overlay?.frontCtx && !!window.__deskcharm.image"));
  check("overlay opened as a window of its own", !!get().overlayWin && !get().overlayWin.isVisible());
  check("tray icon made", !!get().tray);
  await wait(1500);
  const tip = await js("JSON.stringify(window.__deskcharm.sim.tip)");
  check("the charm hangs on its chain", JSON.parse(tip).y > 200, tip);

  // Each power, watched: was the overlay shown, did anything get drawn, did
  // it end and hide the overlay again, and how far did it get.
  const powers = [
    ["blast", "spider-man web blast"], ["swarm", "batman bat swarm"], ["wall", "hulk wall smash"],
    ["symbiote", "venom symbiote"], ["storm", "thor thunderstorm"],
    ["yank", "spider-man web yank", "pulled"], ["tow", "batman grapple tow", "stowed"],
    ["lash", "venom tongue grab", "swallowed"], ["strike", "thor lightning strike", "stowed"],
    ["smash", "hulk window smash", "released"],
  ];
  for (const [method, label, stage] of powers) {
    await js(`window.__deskcharm.powers.${method}()`);
    let shown = false, inked = 0, gl = false, reached = !stage, done = false;
    const started = Date.now();
    while (Date.now() - started < 15000) {
      await wait(100);
      shown ||= !!get().overlayWin?.isVisible();
      const s = JSON.parse(await js(`(() => {
        const o = window.__deskcharm.overlay, e = o.entries[0]?.effect;
        let inked = 0;
        if (o.entries.length) {
          const c = o.frontCtx.canvas, d = o.frontCtx.getImageData(0, 0, c.width, c.height).data, b = o.backCtx.getImageData(0, 0, c.width, c.height).data;
          for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0 || b[i] > 0) inked++;
        }
        return JSON.stringify({ n: o.entries.length, inked, gl: o.glUsed, stage: ${stage ? `e ? e[${JSON.stringify(stage)}] ?? null : null` : "null"} });
      })()`));
      inked = Math.max(inked, s.inked);
      gl ||= s.gl;
      if (stage && s.stage !== null && s.stage !== undefined && s.stage !== false) reached = true;
      if (s.n === 0) { done = true; break; }
    }
    await wait(150);
    const hidden = !get().overlayWin?.isVisible();
    check(`${label}: shown, drawn, ended, overlay hidden${stage ? `, reached ${stage}` : ""}`,
      shown && inked > 20 && done && hidden && reached,
      `${Math.round((Date.now() - started) / 100) / 10}s, ${inked} inked samples${gl ? ", 3D" : ""}${stage ? `, ${stage}: ${reached}` : ""}`);
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll smoke checks passed.");
  app.exit(failures ? 1 : 0);
}
