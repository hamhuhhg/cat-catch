// --- Start of new code for video monitoring ---

// Helper to generate a unique ID for video elements if needed
// (though src might be sufficient if background script handles changes well)
let videoIdCounter = 0;
const videoElementMap = new Map(); // Maps video elements to unique IDs

function getVideoId(videoElement) {
    if (!videoElementMap.has(videoElement)) {
        // Try to use src as a base for the ID, but ensure uniqueness
        // A simple counter might be more robust if src can be non-unique or change frequently for the same element
        const newId = `video-${videoIdCounter++}`;
        videoElementMap.set(videoElement, newId);
        // Clean up map if element is removed (can be done via MutationObserver)
    }
    return videoElementMap.get(videoElement);
}

function sendMessageToBackground(message) {
    try {
        chrome.runtime.sendMessage(message);
    } catch (e) {
        console.warn("Cat Katcher: Error sending message to background. Extension context likely invalidated.", e);
        // Potentially stop listeners if the background isn't available
        // For now, just log the warning.
    }
}

function handleVideoEvent(event) {
    const videoElement = event.target;
    const videoId = getVideoId(videoElement);
    const commonData = {
        videoId: videoId,
        src: videoElement.currentSrc || videoElement.src, // currentSrc is often more reliable
        duration: videoElement.duration,
        currentTime: videoElement.currentTime,
        // tabId will be added by the background script if it uses sender.tab.id
        // Or, content script can query tabId if strictly needed, but usually background adds it.
        // For now, let background script add tabId from sender.tab.
    };

    switch (event.type) {
        case 'loadstart':
            sendMessageToBackground({
                action: "videoLoadingSource", // Renamed
                ...commonData
            });
            break;
        case 'loadedmetadata':
            sendMessageToBackground({
                action: "videoMetadataReady", // Renamed
                ...commonData
            });
            break;
        case 'play': // Note: 'play' can fire before actual playback starts if buffering
            // Using 'playing' event is generally better for "playback has started"
            break;
        case 'playing':
            sendMessageToBackground({
                action: "videoPlaybackStarted",
                ...commonData
            });
            break;
        case 'pause':
            sendMessageToBackground({
                action: "videoPlaybackPaused",
                ...commonData
            });
            break;
        case 'ended':
            sendMessageToBackground({
                action: "videoHasEnded",
                ...commonData
            });
            break;
        case 'timeupdate':
            // Throttle timeupdate messages if needed, but background can also do that.
            // For now, send all.
            sendMessageToBackground({
                action: "videoProgressUpdated",
                ...commonData
            });
            break;
        case 'error':
            sendMessageToBackground({
                action: "videoError",
                videoId: videoId,
                src: videoElement.currentSrc || videoElement.src,
                error: videoElement.error ? { code: videoElement.error.code, message: videoElement.error.message } : "Unknown error"
            });
            break;
    }
}

const videoEventsToMonitor = ['loadstart', 'loadedmetadata', 'playing', 'pause', 'ended', 'timeupdate', 'error'];

function addEventListenersToVideo(videoElement) {
    // Check if listeners are already attached to prevent duplicates
    if (videoElement._catKatcherMonitored) {
        return;
    }
    videoElement._catKatcherMonitored = true;

    let initialSrc = videoElement.currentSrc || videoElement.src;
    const videoId = getVideoId(videoElement);

    new MutationObserver((mutationsList) => {
        for (let mutation of mutationsList) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                const newSrc = videoElement.currentSrc || videoElement.src;
                if (newSrc !== initialSrc && newSrc !== "") { // also check newSrc is not empty
                    videoElementMap.delete(videoElement);
                    const newVideoIdForElement = getVideoId(videoElement);

                    sendMessageToBackground({
                        action: "videoNewSourceLoaded",
                        videoId: newVideoIdForElement,
                        src: newSrc,
                        duration: videoElement.duration,
                        currentTime: 0,
                    });
                    initialSrc = newSrc;
                }
            }
        }
    }).observe(videoElement, { attributes: true });


    videoEventsToMonitor.forEach(eventType => {
        videoElement.addEventListener(eventType, handleVideoEvent, true);
    });
}

function discoverVideos() {
    document.querySelectorAll('video:not([_catKatcherMonitored])').forEach(video => {
        addEventListenersToVideo(video);
    });
}

// Initial discovery
discoverVideos();

