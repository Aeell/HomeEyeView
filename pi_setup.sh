#!/bin/bash
# Raspberry Pi Surveillance System Setup Script

echo "🔧 Setting up Raspberry Pi Surveillance System..."

# Create project directory
mkdir -p surveillance-system
cd surveillance-system

# Create directory structure
mkdir -p templates static/css static/js recordings

# Create requirements.txt
cat > requirements.txt << 'EOF'
flask
flask-socketio
opencv-python
pillow
numpy
EOF

echo "📁 Created project structure"
echo "📋 Next steps:"
echo "1. Copy the code files (app.py, HTML, CSS, JS) to this directory"
echo "2. Run: python3 -m venv venv"
echo "3. Run: source venv/bin/activate"
echo "4. Run: pip install -r requirements.txt"
echo "5. Run: python app.py"
echo ""
echo "✨ Project ready in: $(pwd)"