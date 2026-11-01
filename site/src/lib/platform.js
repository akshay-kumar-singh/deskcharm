// Which download to lead with: Windows for a visitor on a Windows PC, as the
// browser reports it, and the Mac for everyone else.
const platform = (navigator.userAgentData?.platform || navigator.platform || "").toLowerCase();

export const VISITOR_OS = platform.startsWith("win") ? "windows" : "mac";
export const otherOS = os => (os === "mac" ? "windows" : "mac");
