// ES Module imports
import {
    G, InitOptionsAsync, cacheData, i18n,
    reFilename,
    reStringModify,
    reFilterFileName,
    reTemplates,
    reJSONparse,
    debounce,
    debounceCount,
    debounceTime,
    wildcardToRegex // Added for storage.onChanged logic
} from './init.js';

import * as func from './function.js';

console.log("CatCatch: background.js (ES Module) - Start of script, imports loaded.");

var tabCaptureStates = new Map();
var autoCaptureManuallyDisabledTabs = new Set();

// Utility functions now use 'func.' prefix if they came from function.js
// or are directly available if they were part of G or init.js exports.

function injectCatchScript(tabId, catchScriptInfo) {
    // console.log(`CatCatch: bg - Injecting catch.js into tab ${tabId}`);
    const files = [`catch-script/catch.js`];
    // Assuming catchScriptInfo.i18n relates to G.i18n or similar logic
    if (catchScriptInfo.i18n && i18n) files.unshift("catch-script/i18n.js"); // Use imported i18n
    chrome.scripting.executeScript({
        target: { tabId: tabId, allFrames: catchScriptInfo.allFrames },
        files: files,
        injectImmediately: true,
        world: catchScriptInfo.world
    }, () => {
        if (chrome.runtime.lastError) {
            console.error(`CatCatch: Error injecting catch.js into tab ${tabId}: ${chrome.runtime.lastError.message}`);
            if (G && G.scriptList && G.scriptList.get("catch.js")) {
                G.scriptList.get("catch.js").tabId.delete(tabId);
            }
        }
    });
}

function removeCatchScript(tabId, catchScriptInfo) {
    // console.log(`CatCatch: bg - Removing catch.js from tab ${tabId}`);
    chrome.tabs.sendMessage(tabId, {
        catCatchMessageRelay: true,
        for: "catchScript",
        payload: { command: "shutdown" }
    }, () => { if (chrome.runtime.lastError) { /* console.warn(...) */ } });
}

function manageAutoCaptureForTab(tabId, tabUrl) {
    if (!G || !G.initSyncComplete || !G.initLocalComplete || tabId <= 0 || !tabUrl || func.isSpecialPage(tabUrl)) {
        return;
    }
    const catchScript = G.scriptList.get("catch.js");
    if (!catchScript) { console.error("CatCatch: catch.js script info not found."); return; }

    const isBlockedByUrl = G.blockUrl && G.blockUrl.length > 0 && func.isLockUrl(tabUrl);
    const effectivelyBlocked = G.blockUrlWhite ? !isBlockedByUrl : isBlockedByUrl;

    if (autoCaptureManuallyDisabledTabs.has(tabId)) {
        if (catchScript.tabId.has(tabId)) {
            catchScript.tabId.delete(tabId); removeCatchScript(tabId, catchScript);
        }
        return;
    }
    const shouldBeActiveDueToAuto = G.autoCaptureEnabled && G.enable && !effectivelyBlocked;
    const isCurrentlyActive = catchScript.tabId.has(tabId);

    if (shouldBeActiveDueToAuto && !isCurrentlyActive) {
        catchScript.tabId.add(tabId); injectCatchScript(tabId, catchScript);
    } else if (!shouldBeActiveDueToAuto && isCurrentlyActive && G.autoCaptureEnabled) {
        catchScript.tabId.delete(tabId); removeCatchScript(tabId, catchScript);
    }
}

