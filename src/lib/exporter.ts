import JSZip from 'jszip';

import type {
  BotProject,
  BuilderNode,
  BuilderNodeData,
  GeneratedArchive,
  GeneratedFile,
  RunInstructions,
} from '../types';

function pyString(value: string): string {
  return JSON.stringify(value ?? '');
}

function indent(lines: string[], level = 1): string[] {
  return lines.map((line) => `${'    '.repeat(level)}${line}`);
}

function sanitizeIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/^$/, 'generated_name');
}

function nodesById(project: BotProject): Map<string, BuilderNode> {
  return new Map(project.graph.nodes.map((node) => [node.id, node]));
}

function orderedOutgoing(project: BotProject, sourceId: string): BuilderNode[] {
  const byId = nodesById(project);
  return project.graph.edges
    .filter((edge) => edge.source === sourceId)
    .map((edge) => byId.get(edge.target))
    .filter((node): node is BuilderNode => Boolean(node))
    .sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y);
}

function collectFlowNodes(project: BotProject, startId: string): BuilderNode[] {
  const visited = new Set<string>();
  const result: BuilderNode[] = [];

  function walk(sourceId: string): void {
    for (const node of orderedOutgoing(project, sourceId)) {
      if (visited.has(node.id)) {
        continue;
      }
      visited.add(node.id);
      result.push(node);
      walk(node.id);
    }
  }

  walk(startId);
  return result;
}

function groupEventNodes(project: BotProject): Map<string, BuilderNode[]> {
  const grouped = new Map<string, BuilderNode[]>();

  for (const node of project.graph.nodes) {
    if (node.data.kind !== 'event' || !node.data.eventName) {
      continue;
    }

    const key = node.data.eventName;
    const current = grouped.get(key) ?? [];
    current.push(node);
    grouped.set(key, current);
  }

  return grouped;
}

function buildEventParams(eventName: string): string {
  const map: Record<string, string> = {
    on_ready: '',
    on_member_join: 'member',
    on_message: 'message',
    on_interaction: 'interaction',
    on_guild_join: 'guild',
  };

  return map[eventName] ?? '*event_args';
}

function eventCanSend(eventName?: string): boolean {
  return eventName === 'on_member_join' || eventName === 'on_message' || eventName === 'on_interaction';
}

function sendMessageLine(
  context: 'slash' | 'prefix' | 'event',
  payload: string,
  extras = '',
  eventName?: string,
  hasResponded = false,
): string {
  const extraSegment = extras ? `, ${extras}` : '';

  if (context === 'slash') {
    const method = hasResponded ? 'interaction.followup.send' : 'interaction.response.send_message';
    return `await ${method}(${payload}${extraSegment})`;
  }

  if (context === 'prefix') {
    return `await ctx.send(${payload}${extraSegment})`;
  }

  if (eventName === 'on_member_join') {
    return `await member.send(${payload}${extraSegment})`;
  }

  if (eventName === 'on_message') {
    return `await message.channel.send(${payload}${extraSegment})`;
  }

  if (eventName === 'on_interaction') {
    const method = hasResponded ? 'interaction.followup.send' : 'interaction.response.send_message';
    return `await ${method}(${payload}${extraSegment})`;
  }

  return `print(${payload})`;
}

interface ViewDefinition {
  name: string;
  lines: string[];
}

function renderActionNode(
  data: BuilderNodeData,
  context: 'slash' | 'prefix' | 'event',
  warnings: string[],
  eventName?: string,
  hasResponded = false,
): { lines: string[]; consumedResponse: boolean } {
  if (data.actionType === 'reply') {
    const payload = pyString(data.responseText ?? 'Antwort aus dem visuellen Builder.');
    return {
      lines: [sendMessageLine(context, payload, '', eventName, hasResponded)],
      consumedResponse: context === 'slash' || eventName === 'on_interaction',
    };
  }

  if (data.actionType === 'embed') {
    if (context === 'event' && !eventCanSend(eventName)) {
      warnings.push(`${data.title}: Embed im Event ${eventName ?? 'unbekannt'} wird als Kommentar exportiert.`);
      return {
        lines: ['# Embed erkannt. Dieser Event-Kontext kann nicht direkt senden und sollte manuell geprüft werden.'],
        consumedResponse: false,
      };
    }

    const embedLines = [
      `embed = discord.Embed(title=${pyString(data.embedTitle ?? 'Discord Bot Maker')}, description=${pyString(
        data.embedDescription ?? 'Importiertes Embed',
      )}, color=discord.Color.orange())`,
      sendMessageLine(context, 'embed=embed', '', eventName, hasResponded),
    ];
    return {
      lines: embedLines,
      consumedResponse: context === 'slash' || eventName === 'on_interaction',
    };
  }

  if (data.actionType === 'assign-role') {
    warnings.push(
      `${data.title}: Rollenzuweisung wurde als sichere Grundlogik exportiert. Prüfe die Zielrolle im Python-Code.`,
    );

    if (context === 'slash') {
      return {
        lines: [
          'if interaction.guild is not None and isinstance(interaction.user, discord.Member):',
          ...indent([
            `target_role = discord.utils.get(interaction.guild.roles, name=${pyString(data.roleName ?? 'Moderator')})`,
            'if target_role is not None:',
            ...indent(['await interaction.user.add_roles(target_role, reason="Generated by Discord Bot Maker")']),
          ]),
        ],
        consumedResponse: false,
      };
    }

    return {
      lines: [
        `# Rolle ${data.roleName ?? 'Moderator'} wurde erkannt. Prüfe den Ziel-Context für diese Aktion manuell.`,
      ],
      consumedResponse: false,
    };
  }

  if (data.actionType === 'log') {
    return {
      lines: [data.notes ? `# ${data.notes}` : `print(${pyString(data.title)})`],
      consumedResponse: false,
    };
  }

  return {
    lines: ['pass'],
    consumedResponse: false,
  };
}

