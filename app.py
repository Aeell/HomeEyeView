import os
import json
import threading
import time
from datetime import datetime, timedelta
from flask import Flask, render_template, jsonify, request, send_file
from flask_socketio import SocketIO, emit
import cv2
import numpy as np
from pathlib import Path
import glob
import shutil

# Safe import for Raspberry Pi specific libraries
try:
    import RPi.GPIO as GPIO
    RPI_AVAILABLE = True
except Exception:  # Catch RuntimeError and other exceptions
    RPI_AVAILABLE = False
    print("Running in development mode - Raspberry Pi libraries not available")
    # Create dummy GPIO class for development
    class DummyGPIO:
        BCM = 11
        IN = 1
        RISING = 31
        def setmode(self, *args, **kwargs): pass
        def setup(self, *args, **kwargs): pass
        def add_event_detect(self, *args, **kwargs): pass
        def cleanup(self, *args, **kwargs): pass
    GPIO = DummyGPIO()

try:
    from picamera2 import Picamera2
    PICAMERA_AVAILABLE = True
except Exception:  # Catch all exceptions for broader compatibility
    PICAMERA_AVAILABLE = False
    print("picamera2 not available - using camera fallback")

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SESSION_SECRET', 'dev-secret-key')
socketio = SocketIO(app, cors_allowed_origins="*")

class CameraAdapter:
    """Base camera adapter interface"""
    def get_frame(self):
        raise NotImplementedError
    
    def release(self):
        pass
    
    def is_bgr_format(self):
        """Returns True if frames are in BGR format, False if RGB"""
        return False

class PiCameraAdapter(CameraAdapter):
    def __init__(self):
        self.camera = Picamera2()
        config = self.camera.create_video_configuration(
            main={"size": (1920, 1080), "format": "RGB888"}
        )
        self.camera.configure(config)
        self.camera.start()
        print("Picamera2 initialized successfully")
    
    def get_frame(self):
        return self.camera.capture_array()
    
    def is_bgr_format(self):
        return False  # PiCamera returns RGB
    
    def release(self):
        if self.camera:
            self.camera.stop()

class OpenCVCameraAdapter(CameraAdapter):
    def __init__(self):
        self.camera = cv2.VideoCapture(0)
        if self.camera.isOpened():
            self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, 1920)
            self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, 1080)
            self.camera.set(cv2.CAP_PROP_FPS, 30)
            print("OpenCV camera initialized successfully")
        else:
            raise Exception("Failed to open camera")
    
    def get_frame(self):
        ret, frame = self.camera.read()
        return frame if ret else None
    
    def is_bgr_format(self):
        return True  # OpenCV returns BGR
    
    def release(self):
        if self.camera:
            self.camera.release()

