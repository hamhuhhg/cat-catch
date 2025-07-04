// 低版本chrome manifest v3协议 会有 getMessage 函数不存在的bug
if (chrome.i18n.getMessage === undefined) {
    chrome.i18n.getMessage = (key) => key;
    fetch(chrome.runtime.getURL("_locales/zh_CN/messages.json")).then(res => res.json()).then(data => {
        chrome.i18n.getMessage = (key) => data[key].messages;
    }).catch((e) => { console.error(e); });
}
/**
 * 部分修改版chrome 不存在 chrome.downloads API
 * 例如 夸克浏览器
 * 使用传统下载方式下载 但无法监听 无法另存为 无法判断下载是否失败 唉~
 */
if (!chrome.downloads) {
    chrome.downloads = {
        download: function (options, callback) {
            let a = document.createElement('a');
            a.href = options.url;
            a.download = options.filename;
            a.click();
            // delete a; // Removed: 'delete' on unqualified name is deprecated and not needed here.
            callback && callback();
        },
        onChanged: { addListener: function () { } },
        showDefaultFolder: function () { },
        show: function () { },
    }
}
// 兼容 114版本以下没有chrome.sidePanel
if (!chrome.sidePanel) {
    chrome.sidePanel = {
        setOptions: function (options) { },
        setPanelBehavior: function (options) { },
    }
}

// 简写翻译函数
export const i18n = new Proxy(chrome.i18n.getMessage, {
    get: function (target, key) {
        // Ensure chrome.i18n.getMessage is available before calling
        if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
            return chrome.i18n.getMessage(key);
        }
        return key; // Fallback
    }
});
// 全局变量
export var G = {};
G.initSyncComplete = false;
G.initLocalComplete = false;
// 缓存数据
export var cacheData = { init: true };
G.blackList = new Set();    // 正则屏蔽资源列表
G.blockUrlSet = new Set();    // 屏蔽网址列表
G.requestHeaders = new Map();   // 临时储存请求头
G.urlMap = new Map();   // url查重map
G.deepSearchTemporarilyClose = null; // 深度搜索临时变量

// 初始化当前tabId
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].id) {
        G.tabId = tabs[0].id;
    } else {
        G.tabId = -1;
    }
});

// 手机浏览器
G.isMobile = /Mobile|Android|iPhone|iPad/i.test(navigator.userAgent);

