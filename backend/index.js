const NodeMediaServer = require('node-media-server');
const PocketBase = require('pocketbase/cjs')
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config();

const activeRecordings = new Map();
// Track viewers per stream
const streamViewers = new Map(); // streamKey -> Set of session IDs

const config = {
    logType: 3,
    rtmp: {
        port: 1935,
        chunk_size: 60000,
        gop_cache: true,
        ping: 30,
        ping_timeout: 60
    },
    http: {
        port: 8000,
        allow_origin: '*',
        mediaroot: path.join(__dirname, 'media'),
    },
    trans: {
        ffmpeg: process.env.FFMPEG_PATH || 'C:\\ProgramData\\chocolatey\\bin\\ffmpeg.exe',
        tasks: [
            {
                app: 'live',
                hls: true,
                hlsFlags: '[hls_time=2:hls_list_size=3]', 
            }
        ],
        mediaroot: path.join(__dirname, 'media')
    }
};

if (fs.existsSync(config.trans.ffmpeg)) {
    console.log(`FFmpeg found at: ${config.trans.ffmpeg}`);
} else {
    console.error(`FFmpeg NOT found at: ${config.trans.ffmpeg}`);
}

var nms = new NodeMediaServer(config);
nms.run();

const pb = new PocketBase("http://127.0.0.1:8090");
pb.admins.authWithPassword(process.env.POCKETBASE_ADMIN_EMAIL, process.env.POCKETBASE_ADMIN_PASSWORD);

const secretKey = process.env.JWT_SECRET;

// Helper function to update viewer count
async function updateViewerCount(streamKey) {
    try {
        const viewerSet = streamViewers.get(streamKey);
        const count = viewerSet ? viewerSet.size : 0;
        
        const stream = await pb.collection("streams")
            .getFirstListItem(`stream_key="${streamKey}"`, { requestKey: null });
        
        await pb.collection("streams").update(stream.id, {
            viewers: count
        }, { requestKey: null });
        
        console.log(`[${streamKey}] Viewers updated: ${count}`);
        return count;
    } catch (error) {
        console.log(`[${streamKey}] Error updating viewer count: ${error}`);
        return 0;
    }
}

nms.on('prePublish', async (id, StreamPath, args) => {
    let session = nms.getSession(id);
    const { token } = args;
    const streamKeyAndToken = StreamPath.split("/").pop();
    const [streamKey, tokenQuery] = streamKeyAndToken.split("?");

    if (!token) {
        console.log(`[${id}] JWT token not provided`);
        session.reject();
        return;
    }

    try {
        const decoded = jwt.verify(token, secretKey);

        if (decoded.stream_key !== streamKey) {
            console.log(`[${id}] Stream key doesnt match`);
            console.log(`[${id}] ${decoded.stream_key} !== ${streamKey}`);
            session.reject();
            return;
        }

        console.log(`[${id}] Stream key verified: ${streamKey}`);
        const stream = await pb.collection("streams").getFirstListItem(`stream_key="${streamKey}"`, { requestKey: null });
        await pb.collection("streams").update(stream.id, { is_live: true }, { requestKey: null });
        
        // Initialize viewer set for this stream
        if (!streamViewers.has(streamKey)) {
            streamViewers.set(streamKey, new Set());
        }
        
        return true;
    } catch (error) {
        console.log(`[${id}] Error while connecting: ${error}`);
        session.reject();
    }
});

