const toggle = document.querySelector(".nav-toggle");
const navigation = document.querySelector(".site-nav");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const heroPlayground = document.querySelector("[data-hero-playground]");
if (heroPlayground) {
  const letters = [...heroPlayground.querySelectorAll("[data-hero-letter]")];
  const remix = heroPlayground.querySelector("[data-hero-remix]");
  const mascot = remix.querySelector("[data-hero-mascot-art]");
  const mascotEntry = remix.querySelector("[data-mascot-entry]") || mascot;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  const offsets = letters.map(() => ({ lift: "0.00px", tilt: "0.00deg" }));
  let visible = !("IntersectionObserver" in window), pageActive = true;
  let mascotReady = false, mascotEntered = false, preparingMascot = false;
  let frame = 0, pointer = null, centers = [], burst = [], decodeTimer;
  heroPlayground.dataset.mascotReady = "false";
  // A stalled request must not leave the no-JavaScript-visible artwork hidden.
  const preparationTimer = setTimeout(() => { heroPlayground.dataset.mascotReady = "true"; }, 8000);
  const arrivalAnimations = () => typeof mascotEntry.getAnimations === "function"
    ? mascotEntry.getAnimations({ subtree: true }).filter((animation) => animation.animationName?.startsWith("mascot-arrive-"))
    : [];
  const clearPointer = () => {
    if (!frame && !pointer) return;
    cancelAnimationFrame(frame);
    frame = 0;
    pointer = null;
    letters.forEach((letter, index) => {
      const offset = offsets[index];
      if (offset.lift !== "0.00px") { letter.style.removeProperty("--letter-lift"); offset.lift = "0.00px"; }
      if (offset.tilt !== "0.00deg") { letter.style.removeProperty("--letter-tilt"); offset.tilt = "0.00deg"; }
    });
  };
  const cancelBurst = () => { burst.forEach((animation) => animation.cancel()); burst = []; };
  const updateMotion = () => {
    const foreground = visible && pageActive && !document.hidden;
    if (mascotReady && foreground && !mascotEntered) {
      mascotEntered = true;
      heroPlayground.dataset.mascotEntered = "true";
    }
    const active = mascotReady && foreground && !reduceMotion.matches;
    heroPlayground.dataset.motionActive = String(active);
    remix.disabled = !active || typeof mascot.animate !== "function";
    if (!active) { clearPointer(); cancelBurst(); }
    arrivalAnimations().forEach((animation) => {
      if (!active && animation.playState === "running") animation.pause();
      else if (active && animation.playState === "paused") animation.play();
    });
  };
  const finishMascotPreparation = () => {
    if (mascotReady) return;
    mascotReady = true;
    clearTimeout(preparationTimer);
    clearTimeout(decodeTimer);
    heroPlayground.dataset.mascotReady = "true";
    updateMotion();
  };
  const prepareMascot = () => {
    if (preparingMascot || mascotReady) return;
    preparingMascot = true;
    if (!mascot.naturalWidth || typeof mascot.decode !== "function") {
      finishMascotPreparation();
      return;
    }
    // Loading has completed; decode failures or a hung decode still release the artwork.
    decodeTimer = setTimeout(finishMascotPreparation, 8000);
    try { Promise.resolve(mascot.decode()).then(finishMascotPreparation, finishMascotPreparation); }
    catch { finishMascotPreparation(); }
  };
  mascot.addEventListener("load", prepareMascot, { once: true });
  mascot.addEventListener("error", finishMascotPreparation, { once: true });
  // Reveal the articulated character only after every layer is usable. The
  // complete illustration remains visible if a request or decode fails.
  const mascotParts = [...remix.querySelectorAll("[data-mascot-part]")];
  if (mascotParts.length === 4) {
    let rigSettled = false, preparedParts = 0;
    const rigListeners = [];
    const finishRigPreparation = (ready) => {
      if (rigSettled) return;
      rigSettled = true;
      clearTimeout(rigTimer);
      rigListeners.forEach(([part, loaded, failed]) => {
        part.removeEventListener("load", loaded);
        part.removeEventListener("error", failed);
      });
      heroPlayground.dataset.mascotRig = ready ? "ready" : "fallback";
    };
    const rigTimer = setTimeout(() => finishRigPreparation(false), 8000);
    mascotParts.forEach((part) => {
      if (rigSettled) return;
      let preparing = false;
      const failed = () => finishRigPreparation(false);
      const loaded = () => {
        if (preparing || rigSettled) return;
        preparing = true;
        if (!part.naturalWidth || !part.naturalHeight || typeof part.decode !== "function") {
          failed();
          return;
        }
        const decoded = () => {
          if (rigSettled) return;
          if (!part.naturalWidth || !part.naturalHeight) { failed(); return; }
          preparedParts += 1;
          if (preparedParts === mascotParts.length) finishRigPreparation(true);
        };
        try { Promise.resolve(part.decode()).then(decoded, failed); }
        catch { failed(); }
      };
      part.addEventListener("load", loaded, { once: true });
      part.addEventListener("error", failed, { once: true });
      rigListeners.push([part, loaded, failed]);
      if (part.complete) loaded();
    });
  } else if (mascotParts.length) {
    heroPlayground.dataset.mascotRig = "fallback";
  }
  const measureLetters = () => {
    centers = letters.map((letter) => {
      const rect = letter.parentElement.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
  };
  const paintPointer = () => {
    frame = 0;
    if (!pointer) return;
    if (!centers.length) measureLetters();
    letters.forEach((letter, index) => {
      const center = centers[index];
      const strength = Math.max(0, 1 - Math.hypot(pointer.x - center.x, pointer.y - center.y) / 115);
      const offset = offsets[index];
      const lift = `${(-6 * strength * strength).toFixed(2)}px`;
      const tilt = `${(2 * strength * (pointer.x < center.x ? -1 : 1)).toFixed(2)}deg`;
      if (offset.lift !== lift) { letter.style.setProperty("--letter-lift", lift); offset.lift = lift; }
      if (offset.tilt !== tilt) { letter.style.setProperty("--letter-tilt", tilt); offset.tilt = tilt; }
    });
  };
  heroPlayground.addEventListener("pointerenter", () => {
    if (heroPlayground.hasAttribute("data-glass-lab")) return;
    if (finePointer.matches && !remix.disabled) measureLetters();
  });
  // Refresh invalidated geometry on demand and skip unchanged style writes.
  heroPlayground.addEventListener("pointermove", (event) => {
    if (heroPlayground.hasAttribute("data-glass-lab")) return;
    if (event.pointerType === "touch" || !finePointer.matches || remix.disabled) return;
    pointer = { x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(paintPointer);
  }, { passive: true });
  heroPlayground.addEventListener("pointerleave", clearPointer);
  window.addEventListener("scroll", () => { clearPointer(); centers = []; }, { passive: true });
  window.addEventListener("resize", () => { clearPointer(); centers = []; }, { passive: true });
  remix.addEventListener("click", () => {
    if (remix.disabled) return;
    // The homepage laboratory coordinates the character and ribbon as one scene.
    if (heroPlayground.hasAttribute("data-glass-lab")) return;
    cancelBurst();
    const animations = letters.map((letter, index) => letter.animate([
      { transform: "translateY(0) rotate(0)" },
      { transform: `translateY(-6px) rotate(${index % 2 ? 2 : -2}deg)`, offset: .32 },
      { transform: "translateY(3px) rotate(0)", offset: .65 },
      { transform: "translateY(0) rotate(0)" }
    ], { duration: 720, delay: index * 32, easing: "cubic-bezier(.22,1,.36,1)" }));
    const arrivals = arrivalAnimations();
    arrivals.forEach((animation) => { animation.currentTime = 0; animation.play(); });
    // Older markup still gets the small greeting jump without stacking two entrances.
    if (!arrivals.length) animations.push(mascot.animate([
      { transform: "translateY(0) rotate(0)" },
      { transform: "translateY(-6px) rotate(-2deg)", offset: .32 },
      { transform: "translateY(-2px) rotate(1.5deg)", offset: .65 },
      { transform: "translateY(0) rotate(0)" }
    ], { duration: 900, easing: "cubic-bezier(.22,1,.36,1)" }));
    burst = animations;
    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (burst === animations) burst = [];
    });
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; updateMotion(); }).observe(remix);
  }
  document.addEventListener("visibilitychange", updateMotion);
  reduceMotion.addEventListener("change", updateMotion);
  finePointer.addEventListener("change", clearPointer);
  window.addEventListener("pagehide", () => { pageActive = false; updateMotion(); });
  window.addEventListener("pageshow", () => { pageActive = true; updateMotion(); });
  if (mascot.complete) prepareMascot();
  updateMotion();
}

