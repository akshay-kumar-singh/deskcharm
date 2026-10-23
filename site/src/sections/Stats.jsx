import "./Stats.css";

const STATS = [
  ["12", "hero charms"],
  ["10", "superpowers"],
  ["240 Hz", "rope physics"],
  ["∞", "charms of your own"],
];

export default function Stats() {
  return (
    <div className="stats">
      <div className="wrap">
        {STATS.map(([n, what]) => <div className="stat" key={what}><b>{n}</b><span>{what}</span></div>)}
      </div>
    </div>
  );
}
