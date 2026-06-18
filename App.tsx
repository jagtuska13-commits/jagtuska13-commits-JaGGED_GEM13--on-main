import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { CommandCenter } from './components/CommandCenter';
import { VisualForensics } from './components/VisualForensics';
import { SignalIntel } from './components/SignalIntel';
import { LiveIntercept } from './components/LiveIntercept';
import { SimulationChamber } from './components/SimulationChamber';
import { MemoryVisualizer } from './components/MemoryVisualizer';
import { ModuleType, AppSettings, MemoryBank } from './types';
import * as Storage from './services/storage';
import { initAuth, syncLoadSettings, syncSaveSettings, syncLoadMemory, syncSaveMemory } from './services/firebase';
import { User } from 'firebase/auth';

function App() {
  const [currentModule, setCurrentModule] = useState<ModuleType>(ModuleType.COMMAND_CENTER);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProtocolOpen, setIsProtocolOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [settings, setSettings] = useState<AppSettings>(Storage.loadSettings());
  const [memory, setMemory] = useState<MemoryBank>(Storage.loadMemory());
  const [isProcessing, setIsProcessing] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  useEffect(() => {
    // Dynamic connection and synchronization with Cloud Database
    const unsubscribe = initAuth(
      async (authUser, token) => {
        setUser(authUser);
        setAccessToken(token);
        
        try {
          const cloudSettings = await syncLoadSettings(Storage.loadSettings());
          setSettings(cloudSettings);
        } catch (e) {
          console.warn("Cloud settings sync fallback:", e);
        }
        
        try {
          const cloudMemory = await syncLoadMemory(Storage.loadMemory());
          setMemory(cloudMemory);
        } catch (e) {
          console.warn("Cloud memory sync fallback:", e);
        }
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );

    const handleProcessing = (e: any) => {
      setIsProcessing(!!e.detail?.active);
    };

    window.addEventListener('gemini-processing', handleProcessing);
    return () => {
      unsubscribe();
      window.removeEventListener('gemini-processing', handleProcessing);
    };
  }, []);

  const handleUpdateSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    Storage.saveSettings(newSettings);
    try {
      await syncSaveSettings(newSettings);
    } catch (e) {
      console.warn("Cloud settings update fallback:", e);
    }
  };

  const handleSelectSession = (id: string) => {
    if (id === 'new') {
      setCurrentSessionId(null);
      setCurrentModule(ModuleType.COMMAND_CENTER);
    } else {
      setCurrentSessionId(id);
      setCurrentModule(ModuleType.COMMAND_CENTER);
    }
  };

  const handleMemoryUpdate = async (newMemory: MemoryBank) => {
      setMemory(newMemory);
      Storage.saveMemory(newMemory);
      try {
        await syncSaveMemory(newMemory);
      } catch (e) {
        console.warn("Cloud memory update fallback:", e);
      }
  };

  const renderModule = () => {
    switch (currentModule) {
      case ModuleType.COMMAND_CENTER:
        return (
          <CommandCenter 
            key={currentSessionId || 'new'} 
            sessionId={currentSessionId}
            settings={settings}
            onSessionUpdate={setCurrentSessionId}
            isProtocolOpen={isProtocolOpen}
            onCloseProtocol={() => setIsProtocolOpen(false)}
            memory={memory}
            onMemoryUpdate={handleMemoryUpdate}
          />
        );
      case ModuleType.VISUAL_FORENSICS:
        return <VisualForensics />;
      case ModuleType.SIGNAL_INTEL:
        return <SignalIntel />;
      case ModuleType.LIVE_INTERCEPT:
        return <LiveIntercept />;
      case ModuleType.SIMULATION_CHAMBER:
        return <SimulationChamber />;
      default:
        return <CommandCenter 
          sessionId={null} 
          settings={settings} 
          onSessionUpdate={() => {}} 
          isProtocolOpen={isProtocolOpen}
          onCloseProtocol={() => setIsProtocolOpen(false)}
          memory={memory}
          onMemoryUpdate={handleMemoryUpdate}
        />;
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden flex items-center justify-center bg-black">
      
      {/* Background Orbs */}
      <div className="orb animate-orb-float opacity-40"></div>
      <div className="orb secondary animate-orb-float-rev opacity-40"></div>

      {/* DEVICE FRAME CONTAINER */}
      <div className="relative w-full h-full sm:w-[450px] sm:h-[850px] glass-card sm:rounded-[40px] flex flex-col overflow-hidden transition-all duration-300 border border-gem-cyan/30 shadow-2xl">
        
        {/* Header - Compact Phone Style */}
        <header className="relative px-4 py-3 flex items-center justify-between border-b border-gem-cyan/20 bg-gem-dark/80 backdrop-blur-md shrink-0 z-20">
           
           {/* System Connection & Intelligence Processing Indicator */}
           <div 
             className="absolute top-2.5 left-2.5 flex items-center justify-center z-30 pointer-events-none"
             title={isProcessing ? "Intelligence core: processing" : "System connection: active"}
           >
             <span className="relative flex h-2 w-2">
               <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                 isProcessing ? 'bg-gem-magenta' : 'bg-gem-cyan opacity-40'
               }`}></span>
               <span className={`relative inline-flex rounded-full h-2 w-2 border border-black/30 ${
                 isProcessing 
                   ? 'bg-gem-magenta animate-flash-fast shadow-[0_0_8px_#ff00ff]' 
                   : 'bg-gem-cyan animate-pulse-slow shadow-[0_0_8px_#00ffff]'
               }`}></span>
             </span>
           </div>
           
           {/* TOP LEFT: Hexagon -> Live Mode */}
           <button 
             onClick={() => setCurrentModule(ModuleType.LIVE_INTERCEPT)}
             className="w-10 h-10 flex items-center justify-center group cursor-pointer active:scale-90 transition-transform"
             aria-label="Live Mode"
           >
             <div className="gem-icon w-8 h-8 group-hover:shadow-[0_0_15px_cyan] transition-shadow"></div>
           </button>

           {/* Title */}
           <h1 className="text-sm font-bold tracking-[3px] text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-fuchsia-200">
             JAGGED GEM
           </h1>
           
           {/* TOP RIGHT: Action Group */}
           <div className="flex items-center gap-2">
             <button 
               onClick={() => setIsSidebarOpen(true)}
               className="w-9 h-9 rounded-full border border-gem-magenta/50 bg-gem-magenta/10 flex items-center justify-center hover:bg-gem-magenta hover:text-black hover:shadow-[0_0_15px_rgba(255,0,255,0.4)] transition-all active:scale-95 text-gem-magenta"
               title="Cortex Control"
             >
               <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
               </svg>
             </button>

             <button 
               onClick={() => {
                  if (currentModule !== ModuleType.COMMAND_CENTER) {
                    setCurrentModule(ModuleType.COMMAND_CENTER);
                  }
                  // Toggle protocol overlay
                  setIsProtocolOpen(true);
               }}
               className="w-9 h-9 rounded-full border border-gem-cyan/50 bg-gem-cyan/10 flex items-center justify-center hover:bg-gem-cyan hover:text-black hover:shadow-[0_0_15px_rgba(0,255,255,0.4)] transition-all active:scale-95 text-gem-cyan"
               title="Operator Profile"
             >
               <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
               </svg>
             </button>
           </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 relative overflow-hidden flex flex-col min-h-0 bg-black/20">
           {renderModule()}
        </div>

        {/* Keeping sidebar logic for session history if needed, but primarily using profile for protocols */}
        <Sidebar 
          currentModule={currentModule} 
          setModule={setCurrentModule} 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onSelectSession={handleSelectSession}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          currentSessionId={currentSessionId}
          onOpenMemory={() => setIsMemoryOpen(true)}
          user={user}
          accessToken={accessToken}
          onLoginSuccess={(u, t) => {
            setUser(u);
            setAccessToken(t);
          }}
          onLogoutSuccess={() => {
            setUser(null);
            setAccessToken(null);
          }}
        />

        <MemoryVisualizer 
           isOpen={isMemoryOpen} 
           onClose={() => setIsMemoryOpen(false)}
           onMemoryUpdate={handleMemoryUpdate}
        />

      </div>
    </div>
  );
}

export default App;