// 所有设置变量 默认值
G.OptionLists = {
    Ext: [
        { "ext": "flv", "size": 0, "state": true },
        { "ext": "hlv", "size": 0, "state": true },
        { "ext": "f4v", "size": 0, "state": true },
        { "ext": "mp4", "size": 0, "state": true },
        { "ext": "mp3", "size": 0, "state": true },
        { "ext": "wma", "size": 0, "state": true },
        { "ext": "wav", "size": 0, "state": true },
        { "ext": "m4a", "size": 0, "state": true },
        { "ext": "ts", "size": 0, "state": false },
        { "ext": "webm", "size": 0, "state": true },
        { "ext": "ogg", "size": 0, "state": true },
        { "ext": "ogv", "size": 0, "state": true },
        { "ext": "acc", "size": 0, "state": true },
        { "ext": "mov", "size": 0, "state": true },
        { "ext": "mkv", "size": 0, "state": true },
        { "ext": "m4s", "size": 0, "state": true },
        { "ext": "m3u8", "size": 0, "state": true },
        { "ext": "m3u", "size": 0, "state": true },
        { "ext": "mpeg", "size": 0, "state": true },
        { "ext": "avi", "size": 0, "state": true },
        { "ext": "wmv", "size": 0, "state": true },
        { "ext": "asf", "size": 0, "state": true },
        { "ext": "movie", "size": 0, "state": true },
        { "ext": "divx", "size": 0, "state": true },
        { "ext": "mpeg4", "size": 0, "state": true },
        { "ext": "vid", "size": 0, "state": true },
        { "ext": "aac", "size": 0, "state": true },
        { "ext": "mpd", "size": 0, "state": true },
        { "ext": "weba", "size": 0, "state": true },
        { "ext": "opus", "size": 0, "state": true },
    ],
    Type: [
        { "type": "audio/*", "size": 0, "state": true },
        { "type": "video/*", "size": 0, "state": true },
        { "type": "application/ogg", "size": 0, "state": true },
        { "type": "application/vnd.apple.mpegurl", "size": 0, "state": true },
        { "type": "application/x-mpegurl", "size": 0, "state": true },
        { "type": "application/mpegurl", "size": 0, "state": true },
        { "type": "application/octet-stream-m3u8", "size": 0, "state": true },
        { "type": "application/dash+xml", "size": 0, "state": true },
        { "type": "application/m4s", "size": 0, "state": true },
    ],
    Regex: [
        { "type": "ig", "regex": "https://cache\\.video\\.[a-z]*\\.com/dash\\?tvid=.*", "ext": "json", "state": false },
        { "type": "ig", "regex": ".*\\.bilivideo\\.(com|cn).*\\/live-bvc\\/.*m4s", "ext": "", "blackList": true, "state": false },
    ],
    TitleName: false,
    Player: "",
    ShowWebIco: !G.isMobile,
    MobileUserAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1",
    m3u8dl: 0,
    m3u8dlArg: `"\${url}" --save-dir "%USERPROFILE%\\Downloads\\m3u8dl" --save-name "\${title}_\${now}" \${referer|exists:'-H "Referer:*"'} \${cookie|exists:'-H "Cookie:*"'} --no-log`,
    m3u8dlConfirm: false,
    playbackRate: 2,
    copyM3U8: "${url}",
    copyMPD: "${url}",
    copyOther: "${url}",
    autoClearMode: 1,
    catDownload: false,
    saveAs: false,
    userAgent: "",
    downFileName: "${title}.${ext}",
    css: "",
    checkDuplicates: true,
    enable: true,
    downActive: !G.isMobile,    // 手机端默认不启用 后台下载
    downAutoClose: false,
    downStream: false,
    aria2Rpc: "http://localhost:6800/jsonrpc",
    enableAria2Rpc: false,
    enableAria2RpcReferer: true,
    aria2RpcToken: "",
    m3u8AutoDown: true,
    badgeNumber: true,
    send2local: false,
    send2localManual: false,
    send2localURL: "http://127.0.0.1:8000/",
    send2localMethod: 'POST',
    send2localBody: '{"action": "${action}", "data": ${data}, "tabId": "${tabId}"}',
    send2localType: 0,
    popup: false,
    popupMode: 0, // 0:preview.html 1:popup.html 2:window preview.html 3: window popup.html
    invoke: false,
    invokeText: `m3u8dlre:"\${url}" --save-dir "%USERPROFILE%\\Downloads" --del-after-done --save-name "\${title}_\${now}" --auto-select \${referer|exists:'-H "Referer: *"'}`,
    invokeConfirm: false,
    // m3u8解析器默认参数
    M3u8Thread: 6,
    M3u8Mp4: false,
    M3u8OnlyAudio: false,
    M3u8SkipDecrypt: false,
    M3u8StreamSaver: false,
    M3u8Ffmpeg: true,
    M3u8AutoClose: false,
    // 第三方服务地址
    onlineServiceAddress: 0,
    chromeLimitSize: 1.8 * 1024 * 1024 * 1024,
    blockUrl: [],
    blockUrlWhite: false,
    maxLength: G.isMobile ? 999 : 9999,
    sidePanel: false,   // 侧边栏
    deepSearch: false, // 常开深度搜索
    autoCaptureEnabled: false,
    watchedOnNextVideo: true,
    watchedOnTabClose: true,
    watchedOnCaptureComplete: true,
};
// 本地储存的配置
G.LocalVar = {
    featMobileTabId: [],
    featAutoDownTabId: [],
    mediaControl: { tabid: 0, index: -1 }
};

// 102版本以上 非Firefox 开启更多功能
G.isFirefox = (typeof browser == "object");
G.version = navigator.userAgent.match(/(Chrome|Firefox)\/([\d]+)/);
G.version = G.version && G.version[2] ? parseInt(G.version[2]) : 93;

