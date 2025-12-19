#!/bin/bash
# Create simple LinkedIn-style icons using ImageMagick (if available) or provide manual instructions

# Check if ImageMagick is available
if command -v convert &> /dev/null; then
    # Create 16x16 icon
    convert -size 16x16 xc:none \
        -fill "linear-gradient:#0077B5-#00A0DC" -draw "roundrectangle 0,0 15,15 2,2" \
        -fill white -draw "line 8,3 8,10" \
        -draw "line 5,7 8,10" -draw "line 11,7 8,10" \
        -draw "line 4,12 12,12" \
        icon16.png

    # Create 48x48 icon
    convert -size 48x48 xc:none \
        -fill "#0077B5" -draw "roundrectangle 0,0 47,47 7,7" \
        -fill white -stroke white -strokewidth 3 \
        -draw "line 24,10 24,30" \
        -draw "line 16,22 24,30" -draw "line 32,22 24,30" \
        -draw "line 12,36 36,36" \
        icon48.png

    # Create 128x128 icon
    convert -size 128x128 xc:none \
        -fill "#0077B5" -draw "roundrectangle 0,0 127,127 19,19" \
        -fill white -stroke white -strokewidth 8 \
        -draw "line 64,26 64,80" \
        -draw "line 42,58 64,80" -draw "line 86,58 64,80" \
        -draw "line 32,96 96,96" \
        icon128.png

    echo "Icons created successfully!"
else
    echo "ImageMagick not found. Please open create_icons.html in a browser to generate icons."
fi
