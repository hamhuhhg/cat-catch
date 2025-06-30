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
            // Reverting to use FFmpeg based on GitHub Copilot's suggestion for typical UMD export
            const { createFFmpeg, fetchFile } = FFmpeg;
            // Initialization for ffmpeg.wasm v0.12.x
            // It's generally better at auto-detecting paths for core .wasm and .worker.js (if used)
            // relative to the corePath, or by being in the same directory as ffmpeg.min.js
            // We provide corePath to ensure it finds ffmpeg-core.js.
            // v0.12.x is also better at falling back to single-threaded if SharedArrayBuffer is not available.
            ffmpeg = createFFmpeg({
                log: true,
                corePath: chrome.runtime.getURL('lib/ffmpeg.wasm/ffmpeg-core.js'),
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
        // document.body.appendChild(a);
        // a.click(); // Don't download directly from here
        // document.body.removeChild(a);
        // URL.revokeObjectURL(downloadUrl); // Revoke later in background.js

        statusDiv.textContent = 'Merge complete! Sending to background for download.';
        console.log('[FFmpegMerger] Merge complete. Sending blob to background.');

        // Send the merged blob back to background.js for download
        // Note: Sending raw ArrayBuffer might be more robust than Blob if issues arise
        chrome.runtime.sendMessage({
            command: 'ffmpegMergeComplete',
            outputFilename: outputFilename,
            mergedBlob: outputBlob, // Send the Blob object
            blobUrl: downloadUrl // Also send the URL for background to use/revoke
        }, response => {
            if (chrome.runtime.lastError) {
                console.error('[FFmpegMerger] Error sending ffmpegMergeComplete to background:', chrome.runtime.lastError.message);
                statusDiv.textContent = 'Error sending result to background. Download may not occur.';
            } else {
                console.log('[FFmpegMerger] ffmpegMergeComplete sent to background. Response:', response);
                if (response && response.status === 'downloadInitiated') {
                    statusDiv.textContent = 'Download initiated by background. This tab might close.';
                    // Optionally close this tab after a delay, or let background.js do it
                    // setTimeout(() => window.close(), 2000);
                } else {
                    statusDiv.textContent = 'Background acknowledged. Download pending or issue.';
                }
            }
        });

        // Optional: Cleanup MEMFS
        inputFiles.forEach(inputFile => ffmpeg.FS('unlink', inputFile));
        ffmpeg.FS('unlink', outputFilename);

    } catch (error) {
        console.error('[FFmpegMerger] Error processing media:', error);
        statusDiv.textContent = `Error during FFmpeg processing: ${error.message || error}`;
        // Notify background of failure
        chrome.runtime.sendMessage({
            command: 'ffmpegMergeFailed',
            outputFilename: outputFilename,
            error: error.message || error.toString()
        });
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
            let processingPromise;
            try {
                statusDiv.textContent = 'Received media processing request...';
                await loadFFmpeg(); // Ensure FFmpeg is loaded

                ffmpeg.setProgress(({ ratio }) => {
                    const progress = Math.round(ratio * 100);
                    progressBar.style.width = progress + '%';
                    progressBar.textContent = progress + '%';
                    if (ratio === 1) { // Progress might hit 1 before actual run command finishes
                        setTimeout(() => { // Ensure "Running FFmpeg" message shows briefly
                            if (progressBar.style.width === '100%') { // Check if still at 100
                                statusDiv.textContent = 'FFmpeg processing nearly complete... finalizing output.';
                            }
                        }, 50);
                    }
                    console.log('[FFmpegMerger] Progress:', ratio);
                });

                processingPromise = processMedia(message.filesData, message.outputFilename);
                await processingPromise; // Wait for processMedia to attempt sending message
                // The actual success/error response will be handled by processMedia's sendMessage callbacks
                // For this listener, we primarily acknowledge receipt and start.
                // However, sendResponse here needs to be careful if processMedia also sends.
                // Let's make processMedia fully handle the response sending for its outcome.
                // sendResponse({ status: "processing_started" }); // Or let processMedia handle the final response
            } catch (error) { // Catches errors from loadFFmpeg or if processMedia itself throws synchronously
                console.error('[FFmpegMerger] Failed to start or during media processing:', error);
                statusDiv.textContent = `Error: ${error.message || error.toString()}`;
                // Send error response if not already handled by processMedia
                if (!processingPromise) { // if error was before or outside processMedia promise
                     sendResponse({ status: "error", detail: error.message || error.toString() });
                }
            }
        } else {
            console.error('[FFmpegMerger] Invalid message payload:', message);
            sendResponse({ status: "error", detail: "Invalid message payload for processCapturedMedia" });
        }
        return true; // Indicate async response handling (though final response comes from processMedia's sendMessage)
    }
});

// Automatically try to load FFmpeg when the page loads.
// Or, wait for a message to trigger loading and processing.
// For now, we'll load when a message comes.
statusDiv.textContent = 'FFmpeg Merger page loaded. Waiting for media data...';
console.log('[FFmpegMerger] Page loaded. Awaiting message.');
