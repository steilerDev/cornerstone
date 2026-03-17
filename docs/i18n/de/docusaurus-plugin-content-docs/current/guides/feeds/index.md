---
sidebar_position: 8
title: Kalender & Kontakt Feeds
---

# Kalender & Kontakt Feeds

Cornerstone stellt Ihre Projektdaten als Standard-Kalender und Kontakt-Feeds bereit, die Sie von jeder kompatiblen App aus abonnieren können. Dies ermöglicht es Ihnen, Ihren Bauzeitplan in Ihrem Alltags-Kalender zu sehen und Lieferanten-Kontaktdetails in Ihrem Telefon zu behalten -- ohne sich bei Cornerstone anzumelden.

## Übersicht

Zwei Feed-Endpunkte sind verfügbar:

- **Calendar Feed** (`/feeds/cal.ics`) -- Ein iCalendar-Feed mit Work Item Zeitplänen, Meilensteinen und Haushaltsgegenstands-Lieferungen
- **Contacts Feed** (`/feeds/contacts.vcf`) -- Ein vCard-Feed mit Ihrer gesamten Lieferanten-Kontaktinformation

Beide Feeds sind schreibgeschützt und aktualisieren sich automatisch. Wenn Ihre Kalender- oder Kontakt-App den Feed erneut abruft, erhält sie die neuesten Daten von Cornerstone.

## Wie es funktioniert

```
Calendar App  -->  GET /feeds/cal.ics    -->  Cornerstone
Contacts App  -->  GET /feeds/contacts.vcf  -->  Cornerstone
```

Ihre Kalender- oder Kontakt-App fragt den Feed-URL regelmäßig ab. Cornerstone unterstützt **ETags** für effizientes Caching -- wenn sich seit dem letzten Abruf nichts geändert hat, antwortet der Server mit `304 Not Modified` statt alle Daten erneut zu senden.

:::caution
Die Feed-Endpunkte erfordern keine Authentifizierung. Jeder mit Zugriff auf Ihre Cornerstone-Instanz-URL kann die Feeds lesen. Wenn Ihre Instanz dem Internet ausgesetzt ist, erwägen Sie, sie hinter einem Reverse Proxy mit Zugriffskontrolle zu platzieren.
:::

## Was ist enthalten

### Calendar Feed

Der Kalender-Feed enthält drei Arten von Events:

| Event-Typ | Quelle | Datums-Handling |
|------------|--------|---------------|
| **Work Items** | Alle Work Items mit Datumangaben | Verwendet tatsächliche Daten, wo verfügbar, fällt auf geplante Daten zurück |
| **Milestones** | Alle Meilensteine mit Zieldatumangaben | Single-Day Events am Zieldatum |
| **Household Item Deliveries** | Haushaltsgegenstände mit Lieferdatumangaben | Single-Day Events am Lieferdatum |

### Contacts Feed

Der Kontakt-Feed exportiert alle Lieferanten als Kontaktkarten. Jede Karte enthält die Felder, die Sie ausgefüllt haben:

- Name
- Email
- Telefonnummer
- Adresse
- Specialty
- Notizen

## Nächste Schritte

- [Feeds abonnieren](subscribing) -- Schritt-für-Schritt-Anweisungen zum Hinzufügen von Feeds zu beliebten Apps
