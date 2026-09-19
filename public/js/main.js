// Student OS - public site interactions (v0.1)
// Kept intentionally simple: mobile nav toggle + filter form submit.

document.addEventListener("DOMContentLoaded", function () {
  const navToggle = document.querySelector(".nav-toggle");
  const mainNav = document.querySelector(".main-nav");

  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      mainNav.classList.toggle("open");
      navToggle.classList.toggle("is-open");
    });
  }

  // Subtle reveal-on-scroll for card grids (student pages only).
  // Respects prefers-reduced-motion and degrades to "just show everything"
  // if IntersectionObserver isn't available.
  var prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var revealTargets = document.querySelectorAll(".card, .material-card, .announce-item");

  if (revealTargets.length && !prefersReducedMotion && "IntersectionObserver" in window) {
    revealTargets.forEach(function (el) { el.classList.add("reveal-on-scroll"); });

    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" });

    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  }

  // Auto-submit filter selects on the Past Papers page
  const filterForm = document.querySelector("#papers-filter-form");
  if (filterForm) {
    filterForm.querySelectorAll("select").forEach(function (select) {
      select.addEventListener("change", function () {
        filterForm.submit();
      });
    });
  }

  // Basic homepage search -> redirects to /papers with a query
  const heroSearchForm = document.querySelector("#hero-search-form");
  if (heroSearchForm) {
    heroSearchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const input = heroSearchForm.querySelector("input[name='q']");
      const query = input && input.value ? input.value.trim() : "";
      window.location.href = "/papers" + (query ? "?q=" + encodeURIComponent(query) : "");
    });
  }
});
