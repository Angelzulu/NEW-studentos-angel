// Student OS Admin — interactions

document.addEventListener("DOMContentLoaded", function () {
  // ── Sidebar toggle (mobile) ──────────────────────────────────────
  const sidebarToggle = document.querySelector(".sidebar-toggle");
  const sidebar       = document.querySelector(".admin-sidebar");
  const backdrop      = document.querySelector(".admin-sidebar-backdrop");

  function closeSidebar() {
    sidebar  && sidebar.classList.remove("open");
    backdrop && backdrop.classList.remove("open");
  }
  function toggleSidebar() {
    sidebar  && sidebar.classList.toggle("open");
    backdrop && backdrop.classList.toggle("open");
  }
  sidebarToggle && sidebarToggle.addEventListener("click", toggleSidebar);
  backdrop      && backdrop.addEventListener("click", closeSidebar);

  // ── Upload content tabs ──────────────────────────────────────────
  const tabs   = document.querySelectorAll(".upload-tab");
  const panels = document.querySelectorAll(".upload-panel");

  function showTab(tabName) {
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === tabName));
    panels.forEach(p => p.classList.toggle("active", p.id === "tab-" + tabName));
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      showTab(tab.dataset.tab);
      // Update URL hash for bookmarking without page reload
      history.replaceState(null, "", "?tab=" + tab.dataset.tab);
    });
  });

  // Pre-select tab from URL ?tab= param
  const urlTab = new URLSearchParams(window.location.search).get("tab");
  if (urlTab && document.getElementById("tab-" + urlTab)) {
    showTab(urlTab);
  }

  // ── Auto-dismiss flash banners ───────────────────────────────────
  const flash = document.querySelector(".flash-banner");
  if (flash) {
    setTimeout(function () {
      flash.style.transition = "opacity 0.5s";
      flash.style.opacity = "0";
      setTimeout(function () { flash.remove(); }, 500);
    }, 4000);
  }
});
