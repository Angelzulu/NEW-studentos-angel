// Student OS - public site interactions (v0.1)
// Kept intentionally simple: mobile nav toggle + filter form submit.

document.addEventListener("DOMContentLoaded", function () {
  const navToggle = document.querySelector(".nav-toggle");
  const mainNav = document.querySelector(".main-nav");

  if (navToggle && mainNav) {
    navToggle.addEventListener("click", function () {
      mainNav.classList.toggle("open");
    });
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