function findMedia(data, isRegex = false, filter = false, timer = false) {
    if (timer) return;
    if (!G || !G.initSyncComplete || !G.initLocalComplete || typeof G.tabId === 'undefined' || (typeof cacheData !== 'undefined' && cacheData.init)) {
        setTimeout(() => findMedia(data, isRegex, filter, true), 233);
        return;
    }
    const blockUrlFlag = data.tabId > 0 && G.blockUrlSet && G.blockUrlSet.has(data.tabId);
    if ((G.enable === false) || (G.blockUrlWhite ? !blockUrlFlag : blockUrlFlag)) return;

    data.getTime = Date.now();
    if (!isRegex && G.blackList && G.blackList.has(data.requestId)) { G.blackList.delete(data.requestId); return; }
    if ((data.initiator && data.initiator !== "null" && func.isSpecialPage(data.initiator)) || (G.isFirefox && data.originUrl && func.isSpecialPage(data.originUrl)) || func.isSpecialPage(data.url)) return;

    const urlParsing = new URL(data.url);
    let [name, ext] = func.fileNameParse(urlParsing.pathname);

    if (isRegex && !filter) {
        if (G.Regex) {
            for (let key in G.Regex) {
                if (!G.Regex[key].state || !G.Regex[key].regex) continue;
                G.Regex[key].regex.lastIndex = 0;
                let result = G.Regex[key].regex.exec(data.url);
                if (result == null) continue;
                if (G.Regex[key].blackList) { G.blackList.add(data.requestId); return; }
                data.extraExt = G.Regex[key].ext || undefined;
                if (result.length == 1) { findMedia(data, true, true); return; }
                result.shift(); result = result.map(str => decodeURIComponent(str));
                if (!result[0].startsWith('http')) result[0] = urlParsing.protocol + "//" + data.url;
                data.url = result.join(""); findMedia(data, true, true); return;
            }
        }
        return;
    }

    if (!isRegex) {
        data.header = func.getResponseHeadersValue(data);
        let checkExtResult = func.CheckExtension(ext, data.header?.size);
        if (!filter && ext !== undefined && checkExtResult === "break") return;
        if (checkExtResult === true) filter = true;

        let checkTypeResult = func.CheckType(data.header?.type, data.header?.size);
        if (!filter && data.header?.type !== undefined && checkTypeResult === "break") return;
        if (checkTypeResult === true) filter = true;

        if (!filter && data.header?.attachment !== undefined) {
            const res = data.header.attachment.match(reFilename);
            if (res && res[1]) {
                [name, ext] = func.fileNameParse(decodeURIComponent(res[1]));
                if (func.CheckExtension(ext, 0) === "break") return;
                filter = true;
            }
        }
        if (data.type == "media") filter = true;
    }

    if (!filter) return;
    data.tabId = data.tabId === -1 ? G.tabId : data.tabId;
    cacheData[data.tabId] ??= [];
    if (G.tabId !== undefined && data.tabId !== G.tabId) cacheData[G.tabId] ??= [];

    if (cacheData[data.tabId].length > G.maxLength) {
        cacheData[data.tabId] = [];
        (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
        return;
    }

    if (G.checkDuplicates && cacheData[data.tabId].length <= 500) {
        const tabFingerprints = G.urlMap.get(data.tabId) || new Set();
        if (tabFingerprints.has(data.url)) return;
        tabFingerprints.add(data.url); G.urlMap.set(data.tabId, tabFingerprints);
        if (tabFingerprints.size >= 500) tabFingerprints.clear();
    }

    chrome.tabs.get(data.tabId, (webInfo) => {
        if (chrome.runtime.lastError) return;
        const reqHeaders = func.getRequestHeaders(data);
        const info = {
            name, url: data.url, size: data.header?.size, ext,
            type: data.mime ?? data.header?.type, tabId: data.tabId, isRegex,
            requestId: data.requestId ?? String(Date.now()), initiator: data.initiator,
            requestHeaders: reqHeaders, cookie: reqHeaders?.cookie, getTime: data.getTime,
            title: webInfo?.title ?? "NULL", favIconUrl: webInfo?.favIconUrl, webUrl: webInfo?.url
        };
        if (reqHeaders?.cookie) info.requestHeaders.cookie = undefined;
        if (!info.ext && info.type) {
            const typeParts = info.type.split("/");
            if (typeParts.length > 1) info.ext = typeParts[1].split("+")[0];
        }
        if (data.extraExt) info.ext = data.extraExt;
        if (!info.initiator || info.initiator === "null") info.initiator = info.requestHeaders?.referer ?? webInfo?.url;

        if (!isRegex && G.blackList.has(data.requestId)) { G.blackList.delete(data.requestId); return; }

        chrome.runtime.sendMessage({ Message: "popupAddData", data: info }, () => {
            if (chrome.runtime.lastError) { /* ... */ }
            if (G.featAutoDownTabId && G.featAutoDownTabId.has(info.tabId) && chrome.downloads?.download) {
                try {
                    const downDir = info.title === "NULL" ? "CatCatch/" : func.stringModify(info.title) + "/";
                    let fileName = func.isEmpty(info.name) ? func.stringModify(info.title) + '.' + info.ext : decodeURIComponent(func.stringModify(info.name));
                    if (G.TitleName && G.downFileName) fileName = func.filterFileName(func.templates(G.downFileName, info));
                    else fileName = downDir + fileName;
                    chrome.downloads.download({ url: info.url, filename: fileName });
                } catch (e) { console.error("CatCatch: Auto-download error:", e); }
            }
        });

        if (G.send2local && typeof func.send2local === 'function') func.send2local("catch", { ...info, requestHeaders: data.allRequestHeaders }, info.tabId);

        cacheData[info.tabId].push(info);
        if (cacheData[info.tabId].length >= 100 && debounceCount <= 10) {
            debounceCount++; clearTimeout(debounce); debounce = setTimeout(() => save(info.tabId), 5000);
        } else if (Date.now() - debounceTime <= 500) {
            clearTimeout(debounce); debounceTime = Date.now(); debounce = setTimeout(() => save(info.tabId), 2000);
        } else {
            save(info.tabId);
        }
    });
}

function save(tabId) {
    clearTimeout(debounce); debounceTime = Date.now(); debounceCount = 0;
    (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData }, () => { if(chrome.runtime.lastError) {} });
    if (typeof G !== 'undefined' && G.badgeNumber && cacheData[tabId]) func.SetIcon({ number: cacheData[tabId].length, tabId: tabId });
}

