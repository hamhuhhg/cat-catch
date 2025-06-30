// 兼容Firefox
if (typeof (browser) == "object") {
    // The importScripts() polyfill that was here was incorrect for MV3 service workers and has been removed.
    // Native importScripts() should be used in background.js.

    // browser.windows.onFocusChanged.addListener 少一个参数
    const _onFocusChanged = chrome.windows.onFocusChanged.addListener;
    chrome.windows.onFocusChanged.addListener = function (listener) {
        _onFocusChanged(listener);
    };

    browser.runtime.onInstalled.addListener(({ reason }) => {
        if (reason == "install") {
            browser.tabs.create({ url: "install.html" });
        }
    });
}