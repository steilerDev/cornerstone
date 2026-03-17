---
sidebar_position: 4
title: Zeitplan
---

# Zeitplan

Die Zeitplan-Seite gibt Ihnen einen visuellen Überblick über Ihren Bauprojekt-Zeitplan. Sie kombiniert ein Gantt-Diagramm, eine Kalenderansicht und Milestone-Verfolgung auf einer einzelnen Seite, sodass Sie sehen können, was passieren muss, wann und in welcher Reihenfolge.

## Übersicht

Das Zeitplan-System bietet:

- **Gantt-Diagramm** -- Interaktive SVG-basierte Visualisierung, die Work Items als horizontale Balken auf einer Zeitachse zeigt, mit Abhängigkeitspfeilen, kritischer Pfad-Hervorhebung und Zoom-Steuerelementen
- **Kalenderansicht** -- Monatliche und wöchentliche Raster, die Work Items als mehrtägige Balken und Milestones als Diamanten anzeigen
- **Meilensteine** -- Benannte Kontrollpunkte mit Zieldatumverfolgung für große Projekt-Fortschritts-Punkte
- **Planungs-Engine** -- Automatische Datumsberechnungen basierend auf Abhängigkeiten, Dauer und Einschränkungen
- **Auto-Reschedule** -- Server-seitige automatische Umplanung von nicht begonnenen Work Items, wenn ein neuer Tag beginnt

## Wie es zusammenpasst

Work Items, die **Start- und Enddatum** haben, erscheinen sowohl im Gantt-Diagramm als auch im Kalender. [Abhängigkeiten](/guides/work-items/dependencies) zwischen Work Items bestimmen die Arbeitsreihenfolge und werden als Pfeile im Gantt-Diagramm visualisiert.

**Meilensteine** markieren wichtige Kontrollpunkte in Ihrem Projekt. Sie können Work Items mit Meilensteinen verknüpfen, damit das geplante Fertigstellungsdatum des Meilensteins die neueste Enddatum seiner beitragenden Work Items widerspiegelt.

Die **Planungs-Engine** verwendet die Critical Path Method (CPM), um optimale Datumwerte für Ihre Work Items zu berechnen, respektierend alle Abhängigkeitsbeziehungen und Einschränkungen. Wenn Sie Auto-Schedule auslösen, passt es Daten für nicht begonnene Elemente an, um sicherzustellen, dass Abhängigkeiten erfüllt sind.

![Timeline Gantt chart view](/img/screenshots/timeline-gantt-light.png)

## Nächste Schritte

- [Gantt-Diagramm](gantt-chart) -- Erfahren Sie mehr über das interaktive Gantt-Diagramm und seine Steuerelemente
- [Meilensteine](milestones) -- Erstellen und verwalten Sie Projekt-Meilensteine
- [Kalenderansicht](calendar-view) -- Navigieren Sie in Ihrem Zeitplan mit monatlichen und wöchentlichen Kalendern
