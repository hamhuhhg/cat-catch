(function () {
    function getMessage(key) {
        if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
            return chrome.i18n.getMessage(key) || key; // Fallback to key if message not found
        }
        return key; // Fallback if getMessage is not available
    }

    document.querySelectorAll('[data-i18n]').forEach(function (element) {
        element.innerHTML = getMessage(element.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-outer]').forEach(function (element) {
        element.outerHTML = getMessage(element.dataset.i18nOuter);
    });
    document.querySelectorAll('i18n').forEach(function (element) {
        element.outerHTML = getMessage(element.innerHTML);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (element) {
        element.setAttribute('placeholder', getMessage(element.dataset.i18nPlaceholder));
    });
    // document.title = getMessage(document.title); // This might be problematic if title is complex
    // Safer to only localize if title is a simple message key
    if (document.title && document.title.startsWith('__MSG_') && document.title.endsWith('__')) {
         document.title = getMessage(document.title.substring(6, document.title.length - 2));
    } else {
         document.title = getMessage(document.title) || document.title;
    }
})();