// 脚本列表
G.scriptList = new Map();
G.scriptList.set("search.js", { key: "search", refresh: true, allFrames: true, world: "MAIN", name: i18n.deepSearch, off: i18n.closeSearch, i18n: false, tabId: new Set() });
G.scriptList.set("catch.js", { key: "catch", refresh: true, allFrames: true, world: "MAIN", name: i18n.cacheCapture, off: i18n.closeCapture, i18n: true, tabId: new Set() });
G.scriptList.set("recorder.js", { key: "recorder", refresh: false, allFrames: true, world: "MAIN", name: i18n.videoRecording, off: i18n.closeRecording, i18n: true, tabId: new Set() });
G.scriptList.set("recorder2.js", { key: "recorder2", refresh: false, allFrames: false, world: "ISOLATED", name: i18n.screenCapture, off: i18n.closeCapture, i18n: true, tabId: new Set() });
G.scriptList.set("webrtc.js", { key: "webrtc", refresh: true, allFrames: true, world: "MAIN", name: i18n.recordWebRTC, off: i18n.closeRecording, i18n: true, tabId: new Set() });

// ffmpeg
G.ffmpegConfig = {
    tab: 0,
    cacheData: [],
    version: 1,
    get url() {
        return G.onlineServiceAddress == 0 ? "https://ffmpeg.bmmmd.com/" : "https://ffmpeg2.bmmmd.com/";
    }
}
// streamSaver 边下边存
G.streamSaverConfig = {
    get url() {
        return G.onlineServiceAddress == 0 ? "https://stream.bmmmd.com/mitm.html" : "https://stream2.bmmmd.com/mitm.html";
    }
}

