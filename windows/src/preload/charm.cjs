const { contextBridge, ipcRenderer } = require("electron");

// What the charm's page may ask of the app.
contextBridge.exposeInMainWorld("deskcharm", {
  state: () => ipcRenderer.invoke("state"),
  onState: callback => ipcRenderer.on("state", (_, s) => callback(s)),
  setIgnoreMouse: ignore => ipcRenderer.send("ignore-mouse", ignore),
  onCursor: callback => ipcRenderer.on("cursor", (_, at) => callback(at)),
  showOverlay: () => ipcRenderer.invoke("overlay:show"),
  hideOverlay: () => ipcRenderer.send("overlay:hide"),
  findTarget: () => ipcRenderer.invoke("target:find"),
  standIn: target => ipcRenderer.invoke("target:stand-in", target),
  hideTarget: target => ipcRenderer.invoke("target:hide", target),
  log: (...parts) => ipcRenderer.send("log", ...parts),
});
