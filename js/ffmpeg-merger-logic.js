// js/ffmpeg-merger-logic.js
const statusDiv = document.getElementById('status');
const progressDiv = document.getElementById('progress');
const progressBar = document.getElementById('progressBar');

let ffmpeg = null;

async function loadFFmpeg() {
    statusDiv.textContent = 'Loading FFmpeg-core... This might take a moment.';
    console.log('[FFmpegMerger] Initializing FFmpeg...');
    try {
        if (!ffmpeg) { // Ensure ffmpeg is initialized only once
            const { createFFmpeg, fetchFile } = FFmpeg; // FFmpeg should be global from ffmpeg.min.js
            ffmpeg = createFFmpeg({
                log: true, // Enable FFmpeg logging to console
                // corePath needs to be the path to ffmpeg-core.js (or .wasm / .worker.js depending on the ffmpeg.wasm version)
                // The path needs to be resolvable from the extension's context.
                // chrome.runtime.getURL is essential here.
                corePath: chrome.runtime.getURL('lib/ffmpeg.wasm/ffmpeg-core.js'),
                // For newer versions, it might be just corePath for the .wasm file, and workerPath for worker.js
                // e.g., corePath: chrome.runtime.getURL('lib/ffmpeg.wasm/ffmpeg-core.wasm'),
                // workerPath: chrome.runtime.getURL('lib/ffmpeg.wasm/ffmpeg-core.worker.js'),
                // This depends on the specific version of ffmpeg.wasm being used.
                // Assuming ffmpeg.min.js handles the exact core/worker loading based on a base path or corePath to the JS.
            });
        }
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load();
        }
        statusDiv.textContent = 'FFmpeg Core Loaded. Ready to process media.';
        console.log('[FFmpegMerger] FFmpeg Core Loaded.');
    } catch (error) {
        console.error('[FFmpegMerger] Error loading FFmpeg:', error);
        statusDiv.textContent = `Error loading FFmpeg: ${error.message || error}`;
        throw error; // Re-throw to stop further processing
    }
}

async function processMedia(filesData, outputFilename) {
    if (!ffmpeg || !ffmpeg.isLoaded()) {
        console.error('[FFmpegMerger] FFmpeg not loaded.');
        statusDiv.textContent = 'Error: FFmpeg not loaded. Cannot process media.';
        return;
    }

    try {
        const inputFiles = [];
        for (let i = 0; i < filesData.length; i++) {
            const fileInfo = filesData[i];
            statusDiv.textContent = `Fetching ${fileInfo.type || 'media'} file (${i + 1}/${filesData.length}): ${fileInfo.name}...`;
            console.log(`[FFmpegMerger] Fetching file: ${fileInfo.url} as ${fileInfo.name}`);
            const data = await FFmpeg.fetchFile(fileInfo.url); // Use global FFmpeg.fetchFile
            ffmpeg.FS('writeFile', fileInfo.name, data);
            inputFiles.push(fileInfo.name);
            console.log(`[FFmpegMerger] Wrote ${fileInfo.name} to MEMFS.`);
        }

        statusDiv.textContent = 'Running FFmpeg merge command...';
        console.log('[FFmpegMerger] Running FFmpeg command...');

        const ffmpegArgs = [];
        inputFiles.forEach(inputFile => {
            ffmpegArgs.push('-i', inputFile);
        });
        // Assuming simple concatenation of two inputs, suitable for -c copy if codecs match container
        ffmpegArgs.push('-c', 'copy', outputFilename);
        // Example for 2 inputs: ['-i', 'input_video.mp4', '-i', 'input_audio.m4a', '-c', 'copy', 'output.mp4']

        console.log('[FFmpegMerger] FFmpeg arguments:', ffmpegArgs);
        await ffmpeg.run(...ffmpegArgs);

        statusDiv.textContent = 'Reading output file...';
        console.log('[FFmpegMerger] Reading output file:', outputFilename);
        const outputData = ffmpeg.FS('readFile', outputFilename);

        statusDiv.textContent = 'Download merged file...';
        console.log('[FFmpegMerger] Triggering download for:', outputFilename);

        const outputBlob = new Blob([outputData.buffer], { type: 'video/mp4' }); // Adjust MIME type if necessary
        const downloadUrl = URL.createObjectURL(outputBlob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = outputFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        statusDiv.textContent = 'Merge and download complete!';
        console.log('[FFmpegMerger] Merge complete.');

        // Optional: Cleanup MEMFS
        inputFiles.forEach(inputFile => ffmpeg.FS('unlink', inputFile));
        ffmpeg.FS('unlink', outputFilename);

    } catch (error) {
        console.error('[FFmpegMerger] Error processing media:', error);
        statusDiv.textContent = `Error during FFmpeg processing: ${error.message || error}`;
    } finally {
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
    }
}

// Listen for messages from background.js
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    console.log('[FFmpegMerger] Message received:', message);
    if (message.command === 'processCapturedMedia') {
        if (message.filesData && message.outputFilename) {
            try {
                statusDiv.textContent = 'Received media processing request...';
                await loadFFmpeg(); // Ensure FFmpeg is loaded
                // Setup progress listener
                ffmpeg.setProgress(({ ratio }) => {
                    const progress = Math.round(ratio * 100);
                    progressBar.style.width = progress + '%';
                    progressBar.textContent = progress + '%';
                    console.log('[FFmpegMerger] Progress:', ratio);
                });
                await processMedia(message.filesData, message.outputFilename);
                sendResponse({ status: "success", detail: "Processing complete" });
            } catch (error) {
                console.error('[FFmpegMerger] Failed to process media:', error);
                sendResponse({ status: "error", detail: error.message || error.toString() });
            }
        } else {
            console.error('[FFmpegMerger] Invalid message payload:', message);
            sendResponse({ status: "error", detail: "Invalid message payload for processCapturedMedia" });
        }
        return true; // Indicate async response
    }
});

// Automatically try to load FFmpeg when the page loads.
// Or, wait for a message to trigger loading and processing.
// For now, we'll load when a message comes.
statusDiv.textContent = 'FFmpeg Merger page loaded. Waiting for media data...';
console.log('[FFmpegMerger] Page loaded. Awaiting message.');
