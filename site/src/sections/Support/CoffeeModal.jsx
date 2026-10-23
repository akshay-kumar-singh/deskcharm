import { UPI } from "../../config.js";
import Modal from "../../components/Modal.jsx";
import Steps from "../../components/Steps.jsx";
import { useCopy } from "../../lib/useCopy.js";
import "./CoffeeModal.css";

const STEPS = [
  ["Open any UPI app", "GPay, PhonePe, Paytm, BHIM or your bank's own app."],
  ["Scan the code", "Or copy the UPI ID below and pay to it."],
  ["Send what feels right", "A coffee, a treat, a pizza night. You choose."],
];

// The UPI code in a viewfinder, with the ways to pay beside it.
export default function CoffeeModal({ open, onClose }) {
  const [copied, copy] = useCopy();
  return (
    <Modal open={open} onClose={onClose} label="Buy me a coffee" className="coffee">
      <div className="coffee-scan">
        <div className="scanner">
          <img src="coffee-qr.png" alt={`UPI QR code to pay ${UPI.id}`} width="480" height="480" />
          <i className="scan-line" aria-hidden="true" />
        </div>
        <p className="scan-caption">Point your UPI app's scanner here</p>
        <p className="scan-apps">GPay · PhonePe · Paytm · BHIM · any UPI app</p>
      </div>
      <div className="coffee-info">
        <p className="kicker">Buy me a coffee</p>
        <h3>Thanks for <em className="s">stopping by.</em></h3>
        <p className="coffee-lede">Every coffee keeps DeskCharm free and the next hero on its way. Send whatever feels right; there's no wrong amount.</p>
        <Steps items={STEPS} />
        <p className="coffee-label">UPI ID</p>
        <div className="upi-id">
          <span>{UPI.id}</span>
          <button type="button" onClick={() => copy(UPI.id)}>{copied ? "Copied ✓" : "Copy"}</button>
        </div>
        <a className="btn btn-dark upi-pay" href={UPI.payLink}>Pay with a UPI app</a>
        <p className="coffee-fine">Payments go straight to my bank account through UPI. No sign-up, and nothing is stored on this site.</p>
      </div>
    </Modal>
  );
}