// Observe DOM changes for dynamically added/removed videos
const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(node => {
                if (node.nodeName === 'VIDEO' && !node._catKatcherMonitored) {
                    addEventListenersToVideo(node);
                } else if (node.nodeType === Node.ELEMENT_NODE && node.querySelectorAll) {
                    node.querySelectorAll('video:not([_catKatcherMonitored])').forEach(video => {
                        addEventListenersToVideo(video);
                    });
                }
            });
            mutation.removedNodes.forEach(node => {
                if (node.nodeName === 'VIDEO' && videoElementMap.has(node)) {
                    sendMessageToBackground({ action: "videoElementRemoved", videoId: videoElementMap.get(node) });
                    videoElementMap.delete(node);
                } else if (node.nodeType === Node.ELEMENT_NODE && node.querySelectorAll) {
                    node.querySelectorAll('video').forEach(video => {
                         if (videoElementMap.has(video)) {
                            sendMessageToBackground({ action: "videoElementRemoved", videoId: videoElementMap.get(video) });
                            videoElementMap.delete(video);
                         }
                    });
                }
            });
        }
    }
});

observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
});

// --- End of new code for video monitoring ---

// Existing content script code (if any) would go here or be integrated.
// Assumed to be minimal or primarily message listeners that won't conflict.

console.log("Cat Katcher: Video monitoring content script loaded and running.");

