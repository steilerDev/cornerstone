---
sidebar_position: 7
title: Haushaltsgegenstände
---

# Haushaltsgegenstände

Haushaltsgegenstände ermöglichen es Ihnen, Möbel, Geräte, Einrichtungen und andere Käufe für Ihr Zuhause zu verfolgen -- getrennt von Bauziele-Arbeitselemente. Jedes Haushaltsgegenstand hat seinen eigenen Lebenszyklus von der Planung bis zur Lieferung, mit Budget-Tracking, Lieferantenverwaltung, Lieferzeitplanung und Dokument-Linking.

## Übersicht

Das Haushaltsgegenstands-System bietet:

- **Item Management** -- Erstellen, bearbeiten und verfolgen Sie Haushaltskäufe mit Kategorien, Status, Lieferanten, Räumen, Mengen und Produkt-URLs
- **Budget-Integration** -- Fügen Sie Budget Lines mit Sicherheitsstufen, Budget-Kategorien und Finanzierungsquellen hinzu -- Kosten für Haushaltsgegenstände erscheinen in der projektweiten Budget-Übersicht
- **Work Item Linking** -- Verknüpfen Sie Haushaltsgegenstände mit Work Items für Installationskoordination (z.B. "Küchenbecken" hängt von "Plumbing rough-in" ab)
- **Lieferzeitplanung** -- Verfolgen Sie Bestelldatum, Lieferfenster (Früh/Spät), tatsächliches Lieferdatum und Verzögerungserkennung
- **Zeitplan-Abhängigkeiten** -- Fügen Sie Abhängigkeiten auf Work Items und Meilensteine hinzu, damit Lieferdatum in den Projekt-Gantt-Diagramm integriert sind
- **Invoice Linking** -- Verknüpfen Sie Lieferanten-Invoices mit Haushaltsgegenstands-Budget-Linien, um tatsächliche Kosten zu verfolgen
- **Dokument-Linking** -- Anhang von Dokumenten aus [Paperless-ngx](/guides/documents) (Produktspezifikationen, Quittungen, Garantien) auf Haushaltsgegenstände
- **Tags & Notizen** -- Organisieren Sie Items mit farbkodierten Tags und fügen Sie zeitgestempelte Notizen hinzu
- **Subsidy Support** -- Wenden Sie Zuschuss-Programme auf Haushaltsgegenstands-Kosten an, um Budgetreduktion zu erreichen

## Kategorien

Jedes Haushaltsgegenstand wird einer Kategorie zugeordnet:

| Kategorie | Beschreibung |
|----------|-------------|
| **Furniture** | Tische, Stühle, Sofas, Betten, Regale |
| **Appliances** | Küchengeräte, Wäscherei, HVAC-Einheiten |
| **Fixtures** | Armaturen, Leuchten, Türgriffe |
| **Decor** | Kunstwerk, Vorhänge, Teppiche, Dekorationsartikel |
| **Electronics** | Smart-Home-Geräte, Lautsprecher, Netzwerk |
| **Outdoor** | Gartenmöbel, Grills, Außenbeleuchtung |
| **Storage** | Schränke, Kleiderschranksysteme, Garagenlagerung |
| **Other** | Alles, das nicht in die obigen passt |

## Status

Haushaltsgegenstände durchlaufen einen Kauflebenszyklus:

| Status | Bedeutung |
|--------|---------|
| **Planned** | Item identifiziert, aber noch nicht bestellt |
| **Purchased** | Bestellung bei Lieferant platziert |
| **Scheduled** | Lieferdatum bestätigt |
| **Arrived** | Item geliefert |

## List View

Die Haushaltsgegenstands-List Page bietet:

- **Search** -- Volltextsuche über Item-Namen und Beschreibungen
- **Filtering** -- Filter nach Kategorie, Status, Raum, Lieferant oder Tag
- **Sorting** -- Sortierung nach Name, Kategorie, Status, Raum, Bestelldatum, Lieferdatum oder Erstellungsdatum
- **Pagination** -- Paginierte Ergebnisse für große Item-Listen
- **Responsive Layout** -- Tabellenansicht auf Desktop, Kartenansicht auf Mobile und Tablet

Alle Filter- und Sortiereinstellungen werden in der URL synchronisiert, sodass Ihre Ansicht hinzufügbar und teilbar ist.

![Household items list page](/img/screenshots/household-items-list-light.png)

## Detail View

Klicken Sie auf ein Haushaltsgegenstand, um seine vollständige Detail-Seite mit allen Feldern, Budget Lines, Notizen, Abhängigkeiten, verknüpften Work Items, verknüpften Dokumenten und angewendeten Zuschüssen zu sehen. Felder können durch Klicken auf diese inline bearbeitet werden.

![Household item detail page](/img/screenshots/household-item-detail-light.png)

## Nächste Schritte

- [Erstellen & Bearbeiten von Items](creating-editing-items) -- Wie man Haushaltsgegenstände erstellt und verwaltet
- [Budget & Invoices](budget-and-invoices) -- Verfolgen Sie Kosten und verknüpfen Sie Invoices
- [Work Item Linking](work-item-linking) -- Koordinieren Sie die Installation mit Work Items
- [Lieferung & Abhängigkeiten](delivery-and-dependencies) -- Zeitplan-Lieferungen mit Zeitplan-Abhängigkeiten
