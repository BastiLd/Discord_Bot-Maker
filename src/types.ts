import type { Edge, Node, Viewport } from '@xyflow/react';

export type BuilderMode = 'beginner' | 'advanced';
export type ProjectStructure = 'single-file' | 'modular';
export type StorageTarget = 'local-json' | 'sqlite' | 'supabase';
export type DeploymentTarget = 'github-pages' | 'local-only';
export type NodeKind = 'command' | 'event' | 'action' | 'condition' | 'ui' | 'storage';
export type CommandStyle = 'slash' | 'prefix';
export type ActionType = 'reply' | 'embed' | 'assign-role' | 'log';
export type UiType = 'button' | 'select' | 'modal';
export type ConditionType = 'has-role' | 'message-contains' | 'is-admin';
export type ImportMode = 'roundtrip' | 'reconstructed';

export interface BuilderNodeData extends Record<string, unknown> {
  title: string;
  summary: string;
  kind: NodeKind;
  accent: string;
  notes?: string;
  imported?: boolean;
  sourceFile?: string;
  commandName?: string;
  commandDescription?: string;
  commandStyle?: CommandStyle;
  eventName?: string;
  actionType?: ActionType;
  responseText?: string;
  embedTitle?: string;
  embedDescription?: string;
  roleName?: string;
  uiType?: UiType;
  buttonLabel?: string;
  conditionType?: ConditionType;
  conditionValue?: string;
  variableName?: string;
  variableValue?: string;
}

export type BuilderNode = Node<BuilderNodeData, 'builderNode'>;
export type BuilderEdge = Edge;

export interface ProjectMetadata {
  name: string;
  description: string;
  mode: BuilderMode;
  framework: string;
  structure: ProjectStructure;
  storage: StorageTarget;
  deploymentTarget: DeploymentTarget;
  allowCustomCode: boolean;
}

export interface SourceFileSummary {
  path: string;
  size: number;
}

export interface ReconstructionReport {
  importedAt: string;
  importMode: ImportMode;
  sourceFiles: SourceFileSummary[];
  commands: string[];
  events: string[];
  uiComponents: string[];
  rawMessages: string[];
  warnings: string[];
}

export interface BotProject {
  version: number;
  id: string;
  metadata: ProjectMetadata;
  graph: {
    nodes: BuilderNode[];
    edges: BuilderEdge[];
    viewport?: Viewport;
  };
  reconstruction?: ReconstructionReport;
  lastSavedAt: string;
}

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface RunInstructions {
  windows: string[];
  macos: string[];
}

export interface GeneratedArchive {
  files: GeneratedFile[];
  warnings: string[];
  runInstructions: RunInstructions;
}