function buildButtonView(node: BuilderNode, index: number): ViewDefinition {
  const viewName = `GeneratedButtonView${index}`;
  const label = node.data.buttonLabel ?? `Button ${index}`;
  const responseText = node.data.responseText ?? 'Button-Klick registriert.';

  return {
    name: viewName,
    lines: [
      `class ${viewName}(discord.ui.View):`,
      ...indent([
        'def __init__(self) -> None:',
        ...indent(['super().__init__(timeout=None)']),
        '',
        `@discord.ui.button(label=${pyString(label)}, style=discord.ButtonStyle.primary)`,
        'async def generated_button(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:',
        ...indent([`await interaction.response.send_message(${pyString(responseText)}, ephemeral=True)`]),
      ]),
    ],
  };
}

function renderUiNode(
  node: BuilderNode,
  context: 'slash' | 'prefix' | 'event',
  warnings: string[],
  views: ViewDefinition[],
  eventName?: string,
  hasResponded = false,
): { lines: string[]; consumedResponse: boolean } {
  if (node.data.uiType !== 'button') {
    warnings.push(`${node.data.title}: ${node.data.uiType ?? 'UI'} wird aktuell nur als Hinweis exportiert.`);
    return {
      lines: [`# ${node.data.title}: ${node.data.uiType ?? 'UI'} bitte manuell ergänzen.`],
      consumedResponse: false,
    };
  }

  if (context === 'event' && !eventCanSend(eventName)) {
    warnings.push(`${node.data.title}: Button kann im Event ${eventName ?? 'unbekannt'} nicht direkt versendet werden.`);
    return {
      lines: ['# Button-View erkannt. Verschiebe diese Aktion in einen Command oder sendefähigen Event-Flow.'],
      consumedResponse: false,
    };
  }

  const viewDefinition = buildButtonView(node, views.length + 1);
  views.push(viewDefinition);

  return {
    lines: [
      sendMessageLine(
        context,
        pyString(node.data.responseText ?? 'Interaktive Antwort bereit.'),
        `view=${viewDefinition.name}()`,
        eventName,
        hasResponded,
      ),
    ],
    consumedResponse: context === 'slash' || eventName === 'on_interaction',
  };
}

function renderConditionNode(node: BuilderNode): string[] {
  return [
    `# Condition ${node.data.conditionType ?? 'custom'} = ${node.data.conditionValue ?? 'manuell prüfen'}`,
    '# Branching wird im Export linearisiert und sollte bei Bedarf nachgeschärft werden.',
  ];
}

function renderStorageNode(node: BuilderNode): string[] {
  return [`# Variable ${node.data.variableName ?? 'builder_value'} = ${pyString(node.data.variableValue ?? '')}`];
}

function buildFlowBody(
  project: BotProject,
  trigger: BuilderNode,
  context: 'slash' | 'prefix' | 'event',
  warnings: string[],
  views: ViewDefinition[],
): string[] {
  const downstream = collectFlowNodes(project, trigger.id);
  const lines: string[] = [];
  let hasResponded = false;

  for (const node of downstream) {
    if (node.data.kind === 'action') {
      const result = renderActionNode(node.data, context, warnings, trigger.data.eventName, hasResponded);
      lines.push(...result.lines);
      hasResponded = hasResponded || result.consumedResponse;
      continue;
    }

    if (node.data.kind === 'ui') {
      const result = renderUiNode(node, context, warnings, views, trigger.data.eventName, hasResponded);
      lines.push(...result.lines);
      hasResponded = hasResponded || result.consumedResponse;
      continue;
    }

    if (node.data.kind === 'condition') {
      lines.push(...renderConditionNode(node));
      continue;
    }

    if (node.data.kind === 'storage') {
      lines.push(...renderStorageNode(node));
    }
  }

  return lines.length ? lines : ['pass'];
}

