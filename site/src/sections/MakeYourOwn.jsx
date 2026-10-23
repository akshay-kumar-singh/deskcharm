import { byId } from "../data/charms.js";
import Hanger from "../components/Hanger.jsx";
import { ArrowIcon } from "../components/Icons.jsx";
import SectionIntro from "../components/SectionIntro.jsx";
import Steps from "../components/Steps.jsx";
import "./MakeYourOwn.css";

const STEPS = [
  ["Drop in a picture", "✦ → Charm → New Custom Charm…, then choose a photo or drag one in."],
  ["It's cut out for you", "The subject is found and cut out on your Mac, then hung from the top of its head, not an empty corner."],
  ["Give it powers", "Mix and match: Spider-Man's web yank on a double-click and Thor's thunderstorm on a shake, say."],
];

export default function MakeYourOwn() {
  return (
    <section className="block tight-top" id="make">
      <div className="wrap make">
        <div>
          <SectionIntro
            kicker="Make it yours."
            title={<>Any picture, <em className="s">turned into a charm.</em></>}
            lede="Your dog, your face, your favourite mug. DeskCharm lifts the subject off the background and gives it a white die-cut border, like a sticker."
          />
          <Steps items={STEPS} />
        </div>
        <div className="maker">
          <figure className="photo">
            <div className="pic"><img src="charms/Thor.webp" alt="A photo before it becomes a sticker" /></div>
            <figcaption>your photo</figcaption>
          </figure>
          <div className="arrow"><ArrowIcon />cut out</div>
          <div className="sticker-box">
            <Hanger charm={byId("Thor")} size={210} chain={40} dur={3.2} />
            <div className="menu-mock" aria-hidden="true">
              <div><b>On Double-Click</b><span>›</span></div>
              <div className="sel">Batman: bat tow<span>✓</span></div>
              <hr />
              <div><b>On Shake</b><span>›</span></div>
              <div className="sel">Thor: thunderstorm<span>✓</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
