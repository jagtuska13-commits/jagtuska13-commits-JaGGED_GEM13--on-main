import React, { useState, useEffect } from 'react';
import { MemoryBank, MemoryFact, FactCategory } from '../types';
import * as Storage from '../services/storage';

interface MemoryVisualizerProps {
  isOpen: boolean;
  onClose: () => void;
  onMemoryUpdate: (newMemory: MemoryBank) => void;
}

const CATEGORIES: FactCategory[] = ['IDENTITY', 'PREFERENCE', 'RELATIONSHIP', 'PROJECT', 'TRIVIA'];

export const MemoryVisualizer: React.FC<MemoryVisualizerProps> = ({ isOpen, onClose, onMemoryUpdate }) => {
  const [memory, setMemory] = useState<MemoryBank>(Storage.loadMemory());
  const [activeCategory, setActiveCategory] = useState<FactCategory | 'ALL'>('ALL');
  const [newFact, setNewFact] = useState('');
  const [newFactCategory, setNewFactCategory] = useState<FactCategory>('TRIVIA');

  useEffect(() => {
    if (isOpen) {
      setMemory(Storage.loadMemory());
    }
  }, [isOpen]);

  const handleDelete = (id: string) => {
    const updatedFacts = memory.facts.filter(f => f.id !== id);
    const updatedMemory = { ...memory, facts: updatedFacts };
    setMemory(updatedMemory);
    Storage.saveMemory(updatedMemory);
    onMemoryUpdate(updatedMemory);
  };

  const handleAdd = () => {
    if (!newFact.trim()) return;
    const fact: MemoryFact = {
      id: Math.random().toString(36).substr(2, 9),
      content: newFact,
      category: newFactCategory,
      timestamp: Date.now(),
      confidence: 1.0
    };
    const updatedFacts = [fact, ...memory.facts];
    const updatedMemory = { ...memory, facts: updatedFacts };
    setMemory(updatedMemory);
    Storage.saveMemory(updatedMemory);
    onMemoryUpdate(updatedMemory);
    setNewFact('');
  };

  const filteredFacts = activeCategory === 'ALL' 
    ? memory.facts 
    : memory.facts.filter(f => f.category === activeCategory);

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/80 backdrop-blur-sm z-50 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      
      <div className={`fixed inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:w-[800px] sm:h-[600px] h-[80vh] bg-gem-dark border border-gem-cyan/50 shadow-[0_0_50px_rgba(0,255,255,0.2)] rounded-t-3xl sm:rounded-3xl z-50 flex flex-col transform transition-transform duration-300 ${isOpen ? 'translate-y-0' : 'translate-y-full sm:translate-y-20 sm:scale-95 sm:opacity-0'}`}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gem-cyan/20">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-gem-magenta animate-pulse"></div>
             <h2 className="text-xl font-mono tracking-widest text-white">CORTEX EXPLORER</h2>
          </div>
          <button onClick={onClose} className="text-gem-cyan hover:text-white transition-colors text-2xl">×</button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
           {/* Sidebar Filters */}
           <div className="w-48 border-r border-gem-cyan/20 p-4 space-y-2 overflow-y-auto hidden sm:block">
              <button 
                onClick={() => setActiveCategory('ALL')}
                className={`w-full text-left px-4 py-2 rounded text-xs font-bold tracking-wider ${activeCategory === 'ALL' ? 'bg-gem-cyan text-black' : 'text-gray-400 hover:text-white'}`}
              >
                ALL DATA
              </button>
              {CATEGORIES.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`w-full text-left px-4 py-2 rounded text-xs font-bold tracking-wider ${activeCategory === cat ? 'bg-gem-cyan/20 text-gem-cyan border border-gem-cyan/50' : 'text-gray-400 hover:text-white'}`}
                >
                  {cat}
                </button>
              ))}
           </div>

           {/* Main Data Area */}
           <div className="flex-1 flex flex-col p-6 overflow-hidden">
              
              {/* Summary Section */}
              <div className="mb-6 p-4 bg-black/40 border border-white/10 rounded-lg">
                 <h3 className="text-xs text-gem-magenta font-mono mb-2 uppercase">Core Narrative</h3>
                 <p className="text-sm text-gray-300 italic">"{memory.summary}"</p>
              </div>

              {/* Facts List */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-thin">
                 {filteredFacts.length === 0 ? (
                    <div className="text-center text-gray-600 mt-10 font-mono text-sm">NO DATA NODES FOUND</div>
                 ) : (
                    filteredFacts.map(fact => (
                       <div key={fact.id} className="group relative bg-white/5 border border-white/5 hover:border-gem-cyan/50 rounded p-3 transition-all">
                          <div className="flex justify-between items-start">
                             <span className="text-[10px] font-mono text-gem-cyan/70 bg-black/50 px-1.5 rounded uppercase mb-1 inline-block">{fact.category}</span>
                             <span className="text-[10px] text-gray-600 font-mono">{new Date(fact.timestamp).toLocaleDateString()}</span>
                          </div>
                          <p className="text-sm text-white/90 pr-6">{fact.content}</p>
                          <button 
                            onClick={() => handleDelete(fact.id)}
                            className="absolute top-2 right-2 text-gray-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                          >
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                       </div>
                    ))
                 )}
              </div>

              {/* Add Fact */}
              <div className="mt-4 pt-4 border-t border-gem-cyan/20 flex gap-2">
                 <select 
                    value={newFactCategory}
                    onChange={(e) => setNewFactCategory(e.target.value as FactCategory)}
                    className="bg-black/50 border border-gem-cyan/30 rounded px-2 text-xs text-white focus:outline-none focus:border-gem-cyan"
                 >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
                 <input 
                    type="text" 
                    value={newFact}
                    onChange={(e) => setNewFact(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder="Inject new memory node..."
                    className="flex-1 bg-black/50 border border-gem-cyan/30 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gem-cyan focus:shadow-[0_0_10px_rgba(0,255,255,0.2)]"
                 />
                 <button 
                    onClick={handleAdd}
                    className="bg-gem-cyan text-black px-4 rounded font-bold hover:bg-white transition-colors"
                 >
                    +
                 </button>
              </div>
           </div>
        </div>
      </div>
    </>
  );
};