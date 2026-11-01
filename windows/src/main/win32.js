import koffi from "koffi";

// The Win32 calls the double-click powers need, through koffi: which window is
// in front and where, a snapshot of it, and minimising it. Window handles are
// BigInts (koffi 3 passes pointers that way); they go to the renderer as strings.

const user32 = koffi.load("user32.dll");
const gdi32 = koffi.load("gdi32.dll");
const dwmapi = koffi.load("dwmapi.dll");
const kernel32 = koffi.load("kernel32.dll");

const HANDLE = koffi.pointer("HANDLE", koffi.opaque());
koffi.alias("HWND", HANDLE);
koffi.struct("RECT", { left: "int32_t", top: "int32_t", right: "int32_t", bottom: "int32_t" });
koffi.struct("BITMAPINFOHEADER", {
  biSize: "uint32_t", biWidth: "int32_t", biHeight: "int32_t", biPlanes: "uint16_t", biBitCount: "uint16_t",
  biCompression: "uint32_t", biSizeImage: "uint32_t", biXPelsPerMeter: "int32_t", biYPelsPerMeter: "int32_t",
  biClrUsed: "uint32_t", biClrImportant: "uint32_t",
});

const GetForegroundWindow = user32.func("HWND __stdcall GetForegroundWindow()");
const GetTopWindow = user32.func("HWND __stdcall GetTopWindow(HWND hWnd)");
const GetWindow = user32.func("HWND __stdcall GetWindow(HWND hWnd, uint32_t uCmd)");
const IsWindow = user32.func("int __stdcall IsWindow(HWND hWnd)");
const IsWindowVisible = user32.func("int __stdcall IsWindowVisible(HWND hWnd)");
const IsIconic = user32.func("int __stdcall IsIconic(HWND hWnd)");
const GetWindowRect = user32.func("int __stdcall GetWindowRect(HWND hWnd, _Out_ RECT *lpRect)");
const GetWindowLongPtrW = user32.func("intptr_t __stdcall GetWindowLongPtrW(HWND hWnd, int nIndex)");
const GetClassNameW = user32.func("int __stdcall GetClassNameW(HWND hWnd, _Out_ uint8_t *lpClassName, int nMaxCount)");
const GetWindowTextW = user32.func("int __stdcall GetWindowTextW(HWND hWnd, _Out_ uint8_t *lpString, int nMaxCount)");
const GetWindowThreadProcessId = user32.func("uint32_t __stdcall GetWindowThreadProcessId(HWND hWnd, _Out_ uint32_t *lpdwProcessId)");
const ShowWindow = user32.func("int __stdcall ShowWindow(HWND hWnd, int nCmdShow)");
const PrintWindow = user32.func("int __stdcall PrintWindow(HWND hwnd, HANDLE hdcBlt, uint32_t nFlags)");
const GetDC = user32.func("HANDLE __stdcall GetDC(HWND hWnd)");
const ReleaseDC = user32.func("int __stdcall ReleaseDC(HWND hWnd, HANDLE hDC)");
const CreateCompatibleDC = gdi32.func("HANDLE __stdcall CreateCompatibleDC(HANDLE hdc)");
const CreateCompatibleBitmap = gdi32.func("HANDLE __stdcall CreateCompatibleBitmap(HANDLE hdc, int cx, int cy)");
const SelectObject = gdi32.func("HANDLE __stdcall SelectObject(HANDLE hdc, HANDLE h)");
const DeleteObject = gdi32.func("int __stdcall DeleteObject(HANDLE ho)");
const DeleteDC = gdi32.func("int __stdcall DeleteDC(HANDLE hdc)");
const GetDIBits = gdi32.func("int __stdcall GetDIBits(HANDLE hdc, HANDLE hbm, uint32_t start, uint32_t cLines, _Out_ uint8_t *lpvBits, _Inout_ BITMAPINFOHEADER *lpbmi, uint32_t usage)");
// One prototype per name: the attribute comes back as raw bytes, read as a RECT or a DWORD by who asked.
const DwmGetWindowAttribute = dwmapi.func("int32_t __stdcall DwmGetWindowAttribute(HWND hwnd, uint32_t dwAttribute, _Out_ uint8_t *pvAttribute, uint32_t cbAttribute)");
const DwmSetWindowAttribute = dwmapi.func("int32_t __stdcall DwmSetWindowAttribute(HWND hwnd, uint32_t dwAttribute, const uint32_t *pvAttribute, uint32_t cbAttribute)");
const OpenProcess = kernel32.func("HANDLE __stdcall OpenProcess(uint32_t dwDesiredAccess, int bInheritHandle, uint32_t dwProcessId)");
const QueryFullProcessImageNameW = kernel32.func("int __stdcall QueryFullProcessImageNameW(HANDLE hProcess, uint32_t dwFlags, _Out_ uint8_t *lpExeName, _Inout_ uint32_t *lpdwSize)");
const CloseHandle = kernel32.func("int __stdcall CloseHandle(HANDLE hObject)");