nms.on('prePlay', async (id, StreamPath, args) => {
    console.log('[NodeEvent on prePlay]', `id=${id} StreamPath=${StreamPath}`);
    let session = nms.getSession(id);
    const streamPath = StreamPath.split("/").pop();

    if (!StreamPath || !StreamPath.startsWith("/live/")) {
        console.log(`[${id}] Invalid stream path`);
        session.reject();
        return;
    }

    try {
        // Check if stream exists
        const stream = await pb.collection("streams")
            .getFirstListItem(`stream_key="${streamPath}"`, { requestKey: null })
            .catch((error) => {
                if (error.status === 0) return null;
                throw error;
            });

        if (!stream) {
            console.log(`[${id}] Stream not found`);
            session.reject();
            return;
        }

        // Add this viewer to the stream
        if (!streamViewers.has(streamPath)) {
            streamViewers.set(streamPath, new Set());
        }
        streamViewers.get(streamPath).add(id);
        
        // Update viewer count
        await updateViewerCount(streamPath);
        
        console.log(`[${id}] Viewer connected to ${streamPath}`);
    } catch (error) {
        console.log(`[${id}] Error in prePlay: ${error}`);
        session.reject();
    }
});

nms.on('donePlay', async (id, StreamPath, args) => {
    console.log('[NodeEvent on donePlay]', `id=${id} StreamPath=${StreamPath}`);
    const streamPath = StreamPath.split("/").pop();

    if (!StreamPath || !StreamPath.startsWith("/live/")) {
        console.log(`[${id}] Invalid stream path`);
        return;
    }

    try {
        // Remove this viewer from the stream
        const viewerSet = streamViewers.get(streamPath);
        if (viewerSet) {
            viewerSet.delete(id);
            
            // Update viewer count
            await updateViewerCount(streamPath);
            
            console.log(`[${id}] Viewer disconnected from ${streamPath}`);
        }
    } catch (error) {
        console.log(`[${id}] Error in donePlay: ${error}`);
    }
});

