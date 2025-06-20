importScripts("/js/function.js", "/js/init.js");

if (typeof G.activeVideoStates === 'undefined') {
    G.activeVideoStates = {};
}

// Service Worker 5分钟后会强制终止扩展
// https://bugs.chromium.org/p/chromium/issues/detail?id=1271154
// https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension/70003493#70003493
chrome.webNavigation.onBeforeNavigate.addListener(function () { return; });
chrome.webNavigation.onHistoryStateUpdated.addListener(function () { return; });
chrome.runtime.onConnect.addListener(function (Port) {
    if (chrome.runtime.lastError || Port.name !== "HeartBeat") return;
    Port.postMessage("HeartBeat");
    Port.onMessage.addListener(function (message, Port) { return; });
    const interval = setInterval(function () {
        clearInterval(interval);
        Port.disconnect();
    }, 250000);
    Port.onDisconnect.addListener(function () {
        interval && clearInterval(interval);
        if (chrome.runtime.lastError) { return; }
    });
});

/**
 *  定时任务
 *  nowClear clear 清理冗余数据
 *  save 保存数据
 */
chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === "nowClear" || alarm.name === "clear") {
        clearRedundant();
        return;
    }
    if (alarm.name === "save") {
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        return;
    }
});

// onBeforeRequest 浏览器发送请求之前使用正则匹配发送请求的URL
// chrome.webRequest.onBeforeRequest.addListener(
//     function (data) {
//         try { findMedia(data, true); } catch (e) { console.log(e); }
//     }, { urls: ["<all_urls>"] }, ["requestBody"]
// );
// 保存requestHeaders
chrome.webRequest.onSendHeaders.addListener(
    function (data) {
        if (G && G.initSyncComplete && !G.enable) { return; }
        if (data.requestHeaders) {
            G.requestHeaders.set(data.requestId, data.requestHeaders);
            data.allRequestHeaders = data.requestHeaders;
        }
        try { findMedia(data, true); } catch (e) { console.log(e); }
    }, { urls: ["<all_urls>"] }, ['requestHeaders',
        chrome.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS].filter(Boolean)
);
// onResponseStarted 浏览器接收到第一个字节触发，保证有更多信息判断资源类型
chrome.webRequest.onResponseStarted.addListener(
    function (data) {
        try {
            data.allRequestHeaders = G.requestHeaders.get(data.requestId);
            if (data.allRequestHeaders) {
                G.requestHeaders.delete(data.requestId);
            }
            findMedia(data);
        } catch (e) { console.log(e, data); }
    }, { urls: ["<all_urls>"] }, ["responseHeaders"]
);
// 删除失败的requestHeadersData
chrome.webRequest.onErrorOccurred.addListener(
    function (data) {
        G.requestHeaders.delete(data.requestId);
        G.blackList.delete(data.requestId);
    }, { urls: ["<all_urls>"] }
);