const GW_HWNDNEXT = 2;
const GWL_EXSTYLE = -20;
const WS_EX_TOPMOST = 0x8, WS_EX_TOOLWINDOW = 0x80;
const SW_MINIMIZE = 6;
const PW_RENDERFULLCONTENT = 2;
const DWMWA_TRANSITIONS_FORCEDISABLED = 3, DWMWA_EXTENDED_FRAME_BOUNDS = 9, DWMWA_CLOAKED = 14;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

/** The shell's own windows: the desktop, the taskbar and its pop-ups, which are never what a power goes for. */
const SHELL = new Set([
  "Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", "NotifyIconOverflowWindow",
  "Windows.UI.Core.CoreWindow", "XamlExplorerHostIslandWindow", "TopLevelWindowForOverflowXamlIsland",
  "ForegroundStaging", "MultitaskingViewFrame", "TaskListThumbnailWnd", "Shell_InputSwitchTopLevelWindow",
]);

const handle = id => BigInt(id);

function text(fn, hwnd) {
  const buf = Buffer.alloc(1024);
  const n = fn(hwnd, buf, 512);
  return n > 0 ? buf.toString("utf16le", 0, n * 2) : "";
}

/** Cloaked windows are "open" but not shown: on another virtual desktop, or a suspended store app. */
function cloaked(hwnd) {
  const out = Buffer.alloc(4);
  return DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, out, 4) === 0 && out.readUInt32LE(0) !== 0;
}

/** The window as it's drawn, without the invisible resize borders round it; in physical pixels. */
function frameRect(hwnd) {
  const b = Buffer.alloc(16);
  if (DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, b, 16) === 0) {
    const r = { left: b.readInt32LE(0), top: b.readInt32LE(4), right: b.readInt32LE(8), bottom: b.readInt32LE(12) };
    if (r.right > r.left) return r;
  }
  const w = {};
  return GetWindowRect(hwnd, w) ? w : null;
}

function processId(hwnd) {
  const pid = [0];
  GetWindowThreadProcessId(hwnd, pid);
  return pid[0];
}

/** A window a power could go for: shown, not minimised, not a tool or the shell's, and big enough; or null. */
function candidate(hwnd, ownPid) {
  if (!hwnd || !IsWindowVisible(hwnd) || IsIconic(hwnd) || cloaked(hwnd)) return null;
  const pid = processId(hwnd);
  if (pid === ownPid) return null;
  if (SHELL.has(text(GetClassNameW, hwnd))) return null;
  const ex = Number(GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
  if (ex & WS_EX_TOOLWINDOW) return null;
  const r = frameRect(hwnd);
  if (!r || r.right - r.left < 80 || r.bottom - r.top < 60) return null;
  return { hwnd, pid, rect: r, topmost: (ex & WS_EX_TOPMOST) !== 0 };
}

/**
 * The window in front, or failing that the frontmost ordinary window: with the
 * desktop or the taskbar in front, the window on top is the one being looked
 * at. `onDisplay(rect)` says whether a window, in physical pixels, is on the
 * charm's display.
 */
export function frontWindow(ownPid, onDisplay) {
  const fg = candidate(GetForegroundWindow(), ownPid);
  if (fg && onDisplay(fg.rect)) return describe(fg);
  for (let h = GetTopWindow(null), n = 0; h && n < 2000; h = GetWindow(h, GW_HWNDNEXT), n++) {
    const c = candidate(h, ownPid);
    if (c && !c.topmost && onDisplay(c.rect)) return describe(c);
  }
  return null;
}

function describe(c) {
  return { id: c.hwnd.toString(), pid: c.pid, rect: c.rect, title: text(GetWindowTextW, c.hwnd) };
}

/** The program a window belongs to, for its icon and name, or null. */
export function exePath(pid) {
  const process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!process) return null;
  try {
    const buf = Buffer.alloc(2048);
    const size = [1024];
    return QueryFullProcessImageNameW(process, 0, buf, size) ? buf.toString("utf16le", 0, size[0] * 2) : null;
  } finally {
    CloseHandle(process);
  }
}