nms.on('postPublish', async (id, StreamPath, args) => {
    console.log('[NodeEvent on postPublish]', `id=${id} StreamPath=${StreamPath}`);
    const streamKeyAndToken = StreamPath.split("/").pop();
    const [streamKey, tokenQuery] = streamKeyAndToken.split("?");

    try {
        const stream = await pb.collection("streams").getFirstListItem(`stream_key="${streamKey}"`, { requestKey: null });
        
        if (stream.settings && stream.settings.save_stream) {
            console.log(`[${id}] 📹 Recording enabled, starting FFmpeg...`);
            
            const streamDir = path.join(__dirname, 'media', 'recordings');
            if (!fs.existsSync(streamDir)) {
                fs.mkdirSync(streamDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const outputFile = path.join(streamDir, `${streamKey}-${timestamp}.mp4`);
            const ffmpegPath = config.trans.ffmpeg;
            const rtmpUrl = `rtmp://127.0.0.1:${config.rtmp.port}${StreamPath}`;

            setTimeout(() => {
                console.log(`[${id}] Starting FFmpeg recording to: ${outputFile}`);

                const ffmpeg = spawn(ffmpegPath, [
                    '-i', rtmpUrl,
                    '-c:v', 'copy',
                    '-c:a', 'copy',
                    '-f', 'mp4',
                    '-movflags', '+faststart',
                    '-y',
                    outputFile
                ], {
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let errorOutput = '';

                ffmpeg.stderr.on('data', (data) => {
                    const output = data.toString();
                    if (output.includes('frame=') || output.includes('error') || output.includes('Error')) {
                        console.log(`[${id}] FFmpeg: ${output.trim()}`);
                    }
                    errorOutput += output;
                });

                ffmpeg.on('error', (err) => {
                    console.error(`[${id}] ❌ FFmpeg spawn error:`, err);
                });

                ffmpeg.on('close', (code) => {
                    console.log(`[${id}] FFmpeg process exited with code ${code}`);
                    if (code !== 0 && code !== null) {
                        console.error(`[${id}] FFmpeg error output:`, errorOutput);
                    }
                });

                activeRecordings.set(id, { 
                    process: ffmpeg, 
                    filePath: outputFile,
                    streamKey: streamKey,
                    streamId: stream.id,
                    userId: stream.user,
                    title: stream.title
                });
                
                console.log(`[${id}] ✅ FFmpeg recording started`);
            }, 3000);
        }
    } catch (error) {
        console.error(`[${id}] Error in postPublish:`, error);
    }
});

nms.on('donePublish', async (id, StreamPath, args) => {
    let session = nms.getSession(id);
    const streamPath = StreamPath.split("/").pop();

    if (!StreamPath || !StreamPath.startsWith("/live/")) {
        console.log(`[${id}] Invalid stream path`);
        return;
    }

    const token = session.publishArgs.token;

    if (!token) {
        console.log(`[${id}] JWT token not provided`);
        return;
    }

    try {
        const stream = await pb.collection("streams").getFirstListItem(`stream_key="${streamPath}"`, { requestKey: null });
        await pb.collection("streams").update(stream.id, { is_live: false, viewers: 0 }, { requestKey: null });
        console.log(`[${id}] Stream stopped, set to offline`);

        // Clear viewers for this stream
        streamViewers.delete(streamPath);

        if (activeRecordings.has(id)) {
            const recording = activeRecordings.get(id);
            console.log(`[${id}] 🛑 Stopping FFmpeg recording...`);
            
            try {
                if (recording.process.stdin && recording.process.stdin.writable) {
                    recording.process.stdin.write('q\n');
                    console.log(`[${id}] Sent 'q' command to FFmpeg`);
                }
            } catch (err) {
                console.log(`[${id}] Could not send 'q' to FFmpeg:`, err.message);
            }
            
            setTimeout(() => {
                if (recording.process && !recording.process.killed) {
                    console.log(`[${id}] Force killing FFmpeg process...`);
                    recording.process.kill('SIGTERM');
                }
            }, 2000);

            setTimeout(async () => {
                const filePath = recording.filePath;
                
                try {
                    if (fs.existsSync(filePath)) {
                        const stats = fs.statSync(filePath);
                        console.log(`[${id}] 📁 Recording file found: ${path.basename(filePath)}`);
                        console.log(`[${id}] 📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
                        
                        if (stats.size < 1024) {
                            console.error(`[${id}] ⚠️ WARNING: File is very small (${stats.size} bytes)`);
                        }
                        
                        if (stats.size === 0) {
                            console.error(`[${id}] ❌ ERROR: File is empty, skipping upload`);
                            activeRecordings.delete(id);
                            return;
                        }

                        console.log(`[${id}] 📤 Uploading to PocketBase...`);
                        
                        const formData = new FormData();
                        
                        const fileBuffer = fs.readFileSync(filePath);
                        const blob = new Blob([fileBuffer], { type: 'video/mp4' });
                        
                        formData.append('user', recording.userId);
                        formData.append('stream', recording.streamId);
                        formData.append('title', recording.title || `Recording ${new Date().toLocaleString()}`);
                        formData.append('video_file', blob, path.basename(filePath));
                        
                        const result = await pb.collection('recordings').create(formData, { 
                            requestKey: null 
                        });
                        
                        console.log(`[${id}] ✅ SUCCESS! Recording saved with ID: ${result.id}`);
                        
                        try {
                            fs.unlinkSync(filePath);
                            console.log(`[${id}] 🗑️ Local file deleted`);
                        } catch (delErr) {
                            console.log(`[${id}] Could not delete local file:`, delErr.message);
                        }
                        
                    } else {
                        console.error(`[${id}] ❌ Recording file not found at: ${filePath}`);
                    }
                } catch (uploadErr) {
                    console.error(`[${id}] ❌ Error uploading to PocketBase:`, uploadErr);
                    console.error(`[${id}] Error details:`, uploadErr.response || uploadErr.message);
                    
                    if (fs.existsSync(filePath)) {
                        const stats = fs.statSync(filePath);
                        console.error(`[${id}] File exists but upload failed. Size: ${stats.size} bytes`);
                    }
                }
                
                activeRecordings.delete(id);
            }, 5000); 
        } else {
            console.log(`[${id}] No active recording found`);
        }

        return true;
    } catch (error) {
        console.log(`[${id}] Error in donePublish:`, error);
    }
});