// 正则预编译
export const reFilename = /filename="?([^"]+)"?/;
export const reStringModify = /[<>:"\/\\|?*~]/g;
export const reFilterFileName = /[<>:"|?*~]/g;
export const reTemplates = /\${([^}|]+)(?:\|([^}]+))?}/g;
export const reJSONparse = /([{,]\s*)([\w-]+)(\s*:)/g;

// 防抖
export let debounce = undefined;
export let debounceCount = 0;
export let debounceTime = 0;

// Init
// InitOptions(); // Will be called from background.js after it's defined.

export function wildcardToRegex(urlPattern) {
    if (!urlPattern) return new RegExp('$', 'i'); // Handle empty input
    const regexPattern = String(urlPattern)
        .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
        .replace(/\*/g, '.*') // Convert * to .*
        .replace(/\?/g, '.');  // Convert ? to .
    return new RegExp(`^${regexPattern}$`, 'i'); // Match whole string, case-insensitive
}

// 初始变量
export async function InitOptionsAsync() {
    console.log("CatCatch: init.js - InitOptionsAsync started");
    // 断开重新连接后 立刻把local里MediaData数据交给cacheData
    await new Promise(resolve => {
        (chrome.storage.session ?? chrome.storage.local).get({ MediaData: {} }, function (items) {
            if (items.MediaData.init) {
                cacheData = {};
            } else {
                cacheData = items.MediaData;
            }
            console.log("CatCatch: init.js - Session MediaData loaded into cacheData.");
            resolve();
        });
    });

    await new Promise(resolve => {
        chrome.storage.sync.get(G.OptionLists, function (items) {
            if (chrome.runtime.lastError) {
                console.warn("CatCatch: init.js - Error getting sync storage, using defaults:", chrome.runtime.lastError.message);
                items = JSON.parse(JSON.stringify(G.OptionLists)); // Deep copy defaults
            }
            // 确保有默认值
            for (let key in G.OptionLists) {
                if (items[key] === undefined || items[key] === null) {
                    items[key] = JSON.parse(JSON.stringify(G.OptionLists[key])); // Deep copy default for missing item
                }
            }
            // Ext的Array转为Map类型
            items.Ext = new Map(items.Ext.map(item => [item.ext, item]));
            // Type的Array转为Map类型
            items.Type = new Map(items.Type.map(item => [item.type, { size: item.size, state: item.state }]));
            // 预编译正则匹配
            items.Regex = items.Regex.map(item => {
                let reg = undefined;
                try { reg = new RegExp(item.regex, item.type) } catch (e) { item.state = false; console.error("CatCatch: Invalid regex", item, e); }
                return { regex: reg, ext: item.ext, blackList: item.blackList, state: item.state }
            });
            // 预编译屏蔽通配符
            items.blockUrl = items.blockUrl.map(item => {
                return { url: wildcardToRegex(item.url), state: item.state }
            });

            // 兼容旧配置
            if (items.copyM3U8.includes('$url$')) {
                items.copyM3U8 = items.copyM3U8.replaceAll('$url$', '${url}').replaceAll('$referer$', '${referer}').replaceAll('$title$', '${title}');
                chrome.storage.sync.set({ copyM3U8: items.copyM3U8 });
            }
            if (items.copyMPD.includes('$url$')) {
                items.copyMPD = items.copyMPD.replaceAll('$url$', '${url}').replaceAll('$referer$', '${referer}').replaceAll('$title$', '${title}');
                chrome.storage.sync.set({ copyMPD: items.copyMPD });
            }
            if (items.copyOther.includes('$url$')) {
                items.copyOther = items.copyOther.replaceAll('$url$', '${url}').replaceAll('$referer$', '${referer}').replaceAll('$title$', '${title}');
                chrome.storage.sync.set({ copyOther: items.copyOther });
            }
            if (typeof items.m3u8dl == 'boolean') {
                items.m3u8dl = items.m3u8dl ? 1 : 0;
                chrome.storage.sync.set({ m3u8dl: items.m3u8dl });
            }

            Object.assign(G, items); // Assign loaded sync items to G
            G.initSyncComplete = true;
            console.log("CatCatch: init.js - Sync options loaded into G.");
            resolve();
        });
    });

    await new Promise(resolve => {
        (chrome.storage.session ?? chrome.storage.local).get(G.LocalVar, function (items) {
             if (chrome.runtime.lastError) {
                console.warn("CatCatch: init.js - Error getting local/session storage, using defaults:", chrome.runtime.lastError.message);
                // Potentially reset items to defaults if critical, or ensure G.LocalVar defaults are robust
            }
            items.featMobileTabId = new Set(items.featMobileTabId);
            items.featAutoDownTabId = new Set(items.featAutoDownTabId);
            Object.assign(G, items); // Assign loaded local items to G
            G.initLocalComplete = true;
            console.log("CatCatch: init.js - Local options loaded into G.");
            resolve();
        });
    });

    // Initialize G.blockUrlSet after G.blockUrl is populated from sync storage
    if (typeof isLockUrl == 'function' && G.blockUrl) {
        await new Promise(resolve => { // Make this async if tabs.query is used
            chrome.tabs.query({}, function (tabs) {
                if (chrome.runtime.lastError) {
                    console.warn("CatCatch: init.js - Error querying tabs for blockUrlSet init:", chrome.runtime.lastError.message);
                } else {
                    for (const tab of tabs) {
                        if (tab.url && isLockUrl(tab.url)) { // isLockUrl uses G.blockUrl
                            G.blockUrlSet.add(tab.id);
                        }
                    }
                }
                console.log("CatCatch: init.js - G.blockUrlSet initialized.");
                resolve();
            });
        });
    } else {
        console.warn("CatCatch: init.js - G.blockUrl not ready for blockUrlSet init or isLockUrl not found.");
    }

    if (G.enable !== undefined) { // Check if G.enable is defined before using it
        chrome.action.setIcon({ path: G.enable ? "/img/icon.png" : "/img/icon-disable.png" });
    } else {
        console.warn("CatCatch: init.js - G.enable is undefined at setIcon.");
        chrome.action.setIcon({ path: "/img/icon.png" }); // Default icon
    }
    console.log("CatCatch: init.js - InitOptionsAsync finished. Current G state:", JSON.parse(JSON.stringify(G))); // Log G state
}

// The InitOptions function previously here was refactored into InitOptionsAsync above.
// Ensure all its logic is within InitOptionsAsync or other appropriate places.
// The old InitOptions sync call is removed.
// Global variable G and cacheData are defined above InitOptionsAsync.

// Listeners like chrome.storage.onChanged and chrome.runtime.onInstalled
// have been moved to background.js to be attached after initial G setup.

// For ES Module export:
// All exports are now inline with their definitions.
// The block export previously here is no longer needed and has been removed.

// Final log for the script (optional, as exports are inline)
console.log("CatCatch: init.js - End of script, all definitions and exports processed.");