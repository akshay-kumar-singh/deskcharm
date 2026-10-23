import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { POWERS, byId } from "../../data/charms.js";
import { reduceMotion } from "../../lib/motion.js";
import { DeskFrame, Dock, MenuBar, MockWindow } from "../../components/Desk.jsx";
import Hanger from "../../components/Hanger.jsx";
import { PlayIcon } from "../../components/Icons.jsx";
import SectionIntro from "../../components/SectionIntro.jsx";
import { createStage } from "./stage.js";
import "./Powers.css";

// Preview one effect on its own, for checking: #preview=thor:shake, or
// #preview=thor:shake@1.5 to hold it at 1.5 s in.
export function readPreview() {
  const m = location.hash.match(/^#preview=(\w+):(dbl|shake)(?:@([\d.]+))?$/);
  return m && POWERS[m[1]] ? { power: m[1], kind: m[2], at: m[3] ? +m[3] : null } : null;
}

export default function Powers({ ref, preview }) {
  const section = useRef(null), stageEl = useRef(null), screen = useRef(null), canvas = useRef(null);
  const win = useRef(null), slot = useRef(null), toast = useRef(null), stage = useRef(null);
  const first = preview?.power ?? "spider";
  // n counts selections, so picking a hero always hangs its charm afresh.
  const [sel, setSel] = useState({ power: first, charmId: POWERS[first].charm, n: 0 });
  // The stage's size, which the charm is hung to fit. Only remeasured on a
  // resize while nothing's playing, so an effect isn't left aiming at an old
  // charm position.
  const [box, setBox] = useState(null);
  const measure = () => { const r = stageEl.current.getBoundingClientRect(); return { W: r.width, H: r.height }; };

  useLayoutEffect(() => {
    const s = createStage({
      stage: stageEl.current, screen: screen.current, canvas: canvas.current, win: win.current,
      slot: slot.current, toast: toast.current, power: first, freezeAt: preview?.at ?? null,
    });
    stage.current = s;
    setBox(measure());
    const onResize = () => { if (!s.running()) setBox(measure()); };
    addEventListener("resize", onResize);
    return () => { removeEventListener("resize", onResize); s.destroy(); };
  }, []);

  useEffect(() => {
    if (preview) {
      const id = setTimeout(() => stage.current.play(preview.kind), 300);
      return () => clearTimeout(id);
    }
    if (reduceMotion) return;
    // Play the first move once the demo comes into view.
    const seen = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { seen.disconnect(); setTimeout(() => stage.current.play("dbl"), 400); }
    }, { threshold: 0.5 });
    seen.observe(stageEl.current);
    return () => seen.disconnect();
  }, [preview]);

  function select(power, charmId) {
    stage.current.select(power);
    setBox(measure());
    setSel(s => ({ power, charmId: charmId || POWERS[power].charm, n: s.n + 1 }));
  }
  // The effect aims at the charm, so the new one has to be hung first.
  function selectAndPlay(power) {
    flushSync(() => select(power));
    stage.current.play("dbl");
  }

  useImperativeHandle(ref, () => ({
    // For a charm picked further down the page: scroll up and show it off.
    showcase(power, charmId) {
      section.current.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      select(power, charmId);
      setTimeout(() => stage.current.play("dbl"), 650);
    },
  }));

  const P = POWERS[sel.power];
  return (
    <section className="block powers" id="powers" ref={section}>
      <div className="wrap">
        <div className="center">
          <SectionIntro
            kicker="Double-click. Or shake it hard."
            title={<>Every hero has <em className="s">two</em> moves.</>}
            lede={<>Double-click a hero and the window you're working in disappears in style. Its app hides, and <kbd>⌘</kbd><kbd>Tab</kbd> brings it back. Throw a hero about hard and the whole screen gets the treatment. That part is paint only, so your clicks and typing carry on underneath.</>}
          />
        </div>
        <div className="tabs" role="tablist">
          {Object.entries(POWERS).map(([p, Q]) => (
            <button key={p} type="button" role="tab" aria-selected={p === sel.power} onClick={() => selectAndPlay(p)}>
              <img src={byId(Q.charm).src} alt="" />{Q.name}
            </button>
          ))}
        </div>
        <div className="demo">
          <DeskFrame ref={stageEl} className="stage">
            <div className="screen" ref={screen}>
              <MenuBar app="Pages" menus={["File", "Edit", "Insert"]} />
              <MockWindow ref={win} title="Quarterly report" lines={[100, 92, 78, 84, 40]} />
              <div className="slot" ref={slot}>
                {box && <Hanger key={sel.n} charm={byId(sel.charmId)} size={Math.min(box.W, box.H) * 0.3} chain={box.H * 0.1} dur={3.4} delay={0} />}
              </div>
              <Dock colors={["#4c8df6", "#f5a623", "#34c759", "#ff6b6b", "#2b2b2b"]} />
            </div>
            <canvas ref={canvas} aria-hidden="true" />
            <div className="toast" ref={toast}>App hidden. ⌘-Tab brings it back.</div>
          </DeskFrame>
          <div className="info" role="tabpanel">
            <h3>{P.name}</h3>
            <p className="sub">{P.sub}</p>
            <Power gesture="Double-click" move={P.dbl} onPlay={() => stage.current.play("dbl")} />
            <Power gesture="Shake hard" move={P.shake} onPlay={() => stage.current.play("shake")} />
            <p className="note">These are quick sketches. In the app each effect plays across your whole screen, with sound.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Power({ gesture, move: [title, text], onPlay }) {
  return (
    <div className="power">
      <div className="head">
        <div><div className="gesture">{gesture}</div><h4>{title}</h4></div>
        <button className="play" type="button" onClick={onPlay}><PlayIcon />Play</button>
      </div>
      <p>{text}</p>
    </div>
  );
}
