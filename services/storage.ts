import { AppSettings, ChatSession, MemoryBank } from '../types';
import { SYSTEM_INSTRUCTION } from '../constants';

const KEYS = {
  SETTINGS: 'apex_settings_v1',
  SESSIONS: 'apex_sessions_v1',
  MEMORY: 'jagged_gem_memory_v2',
};

const DEFAULT_SETTINGS: AppSettings = {
  systemInstruction: SYSTEM_INSTRUCTION,
  userName: 'OPERATOR',
};

const DEFAULT_MEMORY: MemoryBank = {
  summary: "New neural link established. No prior data.",
  facts: [],
  lastInteraction: Date.now(),
};

export const loadSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    // Allow the new default SYSTEM_INSTRUCTION to override old defaults if the user hasn't customized it heavily
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, systemInstruction: parsed.systemInstruction || SYSTEM_INSTRUCTION };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: AppSettings) => {
  localStorage.setItem(KEYS.SETTINGS, JSON.stringify(settings));
};

export const loadSessions = (): ChatSession[] => {
  try {
    const raw = localStorage.getItem(KEYS.SESSIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const saveSession = (session: ChatSession) => {
  const sessions = loadSessions();
  const index = sessions.findIndex(s => s.id === session.id);
  
  if (index >= 0) {
    sessions[index] = session;
  } else {
    sessions.unshift(session);
  }
  
  // Limit history to 50 sessions to prevent overflow
  if (sessions.length > 50) sessions.pop();
  
  localStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
};

export const deleteSession = (id: string) => {
  const sessions = loadSessions().filter(s => s.id !== id);
  localStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
};

export const getSession = (id: string): ChatSession | undefined => {
  const sessions = loadSessions();
  return sessions.find(s => s.id === id);
};

// --- Memory System ---

export const loadMemory = (): MemoryBank => {
  try {
    const raw = localStorage.getItem(KEYS.MEMORY);
    if (!raw) return DEFAULT_MEMORY;
    
    const parsed = JSON.parse(raw);
    // Migration check: if old format (string[] facts), convert them
    if (parsed.facts.length > 0 && typeof parsed.facts[0] === 'string') {
        parsed.facts = parsed.facts.map((f: string, i: number) => ({
            id: `legacy-${Date.now()}-${i}`,
            category: 'TRIVIA',
            content: f,
            timestamp: Date.now(),
            confidence: 1
        }));
    }
    return { ...DEFAULT_MEMORY, ...parsed };
  } catch {
    return DEFAULT_MEMORY;
  }
};

export const saveMemory = (memory: MemoryBank) => {
  localStorage.setItem(KEYS.MEMORY, JSON.stringify(memory));
};