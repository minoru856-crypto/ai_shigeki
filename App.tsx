
import React, { useState, useEffect, useCallback } from 'react';
import { Settings, ShieldCheck, X } from 'lucide-react';
import { ChatInterface } from './components/ChatInterface';
import { AdminDashboard } from './components/AdminDashboard';
import { RuleFile, AppMode, ChatHistoryItem, GoogleDriveConfig } from './types';
import { ADMIN_PASSWORD, APP_STORAGE_KEYS } from './constants';
import { googleDriveService } from './services/googleDriveService';

const HISTORY_STORAGE_KEY = 'rule_navigator_history';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('user');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Lazy Initializer
  const [files, setFiles] = useState<RuleFile[]>(() => {
    try {
      const saved = localStorage.getItem(APP_STORAGE_KEYS.FILES);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // 自動同期ロジック
  useEffect(() => {
    const autoSync = async () => {
      const savedGdConfig = localStorage.getItem('gd_config');
      if (savedGdConfig) {
        const config: GoogleDriveConfig = JSON.parse(savedGdConfig);
        if (config.clientId && config.apiKey && config.isConnected) {
          try {
            await googleDriveService.init(config.clientId, config.apiKey);
            await googleDriveService.connect();
            const cloudFiles = await googleDriveService.loadFiles();
            if (cloudFiles && cloudFiles.length > 0) {
              setFiles(cloudFiles);
              console.log("Cloud data synced automatically.");
            }
          } catch (err) {
            console.error("Auto-sync failed:", err);
          }
        }
      }
    };
    autoSync();
  }, []);

  // ローカル保存
  useEffect(() => {
    localStorage.setItem(APP_STORAGE_KEYS.FILES, JSON.stringify(files));
  }, [files]);

  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(chatHistory));
  }, [chatHistory]);

  const handleAdminAccess = () => {
    if (password === ADMIN_PASSWORD) {
      setMode('admin'); setShowPasswordModal(false); setPassword(''); setPasswordError(false);
    } else setPasswordError(true);
  };

  const handleSaveHistory = useCallback((query: string, response: string) => {
    const newItem: ChatHistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      query,
      response
    };
    setChatHistory(prev => [newItem, ...prev]);
  }, []);

  const handleClearHistory = useCallback(() => {
    if (confirm("すべての回答履歴を削除しますか？")) {
      setChatHistory([]);
    }
  }, []);

  return (
    <div className="h-screen bg-[#f1f5f9] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-6xl h-[94vh] relative bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-200">
        
        {mode === 'user' && (
          <button
            onClick={() => setShowPasswordModal(true)}
            className="absolute top-6 right-8 z-20 flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md text-slate-500 rounded-xl hover:bg-slate-900 hover:text-white transition-all text-[11px] font-black uppercase tracking-widest border border-slate-200 shadow-sm"
          >
            <Settings size={14} />
            <span>管理画面 {files.length === 0 && '(未登録)'}</span>
          </button>
        )}

        {mode === 'user' ? (
          <ChatInterface files={files} onSaveHistory={handleSaveHistory} />
        ) : (
          <AdminDashboard 
            files={files} 
            chatHistory={chatHistory}
            onAddFiles={f => setFiles(prev => [...prev, ...f])} 
            onDeleteFile={id => setFiles(prev => prev.filter(f => f.id !== id))}
            onUpdateFiles={f => setFiles(f)}
            onClearHistory={handleClearHistory}
            onExit={() => setMode('user')}
          />
        )}
      </div>

      {showPasswordModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><ShieldCheck size={28} /></div>
                <div>
                  <h3 className="text-xl font-bold">管理者認証</h3>
                  <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Admin access required</p>
                </div>
              </div>
              <button onClick={() => setShowPasswordModal(false)} className="p-2 text-slate-300 hover:text-slate-600"><X size={24} /></button>
            </div>
            <form onSubmit={e => { e.preventDefault(); handleAdminAccess(); }}>
              <input
                autoFocus type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="パスワードを入力"
                className={`w-full px-6 py-4 rounded-2xl border-2 mb-6 outline-none transition-all text-lg tracking-widest ${passwordError ? 'border-red-400 bg-red-50' : 'border-slate-100 bg-slate-50 focus:border-blue-500'}`}
              />
              <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all">ログイン</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
