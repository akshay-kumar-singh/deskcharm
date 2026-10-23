import { useState } from "react";
import { CupIcon } from "../../components/Icons.jsx";
import SectionIntro from "../../components/SectionIntro.jsx";
import CoffeeModal from "./CoffeeModal.jsx";
import "./Support.css";

const MENU = [
  ["☕", "A coffee", "Fuels one more late-night bug fix."],
  ["🍰", "A treat", "Buys an evening on the next hero."],
  ["🍕", "A pizza night", "Pays for a whole new superpower."],
];

export default function Support() {
  const [open, setOpen] = useState(false);
  return (
    <section className="block tight-top" id="support">
      <div className="wrap">
        <div className="support">
          <div>
            <SectionIntro
              kicker="A human behind the charms."
              title={<>Buy me a coffee, <em className="s">or a treat.</em></>}
              lede="DeskCharm is free, and it stays free: no ads, no accounts, no catch. If a hero made you grin, a coffee keeps the next one coming. Entirely optional, always appreciated."
            />
            <div className="support-actions">
              <button type="button" className="btn btn-dark btn-coffee" aria-haspopup="dialog" onClick={() => setOpen(true)}>
                <CupIcon />Buy me a coffee
              </button>
              <span className="support-note">Scan with any UPI app. Takes ten seconds.</span>
            </div>
          </div>
          <div className="menu-card">
            <p className="menu-title">The DeskCharm café</p>
            <p className="menu-sub">Today's menu</p>
            <ul>
              {MENU.map(([icon, item, what]) => (
                <li key={item}>
                  <span className="menu-icon" aria-hidden="true">{icon}</span>
                  <div>
                    <div className="menu-line"><b>{item}</b><i className="dots" /><em>you choose</em></div>
                    <p>{what}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="menu-foot">Paid by UPI · There's no wrong amount</p>
          </div>
        </div>
      </div>
      <CoffeeModal open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
