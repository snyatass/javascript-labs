export function setupCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const size = { width: 0, height: 0 };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    size.width = window.innerWidth;
    size.height = window.innerHeight;

    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener("resize", resize);

  return {
    ctx,
    size,
    destroy: () => window.removeEventListener("resize", resize),
  };
}
