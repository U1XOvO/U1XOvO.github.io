const toggle = document.querySelector(".nav-toggle");
const navigation = document.querySelector(".site-nav");

if (toggle && navigation) {
  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    navigation.classList.toggle("is-open", !expanded);
  });

  navigation.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      toggle.setAttribute("aria-expanded", "false");
      navigation.classList.remove("is-open");
    }
  });
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
  const suppressedClicks = new WeakSet();
  let activeTopic = null;
  let selectedPaper = null;
  let dragState = null;
  let mobileLayout = null;
  let yearNavFrame = null;

  const normalizeText = (value) => String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

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

  const clampGraphPosition = (position) => ({
    x: Math.min(Math.max(position.x, 0.025), 0.975),
    y: Math.min(Math.max(position.y, 0.025), 0.975),
  });

  const currentPosition = (node) => nodePositions.get(node)
    || initialPosition(node, mobileLayout ?? window.matchMedia("(max-width: 680px)").matches);

  const dragFollowersFor = (node) => {
    const topic = node.dataset.topic;
    if (!topic || topic === "all") return [];
    return paperNodes.filter((paperNode) => paperNode.dataset.paperTopic === topic);
  };

  const constrainGroupDelta = (startPositions, delta) => {
    let minDeltaX = -Infinity;
    let maxDeltaX = Infinity;
    let minDeltaY = -Infinity;
    let maxDeltaY = Infinity;

    startPositions.forEach((position) => {
      minDeltaX = Math.max(minDeltaX, 0.025 - position.x);
      maxDeltaX = Math.min(maxDeltaX, 0.975 - position.x);
      minDeltaY = Math.max(minDeltaY, 0.025 - position.y);
      maxDeltaY = Math.min(maxDeltaY, 0.975 - position.y);
    });

    return {
      x: Math.min(Math.max(delta.x, minDeltaX), maxDeltaX),
      y: Math.min(Math.max(delta.y, minDeltaY), maxDeltaY),
    };
  };

  const placeNode = (node, position, mapBounds = knowledgeMap.getBoundingClientRect()) => {
    node.style.left = `${position.x * mapBounds.width}px`;
    node.style.top = `${position.y * mapBounds.height}px`;
  };

  const positionEdges = () => {
    const mapBounds = knowledgeMap.getBoundingClientRect();
    edges.forEach((edge) => {
      const source = graphNodeById.get(edge.dataset.source);
      const target = graphNodeById.get(edge.dataset.target);
      if (!source || !target) return;
      const sourceBounds = source.getBoundingClientRect();
      const targetBounds = target.getBoundingClientRect();
      const sourceX = sourceBounds.left + sourceBounds.width / 2 - mapBounds.left;
      const sourceY = sourceBounds.top + sourceBounds.height / 2 - mapBounds.top;
      const targetX = targetBounds.left + targetBounds.width / 2 - mapBounds.left;
      const targetY = targetBounds.top + targetBounds.height / 2 - mapBounds.top;
      const deltaX = targetX - sourceX;
      const deltaY = targetY - sourceY;
      edge.style.setProperty("--edge-left", `${sourceX}px`);
      edge.style.setProperty("--edge-top", `${sourceY}px`);
      edge.style.setProperty("--edge-length", `${Math.hypot(deltaX, deltaY)}px`);
      edge.style.setProperty("--edge-angle", `${Math.atan2(deltaY, deltaX) * 180 / Math.PI}deg`);
    });
  };

  const layoutGraph = () => {
    const mapBounds = knowledgeMap.getBoundingClientRect();
    const isMobile = window.matchMedia("(max-width: 680px)").matches;
    if (mobileLayout === null || mobileLayout !== isMobile) {
      mobileLayout = isMobile;
      draggableNodes.forEach((node) => nodePositions.set(node, initialPosition(node, isMobile)));
    }
    draggableNodes.forEach((node) => placeNode(node, nodePositions.get(node), mapBounds));
    positionEdges();
  };

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

  const updateReadingList = () => {
    const query = normalizeText(searchInput?.value);
    const selectedYear = yearSelect?.value || "";
    const featuredOnly = featuredFilter?.getAttribute("aria-pressed") === "true";
    let visibleCount = 0;

    records.forEach((record) => {
      const topicMatch = !activeTopic || record.dataset.readingTopics.split(" ").includes(activeTopic);
      const yearMatch = !selectedYear || record.dataset.readingYear === selectedYear;
      const featuredMatch = !featuredOnly || record.dataset.readingFeatured === "true";
      const searchMatch = !query || normalizeText(record.dataset.readingSearch).includes(query);
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
  };

  const applyTopic = (topic) => {
    activeTopic = !topic || topic === "all" || topic === activeTopic ? null : topic;
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
    updateReadingList();
  };

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
    node.addEventListener("pointerenter", () => showPaperTooltip(node));
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
      if (event.button !== 0 || dragState) return;
      const followers = dragFollowersFor(node);
      const nodes = [node, ...followers];
      dragState = {
        node,
        followers,
        nodes,
        startPositions: new Map(nodes.map((dragNode) => [dragNode, currentPosition(dragNode)])),
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      };
      node.setPointerCapture?.(event.pointerId);
      node.classList.add("is-dragging");
      if (node.matches("[data-paper-node]")) showPaperTooltip(node);
    });
  });

  document.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!dragState.moved && distance < 4) return;
    if (!dragState.moved) {
      dragState.followers.forEach((node) => node.classList.add("is-topic-dragging"));
    }
    dragState.moved = true;
    event.preventDefault();
    const mapBounds = knowledgeMap.getBoundingClientRect();
    const delta = constrainGroupDelta(dragState.startPositions, {
      x: (event.clientX - dragState.startX) / mapBounds.width,
      y: (event.clientY - dragState.startY) / mapBounds.height,
    });
    dragState.nodes.forEach((node) => {
      const startPosition = dragState.startPositions.get(node);
      const position = clampGraphPosition({
        x: startPosition.x + delta.x,
        y: startPosition.y + delta.y,
      });
      nodePositions.set(node, position);
      placeNode(node, position, mapBounds);
    });
    positionEdges();
    if (dragState.node.matches("[data-paper-node]")) positionTooltip(dragState.node);
  });

  const finishDrag = (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const { node, moved } = dragState;
    if (moved) {
      suppressedClicks.add(node);
      window.setTimeout(() => suppressedClicks.delete(node), 0);
    }
    if (node.hasPointerCapture?.(event.pointerId)) node.releasePointerCapture(event.pointerId);
    node.classList.remove("is-dragging");
    dragState.followers.forEach((follower) => follower.classList.remove("is-topic-dragging"));
    dragState = null;
  };

  document.addEventListener("pointerup", finishDrag);
  document.addEventListener("pointercancel", finishDrag);

  graphReset?.addEventListener("click", () => applyTopic(null));
  searchInput?.addEventListener("input", updateReadingList);
  searchInput?.addEventListener("search", updateReadingList);
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
    if (event.key === "Escape" && (activeTopic || selectedPaper)) {
      clearPaperSelection();
      applyTopic(null);
      nodeByTopic.get("all")?.focus();
    }
  });

  if ("ResizeObserver" in window) {
    new ResizeObserver(layoutGraph).observe(knowledgeMap);
  } else {
    window.addEventListener("resize", layoutGraph);
  }
  document.fonts?.ready.then(layoutGraph);
  requestAnimationFrame(layoutGraph);
  syncYearPicker();
  updateReadingList();
}
