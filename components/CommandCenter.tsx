import React, { useState, useRef, useEffect } from 'react';
import { ModelName, ChatMessage, AppSettings, ChatSession, ModuleType, MemoryBank, IntelligenceLevel } from '../types';
import * as GeminiService from '../services/geminiService';
import * as Storage from '../services/storage';
import ReactMarkdown from 'react-markdown';

interface CommandCenterProps {
  sessionId: string | null;
  settings: AppSettings;
  onSessionUpdate: (id: string) => void;
  isProtocolOpen: boolean;
  onCloseProtocol: () => void;
  memory: MemoryBank;
  onMemoryUpdate: (m: MemoryBank) => void;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({ 
  sessionId, 
  settings, 
  onSessionUpdate, 
  isProtocolOpen, 
  onCloseProtocol,
  memory,
  onMemoryUpdate
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const [intelligenceLevel, setIntelligenceLevel] = useState<IntelligenceLevel>(IntelligenceLevel.JAGGED);
  const [attachments, setAttachments] = useState<string[]>([]); // Base64 strings
  
  // Maps & Location State
  const [useMaps, setUseMaps] = useState(false);
  const [location, setLocation] = useState<{latitude: number, longitude: number} | undefined>(undefined);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(sessionId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setActiveId(sessionId);
    if (sessionId) {
      const session = Storage.getSession(sessionId);
      if (session) {
        setMessages(session.messages);
      } else {
        setMessages([{
           id: 'init', role: 'model', text: `Link established. I'm listening.`, timestamp: Date.now()
        }]);
      }
    } else {
      setMessages([{
        id: 'init',
        role: 'model',
        text: `I'm Jagged. What's the plan?`,
        timestamp: Date.now()
      }]);
    }
  }, [sessionId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    const handleDriveIngest = (e: any) => {
      const txt = e.detail?.content || '';
      if (txt) {
        setInput(prev => prev ? `${prev}\n\n${txt}` : txt);
      }
    };
    window.addEventListener('drive-ingest', handleDriveIngest);
    return () => {
      window.removeEventListener('drive-ingest', handleDriveIngest);
    };
  }, []);

  const saveToStorage = (newMessages: ChatMessage[]) => {
    let currentId = activeId;
    if (!currentId) {
      currentId = Date.now().toString();
      setActiveId(currentId);
      onSessionUpdate(currentId);
    }
    const title = newMessages.find(m => m.role === 'user')?.text.slice(0, 30) + "..." || "New Operation";
    const session: ChatSession = {
      id: currentId,
      title: title,
      messages: newMessages,
      lastModified: Date.now(),
      module: ModuleType.COMMAND_CENTER
    };
    Storage.saveSession(session);
  };

  const handleConsolidateMemory = async (currentMessages: ChatMessage[]) => {
    setIsConsolidating(true);
    try {
      const updatedMemory = await GeminiService.consolidateMemory(currentMessages, memory);
      onMemoryUpdate(updatedMemory);
    } catch (e) {
      console.error("Memory consolidation skipped", e);
    } finally {
      setIsConsolidating(false);
    }
  };

  const toggleLocation = () => {
    if (useMaps) {
      setUseMaps(false);
      setLocation(undefined);
    } else {
      setIsGettingLocation(true);
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocation({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            });
            setUseMaps(true);
            setIsGettingLocation(false);
          },
          (error) => {
            console.error("Location error:", error);
            setIsGettingLocation(false);
            // Could add a toast here
          }
        );
      } else {
        console.error("Geolocation not supported");
        setIsGettingLocation(false);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          setAttachments(prev => [...prev, base64]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;
    
    // Create user message
    const userMsg: ChatMessage = { 
      id: Date.now().toString(), 
      role: 'user', 
      text: input, 
      timestamp: Date.now(),
      images: attachments // Store images in the message for history/display
    };

    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    saveToStorage(newHistory);
    
    // Clear inputs
    setInput('');
    setAttachments([]);
    setIsLoading(true);

    try {
      const historyParts = newHistory.slice(1, -1).map(m => {
        const parts: any[] = [{ text: m.text }];
        return { role: m.role, parts };
      });
      
      const response = await GeminiService.sendChatMessage(
        historyParts, 
        userMsg.text, 
        intelligenceLevel, 
        userMsg.images, 
        true, // useSearch default
        useMaps, 
        location, 
        settings.systemInstruction,
        memory 
      );

      let text = "";
      try {
         text = response.text || "I processed that, but I decided not to speak."; 
      } catch (e) {
         text = "Neural Error: Unable to decode response.";
      }
      
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: text,
        timestamp: Date.now(),
        groundingMetadata: groundingMetadata
      };

      const finalHistory = [...newHistory, modelMsg];
      setMessages(finalHistory);
      saveToStorage(finalHistory);

      if (finalHistory.filter(m => m.role === 'user').length % 2 === 0) {
        handleConsolidateMemory(finalHistory);
      }

    } catch (error: any) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { 
        id: Date.now().toString(), 
        role: 'model', 
        text: `⚠️ Neural glitch: ${error.message || "Unknown error occurred."}`, 
        timestamp: Date.now() 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex relative overflow-hidden">
      
      {/* FULL WIDTH Main Chat Area - Compact for Phone */}
      <div className="flex-1 flex flex-col relative min-w-0">
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin" ref={scrollRef}>
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
              <div className={`max-w-[85%] px-4 py-3 backdrop-blur-[10px] text-xs leading-relaxed transition-all duration-200 hover:border-white hover:shadow-[0_0_10px_currentColor] ${
                msg.role === 'user' 
                  ? 'bubble-user text-white' 
                  : 'bubble-bot text-[#f0f8ff]'
              }`}>
                
                {/* Display User Images */}
                {msg.images && msg.images.length > 0 && (
                   <div className="flex flex-wrap gap-2 mb-2">
                      {msg.images.map((img, idx) => (
                        <img key={idx} src={`data:image/jpeg;base64,${img}`} alt="attachment" className="w-16 h-16 object-cover rounded border border-white/20" />
                      ))}
                   </div>
                )}

                <div className="prose prose-invert prose-xs font-sans break-words">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>

                {/* Grounding UI */}
                {msg.groundingMetadata?.groundingChunks && msg.groundingMetadata.groundingChunks.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-1">
                     {msg.groundingMetadata.groundingChunks.map((chunk: any, i: number) => {
                       if (chunk.web?.uri && chunk.web?.title) {
                         return (
                           <a 
                             key={i}
                             href={chunk.web.uri}
                             target="_blank"
                             rel="noopener noreferrer"
                             className="flex items-center gap-1 bg-black/40 hover:bg-gem-cyan/20 border border-gem-cyan/30 text-[9px] text-gem-cyan px-1.5 py-0.5 rounded no-underline"
                           >
                             <span className="truncate max-w-[80px] font-mono">{chunk.web.title}</span>
                             <span className="text-[8px]">↗</span>
                           </a>
                         );
                       }
                       return null;
                     })}
                  </div>
                )}
                
                <div className="text-[9px] opacity-60 mt-1 text-right text-[#bbddff]">
                   {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
              </div>
            </div>
          ))}
          
          {/* VISUAL TYPING INDICATOR */}
          {isLoading && (
             <div className="flex justify-start animate-slide-up">
               <div className="bubble-bot px-4 py-3 flex items-center gap-3">
                    {/* Futuristic Waveform Animation */}
                    <div className="flex space-x-1 h-3 items-center">
                        <div className="w-0.5 h-full bg-gem-cyan animate-wave"></div>
                        <div className="w-0.5 h-full bg-gem-cyan animate-wave delay-100"></div>
                        <div className="w-0.5 h-full bg-gem-cyan animate-wave delay-200"></div>
                        <div className="w-0.5 h-full bg-gem-cyan animate-wave delay-300"></div>
                    </div>
                    
                    <span className="text-[9px] text-gem-cyan font-mono animate-pulse uppercase tracking-wider">
                       {intelligenceLevel === IntelligenceLevel.JAGGED_GEM ? 'DEEP SCAN' : 'PROCESSING'}
                    </span>
               </div>
             </div>
          )}
        </div>

        {/* COMPACT INPUT AREA - Phone Sized */}
        <div className="p-3 border-t border-gem-cyan/20 bg-gem-dark/80 backdrop-blur-xl flex items-center gap-2 shrink-0 z-10">
            
            {/* Location Toggle Button */}
            <button 
              onClick={toggleLocation}
              disabled={isGettingLocation}
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all duration-300 ${
                useMaps 
                  ? 'bg-gem-cyan text-black border-gem-cyan shadow-[0_0_15px_cyan]' 
                  : 'bg-transparent border-gray-600 text-gray-500 hover:text-white hover:border-white'
              } ${isGettingLocation ? 'animate-pulse' : ''}`}
              title="Toggle Location/Maps"
            >
              {isGettingLocation ? (
                 <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path fill="currentColor" d="M12 4c-4.41 0-8 3.59-8 8h2c0-3.31 2.69-6 6-6V4z"/></svg>
              ) : (
                 <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              )}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={useMaps ? "Ask about places nearby..." : `Msg (${intelligenceLevel})...`}
              className="flex-1 bg-[rgba(0,30,50,0.6)] border border-gem-cyan/40 rounded-full px-4 py-2 text-xs text-white focus:outline-none focus:border-gem-cyan focus:shadow-[0_0_10px_cyan] placeholder-blue-200/50 transition-all"
            />
            <button 
              onClick={handleSend}
              disabled={isLoading}
              className="w-9 h-9 bg-transparent border border-gem-cyan rounded-full flex items-center justify-center cursor-pointer transition-all hover:bg-gem-cyan hover:text-black shrink-0"
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
        </div>
      </div>

      {/* PROTOCOL OVERLAY (Slide Over) */}
      {isProtocolOpen && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-30 flex justify-end">
           <div className="w-[80%] h-full bg-gem-dark border-l border-gem-cyan/30 flex flex-col p-5 animate-slide-up shadow-2xl">
              
              <div className="flex justify-between items-center mb-6">
                  <h3 className="text-sm font-bold text-gem-cyan font-mono tracking-widest uppercase">PROTOCOLS</h3>
                  <button onClick={onCloseProtocol} className="text-white text-lg px-2">✕</button>
              </div>

              {/* Intelligence Selector */}
              <div className="space-y-3 mb-8">
                  <label className="text-[10px] text-gray-500 font-mono block mb-1">INTELLIGENCE TIER</label>
                  <button 
                    onClick={() => setIntelligenceLevel(IntelligenceLevel.JAGGED)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${intelligenceLevel === IntelligenceLevel.JAGGED ? 'bg-gem-cyan/20 border-gem-cyan text-white' : 'border-white/10 text-gray-400'}`}
                  >
                    <div>
                        <div className="text-xs font-bold">JAGGED</div>
                        <div className="text-[9px] opacity-70">Flash • Conversational</div>
                    </div>
                    {intelligenceLevel === IntelligenceLevel.JAGGED && <div className="w-2 h-2 bg-gem-cyan rounded-full shadow-[0_0_5px_cyan]"></div>}
                  </button>
                  
                  <button 
                    onClick={() => setIntelligenceLevel(IntelligenceLevel.GEM)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${intelligenceLevel === IntelligenceLevel.GEM ? 'bg-gem-magenta/20 border-gem-magenta text-white' : 'border-white/10 text-gray-400'}`}
                  >
                    <div>
                        <div className="text-xs font-bold">GEM</div>
                        <div className="text-[9px] opacity-70">Pro • Logic & Code</div>
                    </div>
                    {intelligenceLevel === IntelligenceLevel.GEM && <div className="w-2 h-2 bg-gem-magenta rounded-full shadow-[0_0_5px_magenta]"></div>}
                  </button>
                  
                  <button 
                    onClick={() => setIntelligenceLevel(IntelligenceLevel.JAGGED_GEM)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between ${intelligenceLevel === IntelligenceLevel.JAGGED_GEM ? 'bg-gradient-to-r from-gem-cyan/20 to-gem-magenta/20 border-white text-white' : 'border-white/10 text-gray-400'}`}
                  >
                    <div>
                        <div className="text-xs font-bold">JAGGED GEM</div>
                        <div className="text-[9px] opacity-70">Reasoning • Strategic</div>
                    </div>
                    {intelligenceLevel === IntelligenceLevel.JAGGED_GEM && <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>}
                  </button>
              </div>

              {/* Assets Drop Zone */}
              <div className="flex-1 flex flex-col">
                  <label className="text-[10px] text-gray-500 font-mono block mb-2">MISSION ASSETS</label>
                  <div 
                    className="flex-1 border-2 border-dashed border-white/20 rounded-xl bg-black/20 relative transition-colors hover:border-gem-cyan/50 hover:bg-black/40 min-h-[150px]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-3">
                        {attachments.length > 0 ? (
                            <div className="w-full h-full overflow-y-auto grid grid-cols-2 gap-2 content-start pr-1 scrollbar-thin">
                                {attachments.map((img, i) => (
                                <div key={i} className="relative group aspect-square">
                                    <img src={`data:image/jpeg;base64,${img}`} className="w-full h-full object-cover rounded border border-white/20" />
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setAttachments(prev => prev.filter((_, idx) => idx !== i)); }}
                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]"
                                    >
                                        ×
                                    </button>
                                </div>
                                ))}
                                <div className="flex items-center justify-center border border-white/10 rounded bg-white/5 aspect-square">
                                    <span className="text-2xl text-gray-500">+</span>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center">
                                <span className="text-2xl mb-2 block">📂</span>
                                <span className="text-[10px] text-gray-500">TAP TO UPLOAD</span>
                            </div>
                        )}
                        <input ref={fileInputRef} type="file" onChange={handleFileSelect} className="hidden" multiple accept="image/*" />
                      </div>
                  </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 text-center">
                  <span className="text-[10px] text-gray-600 font-mono">SECURE LINK • V 2.4</span>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};