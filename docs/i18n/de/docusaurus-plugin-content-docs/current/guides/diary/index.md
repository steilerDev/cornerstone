---
sidebar_position: 8
title: Bautagebuch
---

# Konstruktionstagebuch

Das Konstruktionstagebuch (Bautagebuch) gibt Ihnen eine chronologische Dokumentation von allem, was auf Ihrem Bauprojekt passiert. Es kombiniert manuelle Einträge, die Sie schreiben, mit automatischen System-Events, die Cornerstone generiert, wenn erhebliche Änderungen anderswo in der Anwendung auftreten.

## Übersicht

Das Tagebuch bietet:

- **Manuelle Einträge** -- Schreiben Sie tägliche Protokolle, zeichnen Sie Baustellen-Besuche auf, verfolgen Sie Lieferungen, markieren Sie Probleme und fügen Sie allgemeine Notizen hinzu
- **Automatische Events** -- Systemgenerierte Einträge für Work Item Status-Änderungen, Invoice-Erstellung und Status-Änderungen, Meilenstein-Verzögerungen, Budget-Brüche, Zeitplan-Änderungen und Subsidy-Änderungen
- **Foto-Anhänge** -- Fügen Sie Fotos zu manuellen Einträgen für visuelle Dokumentation hinzu
- **Signatur-Erfassung** -- Sammeln Sie digitale Signaturen von Benutzern oder Lieferanten mit einem Drawing Canvas; signierte Einträge werden unveränderbar
- **Filterung** -- Filtern Sie das Tagebuch nach All, Manual oder Automatic Einträgen mit type-spezifischen Filter Chips

## Entry Types

### Manuelle Einträge

Sie erstellen diese Einträge, um Aktivitäten und Beobachtungen zu dokumentieren:

| Type | Zweck |
|------|---------|
| **Daily Log** | Allgemeine tägliche Fortschrittsnotizen und Beobachtungen |
| **Site Visit** | Zeichnen Sie einen Besuch auf der Baustelle auf |
| **Delivery** | Verfolgen Sie Materialien oder Items, die zur Baustelle geliefert werden |
| **Issue** | Markieren Sie ein Problem, das Aufmerksamkeit benötigt -- unterstützt Bestätigungs-Signaturen |
| **General Note** | Alles, das nicht in die anderen Kategorien passt |

### Automatische Events

Cornerstone erstellt automatisch Tagebuch-Einträge, wenn erhebliche Änderungen im System auftreten:

| Event | Trigger |
|-------|---------|
| **Work Item Status** | Status eines Work Items ändert sich (z.B. von "Not Started" zu "In Progress") |
| **Invoice Created** | Eine neue Invoice wird zu einem Lieferanten hinzugefügt |
| **Invoice Status** | Ein Invoice Status ändert sich (z.B. von "Pending" zu "Paid") |
| **Milestone Delay** | Das geplante Fertigstellungsdatum eines Meilensteins überschreitet sein Zieldatum |
| **Budget Breach** | Die Kosten einer Budget-Kategorie überschreiten den zugeordneten Betrag |
| **Schedule** | Der Projekt-Zeitplan wird neu berechnet oder geändert |
| **Subsidy** | Status oder Betrag eines Zuschuss-Programms ändern sich |

Automatische Events sind chronologisch mit manuellen Einträgen verflochten -- es gibt keinen separaten Abschnitt für sie. Jedes automatische Event enthält einen Link zur verwandten Entity, sodass Sie direkt zur Quelle navigieren können.

## Filterung

Oben auf der Tagebuch-Seite können Sie mit Filter Chips die Ansicht eingrenzen:

- **All** -- Zeigen Sie jeden Eintrag an (manuell und automatisch)
- **Manual** -- Zeigen Sie nur Ihre handgeschriebenen Einträge an
- **Automatic** -- Zeigen Sie nur systemgenerierte Events an

Wenn der Automatic-Filter aktiv ist, erscheinen zusätzliche type-spezifische Chips für feinere Kontrolle (z.B. "Invoice" gruppiert sowohl Invoice-Erstellung als auch Status-Änderungs-Events).

## Nächste Schritte

- [Manuelle Einträge](manual-entries) -- Erstellung und Bearbeitung von Tagebuch-Einträgen
- [Automatische Events](automatic-events) -- Wie System-Events generiert werden
- [Signaturen](signatures) -- Digitale Signatur-Erfassung und Unveränderbarkeit

:::info Screenshot benötigt
Tagebuch-Screenshots werden bei der nächsten stabilen Version erfasst.
:::