function findMedia(data, isRegex = false, filter = false, timer = false) {
    if (timer) { return; }
    // Service Worker被强行杀死之后重新自我唤醒，等待全局变量初始化完成。
    if (!G || !G.initSyncComplete || !G.initLocalComplete || G.tabId == undefined || cacheData.init) {
        setTimeout(() => {
            findMedia(data, isRegex, filter, true);
        }, 233);
        return;
    }
    // 检查 是否启用 是否在当前标签是否在屏蔽列表中
    const blockUrlFlag = data.tabId && data.tabId > 0 && G.blockUrlSet.has(data.tabId);
    if (!G.enable || (G.blockUrlWhite ? !blockUrlFlag : blockUrlFlag)) {
        return;
    }

    data.getTime = Date.now();

    if (!isRegex && G.blackList.has(data.requestId)) {
        G.blackList.delete(data.requestId);
        return;
    }
    // 屏蔽特殊页面发起的资源
    if (data.initiator != "null" &&
        data.initiator != undefined &&
        isSpecialPage(data.initiator)) { return; }
    if (G.isFirefox &&
        data.originUrl &&
        isSpecialPage(data.originUrl)) { return; }
    // 屏蔽特殊页面的资源
    if (isSpecialPage(data.url)) { return; }
    const urlParsing = new URL(data.url);
    let [name, ext] = fileNameParse(urlParsing.pathname);

    //正则匹配
    if (isRegex && !filter) {
        for (let key in G.Regex) {
            if (!G.Regex[key].state) { continue; }
            G.Regex[key].regex.lastIndex = 0;
            let result = G.Regex[key].regex.exec(data.url);
            if (result == null) { continue; }
            if (G.Regex[key].blackList) {
                G.blackList.add(data.requestId);
                return;
            }
            data.extraExt = G.Regex[key].ext ? G.Regex[key].ext : undefined;
            if (result.length == 1) {
                findMedia(data, true, true);
                return;
            }
            result.shift();
            result = result.map(str => decodeURIComponent(str));
            if (!result[0].startsWith('https://') && !result[0].startsWith('http://')) {
                result[0] = urlParsing.protocol + "//" + data.url;
            }
            data.url = result.join("");
            findMedia(data, true, true);
            return;
        }
        return;
    }

    // 非正则匹配
    if (!isRegex) {
        // 获取头部信息
        data.header = getResponseHeadersValue(data);
        //检查后缀
        if (!filter && ext != undefined) {
            filter = CheckExtension(ext, data.header?.size);
            if (filter == "break") { return; }
        }
        //检查类型
        if (!filter && data.header?.type != undefined) {
            filter = CheckType(data.header.type, data.header?.size);
            if (filter == "break") { return; }
        }
        //查找附件
        if (!filter && data.header?.attachment != undefined) {
            const res = data.header.attachment.match(reFilename);
            if (res && res[1]) {
                [name, ext] = fileNameParse(decodeURIComponent(res[1]));
                filter = CheckExtension(ext, 0);
                if (filter == "break") { return; }
            }
        }
        //放过类型为media的资源
        if (data.type == "media") {
            filter = true;
        }
    }

    if (!filter) { return; }

    // 谜之原因 获取得资源 tabId可能为 -1 firefox中则正常
    // 检查是 -1 使用当前激活标签得tabID
    data.tabId = data.tabId == -1 ? G.tabId : data.tabId;

    cacheData[data.tabId] ??= [];
    cacheData[G.tabId] ??= [];

    // 缓存数据大于9999条 清空缓存 避免内存占用过多
    if (cacheData[data.tabId].length > G.maxLength) {
        cacheData[data.tabId] = [];
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        return;
    }

    // 查重 避免CPU占用 大于500 强制关闭查重
    // if (G.checkDuplicates && cacheData[data.tabId].length <= 500) {
    //     for (let item of cacheData[data.tabId]) {
    //         if (item.url.length == data.url.length &&
    //             item.cacheURL.pathname == urlParsing.pathname &&
    //             item.cacheURL.host == urlParsing.host &&
    //             item.cacheURL.search == urlParsing.search) { return; }
    //     }
    // }

    if (G.checkDuplicates && cacheData[data.tabId].length <= 500) {
        const tabFingerprints = G.urlMap.get(data.tabId) || new Set();
        if (tabFingerprints.has(data.url)) {
            return; // 找到重复，直接返回
        }
        tabFingerprints.add(data.url);
        G.urlMap.set(data.tabId, tabFingerprints);
        if (tabFingerprints.size >= 500) {
            tabFingerprints.clear();
        }
    }

    chrome.tabs.get(data.tabId, async function (webInfo) {
        if (chrome.runtime.lastError) { return; }
        data.requestHeaders = getRequestHeaders(data);
        // requestHeaders 中cookie 单独列出来
        if (data.requestHeaders?.cookie) {
            data.cookie = data.requestHeaders.cookie;
            data.requestHeaders.cookie = undefined;
        }
        const info = {
            name: name,
            url: data.url,
            size: data.header?.size,
            ext: ext,
            type: data.mime ?? data.header?.type,
            tabId: data.tabId,
            isRegex: isRegex,
            requestId: data.requestId ?? Date.now().toString(),
            initiator: data.initiator,
            requestHeaders: data.requestHeaders,
            cookie: data.cookie,
            // cacheURL: { host: urlParsing.host, search: urlParsing.search, pathname: urlParsing.pathname },
            getTime: data.getTime
        };
        // 不存在扩展使用类型
        if (info.ext === undefined && info.type !== undefined) {
            info.ext = info.type.split("/")[1];
        }
        // 正则匹配的备注扩展
        if (data.extraExt) {
            info.ext = data.extraExt;
        }
        // 不存在 initiator 和 referer 使用web url代替initiator
        if (info.initiator == undefined || info.initiator == "null") {
            info.initiator = info.requestHeaders?.referer ?? webInfo?.url;
        }
        // 装载页面信息
        info.title = webInfo?.title ?? "NULL";
        info.favIconUrl = webInfo?.favIconUrl;
        info.webUrl = webInfo?.url;
        // 屏蔽资源
        if (!isRegex && G.blackList.has(data.requestId)) {
            G.blackList.delete(data.requestId);
            return;
        }
        // 发送到popup 并检查自动下载
        chrome.runtime.sendMessage({ Message: "popupAddData", data: info }, function () {
            if (chrome.runtime.lastError) { /* globalAutoDownloadEnabled check will not run if popupAddData fails */ }

            let downloadedByGlobal = false;
            if (G.globalAutoDownloadEnabled && chrome.downloads && chrome.downloads.download) {
                // Check against G.Ext and G.Type
                // The CheckExtension and CheckType functions are already available in background.js
                let typeMatch = false;
                if (info.type) { // Ensure type is available
                    const typeCheckResult = CheckType(info.type, info.header?.size);
                    if (typeCheckResult === true) { // Explicitly check for true, as it can return "break"
                        typeMatch = true;
                    }
                }

                let extMatch = false;
                if (info.ext) { // Ensure extension is available
                    const extCheckResult = CheckExtension(info.ext, info.header?.size);
                    if (extCheckResult === true) { // Explicitly check for true
                        extMatch = true;
                    }
                }

                if (typeMatch || extMatch) {
                    try {
                        const downDir = info.title == "NULL" ? "CatCatch/" : stringModify(info.title) + "/";
                        let fileName = isEmpty(info.name) ? stringModify(info.title) + '.' + info.ext : decodeURIComponent(stringModify(info.name));
                        if (G.TitleName) {
                            fileName = filterFileName(templates(G.downFileName, info));
                        } else {
                            fileName = downDir + fileName;
                        }
                        chrome.downloads.download({
                            url: info.url,
                            filename: fileName,
                            // Potentially add saveAs: G.saveAs if that's a desired behavior for global auto-dl too
                        });
                        downloadedByGlobal = true;
                    } catch (e) { console.error("Global auto-download failed:", e); }
                }
            }

            // If not downloaded by global, check per-tab auto-download
            if (!downloadedByGlobal && G.featAutoDownTabId.size > 0 && G.featAutoDownTabId.has(info.tabId) && chrome.downloads && chrome.downloads.download) {
                try {
                    const downDir = info.title == "NULL" ? "CatCatch/" : stringModify(info.title) + "/";
                    let fileName = isEmpty(info.name) ? stringModify(info.title) + '.' + info.ext : decodeURIComponent(stringModify(info.name));
                    if (G.TitleName) {
                        fileName = filterFileName(templates(G.downFileName, info));
                    } else {
                        fileName = downDir + fileName;
                    }
                    chrome.downloads.download({
                        url: info.url,
                        filename: fileName
                    });
                } catch (e) { console.error("Per-tab auto-download failed:", e); }
            }

            // The original lastError check for sendMessage callback
            if (chrome.runtime.lastError) { return; }
        });

        // 数据发送
        if (G.send2local) {
            try { send2local("catch", { ...info, requestHeaders: data.allRequestHeaders }, info.tabId); } catch (e) { console.log(e); }
        }

        // 储存数据
        cacheData[info.tabId] ??= [];
        cacheData[info.tabId].push(info);

        // 当前标签媒体数量大于100 开启防抖 等待5秒储存 或 积累10个资源储存一次。
        if (cacheData[info.tabId].length >= 100 && debounceCount <= 10) {
            debounceCount++;
            clearTimeout(debounce);
            debounce = setTimeout(function () { save(info.tabId); }, 5000);
            return;
        }
        // 时间间隔小于500毫秒 等待2秒储存
        if (Date.now() - debounceTime <= 500) {
            clearTimeout(debounce);
            debounceTime = Date.now();
            debounce = setTimeout(function () { save(info.tabId); }, 2000);
            return;
        }
        save(info.tabId);
    });
}
// cacheData数据 储存到 chrome.storage.local
function save(tabId) {
    clearTimeout(debounce);
    debounceTime = Date.now();
    debounceCount = 0;
    (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData }, function () {
        chrome.runtime.lastError && console.log(chrome.runtime.lastError);
    });
    cacheData[tabId] && SetIcon({ number: cacheData[tabId].length, tabId: tabId });
}

