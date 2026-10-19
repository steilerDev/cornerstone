---
name: camera-review-close-labels
description: German wording for the rapid-capture camera exit label (Review (n) / Close) and camera-roll phrasing (#2227)
metadata:
  type: project
---

"Review (n)" as a verb (check the photos) is "Prüfen ({{n}})", not "Fertig" or the status word "Abgeschlossen" (glossary Done). "Close" is "Schließen". Do not name the platform photo library (Apple "Fotomediathek", Android "Galerie"/"Google Fotos"). Say "auf deinem Telefon gespeichert" instead, in every camera string. Quote browser dialog buttons only if the wording is stable; Chrome says "Zulassen", Firefox and Safari "Erlauben", so the allow hint avoids naming the button.

**Why:** the camera exit label is a short top-bar control at 360px, and the browser button names differ by vendor. **How to apply:** reuse these for any future camera or capture label.
