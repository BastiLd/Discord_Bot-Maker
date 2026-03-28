import type { XYPosition } from '@xyflow/react';

import type { BotProject } from '../types';
import { createEmptyProject, createEdge, createNode, projectNameToSlug } from '../lib/project';

export interface BuilderTemplate {
  id: string;
  name: string;
  description: string;
  project: BotProject;
}

function at(x: number, y: number): XYPosition {
  return { x, y };
}

function moderationTemplate(): BuilderTemplate {
  const project = createEmptyProject({
    name: 'Moderation Starter',
    description: 'Slash-Command mit Rollenzuweisung und Bestätigungsantwort.',
    mode: 'advanced',
  });

  const command = createNode('command', at(60, 80), {
    title: 'Slash Command /baninfo',
    summary: 'Startet einen Moderationsablauf mit Antwort.',
    commandName: 'baninfo',
    commandDescription: 'Zeigt den Moderationshinweis an.',
  });
  const role = createNode('action', at(360, 60), {
    title: 'Rolle prüfen',
    summary: 'Markiert Moderationsrollen für spätere Prüfung.',
    actionType: 'assign-role',
    roleName: 'Moderator',
    notes: 'Der Export erzeugt eine sichere Grundlogik und markiert Spezialfälle in EXPORT_NOTES.md.',
  });
  const reply = createNode('action', at(660, 80), {
    title: 'Antwort senden',
    summary: 'Schickt eine sichtbare Rückmeldung im Command.',
    actionType: 'reply',
    responseText: 'Moderations-Check abgeschlossen. Bitte überprüfe den User manuell.',
  });

  project.graph.nodes = [command, role, reply];
  project.graph.edges = [
    createEdge(command.id, role.id),
    createEdge(role.id, reply.id),
  ];
  project.id = projectNameToSlug(project.metadata.name);

  return {
    id: 'moderation-starter',
    name: 'Moderation Starter',
    description: 'Ein kleiner, sicherer Einstieg für Slash Commands und Rollenlogik.',
    project,
  };
}

function welcomeTemplate(): BuilderTemplate {
  const project = createEmptyProject({
    name: 'Welcome Flow',
    description: 'Willkommensnachricht mit Embed und Button.',
    mode: 'beginner',
  });

  const event = createNode('event', at(60, 100), {
    title: 'Event on_member_join',
    summary: 'Reagiert auf neue Server-Mitglieder.',
    eventName: 'on_member_join',
  });
  const embed = createNode('action', at(380, 40), {
    title: 'Willkommens-Embed',
    summary: 'Versendet eine DM mit gestylter Begrüßung.',
    actionType: 'embed',
    embedTitle: 'Willkommen auf dem Server',
    embedDescription: 'Lies bitte die Regeln und nutze die Buttons, um loszulegen.',
  });
  const button = createNode('ui', at(700, 120), {
    title: 'Regel-Button',
    summary: 'Hängt eine Button-Interaktion an die Nachricht.',
    uiType: 'button',
    buttonLabel: 'Regeln öffnen',
    responseText: 'Die Regeln sind jetzt markiert. Passe die Zielaktion im Export an.',
  });

  project.graph.nodes = [event, embed, button];
  project.graph.edges = [
    createEdge(event.id, embed.id),
    createEdge(embed.id, button.id),
  ];
  project.id = projectNameToSlug(project.metadata.name);

  return {
    id: 'welcome-flow',
    name: 'Welcome Flow',
    description: 'Ein visueller Startpunkt für Join-Events, Embeds und Buttons.',
    project,
  };
}

function ticketTemplate(): BuilderTemplate {
  const project = createEmptyProject({
    name: 'Ticket Panel',
    description: 'Prefix-Command, Embed und Button für ein Ticket-Panel.',
    mode: 'advanced',
  });

  const command = createNode('command', at(60, 80), {
    title: 'Prefix Command !ticket',
    summary: 'Öffnet das Ticket-Panel per Prefix Command.',
    commandName: 'ticket',
    commandStyle: 'prefix',
    commandDescription: 'Sendet das Ticket-Panel.',
  });
  const embed = createNode('action', at(380, 50), {
    title: 'Panel-Embed',
    summary: 'Zeigt eine Ticket-Anleitung an.',
    actionType: 'embed',
    embedTitle: 'Support Ticket',
    embedDescription: 'Drücke den Button, um dein Anliegen zu starten.',
  });
  const button = createNode('ui', at(700, 80), {
    title: 'Ticket-Button',
    summary: 'Stellt eine klickbare Aktion bereit.',
    uiType: 'button',
    buttonLabel: 'Ticket öffnen',
    responseText: 'Ticket-Interaktion ausgelöst.',
  });

  project.graph.nodes = [command, embed, button];
  project.graph.edges = [
    createEdge(command.id, embed.id),
    createEdge(embed.id, button.id),
  ];
  project.id = projectNameToSlug(project.metadata.name);

  return {
    id: 'ticket-panel',
    name: 'Ticket Panel',
    description: 'Ein Export, der direkt eine Button-basierte Support-Fläche erzeugt.',
    project,
  };
}

export const builderTemplates: BuilderTemplate[] = [
  moderationTemplate(),
  welcomeTemplate(),
  ticketTemplate(),
];
