const fs = require("node:fs");
const path = require("node:path");

// Run by electron-builder once it has laid the app out, before it makes the
// installer: takes out the parts of Electron this app never loads.
//  - dxcompiler.dll (26 MB), the shader compiler WebGPU uses; the app draws
//    with canvas and WebGL, which compile with d3dcompiler_47.dll.
//  - vk_swiftshader.dll and its manifest (5 MB), software Vulkan, which
//    Chromium only falls back to for WebGL when told to with
//    --enable-unsafe-swiftshader.
const UNUSED = ["dxcompiler.dll", "vk_swiftshader.dll", "vk_swiftshader_icd.json"];

exports.default = async function afterPack({ electronPlatformName, appOutDir }) {
  if (electronPlatformName !== "win32") return;
  for (const file of UNUSED) fs.rmSync(path.join(appOutDir, file), { force: true });
};
