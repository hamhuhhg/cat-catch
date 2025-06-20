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

        // Messages from background script for catch-script control
        if (Message.Message === "setCatchScriptSilentMode") {
            // console.log("content-script: Received setCatchScriptSilentMode, forwarding to catch-script");
            window.postMessage({ action: "setCatCatchSilentMode", tabId: Message.tabId }, "*");
            sendResponse({status: "ok_sent_to_catch_script"});
            return true;
        }
        if (Message.Message === "getCapturedMediaDataFromCatchScript") {
            // console.log("content-script: Received getCapturedMediaDataFromCatchScript, forwarding to catch-script");
            window.postMessage({ action: "getCatCatchDataRequest", originTabId: Message.tabId }, "*");
            // This response is just an ack; actual data will come via a separate message flow
            sendResponse({status: "request_sent_to_catch_script"});
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
        // Relay message from catch-script.js (MediaSource ended) to background.js
        if (event.data.action == "catCatchMediaSourceEnded") {
            // console.log("content-script: Relaying catCatchMediaSourceEnded to background", event.data.data);
            chrome.runtime.sendMessage({
                Message: "mediaSourceEndedForAutoSave",
                data: event.data.data
            }, function(response) {
                if (chrome.runtime.lastError) {
                    // console.error("content-script: Error relaying mediaSourceEndedForAutoSave message:", chrome.runtime.lastError.message);
                } else {
                    // console.log("content-script: Background response to mediaSourceEndedForAutoSave relay:", response);
                }
            });
        }
        // Relay data response from catch-script.js to background.js
        if (event.data.action === "catCatchDataResponse") {
            // console.log("content-script: Relaying catCatchDataResponse to background", event.data.payload);
            chrome.runtime.sendMessage({
                Message: "capturedMediaDataFromCatchScript", // This is the message background.js will listen for
                payload: event.data.payload
                // Background will use sender.tab.id for the sourceTabId if needed,
                // or it could be explicitly passed if event.data.originTabId was reliably set by catch-script.
            }, function(response) {
                if (chrome.runtime.lastError) {
                    // console.error("content-script: Error relaying catCatchDataResponse message:", chrome.runtime.lastError.message);
                } else {
                    // console.log("content-script: Background response to catCatchDataResponse relay:", response);
                }
            });
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

// === Automatic Video Saving Feature - Start ===
(function() {
    // To keep track of the video currently considered active for auto-capture in this tab/frame.
    let currentTabVideoUrl = null;
    let currentVideoElement = null; // To correctly remove listeners from the right element

    // Using a more specific console log for this feature
    // console.log("Cat-Catch content script: Auto-save module loaded.");

    document.addEventListener('play', function(event) {
        const videoElement = event.target;

        if (videoElement.tagName === 'VIDEO') {
            const newVideoSrc = videoElement.currentSrc || videoElement.src;

            if (!newVideoSrc || newVideoSrc.startsWith('blob:')) {
                // console.log("Auto-save: Video source is blob or empty, ignoring:", newVideoSrc);
                return;
            }

            // console.log('Auto-save: Play event detected:', newVideoSrc, 'Page title:', document.title);

            if (currentTabVideoUrl && newVideoSrc !== currentTabVideoUrl) {
                // console.log('Auto-save: Next video played. Previous:', currentTabVideoUrl, 'New:', newVideoSrc);
                chrome.runtime.sendMessage({
                    Message: "nextVideoPlayedInTab",
                    data: {
                        previousMediaUrl: currentTabVideoUrl,
                        videoTitle: document.title
                    }
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        // console.error("Auto-save: Error sending nextVideoPlayedInTab message:", chrome.runtime.lastError.message);
                    } else {
                        // console.log("Auto-save: Background response to nextVideoPlayedInTab:", response);
                    }
                });
            }

            // Update current video if it's different or if no video was being tracked
            if (newVideoSrc !== currentTabVideoUrl || !currentVideoElement) {
                // If there was a previously tracked element, ensure its listeners are cleaned up
                // This handles cases where a new video plays before the old one formally "ended" or reached 99%
                if (currentVideoElement && currentVideoElement !== videoElement && currentVideoElement._autoSaveListenersAttached) {
                    // console.log('Auto-save: Cleaning up listeners from previously tracked video:', currentVideoElement.currentSrc);
                    cleanupListeners(currentVideoElement);
                }

                currentTabVideoUrl = newVideoSrc;
                currentVideoElement = videoElement;
                // console.log('Auto-save: Now tracking video:', currentTabVideoUrl);

                chrome.runtime.sendMessage({
                    Message: "videoPlaying",
                    data: {
                        mediaUrl: currentTabVideoUrl,
                        videoTitle: document.title
                    }
                }, function(response) {
                    if (chrome.runtime.lastError) {
                        // console.error("Auto-save: Error sending videoPlaying message:", chrome.runtime.lastError.message);
                    } else {
                        // console.log("Auto-save: Background response to videoPlaying:", response);
                    }
                });
            }

            if (!videoElement._autoSaveListenersAttached) {
                videoElement._autoSaveListenersAttached = true;
                // console.log('Auto-save: Attaching specific listeners to:', videoElement.currentSrc);
                videoElement.addEventListener('timeupdate', handleTimeUpdateForAutoSave);
                videoElement.addEventListener('ended', handleEndedForAutoSave);
            }
        }
    }, true);

    function handleTimeUpdateForAutoSave() {
        const video = this;
        if (video.duration && (video.currentTime / video.duration >= 0.99)) {
            // console.log('Auto-save: Video nearing end (99% played):', video.currentSrc);
            chrome.runtime.sendMessage({
                Message: "videoEnded",
                data: {
                    mediaUrl: video.currentSrc,
                    videoTitle: document.title
                }
            }, function(response) {
                if (chrome.runtime.lastError) {
                    // console.error("Auto-save: Error sending videoEnded (timeupdate) message:", chrome.runtime.lastError.message);
                } else {
                    // console.log("Auto-save: Background response to videoEnded (timeupdate):", response);
                }
            });
            cleanupListeners(video);
            if (currentVideoElement === video) {
                currentTabVideoUrl = null;
                currentVideoElement = null;
            }
        }
    }

    function handleEndedForAutoSave() {
        const video = this;
        // console.log('Auto-save: Video ended event:', video.currentSrc);
        chrome.runtime.sendMessage({
            Message: "videoEnded",
            data: {
                mediaUrl: video.currentSrc,
                videoTitle: document.title
            }
        }, function(response) {
            if (chrome.runtime.lastError) {
                // console.error("Auto-save: Error sending videoEnded (ended event) message:", chrome.runtime.lastError.message);
            } else {
                // console.log("Auto-save: Background response to videoEnded (ended event):", response);
            }
        });
        cleanupListeners(video);
        if (currentVideoElement === video) {
            currentTabVideoUrl = null;
            currentVideoElement = null;
        }
    }

    function cleanupListeners(videoElement) {
        if (videoElement && videoElement._autoSaveListenersAttached) {
            // console.log('Auto-save: Cleaning up listeners for:', videoElement.currentSrc);
            videoElement.removeEventListener('timeupdate', handleTimeUpdateForAutoSave);
            videoElement.removeEventListener('ended', handleEndedForAutoSave);
            videoElement._autoSaveListenersAttached = false;
        }
    }
    // console.log("Cat-Catch content script: Auto-save module is active.");
})();
// === Automatic Video Saving Feature - End ===