// A bounded, event-driven scene: no idle rendering loop or layout reads on move/scroll.
const glassLab = document.querySelector("[data-glass-lab]");
if (glassLab) {
  const trigger = glassLab.querySelector("[data-hero-remix]");
  const character = glassLab.querySelector("[data-mascot-entry]");
  const pulse = glassLab.querySelector("[data-lab-pulse]");
  const front = glassLab.querySelector(".lab-ribbon-front");
  const ribbonLayers = [glassLab.querySelector(".lab-ribbon-back"), front, glassLab.querySelector(".lab-energy")];
  const orbit = glassLab.querySelector(".lab-orbit");
  const status = glassLab.querySelector("[data-lab-status]");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
  let frame = 0, bounds = null, point = null, inView = true, pageActive = true;
  let measurePending = true, animations = [], awakeCount = 0, lastFrameTime = 0;
  const position = { x: 0, y: 0, scroll: 0 };
  const layerTransforms = new Map();
  const written = new Map();
  const write = (key, value) => {
    if (written.get(key) === value) return;
    glassLab.style.setProperty(key, value);
    written.set(key, value);
  };
  const stopAwakening = () => {
    animations.forEach((animation) => animation.cancel());
    animations = [];
    delete glassLab.dataset.labAwake;
  };
  const motionAllowed = () => pageActive && !document.hidden && !reduceMotion.matches;
  const paint = (timestamp) => {
    frame = 0;
    if (!motionAllowed() || !inView) return;
    if (measurePending || !bounds) {
      const rect = glassLab.getBoundingClientRect();
      bounds = { left: rect.left, top: rect.top + scrollY, width: rect.width, height: rect.height };
      measurePending = false;
    }
    const target = {
      scroll: Math.max(0, Math.min(1, (scrollY - bounds.top + 45) / (bounds.height * .85))),
      x: point ? Math.max(-1, Math.min(1, (point.x - bounds.left) / bounds.width * 2 - 1)) * 14 : 0,
      y: point ? Math.max(-1, Math.min(1, (point.y - (bounds.top - scrollY)) / bounds.height * 2 - 1)) * 9 : 0
    };
    // Time-based damping feels the same on 60/120/144 Hz displays. Stop once settled.
    const elapsed = lastFrameTime ? Math.min(64, timestamp - lastFrameTime) : 1000 / 60;
    lastFrameTime = timestamp;
    const blend = 1 - Math.exp(-elapsed / 75);
    let settling = false;
    for (const key of ["x", "y", "scroll"]) {
      position[key] += (target[key] - position[key]) * blend;
      if (Math.abs(target[key] - position[key]) < (key === "scroll" ? .0003 : .015)) position[key] = target[key];
      else settling = true;
    }
    // Pointer movement changes only composited layer transforms, not inherited
    // variables or gradient paint coordinates across the entire hero subtree.
    write("--lab-scroll", position.scroll.toFixed(3));
    const transform = `perspective(1200px) translate3d(${position.x.toFixed(2)}px,${(position.y - position.scroll * 75).toFixed(2)}px,0) rotateY(${(position.x * .06).toFixed(3)}deg) rotate(${(-position.scroll * 7).toFixed(3)}deg) scale(${(1 - position.scroll * .065).toFixed(4)})`;
    ribbonLayers.forEach((layer) => {
      if (layerTransforms.get(layer) === transform) return;
      layer.style.transform = transform;
      layerTransforms.set(layer, transform);
    });
    if (settling) queue();
    else lastFrameTime = 0;
  };
  const queue = () => { if (!frame && motionAllowed() && inView) frame = requestAnimationFrame(paint); };
  const clearPointer = () => { point = null; queue(); };
  const synchronize = () => {
    glassLab.dataset.labComposited = String(motionAllowed() && inView);
    if (!motionAllowed()) {
      cancelAnimationFrame(frame);
      frame = 0;
      point = null;
      lastFrameTime = 0;
      position.x = position.y = position.scroll = 0;
      stopAwakening();
      write("--lab-scroll", "0");
      ribbonLayers.forEach((layer) => layer.style.removeProperty("transform"));
      layerTransforms.clear();
    } else { measurePending = true; queue(); }
  };
  glassLab.addEventListener("pointerenter", () => { measurePending = true; queue(); });
  glassLab.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" || !finePointer.matches || !motionAllowed()) return;
    point = { x: event.clientX, y: event.clientY };
    queue();
  }, { passive: true });
  glassLab.addEventListener("pointerleave", clearPointer);
  glassLab.addEventListener("pointercancel", clearPointer);
  window.addEventListener("scroll", clearPointer, { passive: true });
  window.addEventListener("resize", () => { point = null; measurePending = true; queue(); }, { passive: true });
  trigger.addEventListener("click", () => {
    if (trigger.disabled || !motionAllowed()) return;
    stopAwakening();
    glassLab.dataset.labAwake = "true";
    status.textContent = "";
    const easing = "cubic-bezier(.22,1,.36,1)";
    const current = [
      character.animate([
        { transform: "translateY(0) rotate(0)" },
        { transform: "translateY(-10px) rotate(-2deg)", offset: .3 },
        { transform: "translateY(2px) rotate(1deg)", offset: .68 },
        { transform: "translateY(0) rotate(0)" }
      ], { duration: 1100, easing }),
      pulse.animate([
        { strokeDashoffset: "1.12", opacity: 0 },
        { strokeDashoffset: ".95", opacity: .95, offset: .12 },
        { strokeDashoffset: "-.9", opacity: .9, offset: .85 },
        { strokeDashoffset: "-1.12", opacity: 0 }
      ], { duration: 1750, easing: "linear" }),
      front.animate([{ opacity: .75 }, { opacity: 1, offset: .4 }, { opacity: .9 }], { duration: 1500, easing }),
      orbit.animate([{ opacity: 1 }, { opacity: .25, offset: .35 }, { opacity: 1 }], { duration: 1700, easing }),
      ...[...orbit.children].map((pearl, index) => pearl.animate([
        { transform: "translate(0,0) scale(1)" },
        { transform: `translate(${(index - 1) * 18}px,-18px) scale(1.6)`, offset: .4 },
        { transform: "translate(0,0) scale(1)" }
      ], { duration: 1400, delay: index * 80, easing }))
    ];
    animations = current;
    Promise.allSettled(current.map((animation) => animation.finished)).then(() => {
      if (animations !== current) return;
      animations = [];
      delete glassLab.dataset.labAwake;
      awakeCount += 1;
      status.textContent = `Light pulse played${awakeCount > 1 ? ` ${awakeCount} times` : ""}.`;
    });
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      glassLab.dataset.labComposited = String(motionAllowed() && inView);
      if (inView) { measurePending = true; queue(); }
      else { cancelAnimationFrame(frame); frame = 0; lastFrameTime = 0; point = null; stopAwakening(); }
    }, { rootMargin: "80px" }).observe(glassLab);
  }
  if ("ResizeObserver" in window) new ResizeObserver(() => { measurePending = true; queue(); }).observe(glassLab);
  document.fonts?.ready.then(() => { measurePending = true; queue(); });
  finePointer.addEventListener("change", clearPointer);
  reduceMotion.addEventListener("change", synchronize);
  document.addEventListener("visibilitychange", synchronize);
  window.addEventListener("pagehide", () => { pageActive = false; synchronize(); });
  window.addEventListener("pageshow", () => { pageActive = true; synchronize(); });
  synchronize();
}

