import { useEffect, useRef, useState } from "react";

// Copies text to the clipboard. `copied` stays true for a moment afterwards,
// so the button can say so.
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = text => navigator.clipboard?.writeText(text).then(() => {
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  });
  return [copied, copy];
}
