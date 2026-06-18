import React, { useState } from 'react';
import * as GeminiService from '../services/geminiService';

export const SimulationChamber: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [image, setImage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => setImage(reader.result as string);
          reader.readAsDataURL(file);
      }
  };

  const handleGenerate = async () => {
    // API Key is now hardcoded in service, skipping manual selection check.
    
    setIsLoading(true);
    setVideoUrl(null);

    try {
        const imageBytes = image ? image.split(',')[1] : undefined;
        const url = await GeminiService.generateVeoVideo(prompt || "A cinematic shot", aspectRatio, imageBytes);
        setVideoUrl(url);
    } catch (e: any) {
        if (e.message?.includes("Requested entity was not found") && (window as any).aistudio) {
             // Fallback: Try to open selector if hardcoded key fails/rejected
             await (window as any).aistudio.openSelectKey();
        }
        alert(`Simulation Failed: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-apex-dark p-6">
      <h2 className="text-xl font-mono text-white mb-6 border-b border-apex-border pb-4">SIMULATION CHAMBER (VEO)</h2>

      <div className="grid grid-cols-3 gap-6 h-full">
         <div className="col-span-1 space-y-6">
             <div className="p-4 border border-apex-border bg-apex-panel rounded">
                 <label className="block text-xs font-mono text-gray-500 mb-2">REFERENCE IMAGE (OPTIONAL)</label>
                 {image ? (
                     <div className="relative">
                         <img src={image} className="w-full h-32 object-cover rounded border border-gray-700" />
                         <button onClick={() => setImage(null)} className="absolute top-1 right-1 bg-black text-white text-xs p-1">CLR</button>
                     </div>
                 ) : (
                     <input type="file" onChange={handleFileChange} className="text-xs text-gray-400" />
                 )}
             </div>

             <div className="p-4 border border-apex-border bg-apex-panel rounded">
                 <label className="block text-xs font-mono text-gray-500 mb-2">SCENARIO DESCRIPTION</label>
                 <textarea 
                   value={prompt}
                   onChange={e => setPrompt(e.target.value)}
                   className="w-full bg-black/30 border border-gray-700 text-white p-2 text-sm h-32 resize-none focus:border-apex-accent focus:outline-none"
                   placeholder="Describe the simulation..."
                 />
             </div>

             <div className="p-4 border border-apex-border bg-apex-panel rounded">
                <label className="block text-xs font-mono text-gray-500 mb-2">ASPECT RATIO</label>
                <div className="flex space-x-2">
                    {['16:9', '9:16'].map(r => (
                        <button 
                          key={r}
                          onClick={() => setAspectRatio(r as any)}
                          className={`flex-1 py-2 text-xs border ${aspectRatio === r ? 'border-apex-accent text-apex-accent' : 'border-gray-700 text-gray-500'}`}
                        >
                            {r}
                        </button>
                    ))}
                </div>
             </div>

             <button 
               onClick={handleGenerate}
               disabled={isLoading}
               className={`w-full py-4 font-bold uppercase tracking-widest ${
                   isLoading ? 'bg-gray-800 text-gray-500' : 'bg-apex-accent text-black hover:bg-white'
               }`}
             >
                 {isLoading ? 'RENDERING SIMULATION...' : 'INITIATE VEO'}
             </button>
             
             <div className="text-[10px] text-gray-500 text-center">
                 <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="hover:text-apex-accent underline">
                     Billing Info Required for Veo
                 </a>
             </div>
         </div>

         <div className="col-span-2 bg-black border border-apex-border rounded flex items-center justify-center p-2">
             {videoUrl ? (
                 <video src={videoUrl} controls autoPlay loop className="w-full h-full object-contain" />
             ) : (
                 <div className="text-center text-gray-600 font-mono">
                     <div className="text-4xl mb-4 opacity-30">🎬</div>
                     <div>AWAITING SIMULATION OUTPUT</div>
                 </div>
             )}
         </div>
      </div>
    </div>
  );
};
