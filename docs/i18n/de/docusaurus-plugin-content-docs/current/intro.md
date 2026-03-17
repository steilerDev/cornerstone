---
slug: /
sidebar_position: 1
title: Einführung
---

import ThemedImage from '@theme/ThemedImage';

<div style={{textAlign: 'center', marginBottom: '2rem'}}>
  <ThemedImage
    alt="Cornerstone"
    sources={{
      light: '/img/logo-full.svg',
      dark: '/img/logo-full-dark.svg',
    }}
    style={{maxWidth: '400px', width: '100%'}}
  />
</div>

# Cornerstone

Ein eigenständig gehostetes Projektmanagement-Tool für Hausbau für Hausbesitzer. Verwalten Sie Arbeitselemente, Budgets, Zeitpläne, Haushaltsgegenstände und Dokumente aus einem einzigen Docker-Container mit SQLite - keine externe Datenbank erforderlich.

## Wer ist Cornerstone?

Cornerstone ist für **Hausbesitzer entwickelt worden, die ein Bau- oder Renovierungsprojekt verwalten**. Egal ob Sie ein neues Haus bauen, ein Stockwerk renovieren oder mehrere Auftragnehmer koordinieren - Cornerstone bietet Ihnen einen zentralen Ort, um alles zu verfolgen.

- **1-5 Benutzer pro Instanz** -- entwickelt für einen Haushalt, nicht für ein Unternehmen
- **Selbst gehostet** -- Ihre Daten bleiben auf Ihrer Hardware
- **Ein einziger Docker-Container** -- keine externe Datenbank, keine komplexe Infrastruktur

## Wichtigste Features

- **Arbeitselemente** -- Erstellen und verwalten Sie Bauziele mit Status, Daten, Zuweisungen, Tags, Notizen, Unterziele und Abhängigkeiten
- **Budgetverwaltung** -- Verfolgung von Kosten mit Budgekategorien, Finanzierungsquellen, Multi-Budget-Zeile Invoice Linking mit itemisierten Beträgen, Zuschüssen und einem Dashboard mit mehreren Prognoseperspektiven
- **Zeitplan & Gantt-Diagramm** -- Interaktives Gantt-Diagramm mit Abhängigkeitspfeilen, kritischer Pfad-Hervorhebung, Zoomsteuerelementen, Meilensteinen und automatischer Planung über die Critical Path Method
- **Kalenderansicht** -- Monatliche und wöchentliche Kalenderraster mit Arbeitselementen und Meilensteinen
- **Meilensteine** -- Verfolgen Sie große Projektkontrollen mit Zieldaten, prognostizierter Fertigstellung und Verzögerungserkennung
- **Haushaltsgegenstände** -- Verfolgen Sie Möbel, Geräte und Einrichtungen mit Kategorien, Lieferzeitplanung, Budgetintegration, Verknüpfung von Arbeitselementen und Zeitplan-Abhängigkeiten
- **Authentifizierung** -- Lokale Konten mit Assistent für die erste Konfiguration, plus OIDC Single Sign-On für bestehende Identity Provider
- **Benutzerverwaltung** -- Admin- und Mitgliederrollen mit einem dedizierten Admin-Panel
- **Bautagebuch** -- Führen Sie ein Bautagebuch mit täglichen Einträgen, Baustellen-Besuche, Lieferdatensätze, Problemverfolgung, automatische Systemereignisse, Fotoanhänge und digitale Signaturerfassung
- **Projekt-Dashboard** -- Projektgesundheit auf einen Blick mit Budgetzusammenfassung, Zeitplanstatus, Invoice und Zuschuss-Pipelines, Mini-Gantt-Vorschau und anpassbares Kartenlayout
- **Dokumentintegration** -- Durchsuchen, durchsuchen und verknüpfen Sie Dokumente aus einer verbundenen [Paperless-ngx](https://docs.paperless-ngx.com/) Instanz mit Arbeitselementen und Invoices
- **Dunkler Modus** -- Helles, Dunkles oder System-Theme mit sofortigem Wechsel
- **Design-System** -- Konsistente visuelle Sprache mit CSS Custom Property Tokens

Weitere Details finden Sie in der [Roadmap](roadmap).

## Schnelle Links

- [Erste Schritte](getting-started) -- Cornerstone in Minuten mit Docker bereitstellen
- [Arbeitselemente-Anleitung](guides/work-items) -- Erfahren Sie, wie Sie Ihre Projektaufgaben verwalten
- [Budget-Anleitung](guides/budget) -- Verfolgung von Kosten, Invoices und Finanzierungsquellen
- [Zeitplan-Anleitung](guides/timeline) -- Gantt-Diagramm, Kalenderansicht und Meilensteine
- [Haushaltsgegenstände-Anleitung](guides/household-items) -- Verwaltung von Möbel-, Geräte- und Installationskäufen
- [Diary-Anleitung](guides/diary) -- Konstruktionstagebuch mit manuellen Einträgen und automatischen Ereignissen
- [Dashboard-Anleitung](guides/dashboard) -- Projektgesundheitsübersicht und Kartenänderung
- [Dokumente-Anleitung](guides/documents) -- Paperless-ngx Integration für Document Linking
- [OIDC Setup](guides/users/oidc-setup) -- Verbinden Sie Ihren Identity Provider
- [Entwicklung](development) -- Wie Cornerstone von einem AI Agent Team gebaut wird
- [GitHub Repository](https://github.com/steilerDev/cornerstone) -- Quellcode und Issue Tracker
- [GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki) -- Technische Architektur-Dokumentation
