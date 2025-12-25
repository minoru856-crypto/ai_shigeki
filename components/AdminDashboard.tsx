
import { RuleFile, ChatHistoryItem, GoogleDriveConfig } from '../types';
import React, { useState, useEffect } from 'react';
import { Upload, FileText, Trash2, Shield, Database, Loader2, ArrowLeft, AlertCircle, Clock, Download, MessageSquare, History, Cloud, CloudOff, RefreshCw, Key } from 'lucide-react';
import { extractTextFromPdf } from '../services/pdfService';
import { googleDriveService } from '../services/googleDriveService';

interface AdminDashboardProps {
  files: RuleFile[];
  chatHistory: ChatHistoryItem[];
  onAddFiles: (newFiles: RuleFile[]) => void;
  onDeleteFile: (id: string) => void;
  onClearHistory: () => void;
  onUpdateFiles: (files: RuleFile[]) => void;
  onExit: () => void;
}

type AdminTab = 'documents' | 'history' | 'cloud';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  files, 
  chatHistory,
  onAddFiles, 
  onDeleteFile, 
  onClearHistory,
  onUpdateFiles,
  onExit 
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('documents');
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'error' | 'success' | 'info' } | null>(null);

  // Google Drive Config
  const [gdConfig, setGdConfig] = useState<GoogleDriveConfig>(() => {
    const saved = localStorage.getItem('gd_config');
    return saved ? JSON.parse(saved) : { clientId: '', apiKey: '', isConnected: false };
  });

  useEffect(() => {
    localStorage.setItem('gd_config', JSON.stringify(gdConfig));
  }, [gdConfig]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const fileList: File[] = Array.from(selectedFiles);
    setIsUploading(true);
    setStatusMessage(null);
    setUploadProgress({ current: 0, total: fileList.length });

    const newRuleFiles: RuleFile[] = [];
    const errors: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setUploadProgress({ current: i + 1, total: fileList.length });

      if (!file.name.toLowerCase().endsWith('.pdf')) {
        errors.push(`${file.name}: PDFではありません。`);
        continue;
      }

      try {
        const text = await extractTextFromPdf(file);
        newRuleFiles.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          uploadedAt: Date.now(),
          content: text,
          size: file.size,
        });
      } catch (err) {
        errors.push(`${file.name}: 解析失敗。`);
      }
    }

    if (newRuleFiles.length > 0) onAddFiles(newRuleFiles);
    if (errors.length > 0) setStatusMessage({ text: `${errors.length}件の失敗があります。`, type: 'error' });
    
    setIsUploading(false);
    if (e.target) e.target.value = '';
  };

  const handleCloudConnect = async () => {
    if (!gdConfig.clientId || !gdConfig.apiKey) {
      setStatusMessage({ text: "Client ID と API Key を入力してください。", type: 'error' });
      return;
    }

    setIsSyncing(true);
    try {
      await googleDriveService.init(gdConfig.clientId, gdConfig.apiKey);
      await googleDriveService.connect();
      setGdConfig(prev => ({ ...prev, isConnected: true }));
      setStatusMessage({ text: "Google Drive に接続しました。", type: 'success' });
    } catch (err) {
      console.error(err);
      setStatusMessage({ text: "接続に失敗しました。設定を確認してください。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCloudPush = async () => {
    setIsSyncing(true);
    try {
      await googleDriveService.saveFiles(files);
      setGdConfig(prev => ({ ...prev, lastSync: Date.now() }));
      setStatusMessage({ text: "クラウドへ保存しました。", type: 'success' });
    } catch (err) {
      setStatusMessage({ text: "保存に失敗しました。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCloudPull = async () => {
    setIsSyncing(true);
    try {
      const cloudFiles = await googleDriveService.loadFiles();
      if (cloudFiles && cloudFiles.length > 0) {
        onUpdateFiles(cloudFiles);
        setGdConfig(prev => ({ ...prev, lastSync: Date.now() }));
        setStatusMessage({ text: "クラウドから同期しました。", type: 'success' });
      } else {
        setStatusMessage({ text: "クラウドにデータが見つかりませんでした。", type: 'info' });
      }
    } catch (err) {
      setStatusMessage({ text: "同期に失敗しました。", type: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportCSV = () => {
    if (chatHistory.length === 0) return;
    const headers = ["日時", "質問", "回答"];
    const rows = chatHistory.map(item => [
      new Date(item.timestamp).toLocaleString('ja-JP'),
      `"${item.query.replace(/"/g, '""')}"`,
      `"${item.response.replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chat_history_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-900 text-white p-5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-amber-500 rounded-xl shadow-lg"><Shield size={24} /></div>
          <div>
            <h2 className="font-bold text-lg leading-none mb-1">管理者ダッシュボード</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Rule Management System</p>
          </div>
        </div>
        <button onClick={onExit} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-bold transition-all border border-slate-700 active:scale-95">
          <ArrowLeft size={16} /><span>戻る</span>
        </button>
      </div>

      <div className="flex bg-white border-b border-slate-200 px-6">
        <button onClick={() => setActiveTab('documents')} className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'documents' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>
          <Database size={18} />ドキュメント
        </button>
        <button onClick={() => setActiveTab('cloud')} className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'cloud' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>
          <Cloud size={18} />クラウド同期
        </button>
        <button onClick={() => setActiveTab('history')} className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'history' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-400'}`}>
          <History size={18} />回答履歴
        </button>
      </div>

      <div className="p-8 overflow-y-auto flex-1 bg-[#f8fafc]">
        {statusMessage && (
          <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 animate-in fade-in duration-300 ${
            statusMessage.type === 'error' ? 'bg-red-50 border-red-200 text-red-600' : 
            statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 
            'bg-blue-50 border-blue-200 text-blue-600'
          }`}>
            <AlertCircle size={18} />
            <p className="text-sm font-bold">{statusMessage.text}</p>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-10 animate-in fade-in duration-300">
            <section>
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4 px-2">
                <Upload size={14} />新規インポート
              </h3>
              <div className="relative border-2 border-dashed border-slate-300 rounded-3xl p-10 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all bg-white shadow-sm group cursor-pointer">
                <input type="file" accept=".pdf" multiple onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" disabled={isUploading} />
                <div className="flex flex-col items-center">
                  {isUploading ? (
                    <>
                      <Loader2 size={48} className="text-blue-500 animate-spin mb-4" />
                      <p className="text-slate-800 font-bold">解析中... {uploadProgress.current}/{uploadProgress.total}</p>
                    </>
                  ) : (
                    <>
                      <div className="p-5 bg-blue-50 text-blue-600 rounded-full mb-4 group-hover:scale-110 transition-transform"><Upload size={32} /></div>
                      <p className="text-slate-800 font-bold text-lg">就業規則(PDF)をドラッグ＆ドロップ</p>
                    </>
                  )}
                </div>
              </div>
            </section>

            <section>
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2 px-2">
                <FileText size={14} />登録済み ({files.length})
              </h4>
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y">
                {files.length > 0 ? files.map(f => (
                  <div key={f.id} className="p-4 flex items-center justify-between hover:bg-slate-50 group">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-100 text-slate-400 rounded-lg"><FileText size={18} /></div>
                      <div>
                        <span className="text-sm font-bold text-slate-700 block">{f.name}</span>
                        <span className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(1)} KB</span>
                      </div>
                    </div>
                    <button onClick={() => onDeleteFile(f.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={16} /></button>
                  </div>
                )) : (
                  <div className="p-12 text-center text-slate-400 italic text-sm">ファイルがありません</div>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'cloud' && (
          <div className="space-y-8 animate-in fade-in duration-300 max-w-2xl mx-auto">
            <section className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <div className="flex items-center gap-4 mb-8">
                <div className={`p-4 rounded-2xl ${gdConfig.isConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {gdConfig.isConnected ? <Cloud size={32} /> : <CloudOff size={32} />}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Google Drive クラウド同期</h3>
                  <p className="text-xs text-slate-500 mt-1">複数の端末でデータを共有できます</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Google Cloud Client ID</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="text" 
                      value={gdConfig.clientId} 
                      onChange={e => setGdConfig(prev => ({ ...prev, clientId: e.target.value, isConnected: false }))}
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/5 outline-none font-mono text-xs" 
                      placeholder="XXXXX.apps.googleusercontent.com"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Google Cloud API Key</label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                    <input 
                      type="password" 
                      value={gdConfig.apiKey} 
                      onChange={e => setGdConfig(prev => ({ ...prev, apiKey: e.target.value, isConnected: false }))}
                      className="w-full pl-12 pr-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/5 outline-none font-mono text-xs" 
                      placeholder="API_KEY"
                    />
                  </div>
                </div>

                {!gdConfig.isConnected ? (
                  <button 
                    onClick={handleCloudConnect} 
                    disabled={isSyncing}
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 active:scale-95 disabled:opacity-50"
                  >
                    {isSyncing ? <Loader2 className="animate-spin" size={24} /> : <Cloud size={24} />}
                    Google Drive に接続
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={handleCloudPush} 
                      disabled={isSyncing}
                      className="py-5 bg-slate-900 text-white rounded-2xl font-bold flex flex-col items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-50"
                    >
                      <Upload size={20} />
                      <span>クラウドへ保存</span>
                      <span className="text-[9px] opacity-50 font-normal">現在のデータをアップロード</span>
                    </button>
                    <button 
                      onClick={handleCloudPull} 
                      disabled={isSyncing}
                      className="py-5 bg-white border-2 border-slate-200 text-slate-900 rounded-2xl font-bold flex flex-col items-center justify-center gap-2 hover:bg-slate-50 transition-all active:scale-95 disabled:opacity-50"
                    >
                      <RefreshCw className={isSyncing ? 'animate-spin' : ''} size={20} />
                      <span>クラウドから同期</span>
                      <span className="text-[9px] opacity-50 font-normal">最新データをダウンロード</span>
                    </button>
                  </div>
                )}

                {gdConfig.lastSync && (
                  <p className="text-center text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    最終同期: {new Date(gdConfig.lastSync).toLocaleString()}
                  </p>
                )}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-2"><Clock size={14} />回答履歴</h3>
              <div className="flex gap-2">
                <button onClick={handleExportCSV} disabled={chatHistory.length === 0} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95"><Download size={14} />CSV出力</button>
                <button onClick={onClearHistory} disabled={chatHistory.length === 0} className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-30 text-xs font-bold rounded-xl transition-all"><Trash2 size={14} />履歴消去</button>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              {chatHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-4 font-black text-[10px] text-slate-400 uppercase tracking-widest w-40">日時</th>
                        <th className="px-6 py-4 font-black text-[10px] text-slate-400 uppercase tracking-widest">質問内容</th>
                        <th className="px-6 py-4 font-black text-[10px] text-slate-400 uppercase tracking-widest">回答内容</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {chatHistory.map(item => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 align-top"><span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">{new Date(item.timestamp).toLocaleDateString()}</span></td>
                          <td className="px-6 py-4 align-top"><div className="flex gap-2"><MessageSquare size={14} className="text-blue-500 mt-1" /><p className="font-bold text-slate-700 line-clamp-2">{item.query}</p></div></td>
                          <td className="px-6 py-4 align-top"><p className="text-slate-500 line-clamp-3 text-xs">{item.response.split(/【参照】/)[0].replace(/\[SPLIT\]/g, ' ')}</p></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-20 text-center text-slate-400 italic">履歴はありません</div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="p-4 bg-slate-900 text-[10px] text-slate-500 text-center font-black uppercase tracking-[0.3em] border-t border-slate-800">Corporate Rule Navigator System</div>
    </div>
  );
};
