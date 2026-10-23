import "./Desk.css";

// A Mac desktop, shared by the hero and the powers demo.
export function DeskFrame({ ref, className = "", children }) {
  return (
    <div className="desk-frame">
      <div className={`desk ${className}`} ref={ref}>{children}</div>
    </div>
  );
}

// Menu items marked hide-sm drop off on phones.
export function MenuBar({ app, menus, date }) {
  return (
    <div className="menubar">
      <b>{app}</b>
      {menus.map(m => <span className="hide-sm" key={m}>{m}</span>)}
      <div className="right">
        <span className="star">✦</span>
        {date && <span className="hide-sm">{date}</span>}
        <span>9:41</span>
      </div>
    </div>
  );
}

export function Dock({ colors }) {
  return <div className="dock">{colors.map((c, i) => <i key={i} style={{ background: c }} />)}</div>;
}

// A window under a heading and greyed-out lines of text, `lines` giving
// each one's width in %.
export function MockWindow({ ref, title, lines, children }) {
  return (
    <div className="win" ref={ref}>
      <div className="bar"><i /><i /><i /><span>{title}</span></div>
      <div className="body">
        <p className="h" />
        {lines.map((w, i) => <p key={i} style={w < 100 ? { width: `${w}%` } : undefined} />)}
        {children}
      </div>
    </div>
  );
}
