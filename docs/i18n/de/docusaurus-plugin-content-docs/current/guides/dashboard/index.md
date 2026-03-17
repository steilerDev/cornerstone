---
sidebar_position: 1
title: Dashboard
---

# Dashboard

Das Projekt-Dashboard unter **Project > Overview** gibt Ihnen einen Überblick über Ihr gesamtes Hausbauprojekt. Es kombiniert Budget-Gesundheit, Zeitplan-Fortschritt, Invoices und Zuschüsse in einer einzelnen Seite von kartenzentrierten Widgets.

## Dashboard-Karten

Das Dashboard ist in Karten organisiert, jede konzentriert sich auf einen spezifischen Aspekt Ihres Projekts:

| Karte | Was es zeigt |
|------|---------------|
| **Budget Summary** | Verfügbare Mittel und verbleibendenes Budget über vier Perspektiven (min geplant, max geplant, tatsächliche Kosten, tatsächlich bezahlt) |
| **Budget Alerts** | Warnungen, wenn die Kosten einer Budget-Kategorie den zugeordneten Betrag überschreiten |
| **Source Utilization** | Fortschrittsbalken zeigen, wie viel von jeder Finanzierungsquelle verwendet wurde |
| **Timeline Status** | Work Item Anzahl nach Status und Meilenstein-Fortschritt |
| **Mini Gantt** | Eine kompakte 30-Tage-Gantt-Diagramm Vorschau -- klicken Sie, um das vollständige [Gantt-Diagramm](/guides/timeline/gantt-chart) zu öffnen |
| **Invoice Pipeline** | Aufschlüsselung von Invoices nach Status (pending, paid, claimed) |
| **Subsidy Pipeline** | Statusüberblick Ihrer [Zuschuss-Programme](/guides/budget/subsidies) |
| **Recent Diary** | Neueste Tagebuch-Einträge mit scrollbarer Liste -- klicken Sie, um das vollständige [Tagebuch](/guides/diary/) zu öffnen |
| **Quick Actions** | Navigations-Links zu häufig verwendeten Aktionen wie dem Erstellen von Work Items oder dem Anzeigen des Budgets |

## Anpassung Ihres Dashboards

Sie können alle Karten, die Sie nicht benötigen, durch Klicken auf die Schaltfläche "Verwerfen" auf dieser Karte verwerfen. Verworfene Karten werden in Ihren Benutzereinstellungen gespeichert und bleiben über Sessions hinweg erhalten.

Um eine versteckte Karte zurückzubringen:

1. Klicken Sie auf die Schaltfläche **Customize** im Seitenkopf (diese Schaltfläche erscheint nur, wenn mindestens eine Karte versteckt ist)
2. Wählen Sie die Karte aus, die Sie wiederherstellen möchten, aus dem Dropdown-Menü

Das Dashboard-Layout jedes Benutzers ist unabhängig -- das Verwerfen einer Karte betrifft nur Ihre eigene Ansicht.

## Mobile Layout

Auf kleineren Bildschirmen wechselt das Dashboard von einem flachen Raster zu einem Abschnittslayout:

- **Primäre Karten** (Budget Summary, Budget Alerts, Invoice Pipeline, Recent Diary, Quick Actions) sind immer sichtbar
- **Zeitplan-Karten** (Timeline Status, Mini Gantt) sind unter einem umklappbaren "Timeline" Abschnitt mit einer Zusammenfassungszeile gruppiert
- **Budget Details Karten** (Source Utilization, Subsidy Pipeline) sind unter einem umklappbaren "Budget Details" Abschnitt gruppiert

Tippen Sie auf einen Abschnittskopf, um ihn zu erweitern oder zu erweichen.

## Error Handling

Wenn eine Datenquelle nicht geladen werden kann, zeigt die betroffene Karte eine Fehlermeldung mit einer Schaltfläche **Retry**. Andere Karten werden weiterhin normal angezeigt -- ein Fehler in einem Bereich blockiert nicht den Rest des Dashboards.

Karten, die keine anzuzeigenden Daten haben (z.B. die Invoice Pipeline, wenn noch keine Invoices vorhanden sind), zeigen eine hilfreiche leere Zustandsmeldung mit einem Link zu der relevanten Seite an, auf der Sie Daten hinzufügen können.

## Accessibility

Das Dashboard verwendet ARIA-Wahrzeichen und Live-Regionen, damit Bildschirmleser Aktualisierungen ankündigen, wenn Daten geladen werden. Alle Karten und Steuerelemente sind vollständig mit der Tastatur navigierbar.

:::info Screenshot benötigt
Dashboard-Screenshots werden bei der nächsten stabilen Version erfasst.
:::
