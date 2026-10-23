import "./Steps.css";

// A numbered list of [title, text] steps.
export default function Steps({ items }) {
  return (
    <ol className="steps">
      {items.map(([title, text]) => <li key={title}><div><b>{title}</b><span>{text}</span></div></li>)}
    </ol>
  );
}
