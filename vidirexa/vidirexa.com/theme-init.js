(function () {
  var theme = 'dark';
  var stored;
  try { stored = window.localStorage.getItem('vireel:theme'); } catch (_) {}
  if (stored === 'light' || stored === 'dark') theme = stored;
  document.documentElement.dataset.theme = theme;
  // JS is running: the server-rendered crawlable fallback (#root > .ssr-root) stays hidden until React replaces it.
  document.documentElement.dataset.js = '';
  document.documentElement.style.colorScheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f6f8' : '#0c1015');
  // Perf U2: index.html loads the app stylesheet with media="print" (not render-blocking) and src/main.tsx switches it on;
  // this is the fallback for a page whose bundle never runs.
  window.addEventListener('load', function () {
    var links = document.querySelectorAll('link[data-app-css]');
    for (var i = 0; i < links.length; i++) links[i].media = 'all';
  });
})();