function generateFlowModule(project: BotProject): { content: string; warnings: string[] } {
  const commandNodes = project.graph.nodes.filter((node) => node.data.kind === 'command');
  const eventGroups = groupEventNodes(project);
  const warnings: string[] = [];
  const views: ViewDefinition[] = [];
  const lines: string[] = [
    'from __future__ import annotations',
    '',
    'import discord',
    'from discord.ext import commands',
    '',
    'synced = False',
    '',
  ];

  lines.push('def register_generated_commands(bot: commands.Bot) -> None:');
  if (!commandNodes.length) {
    lines.push(...indent(['pass']));
  } else {
    for (const command of commandNodes) {
      const commandName = command.data.commandName ?? sanitizeIdentifier(command.data.title);
      const description = command.data.commandDescription ?? 'Generated by Discord Bot Maker';
      const functionName = sanitizeIdentifier(`${commandName}_${command.data.commandStyle ?? 'slash'}`);
      const decorator =
        command.data.commandStyle === 'prefix'
          ? `@bot.command(name=${pyString(commandName)})`
          : `@bot.tree.command(name=${pyString(commandName)}, description=${pyString(description)})`;
      const parameters = command.data.commandStyle === 'prefix' ? 'ctx' : 'interaction: discord.Interaction';
      const context = command.data.commandStyle === 'prefix' ? 'prefix' : 'slash';
      const body = buildFlowBody(project, command, context, warnings, views);

      lines.push(...indent([decorator]));
      lines.push(...indent([`async def ${functionName}(${parameters}) -> None:`]));
      lines.push(...indent(indent(body)));
      lines.push('');
    }
  }

  lines.push('def register_generated_events(bot: commands.Bot) -> None:');
  lines.push('');

  if (!eventGroups.size) {
    lines.push(...indent(['@bot.event']));
    lines.push(...indent(['async def on_ready() -> None:']));
    lines.push(
      ...indent([
        'global synced',
        'if not synced:',
        ...indent(['await bot.tree.sync()', 'synced = True']),
        'print(f"Bot online as {bot.user}")',
      ]),
    );
  } else {
    if (!eventGroups.has('on_ready')) {
      eventGroups.set('on_ready', []);
    }

    for (const [eventName, nodes] of eventGroups) {
      const parameters = buildEventParams(eventName);
      const body: string[] = [];

      if (eventName === 'on_ready') {
        body.push('global synced');
        body.push('if not synced:');
        body.push(...indent(['await bot.tree.sync()', 'synced = True']));
        body.push('print(f"Bot online as {bot.user}")');
      }

      for (const trigger of nodes) {
        body.push(...buildFlowBody(project, trigger, 'event', warnings, views));
      }

      lines.push(...indent(['@bot.event']));
      lines.push(...indent([`async def ${eventName}(${parameters}) -> None:`]));
      lines.push(...indent(body.length ? indent(body) : ['pass']));
      lines.push('');
    }
  }

  if (views.length) {
    lines.push('');
    lines.push(...views.flatMap((view) => [...view.lines, '']));
  }

  return {
    content: `${lines.join('\n').trim()}\n`,
    warnings,
  };
}

function generateMainFile(structure: BotProject['metadata']['structure']): string {
  const importLines =
    structure === 'modular'
      ? ['from bot.generated_flows import register_generated_commands, register_generated_events']
      : [];

  return [
    'from __future__ import annotations',
    '',
    'import os',
    '',
    'import discord',
    'from discord.ext import commands',
    'from dotenv import load_dotenv',
    ...importLines,
    '',
    'load_dotenv()',
    '',
    'TOKEN = os.getenv("DISCORD_TOKEN")',
    'if not TOKEN:',
    '    raise RuntimeError("DISCORD_TOKEN fehlt. Erstelle zuerst eine .env-Datei.")',
    '',
    'intents = discord.Intents.default()',
    'intents.message_content = True',
    'intents.members = True',
    '',
    'bot = commands.Bot(command_prefix="!", intents=intents)',
    '',
    'register_generated_commands(bot)',
    'register_generated_events(bot)',
    '',
    'bot.run(TOKEN)',
    '',
  ].join('\n');
}

function generateSingleFile(project: BotProject): { content: string; warnings: string[] } {
  const module = generateFlowModule(project);
  const inlineMain = generateMainFile('single-file');
  const content = `${module.content}\n${inlineMain}`;
  return { content, warnings: module.warnings };
}

