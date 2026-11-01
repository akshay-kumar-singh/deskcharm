export const GITHUB_REPO = "akshay-kumar-singh/deskcharm";
export const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

// The maker's portfolio: work, the studio's AI automations and product
// videos, and a way to get in touch.
export const PORTFOLIO_URL = "https://portfolio-next-js-blond.vercel.app/";

// Where the download buttons point: the files attached to the latest GitHub
// release, DeskCharm.dmg and DeskCharm-Setup.exe. GitHub serves big files for
// free; Netlify advises keeping each file in a deploy under 10 MB.
const latest = file => `${GITHUB_URL}/releases/latest/download/${file}`;

export const DOWNLOADS = {
  mac: { name: "Mac", url: latest("DeskCharm.dmg"), size: "19 MB", needs: "macOS 14 or later", arch: "Apple silicon & Intel", shell: "Terminal" },
  windows: { name: "Windows", url: latest("DeskCharm-Setup.exe"), size: "125 MB", needs: "Windows 10 or 11", arch: "64-bit", shell: "PowerShell" },
};

export const UPI = {
  id: "akshaysing975@oksbi",
  payLink: "upi://pay?pa=akshaysing975@oksbi&pn=Akshay%20Singh&cu=INR&tn=Coffee%20for%20DeskCharm",
};