/**
 * 监听 扩展 message 事件
 */
chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
    if (chrome.runtime.lastError) {
        // console.error("Runtime error in onMessage:", chrome.runtime.lastError.message);
        return;
    }

    const tabId = sender.tab ? sender.tab.id : Message.tabId;
    const frameId = sender.frameId || 0;

    if (Message.action && Message.action.startsWith("video")) {
        // Video-related actions
        if (!tabId) {
            // console.warn("Background: Video message without tabId.", Message);
        } else {
            G.activeVideoStates[tabId] = G.activeVideoStates[tabId] || {};

            switch (Message.action) {
                case "videoLoadingSource":
                    G.activeVideoStates[tabId][Message.videoId] = {
                        ...(G.activeVideoStates[tabId][Message.videoId] || {}),
                        src: Message.src, duration: Message.duration, currentTime: Message.currentTime || 0,
                        isPlaying: (G.activeVideoStates[tabId][Message.videoId] && G.activeVideoStates[tabId][Message.videoId].isPlaying) || false,
                        initialDetectionDone: false,
                        tabUrl: sender.tab ? sender.tab.url : (G.activeVideoStates[tabId][Message.videoId] ? G.activeVideoStates[tabId][Message.videoId].tabUrl : null),
                        frameId: frameId, error: null, lastUpdateTime: Date.now()
                    };
                    break;
                case "videoMetadataReady":
                     G.activeVideoStates[tabId][Message.videoId] = {
                        ...(G.activeVideoStates[tabId][Message.videoId] || {}),
                        src: Message.src, duration: Message.duration, currentTime: Message.currentTime || 0,
                        isPlaying: (G.activeVideoStates[tabId][Message.videoId] && G.activeVideoStates[tabId][Message.videoId].isPlaying) || false,
                        initialDetectionDone: true,
                        tabUrl: sender.tab ? sender.tab.url : (G.activeVideoStates[tabId][Message.videoId] ? G.activeVideoStates[tabId][Message.videoId].tabUrl : null),
                        frameId: frameId, error: null, lastUpdateTime: Date.now()
                    };
                    break;
                case "videoPlaybackStarted":
                    if (!G.activeVideoStates[tabId][Message.videoId]) {
                        G.activeVideoStates[tabId][Message.videoId] = { src: Message.src, duration: Message.duration, tabUrl: sender.tab ? sender.tab.url : null, frameId: frameId, error: null, initialDetectionDone: true };
                    } else {
                         G.activeVideoStates[tabId][Message.videoId].initialDetectionDone = true;
                    }
                    G.activeVideoStates[tabId][Message.videoId] = {
                        ...G.activeVideoStates[tabId][Message.videoId],
                        currentTime: Message.currentTime,
                        duration: Message.duration || G.activeVideoStates[tabId][Message.videoId].duration,
                        isPlaying: true, lastUpdateTime: Date.now()
                    };
                    if (G.captureOnNextVideoPlayed) {
                        for (const vidId_key in G.activeVideoStates[tabId]) {
                            if (vidId_key !== Message.videoId && G.activeVideoStates[tabId][vidId_key].isPlaying) {
                                if (typeof initiateAutomaticCapture === 'function') initiateAutomaticCapture(G.activeVideoStates[tabId][vidId_key], vidId_key, sender.tab);
                                G.activeVideoStates[tabId][vidId_key].isPlaying = false;
                            }
                        }
                    }
                    break;
                case "videoPlaybackPaused":
                    if (G.activeVideoStates[tabId] && G.activeVideoStates[tabId][Message.videoId]) {
                        G.activeVideoStates[tabId][Message.videoId].isPlaying = false;
                        G.activeVideoStates[tabId][Message.videoId].currentTime = Message.currentTime;
                        G.activeVideoStates[tabId][Message.videoId].lastUpdateTime = Date.now();
                    }
                    break;
                case "videoProgressUpdated":
                    if (G.activeVideoStates[tabId] && G.activeVideoStates[tabId][Message.videoId]) {
                        G.activeVideoStates[tabId][Message.videoId].currentTime = Message.currentTime;
                        G.activeVideoStates[tabId][Message.videoId].lastUpdateTime = Date.now();
                        if (!G.activeVideoStates[tabId][Message.videoId].initialDetectionDone && Message.duration > 0) {
                            G.activeVideoStates[tabId][Message.videoId].initialDetectionDone = true;
                            G.activeVideoStates[tabId][Message.videoId].duration = Message.duration;
                        }
                        if (G.captureOnMinWatchTime && !G.activeVideoStates[tabId][Message.videoId].hasBeenCaptured &&
                            G.activeVideoStates[tabId][Message.videoId].initialDetectionDone &&
                            G.activeVideoStates[tabId][Message.videoId].duration > 0 &&
                            Message.currentTime >= G.minWatchTimeSeconds) {
                            if (typeof initiateAutomaticCapture === 'function') initiateAutomaticCapture(G.activeVideoStates[tabId][Message.videoId], Message.videoId, sender.tab);
                        }
                    }
                    break;
                case "videoHasEnded":
                    if (G.activeVideoStates[tabId] && G.activeVideoStates[tabId][Message.videoId]) {
                        G.activeVideoStates[tabId][Message.videoId].isPlaying = false;
                        G.activeVideoStates[tabId][Message.videoId].currentTime = Message.duration;
                        G.activeVideoStates[tabId][Message.videoId].lastUpdateTime = Date.now();
                        if (G.captureOnVideoEnd) {
                            if (typeof initiateAutomaticCapture === 'function') initiateAutomaticCapture(G.activeVideoStates[tabId][Message.videoId], Message.videoId, sender.tab);
                        }
                    }
                    break;
                case "videoNewSourceLoaded":
                    G.activeVideoStates[tabId][Message.videoId] = {
                        src: Message.src, duration: Message.duration, currentTime: Message.currentTime || 0,
                        isPlaying: false, initialDetectionDone: false, hasBeenCaptured: false,
                        tabUrl: sender.tab ? sender.tab.url : null, frameId: frameId, error: null, lastUpdateTime: Date.now()
                    };
                    break;
                case "videoElementRemoved":
                    if (G.activeVideoStates[tabId] && G.activeVideoStates[tabId][Message.videoId]) {
                        delete G.activeVideoStates[tabId][Message.videoId];
                        if (Object.keys(G.activeVideoStates[tabId]).length === 0) delete G.activeVideoStates[tabId];
                    }
                    break;
                case "videoError":
                    if (G.activeVideoStates[tabId] && G.activeVideoStates[tabId][Message.videoId]) {
                        G.activeVideoStates[tabId][Message.videoId].error = Message.error;
                        G.activeVideoStates[tabId][Message.videoId].isPlaying = false;
                    }
                    break;
                default:
                    // console.warn("Background: Unknown video action:", Message.action);
                    break;
            }
        }
        return true; // Keep channel open for potential async response from video handlers or signify handled.
    }
    else { // Non-video messages
        if (!G.initLocalComplete || !G.initSyncComplete) {
            if (typeof sendResponse === 'function') sendResponse("error");
            return true;
        }

        Message.tabId = Message.tabId ?? G.tabId; // Default tabId for non-video messages

        if (Message.Message == "pushData") {
            (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
            if (typeof sendResponse === 'function') sendResponse("ok");
            return true;
        }
        else if (Message.Message == "getAllData") {
            if (typeof sendResponse === 'function') sendResponse(cacheData);
            return true;
        }
        else if (Message.Message == "ClearIcon") {
            Message.type ? SetIcon({ tabId: Message.tabId }) : SetIcon();
            if (typeof sendResponse === 'function') sendResponse("ok");
            return true;
        }
        else if (Message.Message == "enable") {
            G.enable = !G.enable;
            chrome.storage.sync.set({ enable: G.enable });
            chrome.action.setIcon({ path: G.enable ? "/img/icon.png" : "/img/icon-disable.png" });
            if (typeof sendResponse === 'function') sendResponse(G.enable);
            return true;
        }
        else if (Message.Message == "getData" && Message.requestId) {
            if (!Array.isArray(Message.requestId)) Message.requestId = [Message.requestId];
            const responseData = [];
            if (Message.requestId.length) {
                for (let item_key_gd in cacheData) {
                    for (let data_item of cacheData[item_key_gd]) {
                        if (Message.requestId.includes(data_item.requestId)) responseData.push(data_item);
                    }
                }
            }
            if (typeof sendResponse === 'function') sendResponse(responseData.length ? responseData : "error");
            return true;
        }
        else if (Message.Message == "getData") {
            if (typeof sendResponse === 'function') sendResponse(cacheData[Message.tabId]);
            return true;
        }
        else if (Message.Message == "getButtonState") {
            let state = {
                MobileUserAgent: G.featMobileTabId.has(Message.tabId),
                AutoDown: G.featAutoDownTabId.has(Message.tabId),
                enable: G.enable,
                globalAutoDownloadEnabled: G.globalAutoDownloadEnabled,
            };
            G.scriptList.forEach((item, key) => { state[item.key] = item.tabId.has(Message.tabId); });
            if (typeof sendResponse === 'function') sendResponse(state);
            return true;
        }
        else if (Message.Message == "toggleGlobalAutoDownload") {
            G.globalAutoDownloadEnabled = !G.globalAutoDownloadEnabled;
            chrome.storage.sync.set({ globalAutoDownloadEnabled: G.globalAutoDownloadEnabled });
            if (typeof sendResponse === 'function') sendResponse(G.globalAutoDownloadEnabled);
            return true;
        }
        else if (Message.Message == "mobileUserAgent") {
            mobileUserAgent(Message.tabId, !G.featMobileTabId.has(Message.tabId));
            chrome.tabs.reload(Message.tabId, { bypassCache: true });
            if (typeof sendResponse === 'function') sendResponse("ok");
            return true;
        }
        else if (Message.Message == "autoDown") {
            if (G.featAutoDownTabId.has(Message.tabId)) G.featAutoDownTabId.delete(Message.tabId);
            else G.featAutoDownTabId.add(Message.tabId);
            (chrome.storage.session ?? chrome.storage.local).set({ featAutoDownTabId: Array.from(G.featAutoDownTabId) });
            if (typeof sendResponse === 'function') sendResponse("ok");
            return true;
        }
        else if (Message.Message == "script") {
            if (!G.scriptList.has(Message.script)) {
                if (typeof sendResponse === 'function') sendResponse("error no exists");
                return true;
            }
            const script = G.scriptList.get(Message.script);
            const scriptTabid = script.tabId;
            const refresh = Message.refresh ?? script.refresh;
            if (scriptTabid.has(Message.tabId)) {
                scriptTabid.delete(Message.tabId);
                if (Message.script == "search.js") G.deepSearchTemporarilyClose = Message.tabId;
                refresh && chrome.tabs.reload(Message.tabId, { bypassCache: true });
            } else {
                scriptTabid.add(Message.tabId);
                if (refresh) {
                    chrome.tabs.reload(Message.tabId, { bypassCache: true });
                } else {
                    const files = [`catch-script/${Message.script}`];
                    script.i18n && files.unshift("catch-script/i18n.js");
                    chrome.scripting.executeScript({
                        target: { tabId: Message.tabId, allFrames: script.allFrames },
                        files: files, injectImmediately: true, world: script.world
                    });
                }
            }
            if (typeof sendResponse === 'function') sendResponse("ok");
            return true;
        }
        else if (Message.Message == "scriptI18n") {
            chrome.scripting.executeScript({
                target: { tabId: Message.tabId, allFrames: true },
                files: ["catch-script/i18n.js"], injectImmediately: true, world: "MAIN"
            });
            if (typeof sendResponse === 'function') sendResponse("ok");
            return true;
        }
        else if (Message.Message == "HeartBeat") {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0] && tabs[0].id) G.tabId = tabs[0].id;
                if (typeof sendResponse === 'function') sendResponse("HeartBeat OK");
            });
            return true;
        }
        else if (Message.Message == "clearData") {
            if (Message.type) delete cacheData[Message.tabId];
            else {
                for (let item_key_cd in cacheData) {
                    if (item_key_cd == Message.tabId) continue;
                    delete cacheData[item_key_cd];
                }
            }
            (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
            clearRedundant();
            if (typeof sendResponse === 'function') sendResponse("OK");
            return true;
        }
        else if (Message.Message == "clearRedundant") {
            clearRedundant();
            if (typeof sendResponse === 'function') sendResponse("OK");
            return true;
        }
        else if (Message.Message == "addMedia") {
            chrome.tabs.query({}, (tabs) => {
                let found_am = false;
                for (let item_am of tabs) {
                    if (item_am.url == Message.href) {
                        if (typeof findMedia === 'function') findMedia({ url: Message.url, tabId: item_am.id, extraExt: Message.extraExt, mime: Message.mime, requestId: Message.requestId, requestHeaders: Message.requestHeaders }, true, true);
                        found_am = true; break;
                    }
                }
                if (!found_am) {
                    if (typeof findMedia === 'function') findMedia({ url: Message.url, tabId: -1, extraExt: Message.extraExt, mime: Message.mime, requestId: Message.requestId, initiator: Message.href, requestHeaders: Message.requestHeaders }, true, true);
                }
            });
            if (typeof sendResponse === 'function') sendResponse("ok");
            return true;
        }
        else if (Message.Message == "catCatchFFmpeg") {
            const dataToFFmpeg_msg = { ...Message, Message: "ffmpeg", tabId: Message.tabId ?? sender.tab.id, version: G.ffmpegConfig.version };
            chrome.tabs.query({ url: G.ffmpegConfig.url + "*" }, (tabs) => {
                if (chrome.runtime.lastError || !tabs.length) {
                    chrome.tabs.create({ url: G.ffmpegConfig.url, active: Message.active ?? true }, (tab) => {
                        if (chrome.runtime.lastError) return;
                        G.ffmpegConfig.tab = tab.id;
                        G.ffmpegConfig.cacheData.push(dataToFFmpeg_msg);
                    });
                } else {
                    if (tabs[0].status == "complete") chrome.tabs.sendMessage(tabs[0].id, dataToFFmpeg_msg);
                    else { G.ffmpegConfig.tab = tabs[0].id; G.ffmpegConfig.cacheData.push(dataToFFmpeg_msg); }
                }
            });
            if (typeof sendResponse === 'function') sendResponse("ok");
            return true;
        }
        else if (Message.Message == "send2local" && G.send2local) {
            try { if (typeof send2local === 'function') send2local(Message.action, Message.data, Message.tabId); } catch (e) { console.log(e); }
            if (typeof sendResponse === 'function') sendResponse("ok");
            return true;
        }
    }
    return true; // Default return for the listener
});