if (toggle && navigation) {
  const menuLabel = toggle.querySelector(".sr-only");
  const japanese = document.documentElement.lang === "ja";
  const setMenuOpen = (open, returnFocus = false) => {
    toggle.setAttribute("aria-expanded", String(open));
    navigation.classList.toggle("is-open", open);
    if (menuLabel) menuLabel.textContent = japanese ? (open ? "メニューを閉じる" : "メニューを開く") : (open ? "Close navigation" : "Open navigation");
    if (returnFocus) toggle.focus();
  };
  toggle.addEventListener("click", () => setMenuOpen(toggle.getAttribute("aria-expanded") !== "true"));
  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenuOpen(false);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!navigation.contains(event.target) && !toggle.contains(event.target)) setMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      setMenuOpen(false, true);
    }
  });
  navigation.addEventListener("focusout", (event) => {
    if (event.relatedTarget && !navigation.contains(event.relatedTarget) && !toggle.contains(event.relatedTarget)) setMenuOpen(false);
  });
  window.matchMedia("(min-width: 901px)").addEventListener("change", () => setMenuOpen(false));
}

const imageViewer = document.querySelector("#literature-viewer");
if (imageViewer) {
  const list = document.querySelector("#reading-list");
  const stage = imageViewer.querySelector("[data-viewer-stage]");
  const image = imageViewer.querySelector("[data-viewer-image]");
  const message = imageViewer.querySelector("[data-viewer-message]");
  const title = imageViewer.querySelector("#viewer-title");
  const meta = imageViewer.querySelector("[data-viewer-meta]");
  const counter = imageViewer.querySelector("[data-viewer-counter]");
  const closeButton = imageViewer.querySelector("[data-viewer-close]");
  const previous = imageViewer.querySelector("[data-viewer-prev]");
  const next = imageViewer.querySelector("[data-viewer-next]");
  const zoomIn = imageViewer.querySelector("[data-viewer-in]");
  const zoomOut = imageViewer.querySelector("[data-viewer-out]");
  const fit = imageViewer.querySelector("[data-viewer-fit]");
  const pointers = new Map();
  let entries = [], index = 0, opener = null, generation = 0, frame = 0, closeTimer;
  let scale = 1, x = 0, y = 0, width = 0, height = 0, areaWidth = 0, areaHeight = 0;
  let gesture = null, backdropDown = false;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  // Pointer moves only update a single composited image; no layout reads in this path.
  const paint = () => {
    frame = 0;
    const limitX = Math.max(0, (width * scale - areaWidth) / 2);
    const limitY = Math.max(0, (height * scale - areaHeight) / 2);
    x = clamp(x, -limitX, limitX);
    y = clamp(y, -limitY, limitY);
    image.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale})`;
    stage.classList.toggle("is-zoomed", scale > 1);
    fit.textContent = scale === 1 ? "Fit" : `${Math.round(scale * 100)}%`;
    zoomOut.disabled = image.hidden || scale <= 1;
    zoomIn.disabled = image.hidden || scale >= 4;
    fit.disabled = image.hidden;
  };
  const requestPaint = () => { if (!frame) frame = requestAnimationFrame(paint); };
  const resize = () => {
    if (!imageViewer.open) return;
    areaWidth = stage.clientWidth;
    areaHeight = stage.clientHeight;
    const source = entries[index].querySelector("img");
    const sourceWidth = Number(source.getAttribute("width"));
    const sourceHeight = Number(source.getAttribute("height"));
    const ratio = Math.min((areaWidth - 20) / sourceWidth, (areaHeight - 20) / sourceHeight, 1);
    width = sourceWidth * ratio;
    height = sourceHeight * ratio;
    image.style.width = `${width}px`;
    image.style.height = `${height}px`;
    requestPaint();
  };
  const reset = () => { scale = 1; x = y = 0; requestPaint(); };
  const zoom = (value, anchorX = 0, anchorY = 0) => {
    if (image.hidden) return;
    const updated = clamp(value, 1, 4);
    x = anchorX - (anchorX - x) * updated / scale;
    y = anchorY - (anchorY - y) * updated / scale;
    scale = updated;
    requestPaint();
  };
  const show = () => {
    const token = ++generation;
    const button = entries[index];
    const card = button.closest(".reading-card");
    const source = button.querySelector("img");
    title.textContent = card.querySelector("h3").textContent;
    title.title = title.textContent;
    meta.textContent = `${button.dataset.figureLabel} · Source PDF page ${button.dataset.sourcePage}`;
    counter.textContent = `${index + 1} / ${entries.length}`;
    previous.disabled = index === 0;
    next.disabled = index === entries.length - 1;
    image.hidden = true;
    image.alt = source.alt;
    message.textContent = "Loading image…";
    message.hidden = false;
    pointers.clear();
    gesture = null;
    stage.classList.remove("is-dragging");
    reset();
    resize();
    image.src = source.currentSrc || source.src;
    image.decode().then(() => {
      if (token !== generation || !imageViewer.open) return;
      image.hidden = false;
      message.hidden = true;
      requestPaint();
    }).catch(() => {
      if (token === generation && imageViewer.open) message.textContent = "Image unavailable. Close and reopen to retry.";
    });
  };
  const move = (step) => {
    const updated = clamp(index + step, 0, entries.length - 1);
    if (updated !== index) { index = updated; show(); }
  };
  const close = () => {
    if (!imageViewer.open || imageViewer.classList.contains("is-closing")) return;
    if (reduceMotion.matches) { imageViewer.close(); return; }
    imageViewer.classList.add("is-closing");
    closeTimer = setTimeout(() => imageViewer.close(), 120);
  };
  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reading-image]");
    if (!button || imageViewer.open) return;
    entries = [...list.querySelectorAll(".reading-list-item:not([hidden]) [data-reading-image]")];
    index = entries.indexOf(button);
    if (index < 0) return;
    opener = button;
    imageViewer.classList.remove("is-closing");
    document.documentElement.classList.add("image-viewer-open");
    imageViewer.showModal();
    show();
  });
  closeButton.addEventListener("click", close);
  imageViewer.addEventListener("cancel", (event) => { event.preventDefault(); close(); });
  imageViewer.addEventListener("close", () => {
    clearTimeout(closeTimer);
    ++generation;
    cancelAnimationFrame(frame);
    frame = 0;
    pointers.clear();
    gesture = null;
    image.hidden = true;
    image.removeAttribute("src");
    imageViewer.classList.remove("is-closing");
    document.documentElement.classList.remove("image-viewer-open");
    opener?.focus({ preventScroll: true });
  });
  // Require both ends of a click on the backdrop; finishing an image drag never closes it.
  imageViewer.addEventListener("pointerdown", (event) => { backdropDown = event.target === imageViewer; });
  imageViewer.addEventListener("click", (event) => { if (event.target === imageViewer && backdropDown) close(); });
  previous.addEventListener("click", () => move(-1));
  next.addEventListener("click", () => move(1));
  zoomIn.addEventListener("click", () => zoom(scale * 1.4));
  zoomOut.addEventListener("click", () => zoom(scale / 1.4));
  fit.addEventListener("click", reset);
  imageViewer.addEventListener("keydown", (event) => {
    if (event.key === "Tab") {
      const buttons = [...imageViewer.querySelectorAll("button:not(:disabled)")];
      const target = event.shiftKey ? buttons.at(-1) : buttons[0];
      if (document.activeElement === (event.shiftKey ? buttons[0] : buttons.at(-1))) {
        event.preventDefault();
        target.focus();
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const action = { ArrowLeft: () => move(-1), ArrowRight: () => move(1), "+": () => zoom(scale * 1.4), "=": () => zoom(scale * 1.4), "-": () => zoom(scale / 1.4), "0": reset }[event.key];
    if (action) { event.preventDefault(); action(); }
  });
  stage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = stage.getBoundingClientRect();
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? areaHeight : 1);
    zoom(scale * Math.exp(-clamp(delta, -100, 100) * 0.003), event.clientX - rect.left - areaWidth / 2, event.clientY - rect.top - areaHeight / 2);
  }, { passive: false });
  stage.addEventListener("dblclick", (event) => {
    const rect = stage.getBoundingClientRect();
    zoom(scale > 1 ? 1 : 2, event.clientX - rect.left - areaWidth / 2, event.clientY - rect.top - areaHeight / 2);
  });
  const startGesture = () => {
    const points = [...pointers.values()];
    const rect = stage.getBoundingClientRect();
    const center = points.length > 1 ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 } : points[0];
    gesture = center ? { x, y, scale, center, left: rect.left, top: rect.top, distance: points.length > 1 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0 } : null;
  };
  stage.addEventListener("pointerdown", (event) => {
    if (image.hidden || event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("is-dragging");
    startGesture();
  });
  stage.addEventListener("pointermove", (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.values()];
    if (points.length > 1 && gesture.distance > 0) {
      scale = clamp(gesture.scale * Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) / gesture.distance, 1, 4);
      const anchorX = gesture.center.x - gesture.left - areaWidth / 2;
      const anchorY = gesture.center.y - gesture.top - areaHeight / 2;
      x = anchorX - (anchorX - gesture.x) * scale / gesture.scale + (points[0].x + points[1].x) / 2 - gesture.center.x;
      y = anchorY - (anchorY - gesture.y) * scale / gesture.scale + (points[0].y + points[1].y) / 2 - gesture.center.y;
    } else {
      x = gesture.x + event.clientX - gesture.center.x;
      y = gesture.y + event.clientY - gesture.center.y;
    }
    requestPaint();
  });
  const endPointer = (event) => {
    if (!pointers.delete(event.pointerId)) return;
    startGesture();
    if (!pointers.size) stage.classList.remove("is-dragging");
  };
  stage.addEventListener("pointerup", endPointer);
  stage.addEventListener("pointercancel", endPointer);
  stage.addEventListener("lostpointercapture", endPointer);
  window.addEventListener("resize", resize, { passive: true });
}

// Enhancement state is scoped to this document, including back/forward-cache restores.
const fineHover = window.matchMedia("(hover: hover) and (pointer: fine)");
let enhancementsActive = true;
window.addEventListener("pagehide", () => { enhancementsActive = false; });
window.addEventListener("pageshow", () => { enhancementsActive = true; });

const hoverPreview = document.querySelector("[data-reading-preview]");
const readingList = document.querySelector("#reading-list");
if (hoverPreview && readingList) {
  const previewImage = hoverPreview.querySelector("[data-preview-image]");
  const previewLabel = hoverPreview.querySelector("[data-preview-label]");
  let sourceButton = null, generation = 0, frame = 0, point = null;
  let previewWidth = 0, previewHeight = 0, viewportWidth = innerWidth, viewportHeight = innerHeight;
  const hidePreview = () => {
    ++generation;
    sourceButton = null;
    point = null;
    cancelAnimationFrame(frame);
    frame = 0;
    hoverPreview.hidden = true;
    previewImage.removeAttribute("src");
  };
  const paintPreview = () => {
    frame = 0;
    if (!point || hoverPreview.hidden) return;
    const gap = 22, edge = 12;
    const left = point.x + gap + previewWidth <= viewportWidth - edge ? point.x + gap : point.x - gap - previewWidth;
    const top = Math.min(point.y + gap, viewportHeight - previewHeight - edge);
    hoverPreview.style.transform = `translate3d(${Math.max(edge, left)}px, ${Math.max(edge, top)}px, 0)`;
  };
  const queuePreview = () => { if (!frame) frame = requestAnimationFrame(paintPreview); };
  readingList.addEventListener("pointerover", (event) => {
    const button = event.target.closest("[data-reading-image]");
    if (!button || button === sourceButton || button.contains(event.relatedTarget)
      || event.pointerType === "touch" || !fineHover.matches || !enhancementsActive
      || imageViewer?.open || button.closest("[hidden]")) return;
    hidePreview();
    const source = button.querySelector("img");
    if (!source || !source.complete || !source.naturalWidth) return;
    const token = ++generation;
    sourceButton = button;
    point = { x: event.clientX, y: event.clientY };
    const scale = Math.min(296 / source.naturalWidth, 220 / source.naturalHeight, 1);
    const width = source.naturalWidth * scale, height = source.naturalHeight * scale;
    previewWidth = width + 24;
    previewHeight = height + 48;
    hoverPreview.style.width = `${previewWidth}px`;
    previewImage.style.height = `${height}px`;
    previewImage.alt = source.alt;
    previewLabel.textContent = `${button.dataset.figureLabel} · Page ${button.dataset.sourcePage}`;
    previewImage.src = source.currentSrc || source.src;
    const decoded = typeof previewImage.decode === "function" ? previewImage.decode() : Promise.resolve();
    decoded.then(() => {
      if (generation !== token || sourceButton !== button || !fineHover.matches || !enhancementsActive || imageViewer?.open) return;
      hoverPreview.hidden = false;
      queuePreview();
    }).catch(() => { if (generation === token) hidePreview(); });
  });
  readingList.addEventListener("pointermove", (event) => {
    if (!sourceButton || event.pointerType === "touch") return;
    point = { x: event.clientX, y: event.clientY };
    queuePreview();
  }, { passive: true });
  readingList.addEventListener("pointerout", (event) => {
    if (sourceButton && sourceButton.contains(event.target) && !sourceButton.contains(event.relatedTarget)) hidePreview();
  });
  readingList.addEventListener("pointercancel", hidePreview);
  document.addEventListener("pointerdown", hidePreview, { passive: true, capture: true });
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-reading-image], [data-topic-filter], [data-reading-featured-filter], [data-reading-reset], [data-reading-year-option]")) hidePreview();
  }, true);
  document.addEventListener("input", (event) => { if (event.target.matches("[data-reading-search-input]")) hidePreview(); }, true);
  document.addEventListener("change", (event) => { if (event.target.matches("[data-reading-year-filter]")) hidePreview(); }, true);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" || event.key === "Tab") hidePreview(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) hidePreview(); });
  window.addEventListener("scroll", hidePreview, { passive: true, capture: true });
  window.addEventListener("resize", () => { viewportWidth = innerWidth; viewportHeight = innerHeight; hidePreview(); }, { passive: true });
  window.addEventListener("popstate", hidePreview);
  window.addEventListener("pagehide", hidePreview);
  fineHover.addEventListener("change", hidePreview);
  // Filtering is owned by literature.js; observing only hidden attributes keeps that contract independent.
  const filterObserver = new MutationObserver(() => { if (sourceButton) hidePreview(); });
  filterObserver.observe(readingList, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  if (imageViewer) new MutationObserver(() => { if (imageViewer.open) hidePreview(); }).observe(imageViewer, { attributes: true, attributeFilter: ["open"] });
}

const revealItems = [...document.querySelectorAll("[data-reveal]")];
if (revealItems.length && "IntersectionObserver" in window) {
  let revealObserver;
  const reveal = (item) => {
    item.dataset.revealState = "visible";
    revealObserver?.unobserve(item);
  };
  const initializeReveals = () => {
    revealObserver?.disconnect();
    if (reduceMotion.matches) { revealItems.forEach(reveal); return; }
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !entry.target.closest("[hidden]")) reveal(entry.target);
      });
    }, { rootMargin: "0px 0px -20px 0px", threshold: 0.04 });
    const siblings = new Map();
    revealItems.forEach((item) => {
      if (item.dataset.revealState === "visible") return;
      const position = siblings.get(item.parentElement) || 0;
      siblings.set(item.parentElement, position + 1);
      item.style.setProperty("--reveal-delay", `${(position % 5) * 45}ms`);
      // Do not conceal above-the-fold content or an item currently removed by filtering.
      if (item.closest("[hidden]") || item.getBoundingClientRect().top < innerHeight - 20) { reveal(item); return; }
      revealObserver.observe(item);
      item.dataset.revealState = "pending";
    });
  };
  document.addEventListener("focusin", (event) => {
    const item = event.target.closest("[data-reveal]");
    if (item) reveal(item);
  });
  reduceMotion.addEventListener("change", initializeReveals);
  window.addEventListener("pagehide", () => revealObserver?.disconnect());
  window.addEventListener("pageshow", initializeReveals);
  initializeReveals();
}

const footer = document.querySelector("[data-footer-glow]");
if (footer) {
  const clock = footer.querySelector("[data-local-clock]");
  const japanese = document.documentElement.lang === "ja";
  let clockTimer = 0, glowFrame = 0, glowPoint = null, bounds = null;
  const updateClock = () => {
    clearTimeout(clockTimer);
    if (!clock || !enhancementsActive || document.hidden) return;
    const now = new Date();
    clock.dateTime = now.toISOString();
    clock.textContent = new Intl.DateTimeFormat(japanese ? "ja-JP" : "en-GB", {
      timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(now);
    clock.title = japanese ? "上海 · UTC+08:00" : "Shanghai · UTC+08:00";
    clockTimer = setTimeout(updateClock, 60000 - now.getSeconds() * 1000 - now.getMilliseconds());
  };
  const clearGlow = () => {
    cancelAnimationFrame(glowFrame);
    glowFrame = 0;
    glowPoint = null;
    bounds = null;
    delete footer.dataset.glowActive;
  };
  footer.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch" && fineHover.matches && !reduceMotion.matches) bounds = footer.getBoundingClientRect();
  });
  footer.addEventListener("pointermove", (event) => {
    if (!bounds || !fineHover.matches || reduceMotion.matches || !enhancementsActive || event.pointerType === "touch") return;
    glowPoint = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    if (!glowFrame) glowFrame = requestAnimationFrame(() => {
      glowFrame = 0;
      if (!glowPoint) return;
      footer.style.setProperty("--glow-x", `${glowPoint.x}px`);
      footer.style.setProperty("--glow-y", `${glowPoint.y}px`);
      footer.dataset.glowActive = "true";
    });
  }, { passive: true });
  footer.addEventListener("pointerleave", clearGlow);
  footer.addEventListener("pointercancel", clearGlow);
  fineHover.addEventListener("change", clearGlow);
  reduceMotion.addEventListener("change", clearGlow);
  window.addEventListener("scroll", clearGlow, { passive: true });
  window.addEventListener("resize", clearGlow, { passive: true });
  document.addEventListener("visibilitychange", () => { clearGlow(); updateClock(); });
  window.addEventListener("pagehide", () => { clearGlow(); clearTimeout(clockTimer); });
  window.addEventListener("pageshow", updateClock);
  updateClock();
}

const filmstrip = document.querySelector("[data-project-filmstrip]");
if (filmstrip) {
  const track = filmstrip.querySelector("[data-project-track]");
  const cards = [...track.querySelectorAll("[data-project-item]")];
  const controls = filmstrip.querySelector("[data-project-controls]");
  const previous = filmstrip.querySelector("[data-project-prev]");
  const next = filmstrip.querySelector("[data-project-next]");
  const progress = filmstrip.querySelector("[data-project-progress]");
  const desktop = window.matchMedia("(min-width: 901px)");
  let trackFrame = 0, offsets = [], maximum = 0, current = 0, active = false;
  const updateTrack = () => {
    trackFrame = 0;
    if (!enhancementsActive) return;
    const position = track.scrollLeft;
    current = offsets.reduce((nearest, value, index) => Math.abs(value - position) < Math.abs(offsets[nearest] - position) ? index : nearest, 0);
    if (maximum > 0 && position >= maximum - 2) current = cards.length - 1;
    previous.disabled = !active || position <= 2;
    next.disabled = !active || position >= maximum - 2;
    const label = `${cards.length ? current + 1 : 0} / ${cards.length}`;
    if (progress.textContent !== label) progress.textContent = label;
    filmstrip.style.setProperty("--project-progress", String(maximum > 0 ? position / maximum : 0));
  };
  const queueTrack = () => { if (!trackFrame && enhancementsActive) trackFrame = requestAnimationFrame(updateTrack); };
  const measureTrack = () => {
    const rect = track.getBoundingClientRect();
    // Align controls with the CSS snap port; the track's leading padding is not a separate slide.
    const snapPadding = parseFloat(getComputedStyle(track).scrollPaddingLeft) || 0;
    offsets = cards.map((card) => Math.max(0, card.getBoundingClientRect().left - rect.left + track.scrollLeft - snapPadding));
    maximum = Math.max(0, track.scrollWidth - track.clientWidth);
    active = desktop.matches && maximum > 2;
    controls.hidden = !active;
    track.tabIndex = active ? 0 : -1;
    track.setAttribute("aria-roledescription", active ? "carousel" : "project collection");
    queueTrack();
  };
  const moveTrack = (index, behavior = reduceMotion.matches ? "instant" : "smooth") => {
    if (!active || !cards.length) return;
    track.scrollTo({ left: Math.max(0, Math.min(maximum, offsets[Math.max(0, Math.min(cards.length - 1, index))])), behavior });
  };
  const stepTrack = (direction) => {
    if (!active) return;
    const positions = [...new Set(offsets.map((offset) => Math.max(0, Math.min(maximum, offset))))];
    const position = direction > 0 ? positions.find((offset) => offset > track.scrollLeft + 2)
      : positions.reverse().find((offset) => offset < track.scrollLeft - 2);
    if (position !== undefined) track.scrollTo({ left: position, behavior: reduceMotion.matches ? "instant" : "smooth" });
  };
  previous.addEventListener("click", () => stepTrack(-1));
  next.addEventListener("click", () => stepTrack(1));
  track.addEventListener("scroll", queueTrack, { passive: true });
  track.addEventListener("keydown", (event) => {
    if (!active || event.target !== track || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") stepTrack(event.key === "ArrowLeft" ? -1 : 1);
    else moveTrack(event.key === "Home" ? 0 : cards.length - 1);
  });
  const restoreProjectHash = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const index = cards.findIndex((card) => card.id === id);
    if (index >= 0) moveTrack(index, "instant");
  };
  const positionKey = () => `project-position:${location.pathname}${location.search}${location.hash}`;
  const restoreProjectPosition = () => {
    // Recreated history entries cannot rely on the browser retaining this nested scroller.
    if (performance.getEntriesByType("navigation")[0]?.type === "back_forward") {
      try {
        const id = sessionStorage.getItem(positionKey());
        const index = cards.findIndex((card) => card.id === id);
        if (index >= 0) { moveTrack(index, "instant"); return; }
      } catch { /* Storage may be disabled; the canonical anchor remains usable. */ }
    }
    restoreProjectHash();
  };
  window.addEventListener("hashchange", restoreProjectHash);
  window.addEventListener("resize", measureTrack, { passive: true });
  desktop.addEventListener("change", measureTrack);
  if ("ResizeObserver" in window) new ResizeObserver(measureTrack).observe(track);
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(trackFrame);
    trackFrame = 0;
    if (!active || !cards.length) return;
    const position = track.scrollLeft;
    const nearest = position >= maximum - 2 ? cards.length - 1
      : offsets.reduce((index, offset, candidate) => Math.abs(offset - position) < Math.abs(offsets[index] - position) ? candidate : index, 0);
    try { sessionStorage.setItem(positionKey(), cards[nearest].id); } catch { /* Browsing does not require storage. */ }
  });
  window.addEventListener("pageshow", (event) => { measureTrack(); if (!event.persisted) restoreProjectPosition(); });
  measureTrack();
  restoreProjectPosition();
}

const lostPlayground = document.querySelector("[data-lost-playground]");
if (lostPlayground) {
  const remix = lostPlayground.querySelector("[data-lost-remix]");
  const pieces = [...lostPlayground.querySelectorAll("[data-lost-atom]")];
  const molecule = remix.querySelector("svg, img");
  let lostFrame = 0, lostPoint = null, bounds = null, animations = [];
  const resetLost = () => {
    cancelAnimationFrame(lostFrame);
    lostFrame = 0;
    lostPoint = null;
    bounds = null;
    ["--lost-x", "--lost-y", "--lost-rotation"].forEach((property) => lostPlayground.style.removeProperty(property));
  };
  const stopLost = () => {
    resetLost();
    animations.forEach((animation) => animation.cancel());
    animations = [];
    remix.disabled = reduceMotion.matches || !enhancementsActive || document.hidden || typeof molecule?.animate !== "function";
  };
  lostPlayground.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch" && fineHover.matches && !remix.disabled) bounds = lostPlayground.getBoundingClientRect();
  });
  lostPlayground.addEventListener("pointermove", (event) => {
    if (!bounds || event.pointerType === "touch" || !fineHover.matches || remix.disabled) return;
    lostPoint = { x: Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)), y: Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)) };
    if (!lostFrame) lostFrame = requestAnimationFrame(() => {
      lostFrame = 0;
      if (!lostPoint) return;
      lostPlayground.style.setProperty("--lost-x", `${lostPoint.x * 10}px`);
      lostPlayground.style.setProperty("--lost-y", `${lostPoint.y * 8}px`);
      lostPlayground.style.setProperty("--lost-rotation", `${lostPoint.x * 3}deg`);
    });
  }, { passive: true });
  lostPlayground.addEventListener("pointerleave", resetLost);
  lostPlayground.addEventListener("pointercancel", resetLost);
  remix.addEventListener("click", () => {
    if (remix.disabled) return;
    animations.forEach((animation) => animation.cancel());
    const targets = pieces.length ? pieces : [molecule];
    animations = targets.map((piece, index) => {
      const angle = index * Math.PI * 2 / targets.length;
      return piece.animate([
        { transform: "translate(0, 0) rotate(0) scale(1)" },
        { transform: `translate(${Math.cos(angle) * 20}px, ${Math.sin(angle) * 20}px) rotate(${index % 2 ? 14 : -14}deg) scale(.92)`, offset: .36 },
        { transform: "translate(0, 0) rotate(0) scale(1)" }
      ], { duration: 900, delay: index * 30, easing: "cubic-bezier(.22,1,.36,1)" });
    });
    const current = animations;
    Promise.allSettled(current.map((animation) => animation.finished)).then(() => { if (animations === current) animations = []; });
  });
  window.addEventListener("scroll", resetLost, { passive: true });
  window.addEventListener("resize", resetLost, { passive: true });
  fineHover.addEventListener("change", resetLost);
  reduceMotion.addEventListener("change", stopLost);
  document.addEventListener("visibilitychange", stopLost);
  window.addEventListener("pagehide", stopLost);
  window.addEventListener("pageshow", stopLost);
  stopLost();
}

const ambianceSections = [...document.querySelectorAll("[data-section-ambiance]")];
if (ambianceSections.length && "IntersectionObserver" in window) {
  const visibleSections = new Map();
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) visibleSections.set(entry.target, entry.intersectionRatio);
      else visibleSections.delete(entry.target);
    });
    if (reduceMotion.matches || !enhancementsActive) return;
    const current = [...visibleSections].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (current) document.body.dataset.ambiance = current.dataset.sectionAmbiance;
  }, { rootMargin: "-15% 0px -20% 0px", threshold: [0, .15, .35, .6] });
  const observeSections = () => {
    observer.disconnect();
    visibleSections.clear();
    if (reduceMotion.matches) { delete document.body.dataset.ambiance; return; }
    ambianceSections.forEach((section) => observer.observe(section));
  };
  reduceMotion.addEventListener("change", observeSections);
  window.addEventListener("pagehide", () => observer.disconnect());
  window.addEventListener("pageshow", observeSections);
  observeSections();
}

import "./literature.js";
