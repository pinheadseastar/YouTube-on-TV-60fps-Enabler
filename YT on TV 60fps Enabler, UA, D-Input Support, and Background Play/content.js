// Inject the script into the page context as early as possible
const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = function() {
    this.remove();
};
// Prepend to documentElement to ensure it's before any other scripts
(document.head || document.documentElement).prepend(script);
