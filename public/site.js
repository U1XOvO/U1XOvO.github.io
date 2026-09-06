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

const knowledgeMap = document.querySelector("[data-knowledge-map]");
if (knowledgeMap) {
  const topicNodes = [...knowledgeMap.querySelectorAll("[data-topic]")];
  const paperNodes = [...knowledgeMap.querySelectorAll("[data-paper-node]")];
  const draggableNodes = [...knowledgeMap.querySelectorAll("[data-drag-node]")];
  const edges = [...knowledgeMap.querySelectorAll(".graph-edge")];
  const graphReset = document.querySelector("[data-graph-reset]");
  const graphStatus = document.querySelector("[data-graph-status]");
  const paperTooltip = knowledgeMap.querySelector("[data-graph-paper-tooltip]");
  const records = [...document.querySelectorAll("[data-reading-topics]")];
  const yearGroups = [...document.querySelectorAll("[data-reading-year-group]")];
  const yearNavLinks = [...document.querySelectorAll("[data-reading-year-link]")];
  const searchInput = document.querySelector("[data-reading-search-input]");
  const yearSelect = document.querySelector("[data-reading-year-filter]");
  const yearPicker = document.querySelector("[data-reading-year-picker]");
  const yearTrigger = document.querySelector("[data-reading-year-trigger]");
  const yearMenu = document.querySelector("[data-reading-year-menu]");
  const yearValue = document.querySelector("[data-reading-year-value]");
  const yearOptions = [...document.querySelectorAll("[data-reading-year-option]")];
  const featuredFilter = document.querySelector("[data-reading-featured-filter]");
  const readingStatus = document.querySelector("[data-reading-status]");
  const readingEmpty = document.querySelector("[data-reading-empty]");
  const nodeByTopic = new Map(topicNodes.map((node) => [node.dataset.topic, node]));
  const graphNodeById = new Map(
    draggableNodes.map((node) => [node.dataset.graphNodeId, node]),
  );
  const nodePositions = new Map();
  const topicFilters = [...document.querySelectorAll("[data-topic-filter]")];
  const disclosure = document.querySelector("[data-graph-disclosure]");
  const resetFilters = [...document.querySelectorAll("[data-reading-reset]")];
  const recordIndex = records.map((node) => ({ node, search: normalizeText(node.dataset.readingSearch), topics: node.dataset.readingTopics.split(" ") }));
  let urlTimer = null;
  const suppressedClicks = new WeakSet();
  let activeTopic = null;
  let selectedPaper = null;
  let dragState = null;
  let mobileLayout = null;
  let yearNavFrame = null;


  const setActiveYear = (year) => {
    yearNavLinks.forEach((link) => {
      const isActive = Boolean(year) && link.dataset.readingYearLink === year;
      link.classList.toggle("is-active", isActive);
      if (isActive) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };

  const updateActiveYear = () => {
    yearNavFrame = null;
    const visibleGroups = yearGroups.filter((group) => !group.hidden);
    if (visibleGroups.length === 0) {
      setActiveYear(null);
      return;
    }
    const activationOffset = Math.min(160, window.innerHeight * 0.22);
    let activeGroup = visibleGroups[0];
    visibleGroups.forEach((group) => {
      if (group.getBoundingClientRect().top <= activationOffset) activeGroup = group;
    });
    setActiveYear(activeGroup.dataset.readingYearGroup);
  };

  const requestYearNavigationUpdate = () => {
    if (yearNavFrame !== null) return;
    yearNavFrame = requestAnimationFrame(updateActiveYear);
  };

  const syncYearPicker = () => {
    const selectedValue = yearSelect?.value || "";
    const selectedOption = yearOptions.find((option) => option.dataset.readingYearOption === selectedValue);
    if (yearValue && selectedOption) {
      yearValue.textContent = selectedOption.querySelector(".reading-year-option-label")?.textContent || "All years";
    }
    yearOptions.forEach((option) => {
      option.setAttribute("aria-selected", String(option === selectedOption));
    });
  };

  const setYearPickerOpen = (isOpen) => {
    if (!yearPicker || !yearTrigger || !yearMenu) return;
    yearPicker.classList.toggle("is-open", isOpen);
    yearTrigger.setAttribute("aria-expanded", String(isOpen));
    yearMenu.hidden = !isOpen;
  };

  const focusYearOption = (direction = 0) => {
    if (yearOptions.length === 0) return;
    const selectedIndex = Math.max(0, yearOptions.findIndex((option) => option.getAttribute("aria-selected") === "true"));
    const targetIndex = Math.min(yearOptions.length - 1, Math.max(0, selectedIndex + direction));
    yearOptions[targetIndex].focus();
  };

  const initialPosition = (node, mobile) => ({
    x: Number(mobile ? node.dataset.graphMobileX : node.dataset.graphX) / 100,
    y: Number(mobile ? node.dataset.graphMobileY : node.dataset.graphY) / 100,
  });

  let mapSize = { width: 0, height: 0 };
  const nodeSizes = new Map();
  const motion = new Map();
  const movingNodes = new Set();
  const edgesByNode = new Map(draggableNodes.map((node) => [node, new Set()]));
  const edgeEndpoints = new Map();
  edges.forEach((edge) => {
    const source = graphNodeById.get(edge.dataset.source), target = graphNodeById.get(edge.dataset.target);
    if (!source || !target) return;
    edgeEndpoints.set(edge, { source, target });
    edgesByNode.get(source).add(edge);
    edgesByNode.get(target).add(edge);
  });
  let motionFrame = null, lastFrameTime = null, releaseTime = 0, layoutFrame = null;
  const boundsFor = (node) => {
    const size = nodeSizes.get(node) || { width: 24, height: 24 };
    return { x: Math.min(0.49, (size.width * 0.55 + 8) / mapSize.width), y: Math.min(0.49, (size.height * 0.55 + 8) / mapSize.height) };
  };
  const clampGraphPosition = (node, position) => {
    const margin = boundsFor(node);
    return { x: Math.min(Math.max(position.x, margin.x), 1 - margin.x), y: Math.min(Math.max(position.y, margin.y), 1 - margin.y) };
  };
  const currentPosition = (node) => nodePositions.get(node) || initialPosition(node, mobileLayout);
  const dragFollowersFor = (node) => {
    const topic = node.dataset.topic;
    return !topic || topic === "all" ? [] : paperNodes.filter((paperNode) => paperNode.dataset.paperTopic === topic);
  };
  const constrainGroupDelta = (startPositions, delta) => {
    let minX = -Infinity, maxX = Infinity, minY = -Infinity, maxY = Infinity;
    startPositions.forEach((position, node) => {
      const margin = boundsFor(node);
      minX = Math.max(minX, margin.x - position.x); maxX = Math.min(maxX, 1 - margin.x - position.x);
      minY = Math.max(minY, margin.y - position.y); maxY = Math.min(maxY, 1 - margin.y - position.y);
    });
    return { x: Math.min(Math.max(delta.x, minX), maxX), y: Math.min(Math.max(delta.y, minY), maxY) };
  };
  const placeNode = (node) => {
    const position = currentPosition(node);
    node.style.setProperty("--graph-x", (position.x * mapSize.width).toFixed(2) + "px");
    node.style.setProperty("--graph-y", (position.y * mapSize.height).toFixed(2) + "px");
  };
  const positionEdges = (changedNodes) => {
    const changedEdges = changedNodes ? new Set([...changedNodes].flatMap((node) => [...edgesByNode.get(node)])) : edges;
    changedEdges.forEach((edge) => {
      const pair = edgeEndpoints.get(edge);
      if (!pair) return;
      const source = currentPosition(pair.source), target = currentPosition(pair.target);
      const dx = (target.x - source.x) * mapSize.width, dy = (target.y - source.y) * mapSize.height;
      edge.style.setProperty("--edge-left", (source.x * mapSize.width).toFixed(2) + "px");
      edge.style.setProperty("--edge-top", (source.y * mapSize.height).toFixed(2) + "px");
      edge.style.setProperty("--edge-length", Math.hypot(dx, dy).toFixed(2));
      edge.style.setProperty("--edge-angle", Math.atan2(dy, dx) + "rad");
    });
  };
  const stopMotion = () => {
    if (motionFrame !== null) cancelAnimationFrame(motionFrame);
    motionFrame = null; lastFrameTime = null;
    const previousDrag = dragState;
    dragState = null;
    if (previousDrag?.node.hasPointerCapture?.(previousDrag.pointerId)) previousDrag.node.releasePointerCapture(previousDrag.pointerId);
    previousDrag?.node.classList.remove("is-dragging");
    const changed = new Set(movingNodes);
    movingNodes.forEach((node) => {
      const state = motion.get(node);
      if (state) nodePositions.set(node, { x: state.x, y: state.y });
      node.classList.remove("is-dragging", "is-topic-dragging");
      placeNode(node);
    });
    positionEdges(changed);
    movingNodes.clear();
    knowledgeMap.classList.remove("is-drag-active");
  };
  const layoutGraph = () => {
    layoutFrame = null;
    if (disclosure && !disclosure.open) return;
    const rect = knowledgeMap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    stopMotion();
    // Cache geometry on open/resize only. Drag frames below never read layout.
    mapSize = { width: rect.width, height: rect.height };
    draggableNodes.forEach((node) => nodeSizes.set(node, { width: node.offsetWidth, height: node.offsetHeight }));
    const isMobile = window.matchMedia("(max-width: 680px)").matches;
    const reset = mobileLayout === null || mobileLayout !== isMobile;
    mobileLayout = isMobile;
    draggableNodes.forEach((node) => nodePositions.set(node, clampGraphPosition(node, reset ? initialPosition(node, isMobile) : currentPosition(node))));
    draggableNodes.forEach(placeNode);
    positionEdges();
    knowledgeMap.classList.add("is-layout-ready");
  };
  const requestGraphLayout = () => { if (layoutFrame === null) layoutFrame = requestAnimationFrame(layoutGraph); };
  const updateDragTargets = () => {
    if (!dragState) return;
    const delta = constrainGroupDelta(dragState.startPositions, { x: (dragState.latestX - dragState.startX) / mapSize.width, y: (dragState.latestY - dragState.startY) / mapSize.height });
    dragState.nodes.forEach((node) => {
      const start = dragState.startPositions.get(node), state = motion.get(node);
      state.x = start.x + delta.x; state.y = start.y + delta.y;
      movingNodes.add(node);
    });
  };
  const animateGraph = (now) => {
    motionFrame = null;
    const dt = Math.min(0.032, Math.max(0.008, lastFrameTime === null ? 1 / 60 : (now - lastFrameTime) / 1000));
    lastFrameTime = now;
    updateDragTargets();
    const changed = new Set();
    movingNodes.forEach((node) => {
      const state = motion.get(node), previous = currentPosition(node);
      const held = dragState?.node === node;
      let x = previous.x, y = previous.y;
      if (held || reduceMotion.matches) {
        x = state.x; y = state.y;
        if (held && (x !== previous.x || y !== previous.y)) {
          state.vx = Math.max(-0.3, Math.min(0.3, (x - previous.x) / dt));
          state.vy = Math.max(-0.3, Math.min(0.3, (y - previous.y) / dt));
          state.lastMoved = now;
        }
      } else {
        // A bounded spring adds trailing motion without an all-pairs simulation.
        state.vx += ((state.x - x) * state.stiffness - state.vx * 19) * dt;
        state.vy += ((state.y - y) * state.stiffness - state.vy * 19) * dt;
        x += state.vx * dt; y += state.vy * dt;
      }
      const clipped = clampGraphPosition(node, { x, y });
      if (clipped.x !== x) state.vx = 0;
      if (clipped.y !== y) state.vy = 0;
      x = clipped.x; y = clipped.y;
      const atRest = Math.hypot((x - state.x) * mapSize.width, (y - state.y) * mapSize.height) < 0.15 && Math.hypot(state.vx * mapSize.width, state.vy * mapSize.height) < 2;
      if (atRest || (!dragState && now - releaseTime > 1400) || reduceMotion.matches || held) {
        if (!held || reduceMotion.matches) { x = state.x; y = state.y; state.vx = 0; state.vy = 0; }
        movingNodes.delete(node);
        if (!held) node.classList.remove("is-topic-dragging");
      }
      if (x !== previous.x || y !== previous.y) { nodePositions.set(node, { x, y }); changed.add(node); }
    });
    changed.forEach(placeNode);
    if (changed.size) positionEdges(changed);
    if (movingNodes.size) motionFrame = requestAnimationFrame(animateGraph);
    else { lastFrameTime = null; if (!dragState) knowledgeMap.classList.remove("is-drag-active"); }
  };
  const requestMotionFrame = () => { if (motionFrame === null) motionFrame = requestAnimationFrame(animateGraph); };

  const positionTooltip = (paperNode) => {
    if (!paperTooltip || paperTooltip.hidden) return;
    const mapBounds = knowledgeMap.getBoundingClientRect();
    const nodeBounds = paperNode.getBoundingClientRect();
    const tooltipBounds = paperTooltip.getBoundingClientRect();
    const preferredLeft = nodeBounds.right - mapBounds.left + 12;
    const preferredTop = nodeBounds.top - mapBounds.top - tooltipBounds.height / 2;
    const maxLeft = Math.max(12, mapBounds.width - tooltipBounds.width - 12);
    const maxTop = Math.max(12, mapBounds.height - tooltipBounds.height - 12);
    paperTooltip.style.left = `${Math.min(Math.max(preferredLeft, 12), maxLeft)}px`;
    paperTooltip.style.top = `${Math.min(Math.max(preferredTop, 12), maxTop)}px`;
  };

  const showPaperTooltip = (paperNode) => {
    if (!paperTooltip) return;
    const title = document.createElement("strong");
    const meta = document.createElement("span");
    title.textContent = paperNode.dataset.paperTitle || "Untitled paper";
    const featuredPrefix = paperNode.dataset.paperFeatured === "true" ? "★ CNS / major family journal · " : "";
    meta.textContent = `${featuredPrefix}${paperNode.dataset.paperMeta || "Metadata unavailable in Zotero"}`;
    paperTooltip.replaceChildren(title, meta);
    paperTooltip.hidden = false;
    positionTooltip(paperNode);
  };

  const hidePaperTooltip = () => {
    if (paperTooltip) paperTooltip.hidden = true;
  };

  const clearPaperSelection = () => {
    selectedPaper = null;
    paperNodes.forEach((node) => {
      node.classList.remove("is-selected");
      node.setAttribute("aria-pressed", "false");
    });
    records.forEach((record) => record.classList.remove("is-graph-selected"));
    hidePaperTooltip();
  };

  const jumpToPaper = (paperNode) => {
    const targetRecord = records.find((record) => record.dataset.recordId === paperNode.dataset.paperRecord);
    if (!targetRecord) return;

    if (activeTopic && !targetRecord.dataset.readingTopics.split(" ").includes(activeTopic)) {
      applyTopic(null);
    }
    if (targetRecord.hidden) {
      if (searchInput?.value) searchInput.value = "";
      if (yearSelect?.value) {
        yearSelect.value = "";
        syncYearPicker();
      }
      if (featuredFilter?.getAttribute("aria-pressed") === "true" && targetRecord.dataset.readingFeatured !== "true") {
        featuredFilter.setAttribute("aria-pressed", "false");
      }
      updateReadingList();
    }

    selectedPaper = paperNode;
    paperNodes.forEach((node) => {
      const isSelected = node === paperNode;
      node.classList.toggle("is-selected", isSelected);
      node.setAttribute("aria-pressed", String(isSelected));
    });
    records.forEach((record) => {
      record.classList.toggle("is-graph-selected", record.dataset.recordId === paperNode.dataset.paperRecord);
    });
    hidePaperTooltip();
    targetRecord.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
    targetRecord.focus({ preventScroll: true });
  };

  const filterUrl = () => {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries({ q: searchInput?.value.trim(), year: yearSelect?.value, topic: activeTopic, starred: featuredFilter?.getAttribute("aria-pressed") === "true" ? "1" : "" })) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    return url;
  };
  const persistFilters = (mode = "push") => {
    window.clearTimeout(urlTimer);
    const url = filterUrl();
    if (url.href !== window.location.href) window.history[mode === "replace" ? "replaceState" : "pushState"](null, "", url);
  };

  const updateReadingList = (historyMode = "push") => {
    const query = normalizeText(searchInput?.value);
    const selectedYear = yearSelect?.value || "";
    const featuredOnly = featuredFilter?.getAttribute("aria-pressed") === "true";
    let visibleCount = 0;

    recordIndex.forEach(({ node: record, topics, search }) => {
      const topicMatch = !activeTopic || topics.includes(activeTopic);
      const yearMatch = !selectedYear || record.dataset.readingYear === selectedYear;
      const featuredMatch = !featuredOnly || record.dataset.readingFeatured === "true";
      const searchMatch = !query || search.includes(query);
      record.hidden = !(topicMatch && yearMatch && featuredMatch && searchMatch);
      if (!record.hidden) visibleCount += 1;
    });

    yearGroups.forEach((group) => {
      const groupVisibleCount = group.querySelectorAll(".reading-list-item:not([hidden])").length;
      const groupCount = group.querySelector("[data-reading-year-count]");
      const navLink = yearNavLinks.find((link) => link.dataset.readingYearLink === group.dataset.readingYearGroup);
      group.hidden = groupVisibleCount === 0;
      if (groupCount) groupCount.textContent = `${groupVisibleCount} ${groupVisibleCount === 1 ? "paper" : "papers"}`;
      if (navLink) {
        const isUnavailable = groupVisibleCount === 0;
        navLink.classList.toggle("is-unavailable", isUnavailable);
        navLink.setAttribute("aria-disabled", String(isUnavailable));
        if (isUnavailable) navLink.setAttribute("tabindex", "-1");
        else navLink.removeAttribute("tabindex");
      }
    });

    requestYearNavigationUpdate();

    if (readingEmpty) readingEmpty.hidden = visibleCount !== 0;
    if (readingStatus) {
      const topicLabel = activeTopic
        ? nodeByTopic.get(activeTopic)?.querySelector(".graph-node-label")?.textContent
        : "";
      const topicText = topicLabel ? ` in ${topicLabel}` : "";
      const yearText = selectedYear ? ` from ${selectedYear}` : "";
      const featuredText = featuredOnly ? ` marked ★ (${featuredFilter.dataset.readingFeaturedLabel})` : "";
      const queryText = query ? ` matching “${searchInput.value.trim()}”` : "";
      readingStatus.textContent = `Showing ${visibleCount} of ${records.length} papers${topicText}${yearText}${featuredText}${queryText}`;
    }
    resetFilters.forEach((button) => { button.disabled = !(searchInput?.value || selectedYear || activeTopic || featuredOnly); });
    if (historyMode) persistFilters(historyMode);
  };

  const renderTopicState = () => {
    topicNodes.forEach((node) => {
      const isAll = node.dataset.topic === "all";
      const isSelected = activeTopic ? node.dataset.topic === activeTopic : isAll;
      const isConnected = Boolean(activeTopic) && isAll;
      node.setAttribute("aria-pressed", String(isSelected));
      node.classList.toggle("is-active", isSelected);
      node.classList.toggle("is-connected", isConnected);
      node.classList.toggle("is-muted", Boolean(activeTopic) && !isSelected && !isConnected);
    });
    paperNodes.forEach((node) => {
      const isTopicActive = Boolean(activeTopic) && node.dataset.paperTopic === activeTopic;
      node.classList.toggle("is-topic-active", isTopicActive);
      node.classList.toggle("is-muted", Boolean(activeTopic) && !isTopicActive);
    });
    edges.forEach((edge) => {
      const isPaperEdge = edge.classList.contains("graph-paper-edge");
      const isActive = Boolean(activeTopic) && (isPaperEdge
        ? edge.dataset.source === activeTopic
        : edge.dataset.source === activeTopic || edge.dataset.target === activeTopic);
      edge.classList.toggle("is-active", isActive);
      edge.classList.toggle("is-muted", Boolean(activeTopic) && !isActive);
    });
    if (selectedPaper && activeTopic && selectedPaper.dataset.paperTopic !== activeTopic) {
      clearPaperSelection();
    }
    if (graphReset) graphReset.disabled = !activeTopic;
    if (graphStatus) {
      const selectedNode = activeTopic ? nodeByTopic.get(activeTopic) : nodeByTopic.get("all");
      const label = selectedNode?.querySelector(".graph-node-label")?.textContent || "All five topics";
      const count = selectedNode?.querySelector(".graph-node-count")?.textContent || records.length;
      graphStatus.textContent = activeTopic ? `${label} · ${count} papers` : `All five topics · ${count} papers`;
    }
    topicFilters.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.topicFilter === (activeTopic || "all"))));
  };
  const applyTopic = (topic) => {
    activeTopic = !topic || topic === "all" || topic === activeTopic ? null : topic;
    renderTopicState();
    updateReadingList();
  };
  const restoreFilters = () => {
    window.clearTimeout(urlTimer);
    const params = new URL(window.location.href).searchParams;
    searchInput.value = params.get("q") || "";
    const year = params.get("year") || "";
    yearSelect.value = yearOptions.some((option) => option.dataset.readingYearOption === year) ? year : "";
    const topic = params.get("topic");
    activeTopic = topic !== "all" && nodeByTopic.has(topic) ? topic : null;
    featuredFilter.setAttribute("aria-pressed", String(params.get("starred") === "1"));
    clearPaperSelection();
    syncYearPicker();
    renderTopicState();
    updateReadingList(null);
  };
  topicFilters.forEach((button) => button.addEventListener("click", () => applyTopic(button.dataset.topicFilter)));
  resetFilters.forEach((button) => button.addEventListener("click", () => {
    searchInput.value = "";
    yearSelect.value = "";
    featuredFilter.setAttribute("aria-pressed", "false");
    clearPaperSelection();
    syncYearPicker();
    applyTopic(null);
    searchInput.focus({ preventScroll: false });
  }));
  document.querySelector("[data-reading-share]")?.addEventListener("click", async () => {
    persistFilters();
    const status = document.querySelector("[data-share-status]");
    try { await navigator.clipboard.writeText(filterUrl().href); status.textContent = "Link copied"; }
    catch { status.textContent = "Copy this URL: " + filterUrl().href; }
  });
  window.addEventListener("popstate", restoreFilters);

  const consumeSuppressedClick = (node, event) => {
    if (!suppressedClicks.has(node)) return false;
    suppressedClicks.delete(node);
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  topicNodes.forEach((node) => {
    node.addEventListener("click", (event) => {
      if (consumeSuppressedClick(node, event)) return;
      applyTopic(node.dataset.topic);
    });
  });

  paperNodes.forEach((node) => {
    node.setAttribute("aria-pressed", "false");
    node.addEventListener("pointerenter", () => { if (!dragState) showPaperTooltip(node); });
    node.addEventListener("pointerleave", hidePaperTooltip);
    node.addEventListener("focus", () => showPaperTooltip(node));
    node.addEventListener("blur", hidePaperTooltip);
    node.addEventListener("click", (event) => {
      if (consumeSuppressedClick(node, event)) return;
      jumpToPaper(node);
    });
  });

  draggableNodes.forEach((node) => {
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || dragState || (event.pointerType === "touch" && node.matches("[data-paper-node]"))) return;
      stopMotion();
      if (!mapSize.width) layoutGraph();
      if (!mapSize.width) return;
      suppressedClicks.delete(node);
      const followers = dragFollowersFor(node), nodes = [node, ...followers];
      nodes.forEach((entry, index) => motion.set(entry, { ...currentPosition(entry), vx: 0, vy: 0, stiffness: 170 + (index % 5) * 10, lastMoved: 0 }));
      dragState = { node, followers, nodes, startPositions: new Map(nodes.map((entry) => [entry, { ...currentPosition(entry) }])), pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, latestX: event.clientX, latestY: event.clientY, moved: false };
      node.setPointerCapture?.(event.pointerId);
      hidePaperTooltip();
    });
  });
  document.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    if (!dragState.moved && Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < 4) return;
    if (!dragState.moved) {
      dragState.node.classList.add("is-dragging");
      dragState.followers.forEach((node) => node.classList.add("is-topic-dragging"));
      knowledgeMap.classList.add("is-drag-active");
    }
    dragState.moved = true;
    dragState.latestX = event.clientX; dragState.latestY = event.clientY;
    event.preventDefault();
    requestMotionFrame();
  });
  const finishDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const { node, moved, pointerId } = dragState;
    if (moved) {
      if (event.type === "pointerup") { dragState.latestX = event.clientX; dragState.latestY = event.clientY; }
      updateDragTargets();
      suppressedClicks.add(node);
      releaseTime = performance.now();
      const leader = motion.get(node);
      if (releaseTime - leader.lastMoved > 90) { leader.vx = 0; leader.vy = 0; }
    }
    dragState = null;
    if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
    node.classList.remove("is-dragging");
    if (moved) requestMotionFrame();
  };
  document.addEventListener("pointerup", finishDrag);
  document.addEventListener("pointercancel", finishDrag);
  draggableNodes.forEach((node) => node.addEventListener("lostpointercapture", (event) => { if (dragState?.node === node) finishDrag(event); }));
  document.querySelector("[data-graph-layout-reset]")?.addEventListener("click", () => { stopMotion(); mobileLayout = null; requestGraphLayout(); });
  disclosure?.addEventListener("toggle", () => { if (disclosure.open) requestGraphLayout(); else { stopMotion(); hidePaperTooltip(); } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopMotion(); });
  reduceMotion.addEventListener("change", stopMotion);
  if ("IntersectionObserver" in window) new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) stopMotion(); }).observe(knowledgeMap);

  graphReset?.addEventListener("click", () => applyTopic(null));
  const searchChanged = () => {
    updateReadingList(null);
    window.clearTimeout(urlTimer);
    urlTimer = window.setTimeout(() => persistFilters(), 300);
  };
  searchInput?.addEventListener("input", searchChanged);
  searchInput?.addEventListener("search", searchChanged);
  featuredFilter?.addEventListener("click", () => {
    const isPressed = featuredFilter.getAttribute("aria-pressed") === "true";
    featuredFilter.setAttribute("aria-pressed", String(!isPressed));
    updateReadingList();
  });
  yearSelect?.addEventListener("change", () => {
    syncYearPicker();
    updateReadingList();
  });
  yearTrigger?.addEventListener("click", () => {
    setYearPickerOpen(yearTrigger.getAttribute("aria-expanded") !== "true");
  });
  yearTrigger?.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && yearTrigger.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      setYearPickerOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setYearPickerOpen(true);
    focusYearOption(event.key === "ArrowDown" ? 0 : yearOptions.length - 1);
  });
  yearOptions.forEach((option) => {
    option.addEventListener("click", () => {
      if (!yearSelect) return;
      yearSelect.value = option.dataset.readingYearOption || "";
      yearSelect.dispatchEvent(new Event("change", { bubbles: true }));
      setYearPickerOpen(false);
      yearTrigger?.focus();
    });
  });
  yearMenu?.addEventListener("keydown", (event) => {
    const currentIndex = yearOptions.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setYearPickerOpen(false);
      yearTrigger?.focus();
      return;
    }
    if ((event.key === "Enter" || event.key === " ") && currentIndex >= 0) {
      event.preventDefault();
      yearOptions[currentIndex].click();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = yearOptions.length - 1;
    else if (event.key === "ArrowDown") nextIndex = (currentIndex + 1 + yearOptions.length) % yearOptions.length;
    else nextIndex = (currentIndex - 1 + yearOptions.length) % yearOptions.length;
    yearOptions[nextIndex].focus();
  });
  yearPicker?.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!yearPicker.contains(document.activeElement)) setYearPickerOpen(false);
    }, 0);
  });
  document.addEventListener("pointerdown", (event) => {
    if (yearPicker && !yearPicker.contains(event.target)) setYearPickerOpen(false);
  });
  yearNavLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (link.getAttribute("aria-disabled") === "true") {
        event.preventDefault();
        return;
      }
      setActiveYear(link.dataset.readingYearLink);
    });
  });
  window.addEventListener("scroll", requestYearNavigationUpdate, { passive: true });
  window.addEventListener("resize", requestYearNavigationUpdate);
  document.addEventListener("keydown", (event) => {
    if (!event.defaultPrevented && event.key === "Escape" && knowledgeMap.contains(event.target) && (activeTopic || selectedPaper)) {
      clearPaperSelection();
      applyTopic(null);
      (disclosure?.open ? nodeByTopic.get("all") : topicFilters[0])?.focus();
    }
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(requestGraphLayout).observe(knowledgeMap);
  } else {
    window.addEventListener("resize", requestGraphLayout);
  }
  document.fonts?.ready.then(requestGraphLayout);
  if (disclosure && window.matchMedia("(min-width: 901px)").matches) disclosure.open = true;
  requestGraphLayout();
  restoreFilters();
}
