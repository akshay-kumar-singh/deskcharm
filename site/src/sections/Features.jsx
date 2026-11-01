import SectionIntro from "../components/SectionIntro.jsx";
import "./Features.css";

const FEATURES = [
  ["Real physics", "A Verlet chain solved 240 times a second. Fling the charm and it carries its momentum, swings through and settles like the real thing."],
  ["Clicks pass through", "Only the charm itself takes clicks. Everything else goes straight to what's underneath, and it never takes focus from your app."],
  ["Menu bar only", "No Dock icon, no window. It lives in the menu bar as ✦, or the system tray on Windows: pick a charm, its size, chain length and screen position there."],
  ["Smooth and light", "A steady 60 fps on about a millisecond of drawing a frame. Screen effects pause their clock while they hold."],
  ["Sound, synthesised", "Webs, bats, thunder and smashes are synthesised when it launches, with no audio files. Switch them off from the menu."],
  ["Mac and Windows", "Native Swift on the Mac, universal for Apple silicon and Intel on macOS Sonoma or later. And for Windows 10 and 11, with the same charms and powers."],
];

export default function Features() {
  return (
    <section className="block tight-top">
      <div className="wrap">
        <div className="center">
          <SectionIntro kicker="Small things, done properly." title={<>Quiet until you <em className="s">play with it.</em></>} />
        </div>
        <div className="feats">
          {FEATURES.map(([title, text], i) => (
            <div className="feat" key={title}>
              <div className="n">{String(i + 1).padStart(2, "0")}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
