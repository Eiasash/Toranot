/* IV Protocols page — toggle and filter logic */
function toggle(el) {
  el.parentElement.classList.toggle("open");
}
function filterCards() {
  var q = document.getElementById("searchInput").value.toLowerCase();
  document.querySelectorAll(".card").forEach(function (c) {
    var kw = c.dataset.keywords || "";
    var text = c.textContent.toLowerCase();
    c.style.display = kw.includes(q) || text.includes(q) ? "" : "none";
  });
}
