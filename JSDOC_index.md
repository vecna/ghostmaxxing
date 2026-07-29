# Ghostmaxxing - Technical Documentation

> **Version:** 0.1.0  
> **Last Updated:** July 6, 2026

Welcome to the internal technical documentation for Ghostmaxxing, a Web AR laboratory for the development and real-time testing of anti-biometric facial recognition camouflage (CV Dazzle).

This documentation is generated from the source code using JSDoc. It provides a detailed breakdown of the functions, classes, and namespaces used throughout the project.

## Ghostyles & Camouflage Templates

If you are developing new anti-biometric style overlays, please read the [Ghostyle Authoring Guide](tutorials/ghostyle-authoring/) (also available under the Tutorials section in the sidebar).

The canonical starting template is documented here:
- **[ghostyles/00-template](module-ghostyles_00-template.html)**: Heavily commented executable documentation for creating new styles.

## Project Architecture and Scopes

The codebase is organized into several modules within the `scripts/` and `ghostyles/` directories. Each file serves a specific role within the application architecture.

### core scripts (`scripts/`)

- **`auto-find-loop.js`**: Manages the loop for automatically identifying bounding boxes or specific areas over frames.
- **`bbox-overlay.js`**: Handles the logic and rendering of bounding boxes overlayed onto the video or canvas elements.
- **`camera.js`**: Abstracts webcam access, setup, and teardown operations.
- **`config.js`**: Centralized configuration parameters and constants used across the application.
- **`db.js`**: IndexedDB management wrapper for persisting local state, images, and user preferences.
- **`dom.js`**: UI manipulation and DOM interaction utilities, binding event listeners and handling interface state.
- **`engine.js`**: Core orchestration layer that connects the rendering loops, models, and UI events.
- **`mobile-ui.js`**: Specific user interface interactions tailored for mobile layouts and touch events.
- **`ghostyle3d-uv-renderer.js`**: Specialized logic for 3D model processing, UV mapping, and 3D rendering.
- **`ghostyles-manager.js`**: Handles the loading, switching, and parsing of "Ghostyles" (camouflage styles).
- **`main.js`**: Application entry point; initializes all subsystems and triggers the main application flow.
- **`mediapipe-loop.js`**: Encapsulates the logic for loading and running Google MediaPipe models.
- **`plugins3d-loader.js`**: Dynamic loader for 3D plugins, enabling extended 3D tracking capabilities.
- **`state.js`**: Global state management and stores for application data.
- **`utils.js`**: General-purpose helper functions and utilities used by multiple modules.

### ghostyles (`ghostyles/`)

- **`00-template.js`**: Canonical template for 2D + UV callbacks.
- **`beauty-2d.js`**: 2D beauty style implementation.
- **`brush.js`**: Procedural makeup/camouflage brush styles.
- **`cv-dazzle-1.js`**: Standard CV Dazzle style 1.
- **`maximalism.js`**: Dazzle maximalist camouflage patterns.
- **`smokey-eyes.js`**: Eye shadow/contouring patterns.
- **`soft-contour.js`**: Cheek/jaw/forehead contouring patterns.
- **`uv-stripes.js`**: Forehead/nose/eyes UV warped stripe patterns.

Explore the sidebar to view detailed information about the functions contained within each module.