// 选定标签 更新G.tabId
// chrome.tabs.onHighlighted.addListener(function (activeInfo) {
//     if (activeInfo.windowId == -1 || !activeInfo.tabIds || !activeInfo.tabIds.length) { return; }
//     G.tabId = activeInfo.tabIds[0];
// });

/**
 * 监听 切换标签
 * 更新全局变量 G.tabId 为当前标签
 */
chrome.tabs.onActivated.addListener(function (activeInfo) {
    G.tabId = activeInfo.tabId;
    if (cacheData[G.tabId] !== undefined) {
        SetIcon({ number: cacheData[G.tabId].length, tabId: G.tabId });
        return;
    }
    SetIcon({ tabId: G.tabId });
});

// 切换窗口，更新全局变量G.tabId
// chrome.windows.onFocusChanged.addListener(function (activeInfo) {
//     if (activeInfo == -1) { return; }
//     chrome.tabs.query({ active: true, windowId: activeInfo }, function (tabs) {
//         if (tabs[0] && tabs[0].id) {
//             G.tabId = tabs[0].id;
//         } else {
//             G.tabId = -1;
//         }
//     });
// }, { filters: ["normal"] });

/**
 * 监听 标签页面更新
 * 检查 清理数据
 * 检查 是否在屏蔽列表中
 */
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    if (isSpecialPage(tab.url) || tabId <= 0 || !G.initSyncComplete) { return; }
    if (changeInfo.status && changeInfo.status == "loading" && G.autoClearMode == 2) {
        G.urlMap.delete(tabId);
        chrome.alarms.get("save", function (alarm) {
            if (!alarm) {
                delete cacheData[tabId];
                SetIcon({ tabId: tabId });
                chrome.alarms.create("save", { when: Date.now() + 1000 });
            }
        });
    }
    // 检查当前标签是否在屏蔽列表中
    if (changeInfo.url && tabId > 0 && G.blockUrl.length) {
        G.blockUrlSet.delete(tabId);
        if (isLockUrl(changeInfo.url)) {
            G.blockUrlSet.add(tabId);
        }
    }
    chrome.sidePanel.setOptions({
        tabId,
        path: "popup.html?tabId=" + tabId
    });
});

