import type { BotProject } from '../types';
import { deepRepairText } from './text';

const STORAGE_KEY = 'discord-bot-maker/project';

export function loadProject(): BotProject | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return deepRepairText(JSON.parse(raw) as BotProject);
  } catch {
    return null;
  }
}

export function saveProject(project: BotProject): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export function clearProject(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}