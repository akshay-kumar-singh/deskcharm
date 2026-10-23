#!/bin/bash
# Headless physics checks — no window, no display needed.
set -e
cd "$(dirname "$0")"
mkdir -p build
swiftc -O -swift-version 5 Sources/RopeSim.swift Sources/Shake.swift Sources/Swarm.swift Sources/Pour.swift Sources/Cracks.swift Sources/Rubble.swift Sources/Cloth.swift Sources/StickerShape.swift Sources/Symbiote.swift Sources/Storm.swift Tests/main.swift -o build/physics
./build/physics
