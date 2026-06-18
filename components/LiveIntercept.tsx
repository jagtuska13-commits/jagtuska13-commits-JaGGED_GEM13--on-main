import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

// Helper for PCM blob creation
function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  const uint8 = new Uint8Array(int16.buffer);
  
  let binary = '';
  const len = uint8.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const base64 = btoa(binary);

  return {
    data: base64,
    mimeType: 'audio/pcm;rate=16000',
  } as any;
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}


export const LiveIntercept: React.FC = () => {
  const [active, setActive] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [status, setStatus] = useState("SECURE LINK READY");
  
  const videoRef = useRef<HTMLVideoElement>(null); 
  const sessionRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<any>(null);

  useEffect(() => {
    return () => {
       // Cleanup if needed
    };
  }, []);

  const triggerActivity = () => {
     setIsTalking(true);
     if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
     silenceTimeoutRef.current = setTimeout(() => setIsTalking(false), 400); 
  };

  const startSession = async () => {
    setActive(true);
    setStatus("ESTABLISHING LINK...");
    
    // Authenticate with environment key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Setup Audio Contexts
    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
    const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
    const outputNode = outputAudioContext.createGain();
    outputNode.connect(outputAudioContext.destination);
    
    let nextStartTime = 0;
    const sources = new Set<AudioBufferSourceNode>();

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); 
    } catch(e) {
        setStatus("ACCESS DENIED");
        setActive(false);
        return;
    }

    const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: "You are Jagged Gem Live. You are a highly intelligent, warm, and fiercely protective AI assistant. Be concise, natural, and supportive.",
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
            }
        },
        callbacks: {
            onopen: () => {
                setStatus("LIVE UPLINK ACTIVE");
                
                const source = inputAudioContext.createMediaStreamSource(stream);
                const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                scriptProcessor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);
                    // Simple VAD for visual feedback
                    let sum = 0;
                    for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
                    if (Math.sqrt(sum / inputData.length) > 0.01) triggerActivity();

                    const pcmBlob = createBlob(inputData);
                    sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                };
                source.connect(scriptProcessor);
                scriptProcessor.connect(inputAudioContext.destination);
            },
            onmessage: async (msg: LiveServerMessage) => {
                const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                if (audioData) {
                    triggerActivity();
                    nextStartTime = Math.max(nextStartTime, outputAudioContext.currentTime);
                    const buffer = await decodeAudioData(decode(audioData), outputAudioContext, 24000, 1);
                    const source = outputAudioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(outputNode);
                    source.start(nextStartTime);
                    nextStartTime += buffer.duration;
                    sources.add(source);
                    source.onended = () => sources.delete(source);
                }
                
                if (msg.serverContent?.interrupted) {
                    sources.forEach(s => s.stop());
                    sources.clear();
                    nextStartTime = 0;
                    setStatus("INTERRUPTED");
                }
            },
            onclose: () => {
                setStatus("LINK TERMINATED");
                setActive(false);
            },
            onerror: (e) => {
                setStatus("CONNECTION ERROR");
                console.error(e);
            }
        }
    });
    
    sessionRef.current = sessionPromise;
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center bg-black relative">
       
       {/* Status Text */}
       <div className="absolute top-10 text-gem-cyan font-mono tracking-[0.2em] text-[10px] animate-pulse">
           {status}
       </div>

       {/* MAIN HEXAGON VISUALIZER */}
       <div className="relative w-64 h-64 flex items-center justify-center">
           
           {/* Outer Pulsing Rings */}
           {active && (
               <>
                 <div className="absolute inset-0 rounded-full border border-gem-cyan/20 animate-ping opacity-20"></div>
                 <div className="absolute inset-[-20px] rounded-full border border-gem-magenta/10 animate-ping delay-150 opacity-10"></div>
               </>
           )}

           {/* The Hexagon Button */}
           <button 
             onClick={!active ? startSession : () => window.location.reload()}
             className={`relative z-10 w-32 h-32 flex items-center justify-center transition-all duration-300 cursor-pointer group ${
                active && isTalking ? 'animate-bounce-futuristic' : ''
             }`}
           >
             {/* Hexagon SVG */}
             <svg viewBox="0 0 100 100" className={`w-full h-full drop-shadow-[0_0_20px_cyan] transition-all duration-500 ${active ? 'scale-110' : 'scale-100'}`}>
                <path 
                  d="M50 0 L93.3 25 L93.3 75 L50 100 L6.7 75 L6.7 25 Z" 
                  className={`stroke-[3px] transition-all duration-300 ${
                    active 
                      ? 'stroke-gem-cyan fill-gem-dark shadow-[0_0_30px_cyan]' 
                      : 'stroke-gray-700 fill-black group-hover:stroke-gem-cyan'
                  }`} 
                />
                
                {/* Inner Tech Detail */}
                <path 
                  d="M50 20 L76 35 L76 65 L50 80 L24 65 L24 35 Z" 
                  className={`fill-none stroke-[1.5px] transition-all duration-300 ${
                    active ? 'stroke-gem-magenta opacity-100' : 'stroke-gray-800 opacity-50'
                  }`}
                />
                
                {/* Center Core */}
                {active && (
                    <circle cx="50" cy="50" r="5" className="fill-white animate-pulse" />
                )}
             </svg>
             
             {/* Label overlay (when inactive) */}
             {!active && (
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                     <span className="text-gray-500 font-mono text-[9px] tracking-widest group-hover:text-gem-cyan">LIVE</span>
                 </div>
             )}
           </button>

       </div>

       {/* Close Button if active */}
       {active && (
         <div className="absolute bottom-16">
             <button onClick={() => window.location.reload()} className="w-12 h-12 rounded-full border border-red-500 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-[0_0_10px_red]">
                ✕
             </button>
         </div>
       )}

       {/* Audio Visualizer Bars (Fake effect for visuals) */}
       {active && isTalking && (
         <div className="absolute bottom-32 flex gap-1 h-8 items-end">
            {[...Array(5)].map((_, i) => (
                <div key={i} className="w-1 bg-gem-cyan animate-pulse" style={{ height: `${Math.random() * 100}%`, animationDuration: `${0.2 + Math.random() * 0.3}s` }}></div>
            ))}
         </div>
       )}

       <video ref={videoRef} className="hidden" muted playsInline />
    </div>
  );
};