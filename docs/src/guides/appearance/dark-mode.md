---
sidebar_position: 6
title: Dark Mode
---

# Dark Mode

Cornerstone includes a full dark mode with three theme options:

| Theme | Behavior |
|-------|----------|
| **Light** | Always use the light theme |
| **Dark** | Always use the dark theme |
| **System** | Follow your operating system's preference |

## Changing the Theme

Click the theme toggle in the sidebar to cycle through Light, Dark, and System modes.

## How It Works

- Your theme preference is saved to `localStorage` and persists across sessions
- Theme changes apply immediately with no page reload
- The **System** option uses the `prefers-color-scheme` media query to match your OS setting
- No flash of wrong theme on page load -- the theme is applied before the page renders

## Design System

Cornerstone uses a 3-layer CSS custom property architecture for theming:

1. **Palette layer** -- raw color values (e.g., `--color-blue-500: #3b82f6`)
2. **Semantic layer** -- purpose-driven aliases (e.g., `--color-primary`, `--color-bg-surface`)
3. **Dark mode overrides** -- swaps semantic values for dark-appropriate colors

No hardcoded color values exist in component CSS -- everything references semantic tokens, ensuring consistent dark mode support across all components.
