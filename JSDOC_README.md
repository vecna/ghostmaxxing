# Ghostmaxxing - Technical Documentation

Welcome to the internal technical documentation for Ghostmaxxing, a Web AR laboratory for the development and real-time testing of anti-biometric facial recognition camouflage (CV Dazzle).

This documentation is generated from the source code using JSDoc. It provides a detailed breakdown of the functions, classes, and namespaces used throughout the project. 

## Project Architecture and Scopes

The codebase is organized into several modules within the `scripts/` directory. Each file serves a specific role within the application architecture.

- **`auto-find-loop.js`**: Manages the loop for automatically identifying bounding boxes or specific areas over frames.
- **`bbox-overlay.js`**: Handles the logic and rendering of bounding boxes overlayed onto the video or canvas elements.
- **`camera.js`**: Abstracts webcam access, setup, and teardown operations.
- **`config.js`**: Centralized configuration parameters and constants used across the application.
- **`db.js`**: IndexedDB management wrapper for persisting local state, images, and user preferences.
- **`dom.js`**: UI manipulation and DOM interaction utilities, binding event listeners and handling interface state.
- **`engine.js`**: Core orchestration layer that connects the rendering loops, models, and UI events.
- **`ghostati-mobile-ui.js`**: Specific user interface interactions tailored for mobile layouts and touch events.
- **`ghostyle3d-uv-renderer.js`**: Specialized logic for 3D model processing, UV mapping, and 3D rendering.
- **`ghostyles-manager.js`**: Handles the loading, switching, and parsing of "Ghostyles" (camouflage styles).
- **`main.js`**: Application entry point; initializes all subsystems and triggers the main application flow.
- **`mediapipe-loop.js`**: Encapsulates the logic for loading and running Google MediaPipe models.
- **`plugins3d-loader.js`**: Dynamic loader for 3D plugins, enabling extended 3D tracking capabilities.
- **`state.js`**: Global state management and stores for application data.
- **`utils.js`**: General-purpose helper functions and utilities used by multiple modules.

Explore the sidebar to view detailed information about the functions contained within each module.
