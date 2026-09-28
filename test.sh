#!/bin/bash
# Headless physics checks — no window, no display needed.
set -e
cd "$(dirname "$0")"
mkdir -p build
swiftc -O -swift-version 5 Sources/RopeSim.swift Tests/main.swift -o build/physics
./build/physics
