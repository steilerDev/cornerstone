---
sidebar_position: 1
title: Entwicklung
---

# Entwicklung

Cornerstone wird fast ausschließlich von einem AI Agent Team gebaut -- ein Satz von spezialisierten Claude Code Agents, die sich um alles von Architektur-Design bis Code-Implementierung bis zu Test und Security Review kümmern.

Dieser Abschnitt dokumentiert den agentic Entwicklungsprozess, das Agent-Team und wie Sie eine Entwicklungsumgebung einrichten.

## Ein Agentic Experiment

Dieses Projekt ist ein absichtliches Experiment in agentischer Softwareentwicklung. Das Ziel ist, so wenig Code wie möglich von Hand zu schreiben, stattdessen auf ein koordiniertes Team von AI Agents zu verlassen, um eine echte, produktionsreife Anwendung zu bauen.

Ein menschlicher Orchestrator (der Repository-Besitzer) leitet die Agents: Er definiert Anforderungen, genehmigt Pläne und validiert Funktionen. Die Agents kümmern sich um die Implementierung, das Testen, die Code-Review und die Dokumentation.

## Dokumentations-Struktur

Die Dokumentation von Cornerstone lebt an drei Orten:

| Ort | Inhalt | Publikum |
|----------|---------|----------|
| **Diese Dokumentations-Website** | Benutzeranleitungen, Bereitstellung, Entwicklungsprozess | End-Users und neugierige Entwickler |
| **[GitHub Wiki](https://github.com/steilerDev/cornerstone/wiki)** | Architektur, API-Vertrag, Datenbankschema, ADRs, Sicherheits-Audit | Agent-Team und Mitwirkende |
| **[CLAUDE.md](https://github.com/steilerDev/cornerstone/blob/main/CLAUDE.md)** | Agent-Anweisungen, Konventionen, Workflow-Regeln | AI Agents |

Das Wiki ist die technische Referenz, die Agents lesen und schreiben. Diese Dokumentations-Website ist die menschenfreundliche Schicht oben drauf.

## Nächste Schritte

- [Agentic-Entwicklung](agentic/overview) -- Wie das Agent-Team funktioniert
- [Agent-Team](agentic/agent-team) -- Treffen Sie die 10 spezialisierten Agents
- [Entwicklungs-Workflow](agentic/workflow) -- Agile-Zyklus, Branching und Releases
- [Dev-Setup](agentic/setup) -- Richten Sie eine lokale Entwicklungsumgebung ein
- [Tech-Stack](tech-stack) -- Im Projekt verwendete Technologien
