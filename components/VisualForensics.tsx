import React, { useState } from 'react';
import * as GeminiService from '../services/geminiService';
import { ASPECT_RATIOS } from '../constants';
import ReactMarkdown from 'react-markdown';

export const VisualForensics: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ANALYZE' | 'GENERATE' | 'EDIT'>('ANALYZE');
  const [image, setImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('1:1');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExecute = async () => {
    if (!prompt) return;
    setIsLoading(true);
    setResult(null);
    try {
      if (activeTab === 'ANALYZE' && image) {
        const base64 = image.split(',')[1];
        const analysis = await GeminiService.analyzeImage(base64, prompt);
        setResult(analysis);
      } else if (activeTab === 'GENERATE') {
        const generatedImage = await GeminiService.generateImage(prompt, aspectRatio);
        setResult(generatedImage);
      } else if (activeTab === 'EDIT' && image) {
        const base64 = image.split(',')[1];
        const editedImage = await GeminiService.editImage(base64, prompt);
        setResult(editedImage);
      }
    } catch (error: any) {
      setResult(`ERROR: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-3">
        <h2 className="text-lg font-light tracking-wide text-white">VISUAL LAB</h2>
        <div className="flex bg-black/20 p-0.5 rounded-lg border border-white/5">
          {['ANALYZE', 'GENERATE', 'EDIT'].map((t) => (
            <button
              key={t}
              onClick={() => { setActiveTab(t as any); setResult(null); }}
              className={`px-3 py-1 text-[10px] font-bold rounded transition-all ${
                activeTab === t 
                  ? 'bg-gem-cyan text-black shadow-[0_0_10px_rgba(0,255,255,0.4)]' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full overflow-y-auto scrollbar-thin">
        {/* Controls */}
        <div className="space-y-4">
          {(activeTab === 'ANALYZE' || activeTab === 'EDIT') && (
             <div className="relative group p-1 rounded-xl bg-gradient-to-br from-white/10 to-transparent">
               <div className="bg-black/40 rounded-lg border border-dashed border-gray-600 flex flex-col items-center justify-center h-48 overflow-hidden relative">
                 {image ? (
                   <>
                    <img src={image} alt="Evidence" className="w-full h-full object-contain" />
                    <button onClick={() => setImage(null)} className="absolute top-2 right-2 bg-red-500/80 hover:bg-red-500 text-white p-1 rounded-full backdrop-blur">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                   </>
                 ) : (
                   <label className="cursor-pointer flex flex-col items-center text-gray-400 hover:text-gem-cyan transition-colors">
                     <svg className="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                     <span className="text-xs tracking-widest uppercase font-bold">Upload</span>
                     <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
                   </label>
                 )}
               </div>
             </div>
          )}

          <div className="space-y-1">
             <label className="text-[9px] font-bold text-gem-magenta tracking-widest uppercase">Prompt</label>
             <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-lg p-3 text-white text-xs h-24 focus:border-gem-magenta focus:outline-none focus:shadow-[0_0_10px_rgba(255,0,255,0.2)] resize-none transition-all"
              placeholder="Describe targets..."
            />
          </div>

          {activeTab === 'GENERATE' && (
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-gray-500 tracking-widest uppercase">Aspect Ratio</label>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_RATIOS.map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`px-2 py-1 text-[9px] border rounded transition-all ${
                      aspectRatio === ratio ? 'border-gem-cyan text-gem-cyan bg-gem-cyan/10' : 'border-gray-700 text-gray-500 hover:border-white'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleExecute}
            disabled={isLoading || (!image && activeTab !== 'GENERATE')}
            className={`w-full py-3 rounded-lg font-bold tracking-[0.2em] uppercase text-xs transition-all duration-300 ${
              isLoading || (!image && activeTab !== 'GENERATE')
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-gem-cyan to-blue-500 text-black shadow-[0_0_15px_rgba(0,255,255,0.4)] hover:scale-[1.01]'
            }`}
          >
            {isLoading ? 'Processing...' : 'Run Procedure'}
          </button>
        </div>

        {/* Output */}
        <div className="bg-black/20 border border-white/5 rounded-xl p-4 relative min-h-[300px]">
          {result ? (
            activeTab === 'ANALYZE' ? (
              <div className="prose prose-invert prose-xs">
                <ReactMarkdown>{result}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                 <img src={result} alt="Generated" className="max-w-full max-h-[400px] rounded-lg shadow-lg border border-white/10" />
                 <a href={result} download="result.png" className="mt-3 px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-bold text-gem-cyan transition-colors">
                    Download
                 </a>
              </div>
            )
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 font-mono text-xs tracking-widest">
              AWAITING OUTPUT
            </div>
          )}
        </div>
      </div>
    </div>
  );
};