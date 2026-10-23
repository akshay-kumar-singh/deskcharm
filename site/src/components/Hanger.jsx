import { useState } from "react";
import { dims } from "../data/charms.js";
import "./Hanger.css";

// A charm hung from a thread whose top is the element's origin, so the whole
// thing swings about the top like a pendulum. size sets the charm's size by
// area, chain the thread's length; dur and delay default to a random sway.
export default function Hanger({ charm: c, size, chain, dur, delay, style }) {
  const [timing] = useState(() => ({ dur: dur || 3.6 + Math.random() * 1.6, delay: delay ?? -Math.random() * 4 }));
  const [w, h] = dims(c, size);
  // Charms hung from a corner and turned (Thor, Venom) would sit off to one
  // side; shift the pivot so the art itself is centred.
  const cx = (0.5 - c.attach[0]) * w, cy = (0.5 - c.attach[1]) * h;
  return (
    <div className="hanger" style={{
      marginLeft: -(cx * Math.cos(c.tilt) - cy * Math.sin(c.tilt)),
      "--dur": `${timing.dur}s`, "--delay": `${timing.delay}s`, ...style,
    }}>
      <i className="thread" style={{ height: chain + 2 }} />
      <img src={c.src} alt={`${c.name} charm`} width={w | 0} height={h | 0} style={{
        left: -c.attach[0] * w, top: chain - c.attach[1] * h,
        transformOrigin: `${c.attach[0] * w}px ${c.attach[1] * h}px`, transform: `rotate(${c.tilt}rad)`,
      }} />
    </div>
  );
}