/**
 * 监听 frame 正在载入
 * 检查 是否在屏蔽列表中 (frameId == 0 为主框架)
 * 检查 自动清理 (frameId == 0 为主框架)
 * 检查 注入脚本
 */
chrome.webNavigation.onCommitted.addListener(function (details) {
    if (isSpecialPage(details.url) || details.tabId <= 0 || !G.initSyncComplete) { return; }

    // 刷新页面 检查是否在屏蔽列表中
    if (details.frameId == 0 && details.transitionType == "reload") {
        G.blockUrlSet.delete(details.tabId);
        if (isLockUrl(details.url)) {
            G.blockUrlSet.add(details.tabId);
        }
    }

    // 刷新清理角标数
    if (details.frameId == 0 && (!['auto_subframe', 'manual_subframe', 'form_submit'].includes(details.transitionType)) && G.autoClearMode == 1) {
        delete cacheData[details.tabId];
        G.urlMap.delete(details.tabId);
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        SetIcon({ tabId: details.tabId });
    }

    // chrome内核版本 102 以下不支持 chrome.scripting.executeScript API
    if (G.version < 102) { return; }

    if (G.deepSearch && G.deepSearchTemporarilyClose != details.tabId) {
        G.scriptList.get("search.js").tabId.add(details.tabId);
        G.deepSearchTemporarilyClose = null;
    }

    // catch-script 脚本
    G.scriptList.forEach(function (item, script) {
        if (!item.tabId.has(details.tabId) || !item.allFrames) { return true; }

        const files = [`catch-script/${script}`];
        item.i18n && files.unshift("catch-script/i18n.js");
        chrome.scripting.executeScript({
            target: { tabId: details.tabId, frameIds: [details.frameId] },
            files: files,
            injectImmediately: true,
            world: item.world
        });
    });

    // 模拟手机
    if (G.initLocalComplete && G.featMobileTabId.size > 0 && G.featMobileTabId.has(details.tabId)) {
        chrome.scripting.executeScript({
            args: [G.MobileUserAgent.toString()],
            target: { tabId: details.tabId, frameIds: [details.frameId] },
            func: function () {
                Object.defineProperty(navigator, 'userAgent', { value: arguments[0], writable: false });
            },
            injectImmediately: true,
            world: "MAIN"
        });
    }
});

