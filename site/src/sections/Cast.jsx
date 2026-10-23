import { CHARMS, POWERS } from "../data/charms.js";
import Hanger from "../components/Hanger.jsx";
import SectionIntro from "../components/SectionIntro.jsx";
import "./Cast.css";

// Every charm on its own card. Picking one with powers shows them off in the
// powers demo, through onPick(power, charmId).
export default function Cast({ onPick }) {
  return (
    <section className="block" id="cast">
      <div className="wrap">
        <div className="center">
          <SectionIntro
            kicker="The whole cast."
            title={<>Pick a hero. <em className="s">Hang it up.</em></>}
            lede="Twelve hand-finished charms, each with its own hang and heft. Change charm, size, chain length and where it hangs from the ✦ menu."
          />
        </div>
        <div className="cast">
          {CHARMS.map(c => <Card key={c.id} charm={c} onPick={onPick} />)}
        </div>
      </div>
    </section>
  );
}

function Card({ charm: c, onPick }) {
  const p = POWERS[c.power];
  const inside = (
    <>
      <Hanger charm={c} size={150} chain={46} />
      <div className="label">
        <b>{c.name}</b>
        <span>{p ? <><span className="pw">{p.dbl[0]}</span> · <span className="pw">{p.shake[0]}</span></> : "Hangs and swings"}</span>
      </div>
    </>
  );
  if (!p) return <div className="card">{inside}</div>;
  return <button type="button" className="card has-power" onClick={() => onPick(c.power, c.id)}>{inside}</button>;
}
