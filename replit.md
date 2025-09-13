# Overview

This is a comprehensive Raspberry Pi-based surveillance system built with Flask and WebSocket real-time communication. The system provides live 1080p@30fps video streaming, PIR motion detection with 3-minute recording triggers, manual recording controls, complete camera settings adjustment (brightness, contrast, focus, white balance, exposure modes, zoom), and a polished web-based interface for monitoring and managing recorded footage. The system is designed to work seamlessly both on Raspberry Pi hardware with Camera V3 modules and in development environments with robust fallback options.

## Recent Updates (September 13, 2025)

- **Hardware Compatibility**: Implemented robust adapter pattern for camera initialization with graceful fallbacks (PiCamera2 → OpenCV → Synthetic frames)
- **Development Safety**: Added safe GPIO import with dummy implementation for non-Pi environments  
- **Video Management**: Complete file browser with date-organized storage, external player integration, and configurable auto-deletion (1-30 days, 1-12 months)
- **Web Interface**: Polished responsive design with real-time video feed (top-right), comprehensive file browser (left panel), full camera controls, and recording management
- **Motion Detection**: PIR sensor integration with debounced triggers and development simulation endpoint
- **Network Access**: Configured for home network access on port 5000 with WebSocket real-time communication

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Backend Architecture
- **Flask Web Framework**: Serves the main web interface and handles HTTP requests
- **Flask-SocketIO**: Provides real-time bidirectional communication for live video streaming and status updates
- **Camera Adapter Pattern**: Abstraction layer supporting multiple camera sources (Picamera2 for Raspberry Pi, OpenCV fallback for development)
- **Hardware Abstraction**: Graceful degradation when running outside Raspberry Pi environment with dummy GPIO implementation

## Frontend Architecture
- **Real-time Web Interface**: HTML5 canvas-based video display with WebSocket communication
- **Component-based JavaScript**: SurveillanceApp class managing video streaming, controls, and file management
- **Responsive Design**: CSS Grid/Flexbox layout optimized for surveillance monitoring

## Video Processing Pipeline
- **Motion Detection**: OpenCV-based background subtraction for automated recording triggers
- **Multi-format Support**: Handles various video codecs and formats for broad compatibility
- **Storage Management**: Automatic cleanup and space monitoring for continuous operation

## File Management System
- **Organized Storage**: Date-based directory structure for recorded videos
- **Web-based Browser**: Real-time file listing and playback interface
- **Storage Monitoring**: Disk usage tracking and automated cleanup policies

## Hardware Integration
- **GPIO Integration**: Motion sensor input handling for external PIR sensors
- **Camera Module Support**: Native Picamera2 integration for Raspberry Pi camera modules
- **Development Fallback**: USB camera support via OpenCV for testing environments

# External Dependencies

## Core Framework Dependencies
- **Flask**: Web application framework
- **Flask-SocketIO**: Real-time communication layer
- **OpenCV (cv2)**: Computer vision and video processing
- **NumPy**: Numerical operations for image processing

## Hardware-Specific Libraries
- **RPi.GPIO**: Raspberry Pi GPIO control (optional, with fallback)
- **Picamera2**: Raspberry Pi camera interface (optional, with fallback)

## Frontend Libraries
- **Socket.IO Client**: Real-time browser communication (CDN)

## System Requirements
- **File System**: Local storage for video files with directory management
- **Camera Hardware**: Raspberry Pi camera module or USB webcam
- **Optional Hardware**: PIR motion sensors via GPIO pins