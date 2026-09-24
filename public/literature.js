const readingList = document.querySelector("#reading-list");
if (readingList) {
  const records = [...readingList.querySelectorAll("[data-reading-topics]")];
  const yearGroups = [...readingList.querySelectorAll("[data-reading-year-group]")];
  const yearNavLinks = [...document.querySelectorAll("[data-reading-year-link]")];
  const topicFilters = [...document.querySelectorAll("[data-topic-filter]")];
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
  const resetFilters = [...document.querySelectorAll("[data-reading-reset]")];
  const topicNames = new Map(topicFilters.map((button) => [button.dataset.topicFilter, button.firstChild.textContent.trim()]));
  const normalize = (value) => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();
  const recordIndex = records.map((node) => ({
    node,
    topics: node.dataset.readingTopics.split(" "),
    search: normalize(node.dataset.readingSearch),
  }));
  let activeTopic = null;
  let searchTimer = null;
  let yearFrame = null;

  const syncYearPicker = () => {
    const selected = yearOptions.find((option) => option.dataset.readingYearOption === yearSelect.value);
    if (selected) yearValue.textContent = selected.querySelector(".reading-year-option-label").textContent;
    yearOptions.forEach((option) => option.setAttribute("aria-selected", String(option === selected)));
  };
  const setYearPickerOpen = (open) => {
    yearPicker.classList.toggle("is-open", open);
    yearTrigger.setAttribute("aria-expanded", String(open));
    yearMenu.hidden = !open;
  };
  const updateActiveYear = () => {
    yearFrame = null;
    const visible = yearGroups.filter((group) => !group.hidden);
    let current = visible[0];
    visible.forEach((group) => {
      if (group.getBoundingClientRect().top <= Math.min(160, innerHeight * 0.22)) current = group;
    });
    yearNavLinks.forEach((link) => {
      const active = current?.dataset.readingYearGroup === link.dataset.readingYearLink;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };
  const requestYearUpdate = () => {
    if (yearFrame === null) yearFrame = requestAnimationFrame(updateActiveYear);
  };
  const filterUrl = () => {
    const url = new URL(location.href);
    const values = {
      q: searchInput.value.trim(),
      year: yearSelect.value,
      topic: activeTopic,
      starred: featuredFilter.getAttribute("aria-pressed") === "true" ? "1" : "",
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    });
    return url;
  };
  const persistFilters = () => {
    const url = filterUrl();
    if (url.href !== location.href) history.pushState(null, "", url);
  };
  const updateReadingList = (persist = true) => {
    const q = normalize(searchInput.value);
    const year = yearSelect.value;
    const starred = featuredFilter.getAttribute("aria-pressed") === "true";
    let count = 0;
    recordIndex.forEach(({ node, topics, search }) => {
      node.hidden = Boolean(
        (activeTopic && !topics.includes(activeTopic)) ||
        (year && node.dataset.readingYear !== year) ||
        (starred && node.dataset.readingFeatured !== "true") ||
        (q && !search.includes(q))
      );
      if (!node.hidden) count += 1;
    });
    yearGroups.forEach((group) => {
      const n = group.querySelectorAll(".reading-list-item:not([hidden])").length;
      group.hidden = n === 0;
      group.querySelector("[data-reading-year-count]").textContent = `${n} ${n === 1 ? "paper" : "papers"}`;
      const link = yearNavLinks.find((item) => item.dataset.readingYearLink === group.dataset.readingYearGroup);
      link.classList.toggle("is-unavailable", n === 0);
      link.setAttribute("aria-disabled", String(n === 0));
      if (n === 0) link.setAttribute("tabindex", "-1");
      else link.removeAttribute("tabindex");
    });
    readingEmpty.hidden = count !== 0;
    const detail = [
      activeTopic ? `in ${topicNames.get(activeTopic)}` : "",
      year ? `from ${year}` : "",
      starred ? `marked ★ (${featuredFilter.dataset.readingFeaturedLabel})` : "",
      q ? `matching “${searchInput.value.trim()}”` : "",
    ].filter(Boolean).join(" ");
    readingStatus.textContent = `Showing ${count} of ${records.length} papers${detail ? ` ${detail}` : ""}`;
    resetFilters.forEach((button) => { button.disabled = !(q || year || activeTopic || starred); });
    topicFilters.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.topicFilter === (activeTopic || "all"))));
    requestYearUpdate();
    if (persist) persistFilters();
  };

  topicFilters.forEach((button) => button.addEventListener("click", () => {
    const id = button.dataset.topicFilter;
    activeTopic = id === "all" || id === activeTopic ? null : id;
    updateReadingList();
  }));
  resetFilters.forEach((button) => button.addEventListener("click", () => {
    searchInput.value = "";
    yearSelect.value = "";
    featuredFilter.setAttribute("aria-pressed", "false");
    activeTopic = null;
    syncYearPicker();
    updateReadingList();
    searchInput.focus();
  }));
  const searchChanged = () => {
    updateReadingList(false);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(persistFilters, 300);
  };
  searchInput.addEventListener("input", searchChanged);
  searchInput.addEventListener("search", searchChanged);
  featuredFilter.addEventListener("click", () => {
    featuredFilter.setAttribute("aria-pressed", String(featuredFilter.getAttribute("aria-pressed") !== "true"));
    updateReadingList();
  });
  yearSelect.addEventListener("change", () => { syncYearPicker(); updateReadingList(); });
  yearTrigger.addEventListener("click", () => setYearPickerOpen(yearTrigger.getAttribute("aria-expanded") !== "true"));
  yearTrigger.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { setYearPickerOpen(false); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    setYearPickerOpen(true);
    yearOptions[event.key === "ArrowDown" ? 0 : yearOptions.length - 1].focus();
  });
  yearOptions.forEach((option) => option.addEventListener("click", () => {
    yearSelect.value = option.dataset.readingYearOption;
    yearSelect.dispatchEvent(new Event("change", { bubbles: true }));
    setYearPickerOpen(false);
    yearTrigger.focus();
  }));
  yearMenu.addEventListener("keydown", (event) => {
    const current = yearOptions.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault(); setYearPickerOpen(false); yearTrigger.focus(); return;
    }
    if ((event.key === "Enter" || event.key === " ") && current >= 0) {
      event.preventDefault(); yearOptions[current].click(); return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? yearOptions.length - 1
      : event.key === "ArrowDown" ? (current + 1 + yearOptions.length) % yearOptions.length
      : (current - 1 + yearOptions.length) % yearOptions.length;
    yearOptions[next].focus();
  });
  yearPicker.addEventListener("focusout", () => setTimeout(() => {
    if (!yearPicker.contains(document.activeElement)) setYearPickerOpen(false);
  }, 0));
  document.addEventListener("pointerdown", (event) => {
    if (!yearPicker.contains(event.target)) setYearPickerOpen(false);
  });
  yearNavLinks.forEach((link) => link.addEventListener("click", (event) => {
    if (link.getAttribute("aria-disabled") === "true") event.preventDefault();
  }));
  window.addEventListener("scroll", requestYearUpdate, { passive: true });
  window.addEventListener("resize", requestYearUpdate);
  const restoreFilters = () => {
    clearTimeout(searchTimer);
    const params = new URL(location.href).searchParams;
    searchInput.value = params.get("q") || "";
    yearSelect.value = yearOptions.some((option) => option.dataset.readingYearOption === params.get("year")) ? params.get("year") : "";
    activeTopic = topicNames.has(params.get("topic")) && params.get("topic") !== "all" ? params.get("topic") : null;
    featuredFilter.setAttribute("aria-pressed", String(params.get("starred") === "1"));
    syncYearPicker();
    updateReadingList(false);
  };
  window.addEventListener("popstate", restoreFilters);
  restoreFilters();
}
