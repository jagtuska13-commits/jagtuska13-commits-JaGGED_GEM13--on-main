import { GoogleGenAI, Type, Modality } from "@google/genai";
import { ModelName, MemoryBank, ChatMessage, MemoryFact, IntelligenceLevel } from "../types";
import { INVESTIGATIVE_LEAD_INSTRUCTION, JAGGED_GEM_INSTRUCTION } from "../constants";

const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

let activeRequests = 0;
const updateProcessingIndicator = (delta: number) => {
  activeRequests = Math.max(0, activeRequests + delta);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gemini-processing', { 
      detail: { active: activeRequests > 0 } 
    }));
  }
};

// --- Text & Reasoning ---

export const sendChatMessage = async (
  history: { role: string; parts: ({ text: string } | { inlineData: { mimeType: string, data: string } })[] }[],
  newMessage: string,
  level: IntelligenceLevel,
  attachedImages: string[] = [], // Base64 strings
  useSearch = false,
  useMaps = false,
  location?: { latitude: number; longitude: number },
  systemInstruction?: string,
  memory?: MemoryBank
) => {
  updateProcessingIndicator(1);
  try {
    const ai = getClient();
  
  // 1. Determine Model & Config based on Level
  let model = 'gemini-3-flash-preview'; // Default Super-Fast Flash model
  let useThinking = false;
  
  // Determine which Persona to use
  let activeSystemInstruction = systemInstruction || JAGGED_GEM_INSTRUCTION;

  switch (level) {
    case IntelligenceLevel.JAGGED:
      // JAGGED: The Warm, Supportive "Jagged Gem" Persona
      model = 'gemini-3-flash-preview'; 
      activeSystemInstruction = JAGGED_GEM_INSTRUCTION;
      break;
      
    case IntelligenceLevel.GEM:
      // GEM: The "Investigative Lead" / Rival Persona (Pro Model)
      model = ModelName.PRO_REASONING;
      activeSystemInstruction = INVESTIGATIVE_LEAD_INSTRUCTION;
      break;
      
    case IntelligenceLevel.JAGGED_GEM:
      // JAGGED GEM: The Supportive Persona + Deep Strategic Thinking
      model = ModelName.PRO_REASONING; 
      useThinking = true; 
      activeSystemInstruction = JAGGED_GEM_INSTRUCTION;
      break;
  }

  // OVERRIDE: Google Maps is only supported on Gemini 2.5 Flash
  // If the user requests Maps, we must downgrade/switch to the compatible model.
  if (useMaps) {
    model = 'gemini-2.5-flash';
    useThinking = false; // Disable thinking to ensure compatibility with Maps tool
  }
  
  const tools: any[] = [];
  if (useSearch) tools.push({ googleSearch: {} });
  if (useMaps) tools.push({ googleMaps: {} });

  // Inject Memory into System Instruction
  let finalInstruction = activeSystemInstruction;
  
  if (memory) {
    const categorizedFacts = memory.facts.reduce((acc, fact) => {
      if (!acc[fact.category]) acc[fact.category] = [];
      acc[fact.category].push(fact.content);
      return acc;
    }, {} as Record<string, string[]>);

    let factsString = "";
    for (const [cat, items] of Object.entries(categorizedFacts)) {
      factsString += `[${cat}]:\n${items.map(i => `  - ${i}`).join('\n')}\n`;
    }

    const memoryContext = `
[LONG-TERM MEMORY BANK]
SUMMARY: ${memory.summary}
DETAILED RECORDS:
${factsString}
`;
    finalInstruction += memoryContext;
  }

  const config: any = {
    tools: tools.length > 0 ? tools : undefined,
    systemInstruction: finalInstruction, 
  };

  // Only enable thinking for Pro models when requested
  if (useThinking && model.includes('gemini-3')) {
    config.thinkingConfig = { thinkingBudget: 32768 };
  }
  
  if (useMaps && location) {
    config.toolConfig = {
      retrievalConfig: {
        latLng: location
      }
    };
  }

  // 2. Prepare Current Message Parts (Text + Images)
  const currentMessageParts: any[] = [{ text: newMessage }];
  
  for (const imgBase64 of attachedImages) {
    currentMessageParts.push({
      inlineData: {
        mimeType: 'image/jpeg', // Assuming jpeg/png for simplicity, could detect from header
        data: imgBase64
      }
    });
  }

  // 3. Create Chat
  const chat = ai.chats.create({
    model: model,
    config: config,
    history: history,
  });

  // 4. Send Message
  const result = await chat.sendMessage({ message: currentMessageParts });
  return result;
  } finally {
    updateProcessingIndicator(-1);
  }
};

// --- Memory Consolidation ---