/**
 * 监听 标签关闭 清理数据
 */
chrome.tabs.onRemoved.addListener(function (tabId) {
    // 清理缓存数据
    chrome.alarms.get("nowClear", function (alarm) {
        !alarm && chrome.alarms.create("nowClear", { when: Date.now() + 1000 });
    });
    if (G.initSyncComplete) {
        G.blockUrlSet.has(tabId) && G.blockUrlSet.delete(tabId);
    }
});

/**
 * 浏览器 扩展快捷键
 */
chrome.commands.onCommand.addListener(function (command) {
    if (command == "auto_down") {
        if (G.featAutoDownTabId.has(G.tabId)) {
            G.featAutoDownTabId.delete(G.tabId);
        } else {
            G.featAutoDownTabId.add(G.tabId);
        }
        (chrome.storage.session ?? chrome.storage.local).set({ featAutoDownTabId: Array.from(G.featAutoDownTabId) });
    } else if (command == "catch") {
        const scriptTabid = G.scriptList.get("catch.js").tabId;
        scriptTabid.has(G.tabId) ? scriptTabid.delete(G.tabId) : scriptTabid.add(G.tabId);
        chrome.tabs.reload(G.tabId, { bypassCache: true });
    } else if (command == "m3u8") {
        chrome.tabs.create({ url: "m3u8.html" });
    } else if (command == "clear") {
        delete cacheData[G.tabId];
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        clearRedundant();
        SetIcon({ tabId: G.tabId });
    } else if (command == "enable") {
        G.enable = !G.enable;
        chrome.storage.sync.set({ enable: G.enable });
        chrome.action.setIcon({ path: G.enable ? "/img/icon.png" : "/img/icon-disable.png" });
    } else if (command == "reboot") {
        chrome.runtime.reload();
    }
});

