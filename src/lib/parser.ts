import JSZip from 'jszip';

import type {
  BotProject,
  BuilderEdge,
  BuilderNode,
  BuilderNodeData,
  CommandStyle,
} from '../types';
import { createEmptyProject, createEdge, createNode, projectNameToSlug, touchProject } from './project';

interface ZipTextFile {
  path: string;
  size: number;
  content: string;
}

interface TriggerMatch {
  type: 'command' | 'event';
  label: string;
  commandStyle?: CommandStyle;
  description?: string;
  eventName?: string;
  block: string;
  file: string;
}

const STRING_LITERAL = /(["'])(?<value>(?:\\.|(?!\1).)*)\1/;

function extractIndentedBlock(source: string, startIndex: number): string {
  const slice = source.slice(startIndex);
  const lines = slice.split(/\r?\n/);
  const defIndex = lines.findIndex((line) => /\bdef\s+[A-Za-z_]\w*/.test(line));
  if (defIndex === -1) {
    return slice.slice(0, 700);
  }

  const result: string[] = [];
  const definitionIndent = lines[defIndex].match(/^\s*/)?.[0].length ?? 0;

  for (const line of lines.slice(0, defIndex + 1)) {
    result.push(line);
  }

  for (const line of lines.slice(defIndex + 1)) {
    if (!line.trim()) {
      result.push(line);
      continue;
    }

    const lineIndent = line.match(/^\s*/)?.[0].length ?? 0;
    if (lineIndent <= definitionIndent && !line.trim().startsWith('#')) {
      break;
    }

    result.push(line);
  }

  return result.join('\n');
}

function parseDecoratorName(argumentsText: string, fallback: string): string {
  const nameMatch = argumentsText.match(/name\s*=\s*["']([^"']+)["']/);
  return nameMatch?.[1] ?? fallback;
}

function parseDecoratorDescription(argumentsText: string): string | undefined {
  return argumentsText.match(/description\s*=\s*["']([^"']+)["']/)?.[1];
}

function extractTriggerMatches(file: ZipTextFile): TriggerMatch[] {
  const matches: TriggerMatch[] = [];
  const slashCommandPattern =
    /@(?:(?:bot|client)\.tree|tree|app_commands)\.command\(([\s\S]*?)\)\s*(?:\r?\n)+\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/g;
  const prefixCommandPattern =
    /@(?:(?:bot|client)\.command|commands\.(?:command|hybrid_command|hybrid_group))\(([\s\S]*?)\)\s*(?:\r?\n)+\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/g;
  const eventPattern =
    /@(?:bot|client)\.event\s*(?:\r?\n)+\s*async\s+def\s+(on_[A-Za-z_]\w*)/g;
  const listenerPattern =
    /@commands\.Cog\.listener(?:\([^)]*\))?\s*(?:\r?\n)+\s*async\s+def\s+(on_[A-Za-z_]\w*)/g;

  for (const match of file.content.matchAll(slashCommandPattern)) {
    const fallbackName = match[2];
    matches.push({
      type: 'command',
      label: parseDecoratorName(match[1], fallbackName),
      commandStyle: 'slash',
      description: parseDecoratorDescription(match[1]),
      block: extractIndentedBlock(file.content, match.index ?? 0),
      file: file.path,
    });
  }

  for (const match of file.content.matchAll(prefixCommandPattern)) {
    const fallbackName = match[2];
    matches.push({
      type: 'command',
      label: parseDecoratorName(match[1], fallbackName),
      commandStyle: 'prefix',
      description: parseDecoratorDescription(match[1]),
      block: extractIndentedBlock(file.content, match.index ?? 0),
      file: file.path,
    });
  }

  for (const match of file.content.matchAll(eventPattern)) {
    matches.push({
      type: 'event',
      label: match[1],
      eventName: match[1],
      block: extractIndentedBlock(file.content, match.index ?? 0),
      file: file.path,
    });
  }

  for (const match of file.content.matchAll(listenerPattern)) {
    matches.push({
      type: 'event',
      label: match[1],
      eventName: match[1],
      block: extractIndentedBlock(file.content, match.index ?? 0),
      file: file.path,
    });
  }

  return matches;
}

function extractMessages(block: string): string[] {
  const results = new Set<string>();
  const callPattern = /(?:send_message|send|reply)\(([\s\S]*?)\)/g;

  for (const match of block.matchAll(callPattern)) {
    const stringMatch = match[1].match(STRING_LITERAL);
    if (stringMatch?.groups?.value) {
      results.add(stringMatch.groups.value.replace(/\\n/g, ' ').trim());
    }
  }

  return [...results].filter(Boolean).slice(0, 3);
}

function extractEmbeds(block: string): Array<{ title?: string; description?: string }> {
  const embeds: Array<{ title?: string; description?: string }> = [];
  const embedPattern = /discord\.Embed\(([\s\S]*?)\)/g;

  for (const match of block.matchAll(embedPattern)) {
    const title = match[1].match(/title\s*=\s*["']([^"']+)["']/)?.[1];
    const description = match[1].match(/description\s*=\s*["']([^"']+)["']/)?.[1];
    embeds.push({ title, description });
  }

  return embeds.slice(0, 2);
}

function extractUiComponents(block: string): string[] {
  const components = new Set<string>();
  const uiPattern = /discord\.ui\.(Button|Select|Modal)/g;

  for (const match of block.matchAll(uiPattern)) {
    components.add(match[1].toLowerCase());
  }

  return [...components];
}

function collectWarnings(files: ZipTextFile[]): string[] {
  const warnings = new Set<string>();
  const warningMap: Array<[RegExp, string]> = [
    [/\bexec\s*\(/, 'exec() erkannt: unsichere oder dynamische Logik wurde nicht rekonstruiert.'],
    [/\beval\s*\(/, 'eval() erkannt: der Import bleibt absichtlich bei best-effort.'],
    [/\bsubprocess\b/, 'subprocess-Nutzung erkannt: Systemaufrufe werden nicht in Nodes übersetzt.'],
    [/\bdiscord\.ext\.tasks\b/, 'discord.ext.tasks erkannt: Scheduler werden aktuell nur als Hinweis importiert.'],
    [/\bload_extension\b/, 'Extension-Lader erkannt: modulare Erweiterungen müssen manuell geprüft werden.'],
    [/\b(open|aiohttp|requests)\b/, 'Datei- oder Netzwerkzugriffe erkannt: diese Logik bleibt im Export markiert.'],
  ];

  for (const file of files) {
    for (const [pattern, message] of warningMap) {
      if (pattern.test(file.content)) {
        warnings.add(`${file.path}: ${message}`);
      }
    }
  }

  return [...warnings];
}

function importedNode(
  kind: BuilderNodeData['kind'],
  position: { x: number; y: number },
  overrides: Partial<BuilderNodeData>,
): BuilderNode {
  return createNode(kind, position, {
    imported: true,
    ...overrides,
  });
}

function connectChain(nodes: BuilderNode[]): BuilderEdge[] {
  const edges: BuilderEdge[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push(createEdge(nodes[index].id, nodes[index + 1].id));
  }
  return edges;
}

function buildProjectFromTriggers(
  zipName: string,
  sourceFiles: ZipTextFile[],
  triggers: TriggerMatch[],
  warnings: string[],
): BotProject {
  const project = createEmptyProject({
    name: zipName.replace(/\.zip$/i, ''),
    description: 'Aus importiertem Python-Code rekonstruiert.',
    mode: 'advanced',
    structure: 'modular',
  });

  const nodes: BuilderNode[] = [];
  const edges: BuilderEdge[] = [];
  const commands = new Set<string>();
  const events = new Set<string>();
  const uiComponents = new Set<string>();
  const rawMessages = new Set<string>();

  triggers.forEach((trigger, index) => {
    const rowBase = 70 + index * 240;
    const chain: BuilderNode[] = [];

    if (trigger.type === 'command') {
      commands.add(trigger.label);
      chain.push(
        importedNode('command', { x: 60, y: rowBase }, {
          title: `${trigger.commandStyle === 'prefix' ? 'Prefix' : 'Slash'} Command ${trigger.commandStyle === 'prefix' ? '!' : '/'}${trigger.label}`,
          summary: 'Aus dem Import erkannt.',
          commandName: trigger.label,
          commandDescription: trigger.description ?? 'Importierter Command',
          commandStyle: trigger.commandStyle ?? 'slash',
          sourceFile: trigger.file,
        }),
      );
    } else {
      events.add(trigger.eventName ?? trigger.label);
      chain.push(
        importedNode('event', { x: 60, y: rowBase }, {
          title: `Event ${trigger.eventName ?? trigger.label}`,
          summary: 'Aus dem Import erkannt.',
          eventName: trigger.eventName ?? trigger.label,
          sourceFile: trigger.file,
        }),
      );
    }

    const embeds = extractEmbeds(trigger.block);
    const messages = extractMessages(trigger.block);
    const componentHits = extractUiComponents(trigger.block);

    embeds.forEach((embed, embedIndex) => {
      chain.push(
        importedNode('action', { x: 360 + embedIndex * 260, y: rowBase - 40 }, {
          title: embed.title ? `Embed ${embed.title}` : 'Embed senden',
          summary: 'Als Embed-Aufruf erkannt.',
          actionType: 'embed',
          embedTitle: embed.title ?? 'Importiertes Embed',
          embedDescription: embed.description ?? 'Bitte Inhalt prüfen.',
          sourceFile: trigger.file,
        }),
      );
    });

    messages.forEach((message, messageIndex) => {
      rawMessages.add(message);
      chain.push(
        importedNode('action', { x: 360 + messageIndex * 260, y: rowBase + 60 }, {
          title: 'Antwort senden',
          summary: 'Aus send()/reply()/send_message() rekonstruiert.',
          actionType: 'reply',
          responseText: message,
          sourceFile: trigger.file,
        }),
      );
    });

    componentHits.forEach((component, componentIndex) => {
      uiComponents.add(component);
      chain.push(
        importedNode('ui', { x: 360 + componentIndex * 260, y: rowBase + 140 }, {
          title: `UI ${component}`,
          summary: 'Best-effort aus discord.ui erkannt.',
          uiType: component === 'button' || component === 'select' || component === 'modal'
            ? component
            : 'button',
          buttonLabel: component === 'button' ? 'Importierter Button' : undefined,
          responseText: 'Prüfe die originale Callback-Logik im Export.',
          sourceFile: trigger.file,
        }),
      );
    });

    if (chain.length === 1) {
      chain.push(
        importedNode('action', { x: 360, y: rowBase }, {
          title: 'Manuelle Prüfung',
          summary: 'Für diesen Trigger wurde keine klare Aktion erkannt.',
          actionType: 'log',
          notes: 'Die Funktion wurde gefunden, aber nicht eindeutig in eine Flow-Kette übersetzt.',
          sourceFile: trigger.file,
        }),
      );
    }

    nodes.push(...chain);
    edges.push(...connectChain(chain));
  });

  project.id = projectNameToSlug(project.metadata.name);
  project.graph.nodes = nodes.length ? nodes : project.graph.nodes;
  project.graph.edges = edges;
  project.reconstruction = {
    importedAt: new Date().toISOString(),
    importMode: 'reconstructed',
    sourceFiles: sourceFiles.map((sourceFile) => ({ path: sourceFile.path, size: sourceFile.size })),
    commands: [...commands],
    events: [...events],
    uiComponents: [...uiComponents],
    rawMessages: [...rawMessages].slice(0, 8),
    warnings: triggers.length
      ? warnings
      : [
          ...warnings,
          'Keine unterstützten Commands oder Events erkannt. Falls der Bot dynamisch aufgebaut ist, importiere bevorzugt ein vorher exportiertes builder-project.json.',
        ],
  };

  return touchProject(project);
}

async function readZipTextFiles(file: File): Promise<ZipTextFile[]> {
  const zip = await JSZip.loadAsync(file);
  const textFiles = await Promise.all(
    Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name.endsWith('.py'))
      .map(async (entry) => {
        const content = await entry.async('text');
        return {
          path: entry.name,
          size: content.length,
          content,
        };
      }),
  );

  return textFiles;
}

export async function importProjectArchive(file: File): Promise<BotProject> {
  const zip = await JSZip.loadAsync(file);
  const roundtripEntry = zip.file('builder-project.json');

  if (roundtripEntry) {
    const project = JSON.parse(await roundtripEntry.async('text')) as BotProject;
    const sourceFiles = await Promise.all(
      Object.values(zip.files)
        .filter((entry) => entry.name.endsWith('.py') && !entry.dir)
        .map(async (entry) => {
          const content = await entry.async('text');
          return { path: entry.name, size: content.length };
        }),
    );

    project.reconstruction = {
      importedAt: new Date().toISOString(),
      importMode: 'roundtrip',
      sourceFiles,
      commands: project.reconstruction?.commands ?? [],
      events: project.reconstruction?.events ?? [],
      uiComponents: project.reconstruction?.uiComponents ?? [],
      rawMessages: project.reconstruction?.rawMessages ?? [],
      warnings: project.reconstruction?.warnings ?? [],
    };

    return touchProject(project);
  }

  const sourceFiles = await readZipTextFiles(file);
  const triggers = sourceFiles.flatMap(extractTriggerMatches);
  const warnings = collectWarnings(sourceFiles);
  return buildProjectFromTriggers(file.name, sourceFiles, triggers, warnings);
}
