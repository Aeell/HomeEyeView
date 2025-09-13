// Surveillance System Frontend JavaScript
class SurveillanceApp {
    constructor() {
        this.socket = io();
        this.isRecording = false;
        this.motionDetectionEnabled = false;
        this.videoCanvas = null;
        this.videoContext = null;
        this.fullscreenCanvas = null;
        this.fullscreenContext = null;
        
        this.init();
    }

    init() {
        this.initElements();
        this.initSocket();
        this.initEventListeners();
        this.loadInitialData();
        this.startVideoStream();
    }

    initElements() {
        // Canvas elements
        this.videoCanvas = document.getElementById('video-canvas');
        this.videoContext = this.videoCanvas.getContext('2d');
        this.fullscreenCanvas = document.getElementById('fullscreen-canvas');
        this.fullscreenContext = this.fullscreenCanvas.getContext('2d');

        // Status indicators
        this.cameraStatus = {
            indicator: document.getElementById('camera-indicator'),
            text: document.getElementById('camera-text')
        };
        this.recordingStatus = {
            indicator: document.getElementById('recording-indicator'),
            text: document.getElementById('recording-text')
        };
        this.motionStatus = {
            indicator: document.getElementById('motion-indicator'),
            text: document.getElementById('motion-text')
        };

        // Control elements
        this.startRecordingBtn = document.getElementById('start-recording');
        this.stopRecordingBtn = document.getElementById('stop-recording');
        this.toggleMotionBtn = document.getElementById('toggle-motion');
        this.refreshVideosBtn = document.getElementById('refresh-videos');
        this.cleanupOldBtn = document.getElementById('cleanup-old');
        
        // Video controls
        this.enlargeVideoBtn = document.getElementById('enlarge-video');
        this.fullscreenVideoBtn = document.getElementById('fullscreen-video');
        this.exitFullscreenBtn = document.getElementById('exit-fullscreen');
        
        // Settings sliders
        this.brightnessSlider = document.getElementById('brightness-slider');
        this.contrastSlider = document.getElementById('contrast-slider');
        this.zoomSlider = document.getElementById('zoom-slider');
        this.whiteBalanceSelect = document.getElementById('white-balance');
        this.exposureModeSelect = document.getElementById('exposure-mode');
        this.focusModeSelect = document.getElementById('focus-mode');
        
        // Auto-delete settings
        this.autoDeleteSelect = document.getElementById('auto-delete-select');
        
        // Modal elements
        this.videoModal = document.getElementById('video-modal');
        this.closeModalBtn = document.getElementById('close-modal');
        this.modalVideoPlayer = document.getElementById('modal-video-player');
        this.openExternalBtn = document.getElementById('open-external');
        this.downloadVideoBtn = document.getElementById('download-video');
        
        // File browser
        this.fileBrowser = document.getElementById('file-browser');
        
        // Fullscreen container
        this.fullscreenContainer = document.getElementById('fullscreen-container');
    }

    initSocket() {
        this.socket.on('connect', () => {
            console.log('Connected to surveillance system');
            this.updateStatus('camera', true, 'Online');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from surveillance system');
            this.updateStatus('camera', false, 'Offline');
        });

        this.socket.on('video_frame', (data) => {
            this.displayFrame(data.data);
        });

        this.socket.on('heartbeat', (data) => {
            // Handle heartbeat if needed
        });
    }