/**
 * 监听 页面完全加载完成 判断是否在线ffmpeg页面
 * 如果是在线ffmpeg 则发送数据
 */
chrome.webNavigation.onCompleted.addListener(function (details) {
    if (G.ffmpegConfig.tab && details.tabId == G.ffmpegConfig.tab) {
        setTimeout(() => {
            G.ffmpegConfig.cacheData.forEach(data => {
                chrome.tabs.sendMessage(details.tabId, data);
            });
            G.ffmpegConfig.cacheData = [];
            G.ffmpegConfig.tab = 0;
        }, 500);
    }
});

/**
 * 检查扩展名和大小
 * @param {String} ext 
 * @param {Number} size 
 * @returns {Boolean|String}
 */
function CheckExtension(ext, size) {
    const Ext = G.Ext.get(ext);
    if (!Ext) { return false; }
    if (!Ext.state) { return "break"; }
    if (Ext.size != 0 && size != undefined && size <= Ext.size * 1024) { return "break"; }
    return true;
}

/**
 * 检查类型和大小
 * @param {String} dataType 
 * @param {Number} dataSize 
 * @returns {Boolean|String}
 */
function CheckType(dataType, dataSize) {
    const typeInfo = G.Type.get(dataType.split("/")[0] + "/*") || G.Type.get(dataType);
    if (!typeInfo) { return false; }
    if (!typeInfo.state) { return "break"; }
    if (typeInfo.size != 0 && dataSize != undefined && dataSize <= typeInfo.size * 1024) { return "break"; }
    return true;
}

/**
 * 获取文件名及扩展名
 * @param {String} pathname 
 * @returns {Array}
 */
function fileNameParse(pathname) {
    let fileName = decodeURI(pathname.split("/").pop());
    let ext = fileName.split(".");
    ext = ext.length == 1 ? undefined : ext.pop().toLowerCase();
    return [fileName, ext ? ext : undefined];
}

/**
 * 获取响应头信息
 * @param {Object} data 
 * @returns {Object}
 */
function getResponseHeadersValue(data) {
    const header = {};
    if (data.responseHeaders == undefined || data.responseHeaders.length == 0) { return header; }
    for (let item of data.responseHeaders) {
        item.name = item.name.toLowerCase();
        if (item.name == "content-length") {
            header.size ??= parseInt(item.value);
        } else if (item.name == "content-type") {
            header.type = item.value.split(";")[0].toLowerCase();
        } else if (item.name == "content-disposition") {
            header.attachment = item.value;
        } else if (item.name == "content-range") {
            let size = item.value.split('/')[1];
            if (size !== '*') {
                header.size = parseInt(size);
            }
        }
    }
    return header;
}

/**
 * 获取请求头
 * @param {Object} data 
 * @returns {Object|Boolean}
 */
