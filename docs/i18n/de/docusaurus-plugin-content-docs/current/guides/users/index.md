---
sidebar_position: 4
title: Benutzer & Authentifizierung
---

# Benutzer & Authentifizierung

Cornerstone unterstützt zwei Authentifizierungsmethoden: lokale Konten (E-Mail/Passwort) und OIDC Single Sign-On.

## Authentifizierungsmethoden

### Lokale Authentifizierung

- E-Mail und Passwort Anmeldung
- Passwörter werden mit bcrypt gehasht
- Sichere Session Cookies mit konfigurierbarer Dauer

### OIDC Single Sign-On

Verbinden Sie sich mit Ihrem bestehenden Identity Provider (Authentik, Keycloak oder einem beliebigen OpenID Connect Provider) für nahtlose Anmeldung. Neue Benutzer werden beim ersten OIDC-Anmelden automatisch mit der Member-Rolle bereitgestellt.

Siehe [OIDC Setup](oidc-setup) für detaillierte Konfigurationsanweisungen.

## Benutzerprofile

Benutzer können ihr Profil ansehen und bearbeiten:

- **Display name** -- wie ihr Name in der Anwendung angezeigt wird
- **Password** -- Benutzer lokaler Konten können ihr Passwort ändern

## Rollen

| Rolle | Berechtigungen |
|------|-------------|
| **Admin** | Vollständiger Zugriff einschließlich Benutzerverwaltung, Rollenänderungen und Kontoentaktivierung |
| **Member** | Standard-Zugriff auf Work Items und Projektfeatures |

## Nächste Schritte

- [OIDC Setup](oidc-setup) -- Verbinden Sie Ihren Identity Provider
- [Admin Panel](admin-panel) -- Verwalten Sie Benutzer und Rollen
