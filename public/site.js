const toggle = document.querySelector(".nav-toggle");
const navigation = document.querySelector(".site-nav");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const normalizeText = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();

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

const gameSearch = document.querySelector("[data-game-search]");
if (gameSearch) {
  const cards = [...document.querySelectorAll("[data-game-name]")].map((node) => ({node, name: normalizeText(node.dataset.gameName)}));
  const platforms = [...document.querySelectorAll(".game-platform")];
  const status = document.querySelector("[data-game-status]");
  const reset = document.querySelector("[data-game-reset]");
  const update = () => {
    const query = normalizeText(gameSearch.value);
    let visible = 0;
    cards.forEach(({node, name}) => { node.hidden = Boolean(query) && !name.includes(query); if (!node.hidden) visible += 1; });
    platforms.forEach((platform) => { platform.querySelector("[data-game-empty]").hidden = Boolean(platform.querySelector(".game-card:not([hidden])")); });
    status.textContent = query ? `Showing ${visible} of ${cards.length} games matching “${gameSearch.value.trim()}”` : "Browse by name or jump to a platform.";
    reset.disabled = !gameSearch.value;
  };
  gameSearch.addEventListener("input", update);
  gameSearch.addEventListener("search", update);
  reset.addEventListener("click", () => { gameSearch.value = ""; update(); gameSearch.focus(); });
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

import "./literature.js";
