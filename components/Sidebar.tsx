import React, { useState, useEffect } from 'react';
import { ModuleType, AppSettings, ChatSession } from '../types';
import * as Storage from '../services/storage';
import { googleSignIn, logout, syncLoadSessions } from '../services/firebase';
import { User } from 'firebase/auth';

interface SidebarProps {
  currentModule: ModuleType;
  setModule: (m: ModuleType) => void;
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (id: string) => void;
  settings: AppSettings;
  onUpdateSettings: (s: AppSettings) => void;
  currentSessionId: string | null;
  onOpenMemory: () => void;
  user: User | null;
  accessToken: string | null;
  onLoginSuccess: (user: User, token: string) => void;
  onLogoutSuccess: () => void;
}

const MODULES = [
  { id: ModuleType.COMMAND_CENTER, label: 'COMMAND' },
  { id: ModuleType.VISUAL_FORENSICS, label: 'VISUAL' },
  { id: ModuleType.SIGNAL_INTEL, label: 'SIGNAL' },
  { id: ModuleType.LIVE_INTERCEPT, label: 'LIVE' },
  { id: ModuleType.SIMULATION_CHAMBER, label: 'SIMULATE' },
];

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentModule, 
  setModule, 
  isOpen, 
  onClose,
  onSelectSession,
  settings,
  onUpdateSettings,
  currentSessionId,
  onOpenMemory,
  user,
  accessToken,
  onLoginSuccess,
  onLogoutSuccess
}) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingDrive, setIsLoadingDrive] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [driveError, setDriveError] = useState('');

  useEffect(() => {
    const fetchSessions = async () => {
      if (isOpen) {
        if (user) {
          const fbSessions = await syncLoadSessions();
          setSessions(fbSessions);
        } else {
          setSessions(Storage.loadSessions());
        }
      }
    };
    fetchSessions();
  }, [isOpen, user]);

  useEffect(() => {
    if (isOpen && accessToken) {
      loadDriveFiles();
    }
  }, [isOpen, accessToken]);

  const loadDriveFiles = async (queryTerm = '') => {
    if (!accessToken) return;
    setIsLoadingDrive(true);
    setDriveError('');
    try {
      let q = "trashed = false";
      if (queryTerm) {
        q += ` and name contains '${queryTerm.replace(/'/g, "\\'")}'`;
      }
      const url = `https://www.googleapis.com/drive/v3/files?pageSize=12&q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,iconLink,webViewLink)&orderBy=modifiedTime desc`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (!response.ok) {
        throw new Error(`Drive connection status: ${response.status}`);
      }
      const data = await response.json();
      setDriveFiles(data.files || []);
    } catch (err: any) {
      console.error('Error fetching drive files:', err);
      setDriveError(err.message || 'Access token expired or permission error');
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      loadDriveFiles(searchQuery);
    }
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setDriveError('');
    try {
      const result = await googleSignIn();
      if (result) {
        onLoginSuccess(result.user, result.accessToken);
      }
    } catch (err: any) {
      console.error(err);
      setDriveError(err.message || 'Sign in failed');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
      onLogoutSuccess();
      setDriveFiles([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleIngestFile = async (file: any) => {
    if (!accessToken) return;
    setIsLoadingDrive(true);
    try {
      let content = `[GOOGLE DRIVE FORENSICS DIRECTIVE]\nTarget ID: ${file.id}\nFilename: ${file.name}\nMimeType: ${file.mimeType}\n`;
      
      let successfullyDownloaded = false;
      // Download file extracts if text-based
      if (file.mimeType === 'application/vnd.google-apps.document') {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const text = await res.text();
          content += `\n--- SECURE DOCUMENT CONTENT EXTRACT ---\n${text.slice(0, 3000)}`;
          successfullyDownloaded = true;
        }
      } else if (file.mimeType.startsWith('text/') || file.mimeType === 'application/json') {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const text = await res.text();
          content += `\n--- SECURE DOCUMENT CONTENT EXTRACT ---\n${text.slice(0, 3000)}`;
          successfullyDownloaded = true;
        }
      }

      if (!successfullyDownloaded) {
        content += `\nFile classification: binary/non-exportable. Secure ingestion of metadata complete. Ready for manual analysis.`;
      }
      
      const event = new CustomEvent('drive-ingest', { detail: { content } });
      window.dispatchEvent(event);
      onClose(); // Auto-close side-panel
    } catch (err) {
      console.error(err);
      setDriveError('Failed to parse file text content.');
    } finally {
      setIsLoadingDrive(false);
    }
  };

  const handleSettingsChange = (key: keyof AppSettings, value: string) => {
    const newSettings = { ...settings, [key]: value };
    onUpdateSettings(newSettings);
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/50 backdrop-blur-[6px] z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div className={`fixed top-0 right-0 h-full w-[420px] max-w-[90vw] glass-panel z-50 transform transition-transform duration-400 cubic-bezier(0.2, 0.9, 0.3, 1) flex flex-col p-6 gap-5 overflow-y-auto ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-gem-cyan/30 pb-3">
           <h2 className="text-[1.6rem] font-normal tracking-[2px] text-transparent bg-clip-text bg-gradient-to-br from-gem-cyan to-gem-magenta">NEO•CTRL</h2>
           <button 
             onClick={onClose} 
             className="w-10 h-10 rounded-full border border-gem-cyan text-gem-cyan text-xl flex items-center justify-center hover:bg-gem-cyan hover:text-black hover:shadow-[0_0_20px_cyan] transition-all leading-none"
           >
             ✕
           </button>
        </div>

        {/* Secure Workspace Sign-In & Auth Status */}
        <div className="bg-gem-dark/50 border border-gem-cyan rounded-3xl p-4 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="text-gem-cyan text-xs font-mono tracking-wider">🔐 CO-INTEL NODE SECURITY</h3>
            <span className={`w-2 h-2 rounded-full ${user ? 'bg-gem-cyan animate-pulse' : 'bg-red-500'}`}></span>
          </div>

          {user ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 bg-black/40 p-2.5 rounded-2xl border border-gem-cyan/20">
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'Operator'} className="w-9 h-9 rounded-full border border-gem-cyan" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gem-cyan/20 flex items-center justify-center border border-gem-cyan text-gem-cyan font-mono text-sm">
                    {user.email?.slice(0, 2).toUpperCase() || 'OP'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white truncate font-medium">{user.displayName || 'Linked Cortex'}</p>
                  <p className="text-[10px] text-gem-cyan/80 truncate font-mono">{user.email}</p>
                </div>
              </div>
              <button 
                onClick={handleSignOut}
                className="w-full py-2 bg-red-500/10 border border-red-500/40 text-red-300 hover:bg-red-500/20 text-xs rounded-xl font-mono tracking-wider transition-all"
              >
                DISCONNECT METRIC
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-400">Authenticating grants neural sync & live Google Drive extraction privileges.</p>
              
              {/* Material Designed Sign-In with Google Button styled matching guidelines */}
              <button 
                onClick={handleSignIn}
                disabled={isSigningIn}
                className="w-full h-11 bg-white hover:bg-gray-100 text-black font-semibold rounded-xl flex items-center justify-center gap-3 border border-gray-300 active:scale-98 transition-all disabled:opacity-50 select-none shadow-[0_2px_10px_rgba(0,0,0,0.1)] font-sans"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                <span className="text-sm font-medium tracking-wide">Sign in with Google</span>
              </button>
            </div>
          )}
        </div>

        {/* Google Drive Forensics Explorer */}
        {user && accessToken && (
          <div className="bg-gem-dark/50 border border-gem-cyan/40 rounded-3xl p-4 flex flex-col gap-3 min-h-[220px]">
             <div className="flex justify-between items-center">
               <h3 className="text-gem-cyan text-xs font-mono tracking-wider flex items-center gap-1.5">
                 📂 CO-INTEL SECURE DRIVE
               </h3>
               {isLoadingDrive && <span className="text-[10px] text-gem-cyan animate-pulse">Scanning...</span>}
             </div>

             <div className="flex gap-2">
               <input 
                 type="text" 
                 placeholder="Search drive documents..." 
                 value={searchQuery}
                 onChange={(e) => setSearchQuery(e.target.value)}
                 onKeyDown={handleSearchKeyPress}
                 className="flex-1 px-3 py-1.5 bg-black/40 border border-gem-cyan/30 rounded-xl text-xs text-white focus:outline-none focus:border-gem-cyan/80 font-mono"
               />
               <button 
                 onClick={() => loadDriveFiles(searchQuery)}
                 className="px-3 bg-gem-cyan/10 hover:bg-gem-cyan/20 text-gem-cyan text-xs rounded-xl font-mono border border-gem-cyan/30"
               >
                 Go
               </button>
             </div>

             {driveError && <p className="text-[10px] text-red-400 font-mono">{driveError}</p>}

             <div className="flex-1 space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
               {driveFiles.length === 0 ? (
                 <p className="text-gray-500 text-center py-4 font-mono text-[11px]">No documents identified</p>
               ) : (
                 driveFiles.map(file => (
                   <div key={file.id} className="p-2 border border-gem-cyan/10 rounded-xl bg-black/30 flex items-center justify-between gap-3 group hover:border-gem-cyan/40 transition-all">
                     <div className="min-w-0 flex-1">
                       <p className="text-[11px] text-white truncate font-medium" title={file.name}>{file.name}</p>
                       <p className="text-[9px] text-gray-500 truncate font-mono uppercase">{file.mimeType.split('/').pop()}</p>
                     </div>
                     <div className="flex items-center gap-1.5 shrink-0">
                       <button
                         onClick={() => handleIngestFile(file)}
                         className="px-2 py-1 bg-gem-cyan/20 border border-gem-cyan/30 text-gem-cyan text-[10px] rounded-lg font-mono hover:bg-gem-cyan hover:text-black transition-all"
                       >
                         Ingest
                       </button>
                       <a 
                         href={file.webViewLink} 
                         target="_blank" 
                         rel="noopener noreferrer"
                         className="w-6 h-6 border border-white/10 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10"
                         title="Open in Drive"
                       >
                         ↗
                       </a>
                     </div>
                   </div>
                 ))
               )}
             </div>
          </div>
        )}

        {/* Memory Bank Access */}
        <button 
            onClick={() => { onOpenMemory(); onClose(); }}
            className="w-full py-3.5 border border-gem-magenta text-gem-magenta bg-gem-magenta/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-gem-magenta/20 transition-all shadow-[0_0_15px_rgba(255,0,255,0.1)] group"
        >
            <div className="w-2 h-2 bg-gem-magenta rounded-full animate-ping"></div>
            <span className="font-mono tracking-widest uppercase text-xs font-bold group-hover:text-white">Open Cortex Explorer</span>
        </button>

        {/* Modules Grid */}
        <div className="flex flex-col gap-2.5">
             {MODULES.map(mod => (
                 <button
                    key={mod.id}
                    onClick={() => { setModule(mod.id); onClose(); }}
                    className={`bg-gem-dark/50 border rounded-2xl px-4 py-3 flex items-center justify-between transition-all duration-200 hover:border-gem-cyan hover:shadow-[0_0_20px_cyan] hover:bg-gem-dark/60 ${
                        currentModule === mod.id ? 'border-gem-cyan shadow-[0_0_15px_rgba(0,255,255,0.3)]' : 'border-gem-cyan/30'
                    }`}
                 >
                    <span className="text-[1rem] text-cyan-100 uppercase tracking-wider">{mod.label}</span>
                    <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${currentModule === mod.id ? 'bg-gem-cyan shadow-[0_0_15px_cyan] animate-pulse' : 'bg-gray-500'}`}></span>
                        <span className="text-xs text-blue-200 w-16 text-right">{currentModule === mod.id ? 'Active' : 'Standby'}</span>
                    </div>
                 </button>
             ))}
        </div>

        {/* Reset / History */}
        <div className="mt-auto pt-2 flex flex-col gap-4 border-t border-gem-cyan/10">
             <button 
                onClick={() => { onSelectSession('new'); onClose(); }}
                className="w-full py-2.5 border border-[#ff7777] text-[#ff9999] rounded-xl hover:bg-[#ff5555] hover:text-black transition-colors text-xs font-mono font-medium"
             >
                ⟲ RESET NEURAL CYCLE
             </button>
             
             {sessions.length > 0 && (
                <div className="border-t border-gem-cyan/20 pt-2">
                    <h3 className="text-gem-cyan text-[10px] mb-2 uppercase tracking-widest font-mono">Recent History Sync</h3>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
                        {sessions.map(s => (
                            <div key={s.id} onClick={() => {onSelectSession(s.id); onClose();}} className="text-[11px] text-gray-400 hover:text-white cursor-pointer truncate py-1 border-b border-white/5 font-mono">
                                • {s.title}
                            </div>
                        ))}
                    </div>
                </div>
             )}
        </div>

      </div>
    </>
  );
};