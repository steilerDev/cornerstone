---
sidebar_position: 2
title: First Login
---

# Erste Anmeldung

Wenn Sie Cornerstone zum ersten Mal starten, führt Sie ein Setup-Assistent durch die Erstellung des ursprünglichen Admin-Kontos. Es ist keine Konfiguration auf der Befehlszeile erforderlich.

## Setup-Assistent

1. Öffnen Sie `http://localhost:3000` (oder Ihren konfigurierten Host/Port) in Ihrem Browser
2. Sie werden automatisch auf die Setup-Seite umgeleitet
3. Geben Sie Ihre Admin-Kontodaten ein:
   - **Display Name** -- wie Ihr Name in der Anwendung angezeigt wird
   - **Email** -- wird zum Anmelden verwendet
   - **Password** -- muss mindestens Sicherheitsanforderungen erfüllen
4. Klicken Sie auf **Create Account**

Nach der Erstellung des Admin-Kontos werden Sie zur Anmeldeseite umgeleitet.

## Anmeldung

Geben Sie die E-Mail und das Passwort ein, die Sie gerade erstellt haben, um sich anzumelden. Sie werden auf der Seite "Work Items" landen, bereit, Ihr Projekt zu verwalten.

## Weitere Benutzer hinzufügen

Nach der Anmeldung als Admin können Sie weitere Benutzer über das [Admin-Panel](/guides/users/admin-panel) hinzufügen. Benutzer können mit einem der folgenden erstellt werden:

- **Lokale Konten** -- E-Mail und Passwort werden von Cornerstone verwaltet
- **OIDC-Konten** -- Benutzer melden sich über Ihren Identity Provider an und werden beim ersten Anmelden automatisch bereitgestellt (siehe [OIDC Setup](/guides/users/oidc-setup))

## Rollen

Cornerstone hat zwei Rollen:

| Rolle | Berechtigungen |
|------|-------------|
| **Admin** | Vollständiger Zugriff einschließlich Benutzerverwaltung |
| **Member** | Standardzugriff auf Work Items und Projektfunktionen |

Der erste Benutzer, der durch den Setup-Assistenten erstellt wird, ist immer ein Admin.
