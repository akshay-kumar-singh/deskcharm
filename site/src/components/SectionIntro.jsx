// A section's kicker, heading, gold rule and, if given, lede.
export default function SectionIntro({ kicker, title, lede }) {
  return (
    <>
      <p className="kicker">{kicker}</p>
      <h2>{title}</h2>
      <hr className="rule" />
      {lede && <p className="lede">{lede}</p>}
    </>
  );
}
