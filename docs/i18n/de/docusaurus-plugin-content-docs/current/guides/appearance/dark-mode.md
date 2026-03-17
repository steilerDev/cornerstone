---
sidebar_position: 6
title: Dunkler Modus
---

# Dunkler Modus

Cornerstone verfügt über einen vollständigen dunklen Modus mit drei Theme-Optionen:

| Theme | Verhalten |
|-------|----------|
| **Light** | Verwenden Sie immer das helle Theme |
| **Dark** | Verwenden Sie immer das dunkle Theme |
| **System** | Folgen Sie der Vorlieben Ihres Betriebssystems |

## Ändern des Themes

Klicken Sie auf den Theme-Umschalter in der Seitenleiste, um zwischen Light, Dark und System Moden zu zykleln.

## Wie es funktioniert

- Ihre Theme-Vorliebe wird in `localStorage` gespeichert und bleibt über Sessions hinweg erhalten
- Theme-Änderungen werden sofort ohne Neuseite angewendet
- Die **System** Option verwendet die `prefers-color-scheme` Media-Abfrage, um Ihre OS-Einstellung zu berücksichtigen
- Kein Flash von falschemTheme beim Seiten-Load -- das Theme wird angewendet, bevor die Seite gerendert wird

## Design-System

Cornerstone verwendet eine 3-Schicht-CSS-Custom-Property-Architektur für Theming:

1. **Palette layer** -- rohe Farbwerte (z.B. `--color-blue-500: #3b82f6`)
2. **Semantic layer** -- zweckgesteuerte Aliases (z.B. `--color-primary`, `--color-bg-surface`)
3. **Dark mode overrides** -- tauscht semantische Werte gegen dunkelgeeignete Farben aus

Es gibt keine hartkodierten Farbwerte in Komponenten-CSS -- alles referenziert semantische Tokens, was einheitliche Dark Mode Unterstützung über alle Komponenten hinweg gewährleistet.