class SyntheticCameraAdapter(CameraAdapter):
    def __init__(self):
        self.frame_count = 0
        print("Synthetic camera initialized for development")
    
    def get_frame(self):
        # Generate a synthetic frame with timestamp
        frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
        frame[:, :] = [64, 128, 64]  # Dark green background
        
        # Add timestamp text
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(frame, f"Development Mode - {timestamp}", 
                   (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 2, (255, 255, 255), 3)
        cv2.putText(frame, "Synthetic Camera Feed", 
                   (50, 200), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 2)
        cv2.putText(frame, f"Frame: {self.frame_count}", 
                   (50, 300), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
        
        self.frame_count += 1
        return frame
    
    def is_bgr_format(self):
        return True  # Synthetic frames are BGR (OpenCV format)

class SurveillanceSystem:
    def __init__(self):
        self.camera_adapter = None
        self.is_recording = False
        self.recording_thread = None
        self.motion_detection_enabled = False
        self.pir_pin = 18  # GPIO pin for PIR sensor
        self.recording_duration = 180  # 3 minutes in seconds
        self.video_storage_path = "recordings"
        self.auto_delete_days = 7  # Default deletion after 7 days
        
        # Camera settings
        self.camera_settings = {
            'brightness': 0,
            'contrast': 1.0,
            'zoom': 1.0,
            'white_balance': 'auto',
            'exposure_mode': 'auto',
            'focus': 'auto'
        }
        
        # Ensure recordings directory exists
        os.makedirs(self.video_storage_path, exist_ok=True)
        
        # Initialize camera
        self.init_camera()
        
        # Initialize PIR sensor if available
        if RPI_AVAILABLE:
            self.init_pir_sensor()
    
    def init_camera(self):
        """Initialize camera system with adapter factory"""
        try:
            if PICAMERA_AVAILABLE:
                self.camera_adapter = PiCameraAdapter()
            else:
                try:
                    # Try OpenCV camera first
                    self.camera_adapter = OpenCVCameraAdapter()
                except Exception:
                    # Fall back to synthetic camera for development
                    self.camera_adapter = SyntheticCameraAdapter()
                    
        except Exception as e:
            print(f"Camera initialization error: {e}")
            # Use synthetic camera as final fallback
            self.camera_adapter = SyntheticCameraAdapter()
    
    def init_pir_sensor(self):
        """Initialize PIR motion sensor"""
        try:
            GPIO.setmode(GPIO.BCM)
            GPIO.setup(self.pir_pin, GPIO.IN)
            GPIO.add_event_detect(self.pir_pin, GPIO.RISING, 
                                callback=self.motion_detected, bouncetime=2000)
            print(f"PIR sensor initialized on GPIO pin {self.pir_pin}")
        except Exception as e:
            print(f"PIR sensor initialization error: {e}")
    
    def motion_detected(self, channel):
        """Callback for PIR motion detection"""
        if self.motion_detection_enabled and not self.is_recording:
            print("Motion detected! Starting recording...")
            self.start_recording(duration=self.recording_duration, trigger="motion")
    
    def get_frame(self):
        """Capture a frame from the camera"""
        try:
            if self.camera_adapter:
                return self.camera_adapter.get_frame()
        except Exception as e:
            print(f"Frame capture error: {e}")
        return None
    
    def start_recording(self, duration=None, trigger="manual"):
        """Start video recording"""
        if self.is_recording:
            return False, "Already recording"
        
        try:
            self.is_recording = True
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            date_folder = datetime.now().strftime("%Y-%m-%d")
            folder_path = os.path.join(self.video_storage_path, date_folder)
            os.makedirs(folder_path, exist_ok=True)
            
            filename = f"{trigger}_{timestamp}.mp4"
            filepath = os.path.join(folder_path, filename)
            
            # Start recording in a separate thread
            self.recording_thread = threading.Thread(
                target=self._record_video, 
                args=(filepath, duration)
            )
            self.recording_thread.start()
            
            return True, f"Recording started: {filename}"
        except Exception as e:
            self.is_recording = False
            return False, f"Recording failed: {str(e)}"
    
    def _record_video(self, filepath, duration=None):
        """Record video to file"""
        try:
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(filepath, fourcc, 30.0, (1920, 1080))
            
            start_time = time.time()
            
            while self.is_recording:
                frame = self.get_frame()
                if frame is not None:
                    # Handle color space conversion based on camera adapter
                    if self.camera_adapter and not self.camera_adapter.is_bgr_format():
                        # Convert RGB to BGR for video writer
                        frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
                    else:
                        # Frame is already in BGR format
                        frame_bgr = frame
                    out.write(frame_bgr)
                
                # Check duration limit
                if duration and (time.time() - start_time) >= duration:
                    break
                    
                time.sleep(1/30)  # 30 FPS
            
            out.release()
            print(f"Recording saved: {filepath}")
            
        except Exception as e:
            print(f"Recording error: {e}")
        finally:
            self.is_recording = False
    
    def stop_recording(self):
        """Stop video recording"""
        if not self.is_recording:
            return False, "Not currently recording"
        
        self.is_recording = False
        if self.recording_thread:
            self.recording_thread.join(timeout=5)
        
        return True, "Recording stopped"
    
    def update_camera_setting(self, setting, value):
        """Update camera settings"""
        try:
            if setting in self.camera_settings:
                self.camera_settings[setting] = value
                
                # Apply settings to Pi camera if available
                if (PICAMERA_AVAILABLE and 
                    isinstance(self.camera_adapter, PiCameraAdapter) and 
                    hasattr(self.camera_adapter.camera, 'set_controls')):
                    
                    if setting == 'brightness':
                        self.camera_adapter.camera.set_controls({"Brightness": float(value)})
                    elif setting == 'contrast':
                        self.camera_adapter.camera.set_controls({"Contrast": float(value)})
                    elif setting == 'white_balance':
                        if value == 'auto':
                            self.camera_adapter.camera.set_controls({"AwbEnable": True})
                        else:
                            self.camera_adapter.camera.set_controls({"AwbEnable": False})
                    # Add more camera control mappings as needed
                
                return True, f"Updated {setting} to {value}"
            else:
                return False, f"Invalid setting: {setting}"
                
        except Exception as e:
            return False, f"Failed to update {setting}: {str(e)}"
    
    def get_video_files(self):
        """Get list of recorded video files organized by date"""
        video_structure = {}
        
        try:
            for date_folder in sorted(os.listdir(self.video_storage_path)):
                date_path = os.path.join(self.video_storage_path, date_folder)
                if os.path.isdir(date_path):
                    videos = []
                    for video_file in sorted(os.listdir(date_path)):
                        if video_file.endswith(('.mp4', '.avi', '.mov')):
                            video_path = os.path.join(date_path, video_file)
                            stat = os.stat(video_path)
                            videos.append({
                                'filename': video_file,
                                'path': video_path,
                                'size': stat.st_size,
                                'created': datetime.fromtimestamp(stat.st_ctime).isoformat(),
                                'duration': self.get_video_duration(video_path)
                            })
                    
                    if videos:
                        video_structure[date_folder] = videos
        
        except Exception as e:
            print(f"Error getting video files: {e}")
        
        return video_structure
    
    def get_video_duration(self, video_path):
        """Get video duration in seconds"""
        try:
            cap = cv2.VideoCapture(video_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            duration = frame_count / fps if fps > 0 else 0
            cap.release()
            return round(duration, 2)
        except:
            return 0
    
    def cleanup_old_recordings(self):
        """Delete recordings older than specified days"""
        try:
            cutoff_date = datetime.now() - timedelta(days=self.auto_delete_days)
            deleted_count = 0
            
            for date_folder in os.listdir(self.video_storage_path):
                try:
                    folder_date = datetime.strptime(date_folder, "%Y-%m-%d")
                    if folder_date < cutoff_date:
                        folder_path = os.path.join(self.video_storage_path, date_folder)
                        shutil.rmtree(folder_path)
                        deleted_count += 1
                        print(f"Deleted old recordings folder: {date_folder}")
                except ValueError:
                    continue
            
            return True, f"Deleted {deleted_count} old recording folders"
            
        except Exception as e:
            return False, f"Cleanup failed: {str(e)}"

# Initialize surveillance system
surveillance = SurveillanceSystem()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/status')
def get_status():
    return jsonify({
        'camera_available': surveillance.camera_adapter is not None,
        'is_recording': surveillance.is_recording,
        'motion_detection': surveillance.motion_detection_enabled,
        'settings': surveillance.camera_settings,
        'auto_delete_days': surveillance.auto_delete_days
    })

@app.route('/api/start-recording', methods=['POST'])
def start_recording():
    duration = request.json.get('duration') if request.json else None
    success, message = surveillance.start_recording(duration=duration)
    return jsonify({'success': success, 'message': message})

@app.route('/api/stop-recording', methods=['POST'])
def stop_recording():
    success, message = surveillance.stop_recording()
    return jsonify({'success': success, 'message': message})

@app.route('/api/toggle-motion-detection', methods=['POST'])
def toggle_motion_detection():
    surveillance.motion_detection_enabled = not surveillance.motion_detection_enabled
    return jsonify({
        'success': True,
        'motion_detection': surveillance.motion_detection_enabled
    })

@app.route('/api/camera-settings', methods=['POST'])
def update_camera_settings():
    data = request.json
    setting = data.get('setting')
    value = data.get('value')
    
    success, message = surveillance.update_camera_setting(setting, value)
    return jsonify({'success': success, 'message': message})

@app.route('/api/videos')
def get_videos():
    videos = surveillance.get_video_files()
    return jsonify(videos)

@app.route('/api/video/<path:video_path>')
def serve_video(video_path):
    full_path = os.path.join(surveillance.video_storage_path, video_path)
    if os.path.exists(full_path):
        return send_file(full_path)
    return jsonify({'error': 'Video not found'}), 404

@app.route('/api/cleanup-old', methods=['POST'])
def cleanup_old():
    success, message = surveillance.cleanup_old_recordings()
    return jsonify({'success': success, 'message': message})

@app.route('/api/set-auto-delete', methods=['POST'])
def set_auto_delete():
    days = request.json.get('days', 7)
    surveillance.auto_delete_days = int(days)
    return jsonify({'success': True, 'auto_delete_days': surveillance.auto_delete_days})

@socketio.on('request_frame')
def handle_frame_request():
    """Handle video frame streaming via WebSocket"""
    frame = surveillance.get_frame()
    if frame is not None:
        # Handle color space for streaming
        if surveillance.camera_adapter and not surveillance.camera_adapter.is_bgr_format():
            # Convert RGB to BGR for JPEG encoding
            frame_bgr = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)
        else:
            # Frame is already in BGR format
            frame_bgr = frame
            
        # Encode frame to JPEG for streaming
        _, buffer = cv2.imencode('.jpg', frame_bgr)
        frame_data = buffer.tobytes()
        emit('video_frame', {'data': frame_data.hex()})

# Development endpoint for motion simulation
@app.route('/api/dev/simulate-motion', methods=['POST'])
def simulate_motion():
    """Development-only endpoint to simulate motion detection"""
    if not RPI_AVAILABLE:  # Only available in development mode
        surveillance.motion_detected(None)
        return jsonify({'success': True, 'message': 'Motion simulation triggered'})
    else:
        return jsonify({'success': False, 'message': 'Not available on Pi hardware'}), 403

# Start frame streaming in background
def stream_frames():
    while True:
        if surveillance.camera_adapter:
            socketio.emit('heartbeat', {'timestamp': datetime.now().isoformat()})
        time.sleep(0.1)  # 10 FPS for streaming

# Start background streaming thread
streaming_thread = threading.Thread(target=stream_frames, daemon=True)
streaming_thread.start()

if __name__ == '__main__':
    try:
        socketio.run(app, host='0.0.0.0', port=5000, debug=False, 
                    use_reloader=False, log_output=True)
    except KeyboardInterrupt:
        print("Shutting down surveillance system...")
    finally:
        if RPI_AVAILABLE:
            GPIO.cleanup()
        if surveillance.camera_adapter and hasattr(surveillance.camera_adapter, 'release'):
            surveillance.camera_adapter.release()