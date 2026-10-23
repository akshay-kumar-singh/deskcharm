import { byId } from "../data/charms.js";
import DownloadButton from "../components/DownloadButton.jsx";
import Hanger from "../components/Hanger.jsx";
import SectionIntro from "../components/SectionIntro.jsx";
import "./Cta.css";

// The charms hung along the top, left to right.
const ROW = ["Iron-Man", "Bat-Man", "Spider-Man", "Hulk", "Thor", "Super-Man", "Venom"];

export default function Cta() {
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
        lede="Free, and quiet in your menu bar until you want to play."
      />
      <DownloadButton variant="gold" />
      <p className="meta">macOS 14 or later · Universal · 19 MB</p>
    </section>
  );
}