    initEventListeners() {
        // Recording controls
        this.startRecordingBtn.addEventListener('click', () => this.startRecording());
        this.stopRecordingBtn.addEventListener('click', () => this.stopRecording());
        this.toggleMotionBtn.addEventListener('click', () => this.toggleMotionDetection());
        
        // Video controls
        this.enlargeVideoBtn.addEventListener('click', () => this.enlargeVideo());
        this.fullscreenVideoBtn.addEventListener('click', () => this.enterFullscreen());
        this.exitFullscreenBtn.addEventListener('click', () => this.exitFullscreen());
        
        // File browser
        this.refreshVideosBtn.addEventListener('click', () => this.loadVideoFiles());
        this.cleanupOldBtn.addEventListener('click', () => this.cleanupOldRecordings());
        
        // Camera settings
        this.brightnessSlider.addEventListener('input', (e) => {
            this.updateCameraSetting('brightness', e.target.value);
            document.getElementById('brightness-value').textContent = e.target.value;
        });
        
        this.contrastSlider.addEventListener('input', (e) => {
            this.updateCameraSetting('contrast', e.target.value);
            document.getElementById('contrast-value').textContent = e.target.value;
        });
        
        this.zoomSlider.addEventListener('input', (e) => {
            this.updateCameraSetting('zoom', e.target.value);
            document.getElementById('zoom-value').textContent = e.target.value + 'x';
        });
        
        this.whiteBalanceSelect.addEventListener('change', (e) => {
            this.updateCameraSetting('white_balance', e.target.value);
        });
        
        this.exposureModeSelect.addEventListener('change', (e) => {
            this.updateCameraSetting('exposure_mode', e.target.value);
        });
        
        this.focusModeSelect.addEventListener('change', (e) => {
            this.updateCameraSetting('focus', e.target.value);
        });
        
        // Auto-delete settings
        this.autoDeleteSelect.addEventListener('change', (e) => {
            this.setAutoDeleteDays(e.target.value);
        });
        
        // Modal controls
        this.closeModalBtn.addEventListener('click', () => this.closeVideoModal());
        this.openExternalBtn.addEventListener('click', () => this.openInExternalPlayer());
        this.downloadVideoBtn.addEventListener('click', () => this.downloadCurrentVideo());
        
        // Close modal on outside click
        this.videoModal.addEventListener('click', (e) => {
            if (e.target === this.videoModal) {
                this.closeVideoModal();
            }
        });
        
        // Fullscreen controls
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.fullscreenContainer.style.display === 'flex') {
                this.exitFullscreen();
            }
        });
    }

    async loadInitialData() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            
            this.updateStatus('camera', status.camera_available, 
                             status.camera_available ? 'Online' : 'Offline');
            this.updateStatus('recording', status.is_recording, 
                             status.is_recording ? 'Recording' : 'Stopped');
            this.updateStatus('motion', status.motion_detection, 
                             status.motion_detection ? 'Enabled' : 'Disabled');
            
            this.isRecording = status.is_recording;
            this.motionDetectionEnabled = status.motion_detection;
            
            this.updateRecordingButtons();
            this.updateMotionButton();
            
            // Load camera settings
            this.loadCameraSettings(status.settings);
            
            // Load videos
            this.loadVideoFiles();
            
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    }

    loadCameraSettings(settings) {
        this.brightnessSlider.value = settings.brightness || 0;
        this.contrastSlider.value = settings.contrast || 1.0;
        this.zoomSlider.value = settings.zoom || 1.0;
        this.whiteBalanceSelect.value = settings.white_balance || 'auto';
        this.exposureModeSelect.value = settings.exposure_mode || 'auto';
        this.focusModeSelect.value = settings.focus || 'auto';
        
        // Update slider value displays
        document.getElementById('brightness-value').textContent = settings.brightness || 0;
        document.getElementById('contrast-value').textContent = settings.contrast || 1.0;
        document.getElementById('zoom-value').textContent = (settings.zoom || 1.0) + 'x';
    }

    startVideoStream() {
        // Request frames from the server
        setInterval(() => {
            if (this.socket.connected) {
                this.socket.emit('request_frame');
            }
        }, 100); // Request at 10 FPS
    }

    displayFrame(hexData) {
        try {
            // Convert hex string to bytes
            const bytes = new Uint8Array(hexData.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
            
            // Create blob and object URL
            const blob = new Blob([bytes], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            
            // Create image and draw on canvas
            const img = new Image();
            img.onload = () => {
                // Clear canvas and draw image
                this.videoContext.clearRect(0, 0, this.videoCanvas.width, this.videoCanvas.height);
                this.videoContext.drawImage(img, 0, 0, this.videoCanvas.width, this.videoCanvas.height);
                
                // Also update fullscreen canvas if active
                if (this.fullscreenContainer.style.display === 'flex') {
                    this.fullscreenContext.clearRect(0, 0, this.fullscreenCanvas.width, this.fullscreenCanvas.height);
                    this.fullscreenContext.drawImage(img, 0, 0, this.fullscreenCanvas.width, this.fullscreenCanvas.height);
                }
                
                // Clean up object URL
                URL.revokeObjectURL(url);
            };
            img.src = url;
            
        } catch (error) {
            console.error('Error displaying frame:', error);
        }
    }

    updateStatus(type, isActive, text) {
        const status = this[type + 'Status'];
        if (status) {
            status.indicator.className = 'indicator' + (isActive ? ' online' : '');
            status.text.textContent = text;
            
            if (type === 'recording' && isActive) {
                status.indicator.className = 'indicator recording';
            }
        }
    }

    async startRecording() {
        try {
            const duration = document.getElementById('recording-duration').value;
            const response = await fetch('/api/start-recording', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({duration: parseInt(duration)})
            });
            
            const result = await response.json();
            if (result.success) {
                this.isRecording = true;
                this.updateStatus('recording', true, 'Recording');
                this.updateRecordingButtons();
                this.showNotification('Recording started', 'success');
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Failed to start recording:', error);
            this.showNotification('Failed to start recording', 'error');
        }
    }

    async stopRecording() {
        try {
            const response = await fetch('/api/stop-recording', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            });
            
            const result = await response.json();
            if (result.success) {
                this.isRecording = false;
                this.updateStatus('recording', false, 'Stopped');
                this.updateRecordingButtons();
                this.showNotification('Recording stopped', 'success');
                this.loadVideoFiles(); // Refresh video list
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Failed to stop recording:', error);
            this.showNotification('Failed to stop recording', 'error');
        }
    }

    async toggleMotionDetection() {
        try {
            const response = await fetch('/api/toggle-motion-detection', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            });
            
            const result = await response.json();
            if (result.success) {
                this.motionDetectionEnabled = result.motion_detection;
                this.updateStatus('motion', this.motionDetectionEnabled, 
                                 this.motionDetectionEnabled ? 'Enabled' : 'Disabled');
                this.updateMotionButton();
                this.showNotification(
                    `Motion detection ${this.motionDetectionEnabled ? 'enabled' : 'disabled'}`, 
                    'success'
                );
            }
        } catch (error) {
            console.error('Failed to toggle motion detection:', error);
            this.showNotification('Failed to toggle motion detection', 'error');
        }
    }

    async updateCameraSetting(setting, value) {
        try {
            const response = await fetch('/api/camera-settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({setting, value})
            });
            
            const result = await response.json();
            if (!result.success) {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Failed to update camera setting:', error);
        }
    }

    async loadVideoFiles() {
        try {
            const response = await fetch('/api/videos');
            const videos = await response.json();
            this.displayVideoFiles(videos);
        } catch (error) {
            console.error('Failed to load video files:', error);
            this.fileBrowser.innerHTML = '<div class="loading">Failed to load videos</div>';
        }
    }

    displayVideoFiles(videoStructure) {
        let html = '';
        
        if (Object.keys(videoStructure).length === 0) {
            html = '<div class="loading">No recordings found</div>';
        } else {
            for (const [date, videos] of Object.entries(videoStructure)) {
                html += `
                    <div class="folder-item" onclick="toggleFolder('${date}')">
                        📁 ${date} (${videos.length} videos)
                    </div>
                    <div id="folder-${date}" class="folder-content" style="display: block;">
                `;
                
                for (const video of videos) {
                    const sizeKB = Math.round(video.size / 1024);
                    const sizeText = sizeKB > 1024 ? 
                        `${Math.round(sizeKB / 1024)}MB` : `${sizeKB}KB`;
                    
                    html += `
                        <div class="video-item" onclick="playVideo('${date}/${video.filename}', '${video.filename}', '${video.duration}', '${sizeText}', '${video.created}')">
                            🎥 <div class="video-info">
                                <div>${video.filename}</div>
                                <div class="video-meta">${video.duration}s • ${sizeText}</div>
                            </div>
                        </div>
                    `;
                }
                
                html += '</div>';
            }
        }
        
        this.fileBrowser.innerHTML = html;
    }

    async cleanupOldRecordings() {
        if (!confirm('Are you sure you want to delete old recordings? This action cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch('/api/cleanup-old', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'}
            });
            
            const result = await response.json();
            if (result.success) {
                this.showNotification(result.message, 'success');
                this.loadVideoFiles(); // Refresh video list
            } else {
                this.showNotification(result.message, 'error');
            }
        } catch (error) {
            console.error('Failed to cleanup old recordings:', error);
            this.showNotification('Failed to cleanup old recordings', 'error');
        }
    }

    async setAutoDeleteDays(days) {
        try {
            const response = await fetch('/api/set-auto-delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({days: parseInt(days)})
            });
            
            const result = await response.json();
            if (result.success) {
                this.showNotification(`Auto-delete set to ${days} days`, 'success');
            }
        } catch (error) {
            console.error('Failed to set auto-delete days:', error);
        }
    }

    enlargeVideo() {
        const videoContainer = document.getElementById('video-container');
        videoContainer.classList.toggle('enlarged');
        
        if (videoContainer.classList.contains('enlarged')) {
            this.videoCanvas.style.maxHeight = '600px';
            this.enlargeVideoBtn.textContent = '🔍 Shrink';
        } else {
            this.videoCanvas.style.maxHeight = '400px';
            this.enlargeVideoBtn.textContent = '🔍 Enlarge';
        }
    }

    enterFullscreen() {
        this.fullscreenContainer.style.display = 'flex';
        this.fullscreenCanvas.width = window.innerWidth;
        this.fullscreenCanvas.height = window.innerHeight;
    }

    exitFullscreen() {
        this.fullscreenContainer.style.display = 'none';
    }

    playVideo(videoPath, filename, duration, size, created) {
        this.currentVideoPath = videoPath;
        document.getElementById('modal-video-title').textContent = filename;
        document.getElementById('modal-video-filename').textContent = filename;
        document.getElementById('modal-video-duration').textContent = duration + ' seconds';
        document.getElementById('modal-video-size').textContent = size;
        document.getElementById('modal-video-created').textContent = new Date(created).toLocaleString();
        
        this.modalVideoPlayer.src = `/api/video/${videoPath}`;
        this.videoModal.style.display = 'block';
    }

    closeVideoModal() {
        this.videoModal.style.display = 'none';
        this.modalVideoPlayer.pause();
        this.modalVideoPlayer.src = '';
    }

    openInExternalPlayer() {
        if (this.currentVideoPath) {
            const url = `/api/video/${this.currentVideoPath}`;
            window.open(url, '_blank');
        }
    }

    downloadCurrentVideo() {
        if (this.currentVideoPath) {
            const link = document.createElement('a');
            link.href = `/api/video/${this.currentVideoPath}`;
            link.download = this.currentVideoPath.split('/').pop();
            link.click();
        }
    }

    updateRecordingButtons() {
        this.startRecordingBtn.disabled = this.isRecording;
        this.stopRecordingBtn.disabled = !this.isRecording;
    }

    updateMotionButton() {
        this.toggleMotionBtn.textContent = this.motionDetectionEnabled ? 
            '📡 Disable Motion Detection' : '📡 Enable Motion Detection';
        this.toggleMotionBtn.className = this.motionDetectionEnabled ? 
            'btn btn-warning' : 'btn btn-outline';
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Style the notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            opacity: 0;
            transition: all 0.3s ease;
            max-width: 300px;
        `;
        
        // Set colors based on type
        const colors = {
            success: '#27ae60',
            error: '#e74c3c',
            warning: '#f39c12',
            info: '#3498db'
        };
        notification.style.background = colors[type] || colors.info;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // Remove after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
}

// Global functions for inline event handlers
window.toggleFolder = function(date) {
    const folder = document.getElementById(`folder-${date}`);
    folder.style.display = folder.style.display === 'none' ? 'block' : 'none';
};

window.playVideo = function(videoPath, filename, duration, size, created) {
    app.playVideo(videoPath, filename, duration, size, created);
};

// Initialize the application when page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SurveillanceApp();
});