/**
 * The window's own pixels, as the app draws them even where something covers
 * it, cropped to its visible frame: {width, height, pixels} in RGBA. Null if
 * it won't print, or prints blank, as some GPU-drawn windows do.
 */
export function snapshot(id) {
  const hwnd = handle(id);
  const wr = {};
  if (!IsWindow(hwnd) || !GetWindowRect(hwnd, wr)) return null;
  const w = wr.right - wr.left, h = wr.bottom - wr.top;
  if (w <= 0 || h <= 0 || w * h > 40e6) return null;
  const screenDC = GetDC(null);
  const memDC = CreateCompatibleDC(screenDC);
  const bitmap = CreateCompatibleBitmap(screenDC, w, h);
  let bgra = null;
  try {
    const old = SelectObject(memDC, bitmap);
    const printed = PrintWindow(hwnd, memDC, PW_RENDERFULLCONTENT);
    SelectObject(memDC, old);                      // a bitmap must be deselected before GetDIBits
    if (printed) {
      const header = { biSize: 40, biWidth: w, biHeight: -h, biPlanes: 1, biBitCount: 32, biCompression: 0,
        biSizeImage: 0, biXPelsPerMeter: 0, biYPelsPerMeter: 0, biClrUsed: 0, biClrImportant: 0 };
      const buf = Buffer.alloc(w * h * 4);
      if (GetDIBits(memDC, bitmap, 0, h, buf, header, 0) === h) bgra = buf;
    }
  } finally {
    DeleteObject(bitmap);
    DeleteDC(memDC);
    ReleaseDC(null, screenDC);
  }
  if (!bgra) return null;

  // The bitmap includes the invisible resize borders: crop to what's drawn.
  const fr = frameRect(hwnd) ?? wr;
  const ox = Math.min(Math.max(fr.left - wr.left, 0), w - 1), oy = Math.min(Math.max(fr.top - wr.top, 0), h - 1);
  const cw = Math.max(1, Math.min(fr.right - fr.left, w - ox)), ch = Math.max(1, Math.min(fr.bottom - fr.top, h - oy));
  const out = Buffer.alloc(cw * ch * 4);
  let dark = 0;
  for (let y = 0; y < ch; y++) {
    let s = ((oy + y) * w + ox) * 4, d = y * cw * 4;
    for (let x = 0; x < cw; x++, s += 4, d += 4) {
      const b = bgra[s], g = bgra[s + 1], r = bgra[s + 2];
      out[d] = r; out[d + 1] = g; out[d + 2] = b; out[d + 3] = 255;
      if (r + g + b < 6) dark++;
    }
  }
  if (dark > cw * ch * 0.97) return null;
  return { width: cw, height: ch, pixels: out };
}

/** Whether the window is out of sight now: minimised, hidden, cloaked or closed. */
export function gone(id) {
  const hwnd = handle(id);
  return !IsWindow(hwnd) || !IsWindowVisible(hwnd) || IsIconic(hwnd) || cloaked(hwnd);
}

/**
 * Minimises the window with its animation switched off, so it goes at once
 * beneath the stand-in that covers it rather than shrinking off to the
 * taskbar past it. The animation is switched back on for its next restore.
 */
export function minimise(id) {
  const hwnd = handle(id);
  if (!IsWindow(hwnd)) return true;
  const disabled = DwmSetWindowAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, Uint32Array.of(1), 4) === 0;
  ShowWindow(hwnd, SW_MINIMIZE);
  if (disabled) setTimeout(() => { DwmSetWindowAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, Uint32Array.of(0), 4); }, 1000);
  return gone(id);
}
