export enum ModuleType {
  COMMAND_CENTER = 'COMMAND_CENTER',
  VISUAL_FORENSICS = 'VISUAL_FORENSICS',
  SIGNAL_INTEL = 'SIGNAL_INTEL',
  LIVE_INTERCEPT = 'LIVE_INTERCEPT',
  SIMULATION_CHAMBER = 'SIMULATION_CHAMBER',
}

export enum ModelName {
  // Text & Reasoning
  PRO_REASONING = 'gemini-3-pro-preview',
  FLASH_FAST = 'gemini-3-flash-preview',
  FLASH_LITE = 'gemini-2.5-flash-lite',
  
  // Grounding
  MAPS_MODEL = 'gemini-2.5-flash',
  
  // Vision
  IMAGE_GEN = 'gemini-3-pro-image-preview',
  IMAGE_EDIT = 'gemini-2.5-flash-image',
  
  // Audio
  TTS = 'gemini-2.5-flash-preview-tts',
  LIVE = 'gemini-2.5-flash-native-audio-preview-12-2025',
  
  // Video
  VEO_FAST = 'veo-3.1-fast-generate-preview',
}

export enum IntelligenceLevel {
  JAGGED = 'JAGGED',       // Flash (Fast/Chat)
  GEM = 'GEM',             // Pro (Smart/Code)
  JAGGED_GEM = 'JAGGED_GEM' // Pro + Thinking (Deep/Strategic)
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  groundingMetadata?: any;
  images?: string[]; // base64 array
  isThinking?: boolean;
}

export interface SimulationConfig {
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  resolution: '720p' | '1080p'; 
}

export interface ImageGenConfig {
  prompt: string;
  aspectRatio: string;
}

export interface AudioDevice {
  deviceId: string;
  label: string;
}

// --- New Types for Storage & Settings ---

export interface ChatSession {
  id: string;
  title: string; // Auto-generated or first few words
  messages: ChatMessage[];
  lastModified: number;
  module: ModuleType;
}

export interface AppSettings {
  systemInstruction: string; // "Memory-based code"
  userName: string;
}

// --- Sophisticated Memory System ---

export type FactCategory = 'IDENTITY' | 'PREFERENCE' | 'RELATIONSHIP' | 'PROJECT' | 'TRIVIA';

export interface MemoryFact {
  id: string;
  category: FactCategory;
  content: string;
  timestamp: number;
  confidence: number; // 0 to 1
}

export interface MemoryBank {
  summary: string;       // High-level context
  facts: MemoryFact[];   // Structured knowledge graph nodes
  lastInteraction: number;
}