function getRequestHeaders(data) {
    if (data.allRequestHeaders == undefined || data.allRequestHeaders.length == 0) { return false; }
    const header = {};
    for (let item of data.allRequestHeaders) {
        item.name = item.name.toLowerCase();
        if (item.name == "referer") {
            header.referer = item.value;
        } else if (item.name == "origin") {
            header.origin = item.value;
        } else if (item.name == "cookie") {
            header.cookie = item.value;
        } else if (item.name == "authorization") {
            header.authorization = item.value;
        }
    }
    if (Object.keys(header).length) {
        return header;
    }
    return false;
}
//设置扩展图标
function SetIcon(obj) {
    if (obj?.number == 0 || obj?.number == undefined) {
        chrome.action.setBadgeText({ text: "", tabId: obj?.tabId ?? G.tabId }, function () { if (chrome.runtime.lastError) { return; } });
        // chrome.action.setTitle({ title: "还没闻到味儿~", tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
    } else if (G.badgeNumber) {
        obj.number = obj.number > 999 ? "999+" : obj.number.toString();
        chrome.action.setBadgeText({ text: obj.number, tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
        // chrome.action.setTitle({ title: "抓到 " + obj.number + " 条鱼", tabId: obj.tabId }, function () { if (chrome.runtime.lastError) { return; } });
    }
}

// 模拟手机端
function mobileUserAgent(tabId, change = false) {
    if (change) {
        G.featMobileTabId.add(tabId);
        (chrome.storage.session ?? chrome.storage.local).set({ featMobileTabId: Array.from(G.featMobileTabId) });
        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [tabId],
            addRules: [{
                "id": tabId,
                "action": {
                    "type": "modifyHeaders",
                    "requestHeaders": [{
                        "header": "User-Agent",
                        "operation": "set",
                        "value": G.MobileUserAgent
                    }]
                },
                "condition": {
                    "tabIds": [tabId],
                    "resourceTypes": Object.values(chrome.declarativeNetRequest.ResourceType)
                }
            }]
        });
        return true;
    }
    G.featMobileTabId.delete(tabId) && (chrome.storage.session ?? chrome.storage.local).set({ featMobileTabId: Array.from(G.featMobileTabId) });
    chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: [tabId]
    });
}

// 判断特殊页面
function isSpecialPage(url) {
    if (!url || url == "null") { return true; }
    return !(url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:"));
}

// 测试
// chrome.storage.local.get(function (data) { console.log(data.MediaData) });
// chrome.declarativeNetRequest.getSessionRules(function (rules) { console.log(rules); });
// chrome.tabs.query({}, function (tabs) { for (let item of tabs) { console.log(item.id); } });

chrome.tabs.onRemoved.addListener(function(removedTabId, removeInfo) {
    if (G.captureOnTabClosed && G.activeVideoStates[removedTabId]) {
        for (const videoId_key_removed in G.activeVideoStates[removedTabId]) {
            const videoState = G.activeVideoStates[removedTabId][videoId_key_removed];
            if (videoState.isPlaying || (videoState.currentTime && videoState.currentTime > 0)) {
                const pseudoTabDetails = {
                    id: removedTabId,
                    url: videoState.tabUrl
                };
                initiateAutomaticCapture(videoState, videoId_key_removed, pseudoTabDetails);
            }
        }
    }
    delete G.activeVideoStates[removedTabId];
});

function initiateAutomaticCapture(videoState, videoId, tabDetails) {
    if (!videoState || videoState.hasBeenCaptured || !videoState.src) {
        return;
    }

    const currentTabUrl = (tabDetails && tabDetails.url) ? tabDetails.url : videoState.tabUrl;
    const currentTabId = tabDetails ? tabDetails.id : null;

    if (!currentTabId || !currentTabUrl) {
        // console.warn("Background: initiateAutomaticCapture missing crucial tabId or tabUrl.");
        return;
    }

    // Ensure G.blockUrlWhite and G.blockUrlSet are available and correctly populated
    const blockUrlFlag = G.blockUrlSet && G.blockUrlSet.has(currentTabId);
    if (G.blockUrlWhite ? !blockUrlFlag : blockUrlFlag) { // Check against blockUrl logic
        return;
    }
    // The above isLockUrl check was simplified, let's use the direct G.blockUrlSet check
    // if (isLockUrl(currentTabUrl)) { // isLockUrl is assumed global
    //     return;
    // }

    let fileExtension = "";
    try {
        const urlObj = new URL(videoState.src);
        const pathParts = urlObj.pathname.split('/');
        if (pathParts.length > 0) {
            const fileName = pathParts[pathParts.length - 1];
            const extParts = fileName.split('.');
            if (extParts.length > 1 && extParts[0] !== "") {
                fileExtension = extParts.pop().toLowerCase();
            }
        }
    } catch (e) {
        // console.warn("Background: Could not parse extension from video src:", videoState.src, e);
    }

    let typeAllowed = false;
    if (fileExtension) {
        const extCheckResult = CheckExtension(fileExtension, undefined); // CheckExtension is assumed global
        if (extCheckResult === true) {
            typeAllowed = true;
        } else if (extCheckResult === "break") {
            return;
        }
    } else {
        // If no extension, we might allow it or rely on a later MIME type check if findMedia does one
        // For now, let's assume if no extension, it's provisionally allowed to be checked by findMedia
        typeAllowed = true;
    }

    if (!typeAllowed) {
        return;
    }

    videoState.hasBeenCaptured = true;

    const syntheticData = {
        url: videoState.src,
        tabId: currentTabId,
        initiator: videoState.tabUrl || currentTabUrl,
        requestId: "auto_watched_capture_" + videoId + "_" + Date.now(),
        getTime: Date.now(),
        frameId: videoState.frameId || 0,
        isAutomaticWatchedCapture: true,
        duration: videoState.duration,
    };

    try {
        findMedia(syntheticData, true, true); // findMedia is assumed global
    } catch (e) {
        // console.error("Background: Error calling findMedia for automatic capture", e);
        videoState.hasBeenCaptured = false;
    }
}