(function () {
    var _videoObj = [];
    var _videoSrc = [];
    var _key = [];
    chrome.runtime.onMessage.addListener(function (Message, sender, sendResponse) {
        if (chrome.runtime.lastError) { return; }
        // 获取页面视频对象
        if (Message.Message == "getVideoState") {
            let videoObj = [];
            let videoSrc = [];
            document.querySelectorAll("video, audio").forEach(function (video) {
                if (video.currentSrc != "" && video.currentSrc != undefined) {
                    videoObj.push(video);
                    videoSrc.push(video.currentSrc);
                }
            });
            const iframe = document.querySelectorAll("iframe");
            if (iframe.length > 0) {
                iframe.forEach(function (iframe) {
                    if (iframe.contentDocument == null) { return true; }
                    iframe.contentDocument.querySelectorAll("video, audio").forEach(function (video) {
                        if (video.currentSrc != "" && video.currentSrc != undefined) {
                            videoObj.push(video);
                            videoSrc.push(video.currentSrc);
                        }
                    });
                });
            }
            if (videoObj.length > 0) {
                if (videoObj.length !== _videoObj.length || videoSrc.toString() !== _videoSrc.toString()) {
                    _videoSrc = videoSrc;
                    _videoObj = videoObj;
                }
                Message.index = Message.index == -1 ? 0 : Message.index;
                const video = videoObj[Message.index];
                const timePCT = video.currentTime / video.duration * 100;
                sendResponse({
                    time: timePCT,
                    currentTime: video.currentTime,
                    duration: video.duration,
                    volume: video.volume,
                    count: _videoObj.length,
                    src: _videoSrc,
                    paused: video.paused,
                    loop: video.loop,
                    speed: video.playbackRate,
                    muted: video.muted,
                    type: video.tagName.toLowerCase()
                });
                return true;
            }
            sendResponse({ count: 0 });
            return true;
        }
        // 速度控制
        if (Message.Message == "speed") {
            _videoObj[Message.index].playbackRate = Message.speed;
            return true;
        }
        // 画中画
        if (Message.Message == "pip") {
            if (document.pictureInPictureElement) {
                try { document.exitPictureInPicture(); } catch (e) { return true; }
                sendResponse({ state: false });
                return true;
            }
            try { _videoObj[Message.index].requestPictureInPicture(); } catch (e) { return true; }
            sendResponse({ state: true });
            return true;
        }
        // 全屏
        if (Message.Message == "fullScreen") {
            if (document.fullscreenElement) {
                try { document.exitFullscreen(); } catch (e) { return true; }
                sendResponse({ state: false });
                return true;
            }
            setTimeout(function () {
                try { _videoObj[Message.index].requestFullscreen(); } catch (e) { return true; }
            }, 500);
            sendResponse({ state: true });
            return true;
        }
        // 播放
        if (Message.Message == "play") {
            _videoObj[Message.index].play();
            return true;
        }
        // 暂停
        if (Message.Message == "pause") {
            _videoObj[Message.index].pause();
            return true;
        }
        // 循环播放
        if (Message.Message == "loop") {
            _videoObj[Message.index].loop = Message.action;
            return true;
        }
        // 设置音量
        if (Message.Message == "setVolume") {
            _videoObj[Message.index].volume = Message.volume;
            sendResponse("ok");
            return true;
        }
        // 静音
        if (Message.Message == "muted") {
            _videoObj[Message.index].muted = Message.action;
            return true;
        }
        // 设置视频进度
        if (Message.Message == "setTime") {
            const time = Message.time * _videoObj[Message.index].duration / 100;
            _videoObj[Message.index].currentTime = time;
            sendResponse("ok");
            return true;
        }
        // 截图视频图片
        if (Message.Message == "screenshot") {
            try {
                const video = _videoObj[Message.index];
                const canvas = document.createElement("canvas");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
                const link = document.createElement("a");
                link.href = canvas.toDataURL("image/jpeg");
                link.download = `${location.hostname}-${secToTime(video.currentTime)}.jpg`;
                link.click();
                delete canvas;
                delete link;
                sendResponse("ok");
                return true;
            } catch (e) { console.log(e); return true; }
        }
        if (Message.Message == "getKey") {
            sendResponse(_key);
            return true;
        }
        if (Message.Message == "ffmpeg") {
            if (!Message.files) {
                window.postMessage(Message);
                sendResponse("ok");
                return true;
            }
            Message.quantity ??= Message.files.length;
            for (let item of Message.files) {
                const data = { ...Message, ...item };
                data.type = item.type ?? "video";
                if (data.data instanceof Blob) {
                    window.postMessage(data);
                } else {
                    fetch(data.data)
                        .then(response => response.blob())
                        .then(blob => {
                            data.data = blob;
                            window.postMessage(data);
                        });
                }
            }
            sendResponse("ok");
            return true;
        }
        if (Message.Message == "getPage") {
            if (Message.find) {
                const DOM = document.querySelector(Message.find);
                DOM ? sendResponse(DOM.innerHTML) : sendResponse("");
                return true;
            }
            sendResponse(document.documentElement.outerHTML);
            return true;
        }
    });

    // Heart Beat
    var Port;
    function connect() {
        Port = chrome.runtime.connect(chrome.runtime.id, { name: "HeartBeat" });
        Port.postMessage("HeartBeat");
        Port.onMessage.addListener(function (message, Port) { return true; });
        Port.onDisconnect.addListener(connect);
    }
    connect();

    function secToTime(sec) {
        let time = "";
        let hour = Math.floor(sec / 3600);
        let min = Math.floor((sec % 3600) / 60);
        sec = Math.floor(sec % 60);
        if (hour > 0) { time = hour + "'"; }
        if (min < 10) { time += "0"; }
        time += min + "'";
        if (sec < 10) { time += "0"; }
        time += sec;
        return time;
    }
    window.addEventListener("message", (event) => {
        if (!event.data || !event.data.action) { return; }
        if (event.data.action == "catCatchAddMedia") {
            if (!event.data.url) { return; }
            chrome.runtime.sendMessage({
                Message: "addMedia",
                url: event.data.url,
                href: event.data.href ?? event.source.location.href,
                extraExt: event.data.ext,
                mime: event.data.mime,
                requestHeaders: { referer: event.data.referer },
                requestId: event.data.requestId
            });
        }
        if (event.data.action == "catCatchAddKey") {
            let key = event.data.key;
            if (key instanceof ArrayBuffer || key instanceof Array) {
                key = ArrayToBase64(key);
            }
            if (!key || _key.includes(key)) { return; }
            _key.push(key);
            chrome.runtime.sendMessage({
                Message: "send2local",
                action: "addKey",
                data: key,
            });
            chrome.runtime.sendMessage({
                Message: "popupAddKey",
                data: key,
                url: event.data.url,
            });
        }
        if (event.data.action == "catCatchFFmpeg") {
            if (!event.data.use ||
                !event.data.files ||
                !event.data.files instanceof Array ||
                event.data.files.length == 0
            ) { return; }
            event.data.title = event.data.title ?? document.title ?? new Date().getTime().toString();
            event.data.title = event.data.title.replaceAll('"', "").replaceAll("'", "").replaceAll(" ", "");
            let data = {
                Message: event.data.action,
                action: event.data.use,
                files: event.data.files,
                url: event.data.href ?? event.source.location.href,
            };
            data = { ...event.data, ...data };
            chrome.runtime.sendMessage(data);
        }
        if (event.data.action == "catCatchFFmpegResult") {
            if (!event.data.state || !event.data.tabId) { return; }
            chrome.runtime.sendMessage({ Message: "catCatchFFmpegResult", ...event.data });
        }
        if (event.data.action == "catCatchToBackground") {
            delete event.data.action;
            chrome.runtime.sendMessage(event.data);
        }
    }, false);

    function ArrayToBase64(data) {
        try {
            let bytes = new Uint8Array(data);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            if (typeof _btoa == "function") {
                return _btoa(binary);
            }
            return btoa(binary);
        } catch (e) {
            return false;
        }
    }
})();