// Main initialization and listener attachment structure
async function initializeBackground() {
    console.log("CatCatch: background.js - initializeBackground() started.");
    if (typeof InitOptionsAsync !== "function") {
        console.error("CatCatch: background.js - InitOptionsAsync is not defined! Attempting to wait briefly.");
        await new Promise(resolve => setTimeout(resolve, 300));
        if (typeof InitOptionsAsync !== "function") {
            console.error("CatCatch: background.js - InitOptionsAsync STILL not defined! Background script may not function.");
            return;
        }
    }
    try {
        await InitOptionsAsync();
        console.log("CatCatch: background.js - InitOptionsAsync completed.");
        if (G && G.initSyncComplete && G.initLocalComplete) {
            attachListeners();
            console.log("CatCatch: background.js - All listeners attached.");
        } else {
            console.error("CatCatch: background.js - G not fully initialized. Listeners not attached. Sync:", G?.initSyncComplete, "Local:", G?.initLocalComplete);
        }
    } catch (error) {
        console.error("CatCatch: background.js - Error during initializeBackground:", error);
    }
}

function attachListeners() {
    console.log("CatCatch: background.js - Attaching listeners now.");

    chrome.runtime.onMessage.addListener((Message, sender, sendResponse) => {
        // console.log("CatCatch: bg - onMessage received:", Message.Message);
        if (chrome.runtime.lastError) { console.error("CatCatch: Error in onMessage:", chrome.runtime.lastError.message); return false; }

        if (Message.Message === "getCaptureSettings") { /* ... */ return true; } // Simplified for brevity
        if (Message.Message === "saveCapturedVideo") { /* ... */ return true; }
        if (Message.Message === "updateTabCaptureState") { /* ... */ return true; }

        if (!G || !G.initSyncComplete || !G.initLocalComplete) {
            sendResponse({ error: "Background not fully initialized." }); return true;
        }

        const tabIdForMsg = Message.tabId ?? G.tabId;

        switch (Message.Message) {
            case "toggleManualCaptureOverride":
                const catchScript = G.scriptList.get("catch.js");
                if (!catchScript) { sendResponse({ success: false, error: "Script info not found." }); break; }
                let newManualOverrideState;
                if (autoCaptureManuallyDisabledTabs.has(tabIdForMsg)) {
                    autoCaptureManuallyDisabledTabs.delete(tabIdForMsg); newManualOverrideState = false;
                    chrome.tabs.get(tabIdForMsg, tab => {
                        if (!chrome.runtime.lastError && tab && tab.url) manageAutoCaptureForTab(tabIdForMsg, tab.url);
                    });
                } else {
                    autoCaptureManuallyDisabledTabs.add(tabIdForMsg); newManualOverrideState = true;
                    if (catchScript.tabId.has(tabIdForMsg)) {
                        catchScript.tabId.delete(tabIdForMsg); removeCatchScript(tabIdForMsg, catchScript);
                    }
                }
                chrome.runtime.sendMessage({ Message: "buttonStateUpdated", tabId: tabIdForMsg }).catch(e => {});
                sendResponse({ success: true, manualOverrideActive: newManualOverrideState });
                break;
            case "pushData": (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData }); sendResponse("ok"); break;
            case "getAllData": sendResponse(cacheData); break;
            case "ClearIcon": Message.type ? func.SetIcon({ tabId: tabIdForMsg }) : func.SetIcon(); sendResponse("ok"); break;
            case "enable":
                G.enable = !G.enable; chrome.storage.sync.set({ enable: G.enable });
                chrome.action.setIcon({ path: G.enable ? "/img/icon.png" : "/img/icon-disable.png" });
                sendResponse(G.enable); break;
            case "getData":
                if (Message.requestId) {
                    const ids = Array.isArray(Message.requestId) ? Message.requestId : [Message.requestId];
                    const resData = [];
                    if(cacheData) for (const key in cacheData) if(cacheData[key]) for (const d of cacheData[key]) if (ids.includes(d.requestId)) resData.push(d);
                    sendResponse(resData.length ? resData : "error");
                } else sendResponse(cacheData ? cacheData[tabIdForMsg] : undefined);
                break;
            case "getButtonState":
                let btnState = {
                    MobileUserAgent: G.featMobileTabId.has(tabIdForMsg), AutoDown: G.featAutoDownTabId.has(tabIdForMsg),
                    enable: G.enable, autoCaptureEnabled: G.autoCaptureEnabled,
                    isManuallyDisabled: autoCaptureManuallyDisabledTabs.has(tabIdForMsg)
                };
                G.scriptList.forEach((item, key) => { btnState[item.key] = item.tabId.has(tabIdForMsg); });
                sendResponse(btnState); break;
            case "mobileUserAgent":
                func.mobileUserAgent(tabIdForMsg, !G.featMobileTabId.has(tabIdForMsg));
                chrome.tabs.reload(tabIdForMsg, { bypassCache: true }); sendResponse("ok"); break;
            case "autoDown":
                G.featAutoDownTabId.has(tabIdForMsg) ? G.featAutoDownTabId.delete(tabIdForMsg) : G.featAutoDownTabId.add(tabIdForMsg);
                (chrome.storage.session ?? chrome.storage.local).set({ featAutoDownTabId: Array.from(G.featAutoDownTabId) });
                sendResponse("ok"); break;
            case "script":
                if (Message.script === "catch.js" && G.autoCaptureEnabled) { sendResponse({ success: false, error: "Use toggleManualCaptureOverride" }); break; }
                const scriptInf = G.scriptList.get(Message.script);
                if (!scriptInf) { sendResponse("error no exists"); break; }
                const sTabIdSet = scriptInf.tabId; const refreshScript = Message.refresh ?? scriptInf.refresh;
                if (sTabIdSet.has(tabIdForMsg)) {
                    sTabIdSet.delete(tabIdForMsg);
                    if (Message.script === "search.js") G.deepSearchTemporarilyClose = tabIdForMsg;
                    if (refreshScript) chrome.tabs.reload(tabIdForMsg, { bypassCache: true });
                } else {
                    sTabIdSet.add(tabIdForMsg);
                    if (refreshScript) chrome.tabs.reload(tabIdForMsg, { bypassCache: true });
                    else {
                        const files = [`catch-script/${Message.script}`];
                        if (scriptInf.i18n) files.unshift("catch-script/i18n.js");
                        chrome.scripting.executeScript({ target: { tabId: tabIdForMsg, allFrames: scriptInf.allFrames }, files, injectImmediately: true, world: scriptInf.world })
                            .catch(e => {});
                    }
                }
                sendResponse("ok"); break;
            case "scriptI18n":
                chrome.scripting.executeScript({ target: { tabId: tabIdForMsg, allFrames: true }, files: ["catch-script/i18n.js"], injectImmediately: true, world: "MAIN" })
                    .catch(e => {});
                sendResponse("ok"); break;
            case "HeartBeat":
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { if (tabs && tabs[0]?.id) G.tabId = tabs[0].id; });
                sendResponse("HeartBeat OK"); break;
            case "clearData":
                if (Message.type) delete cacheData[tabIdForMsg];
                else for (let item in cacheData) if (item != tabIdForMsg && cacheData.hasOwnProperty(item)) delete cacheData[item];
                (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
                func.clearRedundant(); sendResponse("OK"); break;
            case "clearRedundant": func.clearRedundant(); sendResponse("OK"); break;
            case "addMedia":
                chrome.tabs.query({}, (tabs) => {
                    let found = false;
                    if (!chrome.runtime.lastError && tabs) {
                        for (let item of tabs) if (item.url == Message.href) {
                            findMedia({ ...Message, tabId: item.id }, true, true); found = true; break;
                        }
                    }
                    if (!found) findMedia({ ...Message, tabId: -1 }, true, true);
                });
                sendResponse("ok"); break;
            case "catCatchFFmpeg":
                const ffData = { ...Message, Message: "ffmpeg", tabId: Message.tabId ?? sender.tab?.id, version: G.ffmpegConfig.version };
                chrome.tabs.query({ url: G.ffmpegConfig.url + "*" }, (tabs) => {
                    if (chrome.runtime.lastError || !tabs || !tabs.length) {
                        chrome.tabs.create({ url: G.ffmpegConfig.url, active: Message.active ?? true }, (tab) => {
                            if (chrome.runtime.lastError) return;
                            G.ffmpegConfig.tab = tab.id; G.ffmpegConfig.cacheData.push(ffData);
                        });
                    } else if (tabs[0].status === "complete") chrome.tabs.sendMessage(tabs[0].id, ffData).catch(e => {});
                    else { G.ffmpegConfig.tab = tabs[0].id; G.ffmpegConfig.cacheData.push(ffData); }
                });
                sendResponse("ok"); break;
            case "send2local": if (G.send2local) try { func.send2local(Message.action, Message.data, tabIdForMsg); } catch (e) {} sendResponse("ok"); break;
            default: console.warn("CatCatch: Unhandled message:", Message.Message); sendResponse({ error: "Unknown message" }); break;
        }
        return true;
    });
    console.log("CatCatch: bg - onMessage listener attached.");

    chrome.webNavigation.onBeforeNavigate.addListener(() => {}, {url: [{schemes: ["http", "https"]}]});
    chrome.webNavigation.onHistoryStateUpdated.addListener(() => {}, {url: [{schemes: ["http", "https"]}]});

    chrome.runtime.onConnect.addListener((port) => {
        if (port.name === "HeartBeat") {
            const keepAliveInterval = setInterval(() => { try { port.postMessage({type: "ping"}); } catch(e) { clearInterval(keepAliveInterval); }}, 20000);
            port.onDisconnect.addListener(() => clearInterval(keepAliveInterval));
        }
    });
    console.log("CatCatch: bg - Keep alive & onConnect listeners attached.");

    chrome.alarms.onAlarm.addListener((alarm) => {
        if (!G || !G.initSyncComplete || !G.initLocalComplete) return;
        if (alarm.name === "nowClear" || alarm.name === "clear") func.clearRedundant();
        else if (alarm.name === "save") (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData });
    });
    console.log("CatCatch: bg - onAlarm listener attached.");

    chrome.webRequest.onSendHeaders.addListener(
        (data) => {
            if (!G || !G.initSyncComplete || (G.enable === false)) return;
            if (data.requestHeaders) { G.requestHeaders.set(data.requestId, data.requestHeaders); data.allRequestHeaders = data.requestHeaders; }
            try { findMedia(data, true); } catch (e) { console.error("CatCatch: Error in findMedia (onSendHeaders):", e); }
        }, { urls: ["<all_urls>"] }, ['requestHeaders', chrome.webRequest.OnBeforeSendHeadersOptions.EXTRA_HEADERS].filter(Boolean)
    );
    console.log("CatCatch: bg - onSendHeaders listener attached.");

    chrome.webRequest.onResponseStarted.addListener(
        (data) => {
            if (!G || !G.initSyncComplete) return;
            try {
                data.allRequestHeaders = G.requestHeaders.get(data.requestId);
                if (data.allRequestHeaders) G.requestHeaders.delete(data.requestId);
                findMedia(data);
            } catch (e) { console.error("CatCatch: Error in findMedia (onResponseStarted):", e); }
        }, { urls: ["<all_urls>"] }, ["responseHeaders"]
    );
    console.log("CatCatch: bg - onResponseStarted listener attached.");

    chrome.webRequest.onErrorOccurred.addListener(
        (data) => { if (!G || !G.initSyncComplete) return; G.requestHeaders.delete(data.requestId); G.blackList.delete(data.requestId); },
        { urls: ["<all_urls>"] }
    );
    console.log("CatCatch: bg - onErrorOccurred listener attached.");

    chrome.tabs.onActivated.addListener((activeInfo) => {
        if (!G || !G.initSyncComplete) return;
        G.tabId = activeInfo.tabId;
        func.SetIcon({ number: cacheData[G.tabId]?.length, tabId: G.tabId });
    });
    console.log("CatCatch: bg - onActivated listener attached.");

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (!G || !G.initSyncComplete || !tab || func.isSpecialPage(tab.url) || tabId <= 0) return;
        if (changeInfo.status === "complete" && tab.url) manageAutoCaptureForTab(tabId, tab.url);
        if (changeInfo.status === "loading" && G.autoClearMode === 2) {
            G.urlMap.delete(tabId);
            chrome.alarms.get("save", alarm => {
                if (!chrome.runtime.lastError && !alarm) {
                    delete cacheData[tabId]; func.SetIcon({ tabId }); chrome.alarms.create("save", { when: Date.now() + 1000 });
                }
            });
        }
        if (changeInfo.url && G.blockUrl?.length) {
            G.blockUrlSet.delete(tabId); if (func.isLockUrl(changeInfo.url)) G.blockUrlSet.add(tabId);
        }
        if (chrome.sidePanel?.setOptions) chrome.sidePanel.setOptions({ tabId, path: "popup.html?tabId=" + tabId }).catch(e => {});
    });
    console.log("CatCatch: bg - onUpdated listener attached.");

    chrome.webNavigation.onCommitted.addListener((details) => {
        if (!G || !G.initSyncComplete || func.isSpecialPage(details.url) || details.tabId <= 0) return;
        if (details.frameId === 0 && details.url) manageAutoCaptureForTab(details.tabId, details.url);
        if (details.frameId === 0 && details.transitionType === "reload" && G.blockUrl) {
            G.blockUrlSet.delete(details.tabId); if (func.isLockUrl(details.url)) G.blockUrlSet.add(details.tabId);
        }
        if (details.frameId === 0 && !['auto_subframe', 'manual_subframe', 'form_submit'].includes(details.transitionType) && G.autoClearMode === 1) {
            delete cacheData[details.tabId]; G.urlMap.delete(details.tabId);
            (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData }); func.SetIcon({ tabId: details.tabId });
        }
        if (G.version < 102) return;
        if (G.deepSearch && G.deepSearchTemporarilyClose !== details.tabId) {
            G.scriptList.get("search.js")?.tabId.add(details.tabId); G.deepSearchTemporarilyClose = null;
        }
        G.scriptList.forEach((item, script) => {
            if (script === "catch.js" || !item.tabId.has(details.tabId) || !item.allFrames) return;
            const files = [`catch-script/${script}`]; if (item.i18n) files.unshift("catch-script/i18n.js");
            chrome.scripting.executeScript({ target: {tabId: details.tabId, frameIds: [details.frameId]}, files, injectImmediately: true, world: item.world })
                .catch(e => {});
        });
        if (G.initLocalComplete && G.featMobileTabId?.size > 0 && G.featMobileTabId.has(details.tabId) && G.MobileUserAgent) {
            chrome.scripting.executeScript({
                args: [G.MobileUserAgent.toString()], target: {tabId: details.tabId, frameIds: [details.frameId]},
                func: (ua) => Object.defineProperty(navigator, 'userAgent', { value: ua, writable: false }),
                injectImmediately: true, world: "MAIN"
            }).catch(e => {});
        }
    });
    console.log("CatCatch: bg - onCommitted listener attached.");

    chrome.tabs.onRemoved.addListener((tabId) => {
        if (!G || !G.initSyncComplete) return;
        const catchScriptInfo = G.scriptList.get("catch.js");
        if (G.autoCaptureEnabled && G.watchedOnTabClose && catchScriptInfo?.tabId.has(tabId)) {
            const state = tabCaptureStates.get(tabId);
            if (state?.isCapturing) {
                chrome.tabs.sendMessage(tabId, { catCatchMessageRelay: true, for: "catchScript", payload: { command: "triggerDownloadFromCache", filenameHint: state.filename }})
                    .catch(e => {});
            }
        }
        tabCaptureStates.delete(tabId);
        chrome.alarms.get("nowClear", alarm => { if (!chrome.runtime.lastError && !alarm) chrome.alarms.create("nowClear", { when: Date.now() + 1000 }); });
        if (G.blockUrlSet) G.blockUrlSet.delete(tabId);
    });
    console.log("CatCatch: bg - onRemoved listener attached.");

    chrome.commands.onCommand.addListener((command) => {
        if (!G || !G.initSyncComplete || !G.initLocalComplete) return;
        const tabId = G.tabId;
        switch (command) {
            case "auto_down":
                G.featAutoDownTabId.has(tabId) ? G.featAutoDownTabId.delete(tabId) : G.featAutoDownTabId.add(tabId);
                (chrome.storage.session ?? chrome.storage.local).set({ featAutoDownTabId: Array.from(G.featAutoDownTabId) }); break;
            case "catch":
                const cs = G.scriptList.get("catch.js").tabId; cs.has(tabId) ? cs.delete(tabId) : cs.add(tabId);
                chrome.tabs.reload(tabId, { bypassCache: true }); break;
            case "m3u8": chrome.tabs.create({ url: "m3u8.html" }); break;
            case "clear": delete cacheData[tabId]; (chrome.storage.session ?? chrome.storage.local).set({ MediaData: cacheData }); func.clearRedundant(); func.SetIcon({ tabId }); break;
            case "enable": G.enable = !G.enable; chrome.storage.sync.set({ enable: G.enable }); chrome.action.setIcon({ path: G.enable ? "/img/icon.png" : "/img/icon-disable.png" }); break;
            case "reboot": chrome.runtime.reload(); break;
        }
    });
    console.log("CatCatch: bg - onCommand listener attached.");

    chrome.webNavigation.onCompleted.addListener((details) => {
        if (!G || !G.initSyncComplete || !G.ffmpegConfig) return;
        if (G.ffmpegConfig.tab && details.tabId === G.ffmpegConfig.tab) {
            setTimeout(() => {
                if (G.ffmpegConfig.cacheData) {
                    G.ffmpegConfig.cacheData.forEach(data => chrome.tabs.sendMessage(details.tabId, data).catch(e => {}));
                    G.ffmpegConfig.cacheData = [];
                }
                G.ffmpegConfig.tab = 0;
            }, 500);
        }
    });
    console.log("CatCatch: bg - webNavigation.onCompleted listener attached.");

    chrome.storage.onChanged.addListener((storageChanges, namespace) => {
        // console.log("CatCatch: bg - storage.onChanged triggered:", storageChanges);
        if (chrome.runtime.lastError) { console.error("CatCatch: Error in storage.onChanged:", chrome.runtime.lastError.message); return; }

        for (let [key, { newValue }] of Object.entries(storageChanges)) {
            if (key === "autoCaptureEnabled") {
                G.autoCaptureEnabled = newValue;
                const catchScript = G.scriptList.get("catch.js");
                if (!catchScript) { console.error("CatCatch: catch.js script info not found (storage change)."); return; }
                if (G.autoCaptureEnabled) {
                    chrome.tabs.query({}, (tabs) => {
                        if (chrome.runtime.lastError) return;
                        for (const tab of tabs) if (tab.id && tab.url) manageAutoCaptureForTab(tab.id, tab.url);
                    });
                } else {
                    new Set(catchScript.tabId).forEach(id => { catchScript.tabId.delete(id); removeCatchScript(id, catchScript); });
                }
                chrome.runtime.sendMessage({ Message: "buttonStateUpdated", affectedSetting: "autoCaptureEnabled" }).catch(e => {});
            } else if (key === "MediaData") {
                if (newValue?.init) cacheData = {}; else if (newValue !== undefined) cacheData = newValue;
            } else if (G.OptionLists && G.OptionLists.hasOwnProperty(key)) { // Check G.OptionLists exists
                let val = newValue ?? G.OptionLists[key]; // Use default from G.OptionLists if newValue is null/undefined
                if (key === "Ext") G.Ext = new Map(val.map(item => [item.ext, item]));
                else if (key === "Type") G.Type = new Map(val.map(item => [item.type, { size: item.size, state: item.state }]));
                else if (key === "Regex") G.Regex = val.map(item => { let r; try { r = new RegExp(item.regex, item.type); } catch (e) {item.state = false;} return { ...item, regex: r }; });
                else if (key === "blockUrl") {
                    G.blockUrl = val.map(item => ({ url: wildcardToRegex(item.url), state: item.state })); // Use global wildcardToRegex
                    G.blockUrlSet.clear();
                    chrome.tabs.query({}, (tabs) => { if (!chrome.runtime.lastError) for (const t of tabs) if (t.url && func.isLockUrl(t.url)) G.blockUrlSet.add(t.id); });
                } else if (key === "featMobileTabId" || key === "featAutoDownTabId") G[key] = new Set(val);
                else if (key === "sidePanel" && !G.isFirefox && chrome.sidePanel?.setPanelBehavior) chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: val }).catch(e => {});
                else G[key] = val;
            }
        }
    });
    console.log("CatCatch: bg - storage.onChanged listener attached.");
}

// Initialize and attach listeners
// Ensure this is the only top-level execution call for initialization logic.
initializeBackground().catch(error => {
    console.error("CatCatch: background.js - Unhandled error during initializeBackground:", error);
});
console.log("CatCatch: background.js - End of script execution path, initializeBackground() was invoked.");