export const consolidateMemory = async (
  recentMessages: ChatMessage[],
  currentMemory: MemoryBank
): Promise<MemoryBank> => {
  updateProcessingIndicator(1);
  try {
    const ai = getClient();
  
  const conversationText = recentMessages
    .slice(-6) 
    .map(m => `${m.role.toUpperCase()}: ${m.text}`)
    .join('\n');

  // We want to extract structured facts
  const prompt = `
You are the Cortex Manager for the Jagged Gem AI.
Your task is to update the Long-Term Memory Bank based on the recent conversation.

CURRENT MEMORY:
Summary: ${currentMemory.summary}
Facts Count: ${currentMemory.facts.length}

RECENT CONVERSATION:
${conversationText}

INSTRUCTIONS:
1. Update the "summary" to reflect the evolving relationship or context (max 3 sentences).
2. Extract NEW specific facts. Assign a category: 'IDENTITY' (user bio), 'PREFERENCE' (likes/dislikes), 'RELATIONSHIP' (dynamic with AI), 'PROJECT' (current task), or 'TRIVIA'.
3. Return a JSON object.
`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview', 
    contents: { parts: [{ text: prompt }] },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          newFacts: { 
            type: Type.ARRAY, 
            items: { 
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING, enum: ['IDENTITY', 'PREFERENCE', 'RELATIONSHIP', 'PROJECT', 'TRIVIA'] },
                content: { type: Type.STRING }
              }
            } 
          }
        }
      }
    }
  });

  try {
    const text = response.text || "{}";
    const result = JSON.parse(text);
    
    // Merge new facts
    const newFactObjects: MemoryFact[] = (result.newFacts || []).map((f: any) => ({
      id: Math.random().toString(36).substr(2, 9),
      category: f.category || 'TRIVIA',
      content: f.content,
      timestamp: Date.now(),
      confidence: 0.9
    }));

    // Filter duplicates (simple string check)
    const uniqueNewFacts = newFactObjects.filter(nf => 
      !currentMemory.facts.some(ef => ef.content.toLowerCase() === nf.content.toLowerCase())
    );

    return {
      summary: result.summary || currentMemory.summary,
      facts: [...currentMemory.facts, ...uniqueNewFacts], // Append new facts
      lastInteraction: Date.now()
    };
  } catch (e) {
    console.error("Memory consolidation failed", e);
    return currentMemory;
  }
  } finally {
    updateProcessingIndicator(-1);
  }
};

export const analyzeImage = async (base64Image: string, prompt: string) => {
  updateProcessingIndicator(1);
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: ModelName.PRO_REASONING,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
          { text: prompt }
        ]
      }
    });
    return response.text;
  } finally {
    updateProcessingIndicator(-1);
  }
};

export const analyzeVideo = async (base64Video: string, mimeType: string, prompt: string) => {
    updateProcessingIndicator(1);
    try {
      const ai = getClient();
      const response = await ai.models.generateContent({
        model: ModelName.PRO_REASONING,
        contents: {
          parts: [
              { inlineData: { mimeType: mimeType, data: base64Video } },
              { text: prompt }
          ]
        }
      });
      return response.text;
    } finally {
      updateProcessingIndicator(-1);
    }
};

// --- Vision ---

export const generateImage = async (prompt: string, aspectRatio: string) => {
  updateProcessingIndicator(1);
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: ModelName.IMAGE_GEN,
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: '1K' 
        }
      }
    });
    
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  } finally {
    updateProcessingIndicator(-1);
  }
};

export const editImage = async (base64Image: string, prompt: string) => {
  updateProcessingIndicator(1);
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: ModelName.IMAGE_EDIT,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/png', data: base64Image } },
          { text: prompt }
        ]
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No edited image returned");
  } finally {
    updateProcessingIndicator(-1);
  }
};

// --- Audio ---

export const transcribeAudio = async (base64Audio: string, mimeType: string) => {
  updateProcessingIndicator(1);
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: base64Audio } },
          { text: "Transcribe this audio verbatim." }
        ]
      }
    });
    return response.text;
  } finally {
    updateProcessingIndicator(-1);
  }
};

export const generateSpeech = async (text: string) => {
  updateProcessingIndicator(1);
  try {
    const ai = getClient();
    const response = await ai.models.generateContent({
      model: ModelName.TTS,
      contents: { parts: [{ text }] },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");
    return base64Audio;
  } finally {
    updateProcessingIndicator(-1);
  }
};

// --- Video (Veo) ---

export const generateVeoVideo = async (prompt: string, aspectRatio: '16:9' | '9:16', imageBytes?: string) => {
  updateProcessingIndicator(1);
  try {
    const ai = getClient();
    
    const config: any = {
      numberOfVideos: 1,
      resolution: '720p',
      aspectRatio: aspectRatio
    };

    let operation;
    if (imageBytes) {
        operation = await ai.models.generateVideos({
            model: ModelName.VEO_FAST,
            prompt: prompt,
            image: {
              imageBytes: imageBytes,
              mimeType: 'image/png'
            },
            config: config
        });
    } else {
        operation = await ai.models.generateVideos({
            model: ModelName.VEO_FAST,
            prompt: prompt,
            config: config
        });
    }

    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!videoUri) throw new Error("Video generation failed");

    return `${videoUri}&key=${process.env.API_KEY}`;
  } finally {
    updateProcessingIndicator(-1);
  }
};

export const decodeAudioData = async (
  base64: string,
  ctx: AudioContext
): Promise<AudioBuffer> => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const dataInt16 = new Int16Array(bytes.buffer);
  const numChannels = 1;
  const sampleRate = 24000;
  const frameCount = dataInt16.length;
  
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);
  
  for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
  }
  
  return buffer;
}