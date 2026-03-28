import type { Edge, XYPosition } from '@xyflow/react';

import type { BotProject, BuilderNode, BuilderNodeData, BuilderMode, NodeKind } from '../types';

const PROJECT_VERSION = 1;

function uniqueId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function projectNameToSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'discord-bot-maker';
}

export function createNode(
  kind: NodeKind,
  position: XYPosition,
  overrides: Partial<BuilderNodeData> = {},
): BuilderNode {
  const base: BuilderNodeData = {
    title: `${kind[0].toUpperCase()}${kind.slice(1)} Node`,
    summary: 'Noch nicht konfiguriert.',
    kind,
    accent: {
      command: '#f97316',
      event: '#06b6d4',
      action: '#10b981',
      condition: '#eab308',
      ui: '#fb7185',
      storage: '#8b5cf6',
    }[kind],
  };

  return {
    id: uniqueId(kind),
    type: 'builderNode',
    position,
    data: {
      ...base,
      ...overrides,
    },
  };
}

export function createEdge(source: string, target: string): Edge {
  return {
    id: uniqueId('edge'),
    source,
    target,
    animated: false,
  };
}

export function createEmptyProject(
  overrides: Partial<BotProject['metadata']> = {},
): BotProject {
  const name = overrides.name ?? 'Discord Bot Maker Project';

  return {
    version: PROJECT_VERSION,
    id: projectNameToSlug(name),
    metadata: {
      name,
      description: overrides.description ?? 'Visueller Discord-Bot mit ZIP-Import und Code-Rekonstruktion.',
      mode: overrides.mode ?? 'beginner',
      framework: overrides.framework ?? 'discord.py',
      structure: overrides.structure ?? 'modular',
      storage: overrides.storage ?? 'local-json',
      deploymentTarget: overrides.deploymentTarget ?? 'github-pages',
      allowCustomCode: overrides.allowCustomCode ?? true,
    },
    graph: {
      nodes: [
        createNode('command', { x: 80, y: 100 }, {
          title: 'Slash Command /hello',
          summary: 'Ein sicherer Starterknoten für neue Projekte.',
          commandName: 'hello',
          commandDescription: 'Antwortet mit einer kurzen Begrüßung.',
          commandStyle: 'slash',
        }),
        createNode('action', { x: 420, y: 100 }, {
          title: 'Antwort senden',
          summary: 'Schickt eine Standardnachricht an Discord.',
          actionType: 'reply',
          responseText: 'Hallo! Dein visueller Bot läuft.',
        }),
      ],
      edges: [],
      viewport: {
        x: 0,
        y: 0,
        zoom: 0.85,
      },
    },
    lastSavedAt: new Date().toISOString(),
  };
}

export function touchProject(project: BotProject): BotProject {
  return {
    ...project,
    lastSavedAt: new Date().toISOString(),
  };
}

export function cloneProject(project: BotProject): BotProject {
  return JSON.parse(JSON.stringify(project)) as BotProject;
}

export function applyTemplate(project: BotProject): BotProject {
  return touchProject({
    ...cloneProject(project),
    id: projectNameToSlug(project.metadata.name),
  });
}

export function setProjectMode(project: BotProject, mode: BuilderMode): BotProject {
  return touchProject({
    ...project,
    metadata: {
      ...project.metadata,
      mode,
    },
  });
}

export function summarizeProject(project: BotProject): Record<string, number> {
  return project.graph.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.data.kind] = (acc[node.data.kind] ?? 0) + 1;
    return acc;
  }, {});
}
