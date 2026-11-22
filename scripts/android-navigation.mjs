// Remove the captured site's obsolete bottom navigation on Android only.
// Keep other platforms and the browser's system navigation unchanged.
if(/Android/i.test(navigator.userAgent)){
 document.documentElement.classList.add('vidirexa-android');
 document.querySelectorAll('nav.mobile-bottom-nav').forEach(nav=>nav.remove());
}
