import { useEffect, useRef } from "react";
import { CloseIcon } from "./Icons.jsx";
import "./Modal.css";

// A popup on a native <dialog>, which brings focus trapping, Esc to close and
// the backdrop with it. Clicking the backdrop closes it too.
export default function Modal({ open, onClose, label, className = "", children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const d = dialog.current;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={`modal ${className}`}
      aria-label={label}
      onClose={onClose}
      // The dialog has no padding, so a click landing on it, not its
      // contents, is a click on the backdrop.
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose}><CloseIcon /></button>
      {children}
    </dialog>
  );
}
