import React, { useState } from 'react';
import * as GeminiService from '../services/geminiService';
import ReactMarkdown from 'react-markdown';

export const SignalIntel: React.FC = () => {
  const [textInput, setTextInput] = useState('');
  const [audioResult, setAudioResult] = useState<string | null>(null);
  const [transcribeResult, setTranscribeResult] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  const handleGenerateSpeech = async () => {
    if (!textInput) return;
    setIsLoading(true);
    try {
      const base64 = await GeminiService.generateSpeech(textInput);
      setAudioResult(base64);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const playAudio = async () => {
    if (!audioResult) return;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const buffer = await GeminiService.decodeAudioData(audioResult, ctx);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' }); // Typically webm in Chrome
        const reader = new FileReader();
        reader.onloadend = async () => {
           const base64 = (reader.result as string).split(',')[1];
           setIsLoading(true);
           try {
             const text = await GeminiService.transcribeAudio(base64, 'audio/webm');
             setTranscribeResult(text);
           } catch(e: any) {
             setTranscribeResult(`Error: ${e.message}`);
           } finally {
             setIsLoading(false);
           }
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (e) {
      console.error(e);
      alert("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-apex-dark p-6">
       <h2 className="text-xl font-mono text-white mb-6 border-b border-apex-border pb-4">SIGNAL INTELLIGENCE</h2>
       
       <div className="grid grid-cols-2 gap-8 h-full">
         
         {/* TTS Section */}
         <div className="bg-apex-panel border border-apex-border rounded p-6 flex flex-col">
            <h3 className="text-apex-accent font-mono mb-4 text-sm">AUDIO SYNTHESIS (TTS)</h3>
            <textarea
              className="flex-1 bg-black/30 border border-apex-border rounded p-4 text-white font-mono mb-4 resize-none focus:outline-none focus:border-apex-accent"
              placeholder="Enter briefing text..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
            />
            <div className="flex space-x-4">
              <button 
                onClick={handleGenerateSpeech}
                disabled={isLoading}
                className="flex-1 bg-apex-accent-dim hover:bg-apex-accent text-white hover:text-black font-bold py-3 rounded uppercase text-xs"
              >
                {isLoading ? 'Synthesizing...' : 'Generate Audio'}
              </button>
              {audioResult && (
                <button 
                  onClick={playAudio}
                  className="flex-1 border border-apex-accent text-apex-accent hover:bg-apex-accent hover:text-black font-bold py-3 rounded uppercase text-xs"
                >
                  ▶ Play Playback
                </button>
              )}
            </div>
         </div>

         {/* Transcription Section */}
         <div className="bg-apex-panel border border-apex-border rounded p-6 flex flex-col">
            <h3 className="text-apex-accent font-mono mb-4 text-sm">SIGNAL INTERCEPT (TRANSCRIPTION)</h3>
            <div className="flex-1 bg-black/30 border border-apex-border rounded p-4 mb-4 overflow-y-auto">
               <div className="prose prose-invert prose-sm font-mono text-gray-300">
                 {transcribeResult ? <ReactMarkdown>{transcribeResult}</ReactMarkdown> : <span className="text-gray-600">No signal intercepted...</span>}
               </div>
            </div>
            
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              className={`w-full py-4 font-bold tracking-widest uppercase rounded select-none ${
                isRecording 
                  ? 'bg-red-500 text-white animate-pulse' 
                  : 'bg-apex-border text-gray-400 hover:bg-gray-700'
              }`}
            >
              {isRecording ? '• RECORDING ACTIVE •' : 'HOLD TO RECORD'}
            </button>
         </div>

       </div>
    </div>
  );
};
