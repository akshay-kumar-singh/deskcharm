const { contextBridge, ipcRenderer } = require("electron");

// What the custom charm maker may ask of the app.
contextBridge.exposeInMainWorld("deskcharm", {
  add: made => ipcRenderer.invoke("maker:add", made),
  cancel: () => ipcRenderer.send("maker:cancel"),
  log: (...parts) => ipcRenderer.send("log", ...parts),
});