function requirementsForProject(project: BotProject): string {
  const base = ['discord.py>=2.4,<3.0', 'python-dotenv>=1.0,<2.0'];
  if (project.metadata.storage === 'supabase') {
    return `${base.join('\n')}\n# Supabase wird aktuell nur als zukünftiger Integrationspunkt dokumentiert.\n`;
  }
  return `${base.join('\n')}\n`;
}

function exportNotes(project: BotProject, warnings: string[]): string {
  const lines = [
    '# Export Notes',
    '',
    'Der Generator erzeugt einen sofort startbaren discord.py-Bot.',
    'Komplexe Verzweigungen, dynamische Imports und Spezialfälle werden absichtlich als sichere Grundlogik exportiert.',
    '',
    '## Projekt',
    `- Name: ${project.metadata.name}`,
    `- Framework: ${project.metadata.framework}`,
    `- Struktur: ${project.metadata.structure}`,
    `- Storage: ${project.metadata.storage}`,
    '',
    '## Hinweise',
    ...(warnings.length ? warnings.map((warning) => `- ${warning}`) : ['- Keine zusätzlichen Hinweise.']),
    '',
    '## Round-Trip',
    '- builder-project.json bleibt im ZIP erhalten, damit Re-Importe in dieser App verlustarm funktionieren.',
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function runInstructions(mainFile = 'main.py'): RunInstructions {
  return {
    windows: [
      'py -m venv .venv',
      '.venv\\Scripts\\Activate.ps1',
      'py -m pip install -r requirements.txt',
      'Copy-Item .env.example .env',
      `py ${mainFile}`,
    ],
    macos: [
      'python3 -m venv .venv',
      'source .venv/bin/activate',
      'python3 -m pip install -r requirements.txt',
      'cp .env.example .env',
      `python3 ${mainFile}`,
    ],
  };
}

function generatedReadme(project: BotProject, instructions: RunInstructions): string {
  return [
    `# ${project.metadata.name}`,
    '',
    'Dieses Archiv wurde von Discord Bot Maker erzeugt.',
    '',
    '## Start unter Windows 11',
    '```powershell',
    ...instructions.windows,
    '```',
    '',
    '## Start unter macOS',
    '```bash',
    ...instructions.macos,
    '```',
    '',
    '## Discord Token',
    '1. Erstelle im Discord Developer Portal eine Anwendung.',
    '2. Erzeuge einen Bot und kopiere den Token.',
    '3. Trage den Token in `.env` unter `DISCORD_TOKEN=` ein.',
    '',
  ].join('\n');
}

function modularFiles(project: BotProject): GeneratedArchive {
  const module = generateFlowModule(project);
  const instructions = runInstructions();
  const files: GeneratedFile[] = [
    {
      path: 'main.py',
      content: generateMainFile('modular'),
    },
    {
      path: 'bot/__init__.py',
      content: '',
    },
    {
      path: 'bot/generated_flows.py',
      content: module.content,
    },
    {
      path: 'requirements.txt',
      content: requirementsForProject(project),
    },
    {
      path: '.env.example',
      content: 'DISCORD_TOKEN=replace_me\n',
    },
    {
      path: 'README_RUN.md',
      content: generatedReadme(project, instructions),
    },
    {
      path: 'EXPORT_NOTES.md',
      content: exportNotes(project, module.warnings),
    },
    {
      path: 'builder-project.json',
      content: JSON.stringify(project, null, 2),
    },
  ];

  return {
    files,
    warnings: module.warnings,
    runInstructions: instructions,
  };
}

function singleFileArchive(project: BotProject): GeneratedArchive {
  const singleFile = generateSingleFile(project);
  const instructions = runInstructions();
  return {
    files: [
      {
        path: 'main.py',
        content: singleFile.content,
      },
      {
        path: 'requirements.txt',
        content: requirementsForProject(project),
      },
      {
        path: '.env.example',
        content: 'DISCORD_TOKEN=replace_me\n',
      },
      {
        path: 'README_RUN.md',
        content: generatedReadme(project, instructions),
      },
      {
        path: 'EXPORT_NOTES.md',
        content: exportNotes(project, singleFile.warnings),
      },
      {
        path: 'builder-project.json',
        content: JSON.stringify(project, null, 2),
      },
    ],
    warnings: singleFile.warnings,
    runInstructions: instructions,
  };
}

export function buildArchive(project: BotProject): GeneratedArchive {
  return project.metadata.structure === 'single-file'
    ? singleFileArchive(project)
    : modularFiles(project);
}

export async function archiveToBlob(project: BotProject): Promise<Blob> {
  const archive = buildArchive(project);
  const zip = new JSZip();

  for (const file of archive.files) {
    zip.file(file.path, file.content);
  }

  return zip.generateAsync({ type: 'blob' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
