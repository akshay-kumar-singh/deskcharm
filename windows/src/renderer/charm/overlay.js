import * as THREE from "three";

// The full-screen see-through window the powers' effects are drawn in. The
// charm's page opens it itself (window.open, same origin), so the effects draw
// into its canvases directly, in the same frame as the charm and with the
// rope's live state, rather than across processes a frame late. Three layers:
// behind (2D), the Hulk's 3D scene, and in front (2D). It's shown only while
// something is playing, and nothing is redrawn while every effect holds still.

export class Overlay {
  constructor(api) {
    this.api = api;
    this.entries = [];
    this.visible = false;
    this.opening = null;
    this.info = null;
    this.size = { width: 0, height: 0 };
    this.dpr = 1;
    this.renderer = null;
    this.glUsed = false;
    this.ready = this.attach();
  }

  async attach() {
    const win = window.open(new URL("overlay.html", location.href).href, "deskcharm-overlay");
    if (!win) throw new Error("the overlay window couldn't be opened");
    this.win = win;
    // window.open returns at once, on a blank page; wait for ours to load.
    await new Promise(resolve => {
      const check = () => (win.document?.readyState === "complete" && win.document.getElementById("front") ? resolve() : setTimeout(check, 20));
      check();
    });
    const doc = win.document;
    this.back = doc.getElementById("back");
    this.gl = doc.getElementById("gl");
    this.front = doc.getElementById("front");
    this.backCtx = this.back.getContext("2d");
    this.frontCtx = this.front.getContext("2d");
  }

  /** Shows the overlay over the charm's display, if it isn't already; its geometry: {bounds, workArea, scaleFactor}. */
  async open() {
    await this.ready;
    if (this.visible) return this.info;
    this.opening ??= (async () => {
      const info = await this.api.showOverlay();
      if (!info) throw new Error("the overlay isn't there to show");
      this.layout(info);
      this.visible = true;
      return info;
    })().finally(() => { this.opening = null; });
    return this.opening;
  }

  layout(info) {
    this.info = info;
    this.size = { width: info.bounds.width, height: info.bounds.height };
    this.dpr = info.scaleFactor || 1;
    for (const canvas of [this.back, this.gl, this.front]) {
      const w = Math.round(this.size.width * this.dpr), h = Math.round(this.size.height * this.dpr);
      if (canvas !== this.gl && (canvas.width !== w || canvas.height !== h)) { canvas.width = w; canvas.height = h; }
      canvas.style.width = `${this.size.width}px`;
      canvas.style.height = `${this.size.height}px`;
    }
    if (this.renderer) {
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(this.size.width, this.size.height, false);
    }
  }

  /** The WebGL renderer the Hulk is drawn with, made the first time it's wanted. */
  renderer3D() {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.gl, alpha: true, antialias: true, premultipliedAlpha: true });
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.setPixelRatio(this.dpr);
      this.renderer.setSize(this.size.width || 1, this.size.height || 1, false);
    }
    return this.renderer;
  }

  /**
   * Plays an effect: `create(finish)` makes it, given the callback that ends
   * it; `done` is called once it has. Returns the effect.
   */
  play(create, done) {
    const entry = { effect: null, done, finished: false };
    entry.effect = create(() => { entry.finished = true; });
    this.entries.push(entry);
    return entry.effect;
  }

  /** Draws every playing effect at `now`, seconds on the page's frame clock. */
  frame(now) {
    if (!this.visible || !this.entries.length) return;
    // While everything holds still the last frame stays on screen untouched.
    if (this.entries.every(e => e.effect.heldUntil != null && now < e.effect.heldUntil)) return;
    const s = this.dpr;
    for (const ctx of [this.backCtx, this.frontCtx]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    let gl = false;
    for (const entry of this.entries) {
      try {
        const e = entry.effect;
        if (e.render3D) {
          e.step(now);
          e.drawBehind(this.backCtx);
          e.render3D();
          gl = true;
          e.drawFront(this.frontCtx);
        } else {
          e.render(this.frontCtx, now);
        }
      } catch (err) {
        this.api.log("an effect failed:", String(err?.stack ?? err));
        entry.finished = true;
      }
    }
    if (this.glUsed && !gl) this.renderer?.clear();
    this.glUsed = gl;
    const over = this.entries.filter(e => e.finished);
    if (over.length) {
      this.entries = this.entries.filter(e => !e.finished);
      for (const e of over) {
        try { e.done?.(e.effect); } catch (err) { this.api.log("cleaning up an effect failed:", String(err)); }
      }
    }
    if (!this.entries.length) this.close();
  }

  close() {
    for (const ctx of [this.backCtx, this.frontCtx]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    this.renderer?.clear();
    this.glUsed = false;
    this.visible = false;
    this.api.hideOverlay();
  }
}
