import { byId } from "../data/charms.js";
import { DOWNLOADS } from "../config.js";
import { VISITOR_OS } from "../lib/platform.js";
import DownloadButton, { OtherDownload } from "../components/DownloadButton.jsx";
import Hanger from "../components/Hanger.jsx";
import SectionIntro from "../components/SectionIntro.jsx";
import "./Cta.css";

// The charms hung along the top, left to right.
const ROW = ["Iron-Man", "Bat-Man", "Spider-Man", "Hulk", "Thor", "Super-Man", "Venom"];

export default function Cta() {
  const download = DOWNLOADS[VISITOR_OS];
  return (
    <section className="cta" id="cta">
      <div className="row">
        {ROW.map((id, i) => (
          <Hanger key={id} charm={byId(id)} size={118} chain={40 + (i % 2) * 34 + (i === 3 ? 20 : 0)}
            style={{ "--x": `${8 + i * (84 / (ROW.length - 1))}%` }} />
        ))}
      </div>
      <SectionIntro
        kicker="One little download."
        title={<>Your screen deserves <em className="s">a hero.</em></>}
        lede={`Free, and quiet in your ${VISITOR_OS === "windows" ? "system tray" : "menu bar"} until you want to play.`}
      />
      <DownloadButton variant="gold" />
      <p className="meta">{download.needs} · {download.arch} · {download.size} · <OtherDownload /></p>
    </section>
  );
}
