import { DOUBLE_CLICK_TITLES, POWERS, SHAKE_TITLES } from "../../shared/charms.js";
import { makeSticker } from "./sticker.js";

// The custom charm maker, as the Mac app's CharmMaker.swift: pick or drop a
// picture, see it made into a sticker, name it and give it a power for a
// double-click and one for a shake.

const api = window.deskcharm;
const $ = id => document.getElementById(id);
const drop = $("drop"), file = $("file"), note = $("note"), hint = $("hint"), add = $("add");
let made = null, generation = 0;

for (const [select, titles, chosen] of [[$("doubleClick"), DOUBLE_CLICK_TITLES, "spiderMan"], [$("shake"), SHAKE_TITLES, "batman"]]) {
  for (const p of [null, ...POWERS]) {
    const option = new Option(p ? titles[p] : "Nothing", p ?? "");
    option.selected = p === chosen;
    select.append(option);
  }
}

function tell(message, isError = false) {
  note.textContent = message;
  note.classList.toggle("error", isError);
}

/** Made in the background; a newer picture outdates a sticker still being made. */
async function load(blob, name) {
  const g = ++generation;
  drop.classList.add("working");
  add.disabled = true;
  tell("");
  if (name && !$("name").value) $("name").value = name.replace(/\.[^.]+$/, "").slice(0, 40);
  try {
    const sticker = await makeSticker(blob);
    if (g !== generation) return;
    made = sticker;
    drop.querySelector("canvas")?.remove();
    hint.hidden = true;
    drop.prepend(sticker.canvas);
    if (!sticker.cutOut) tell("No transparent background, so the whole picture is used as a card.");
  } catch (e) {
    if (g !== generation) return;
    made = null;
    tell(e.message, true);
  } finally {
    if (g === generation) {
      drop.classList.remove("working");
      add.disabled = !made;
    }
  }
}

drop.addEventListener("click", () => file.click());
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") file.click(); });
file.addEventListener("change", () => { if (file.files[0]) load(file.files[0], file.files[0].name); file.value = ""; });
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => {
  e.preventDefault();
  drop.classList.remove("over");
  const f = [...e.dataTransfer.files].find(x => x.type.startsWith("image/")) ?? e.dataTransfer.files[0];
  if (f) load(f, f.name);
});

$("cancel").addEventListener("click", () => api.cancel());
document.addEventListener("keydown", e => { if (e.key === "Escape") api.cancel(); });

add.addEventListener("click", async () => {
  if (!made) return;
  add.disabled = true;
  const png = await new Promise(resolve => made.canvas.toBlob(resolve, "image/png"));
  const result = await api.add({
    png: new Uint8Array(await png.arrayBuffer()),
    name: $("name").value.trim() || "My Charm",
    attach: made.attach,
    doubleClick: $("doubleClick").value || null,
    shake: $("shake").value || null,
  });
  if (!result.ok) {
    tell(result.error, true);
    add.disabled = false;
  }
});
