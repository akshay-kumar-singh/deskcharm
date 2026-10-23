import { useEffect, useRef, useState } from "react";
import { CHARMS, POWERS } from "../../data/charms.js";
import { DeskFrame, Dock, MenuBar, MockWindow } from "../../components/Desk.jsx";
import DownloadButton from "../../components/DownloadButton.jsx";
import { createChain } from "./chain.js";
import "./Hero.css";

export default function Hero() {
  const desk = useRef(null), canvas = useRef(null), chain = useRef(null);
  const [picked, setPicked] = useState(null);
  const shown = picked ?? CHARMS[0];

  useEffect(() => {
    chain.current = createChain(desk.current, canvas.current, CHARMS[0]);
    return () => chain.current.destroy();
  }, []);

  function pick(c) {
    setPicked(c);
    chain.current.setCharm(c);
  }

  return (
    <header className="hero">
      <div className="wrap">
        <div>
          <p className="kicker">A little mischief. A lot of heroes.</p>
          <h1>Superheroes, <em className="s">hanging</em> off your screen.</h1>
          <p className="lede">DeskCharm hangs a charm from the top of your Mac's screen on a gold chain. Fling it and it swings with real physics. Double-click it, or shake it hard, and its hero gets to work.</p>
          <div className="actions">
            <DownloadButton />
            <a className="btn btn-ghost" href="#powers">See the powers</a>
          </div>
          <p className="meta">Free · v1.0 · 19 MB · macOS 14 or later · Apple silicon &amp; Intel · <a href="#terminal">Install from Terminal</a></p>
        </div>
        <div>
          <DeskFrame ref={desk}>
            <MenuBar app="Finder" menus={["File", "Edit", "View", "Go"]} date="Fri 23 Oct" />
            <MockWindow title="Moodboard" lines={[100, 85, 70]}>
              <div className="tile">
                <i style={{ background: "#f3c9a8" }} /><i style={{ background: "#b9c8e8" }} /><i style={{ background: "#d7e3c3" }} />
              </div>
            </MockWindow>
            <Dock colors={["#4c8df6", "#f5a623", "#34c759", "#ff6b6b", "#a479f2", "#2b2b2b"]} />
            <canvas ref={canvas} aria-hidden="true" />
          </DeskFrame>
          <div className="picker" aria-label="Pick a charm">
            {CHARMS.map(c => (
              <button key={c.id} type="button" title={c.name} aria-label={c.name} aria-pressed={c === shown} onClick={() => pick(c)}>
                <img src={c.src} alt="" />
              </button>
            ))}
          </div>
          <p className="picker-label">{picked ? <><b>{picked.name}</b>{powersOf(picked)}</> : "Grab the charm and fling it."}</p>
        </div>
      </div>
    </header>
  );
}

function powersOf(c) {
  const p = POWERS[c.power];
  return p ? ` · ${p.dbl[0]} and ${p.shake[0].toLowerCase()}` : " · hangs and swings";
}
