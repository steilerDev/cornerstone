---
sidebar_position: 6
title: Dokumente
---

# Dokumente

Cornerstone integriert sich mit [Paperless-ngx](https://docs.paperless-ngx.com/) um Ihre Bau-Dokumente -- Invoices, Verträge, Genehmigungen, Pläne -- an den gleichen Ort zu bringen, wo Sie Ihr Projekt verwalten. Keine Dokumente werden in Cornerstone selbst gespeichert; es referenziert Dokumente in Ihrer bestehenden Paperless-ngx-Instanz und zeigt sie inline an.

## Übersicht

Die Dokumentintegration bietet:

- **Dokument-Browser** -- Eine dedizierte Seite zum Suchen, Filtern und Durchsuchen aller Dokumente in Ihrer Paperless-ngx-Instanz
- **Dokument-Linking** -- Anhang von Paperless-ngx-Dokumenten zu Work Items und Lieferanten-Invoices, damit verwandte Dokumente immer einen Klick entfernt sind
- **Thumbnail-Vorschaubilder** -- Dokument-Thumbnails werden inline angezeigt, sodass Sie Dokumente auf einen Blick identifizieren können
- **Detail-Panel** -- Ansicht von Dokument-Metadaten (Titel, Erstellungsdatum, Correspondent, Dokumenttyp, Tags, Inhaltsvorschau), ohne Cornerstone zu verlassen
- **Tag-Filterung** -- Filtern Sie Dokumente nach Paperless-ngx-Tags im Dokument-Browser
- **Graceful Degradation** -- Wenn Paperless-ngx nicht konfiguriert oder erreichbar ist, zeigt Cornerstone klare Statusmeldungen statt Fehler an

## Wie es funktioniert

Die gesamte Kommunikation mit Paperless-ngx wird durch den Cornerstone-Backend proxiert. Ihr Paperless-ngx-API-Token verlässt den Server nie -- der Browser spricht nur mit Cornerstone, das Anfragen zu Paperless-ngx in Ihrem Namen weiterleitet. Dies hält Ihre Anmeldedaten sicher und vereinfacht die Netzwerkkonfiguration.

```
Browser  -->  Cornerstone Server  -->  Paperless-ngx
               (proxy layer)            (document store)
```

:::note
Screenshots für die Dokumentenfeature erfordern eine verbundene Paperless-ngx-Instanz und werden in einer zukünftigen Version hinzugefügt.
:::

## Voraussetzungen

Sie benötigen eine laufende [Paperless-ngx](https://docs.paperless-ngx.com/)-Instanz mit aktiviertem API-Zugriff. Cornerstone wurde mit Paperless-ngx v2.x getestet.

## Nächste Schritte

- [Setup](setup) -- Konfigurieren Sie die Paperless-ngx-Verbindung
- [Dokumente durchsuchen](browsing-documents) -- Verwenden Sie den Dokument-Browser zum Suchen und Filtern
- [Dokumente verknüpfen](linking-documents) -- Befestigen Sie Dokumente an Work Items und Invoices
