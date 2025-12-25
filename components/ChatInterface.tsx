
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, FileText, X, Sparkles, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Message, RuleFile } from '../types';
import { getGeminiResponseStream, generatePersonaImage } from '../services/geminiService';

// --- Utility: Robust ID Generator ---
const generateId = () => {
  try {
    return crypto.randomUUID();
  } catch (e) {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
};

// --- Sub-components ---

const ReferenceModal = React.memo(({ reference, onClose }: { reference: { fileName: string; excerpt: string }; onClose: () => void }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
      <div className="px-8 py-6 border-b flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-600 text-white rounded-xl shadow-lg"><BookOpen size={24} /></div>
          <div>
            <h3 className="font-bold text-slate-900 text-xl">参照箇所の確認</h3>
            <p className="text-[10px] text-blue-600 font-black uppercase tracking-widest">{reference.fileName}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-all hover:rotate-90 text-slate-400"><X size={28} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-10 lg:p-12 bg-[#fafbfc]">
        <div className="max-w-2xl mx-auto bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
          <div className="prose prose-slate prose-lg max-w-none leading-relaxed text-slate-800 font-medium whitespace-pre-wrap">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {reference.excerpt}
            </ReactMarkdown>
          </div>
        </div>
        <p className="text-center text-[11px] text-slate-400 mt-6 font-bold uppercase tracking-widest italic">
          — End of referenced section —
        </p>
      </div>
      <div className="p-8 bg-white border-t flex justify-center">
        <button onClick={onClose} className="px-12 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-xl active:scale-95">閉じる</button>
      </div>
    </div>
  </div>
));

// --- Main Component ---

interface ChatInterfaceProps {
  files: RuleFile[];
  onSaveHistory?: (query: string, response: string) => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ files, onSaveHistory }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', content: `うむ、よく来たな。[SPLIT]儂は創業者・尾上しげきである。我が社の就業規則について、疑問があれば何なりと聞きたまえ。`, timestamp: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [icons, setIcons] = useState({ shigeki: '', user: '' });
  const [selectedReference, setSelectedReference] = useState<{ fileName: string; excerpt: string } | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadIcons = async () => {
      const savedS = localStorage.getItem('s_p_v6'), savedU = localStorage.getItem('u_p_v6');
      if (savedS && savedU) return setIcons({ shigeki: savedS, user: savedU });

      const [sImg, uImg] = await Promise.all([
        generatePersonaImage("High-quality anime-realism, BUST-UP PORTRAIT, Japanese elder founder, Meiji era, formal black suit, dignified expression, library background."),
        generatePersonaImage("Clean anime style, BUST-UP PORTRAIT, modern Japanese male office worker, friendly professional expression, blue shirt, office background.")
      ]);
      setIcons({ shigeki: sImg, user: uImg });
      localStorage.setItem('s_p_v6', sImg); localStorage.setItem('u_p_v6', uImg);
    };
    loadIcons();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isLoading]);

  const renderContent = useCallback((content: string) => {
    const parts = content.split(/【参照】|参照[:：]/);
    const bodyText = parts[0] || "";
    const refText = parts.slice(1).join("\n");
    const bubbles = bodyText.split('[SPLIT]').map(s => s.trim()).filter(Boolean);
    
    const refsMap = new Map<string, string[]>();
    refText.split('\n').forEach(line => {
      const trimmed = line.replace(/^[-\s*・\d.]+/, '').trim();
      if (!trimmed) return;
      const colonIdx = trimmed.search(/[:：]/);
      if (colonIdx > -1) {
        let fileName = trimmed.slice(0, colonIdx).trim();
        let excerpt = trimmed.slice(colonIdx + 1).trim();

        const labelPattern = /^(ファイル名|ファイル|Document|File)[:：]\s*/i;
        if (labelPattern.test(fileName)) {
          const cleanedFileName = fileName.replace(labelPattern, '').trim();
          if (cleanedFileName) {
            fileName = cleanedFileName;
          } else {
            const subColonIdx = excerpt.search(/[:：]/);
            if (subColonIdx > -1) {
              fileName = excerpt.slice(0, subColonIdx).trim();
              excerpt = excerpt.slice(subColonIdx + 1).trim();
            }
          }
        }

        if (fileName && fileName !== "ファイル名" && excerpt) {
          const current = refsMap.get(fileName) || [];
          refsMap.set(fileName, [...current, excerpt]);
        }
      }
    });

    const refs = Array.from(refsMap.entries()).map(([fileName, excerpts]) => ({
      fileName,
      excerpt: excerpts.join('\n\n---\n\n')
    }));

    return { bubbles, refs };
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input;
    const userMsgId = generateId();
    const assistantMsgId = generateId();

    // ユーザーメッセージとアシスタントのプレースホルダーを同時に追加
    setMessages(prev => [
      ...prev, 
      { id: userMsgId, role: 'user', content: userText, timestamp: Date.now() },
      { id: assistantMsgId, role: 'assistant', content: '', timestamp: Date.now() + 1 }
    ]);
    
    setInput('');
    setIsLoading(true);

    const history = messages.slice(-6).map(m => ({ 
      role: m.role, 
      text: m.content.split(/【参照】|参照[:：]/)[0].replace(/\[SPLIT\]/g, '') 
    }));

    try {
      const stream = await getGeminiResponseStream(userText, files, history);
      setIsLoading(false);

      let full = '';
      for await (const chunk of stream) {
        if (chunk.text) {
          full += chunk.text;
          // IDを指定して確実に特定の吹き出しを更新
          setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: full } : m));
        }
      }
      
      if (onSaveHistory) {
        onSaveHistory(userText, full);
      }
    } catch (err) {
      setIsLoading(false);
      setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: "通信の調子が悪いようです。恐れ入りますが、もう一度お試しください。" } : m));
    }
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans">
      {selectedReference && <ReferenceModal reference={selectedReference} onClose={() => setSelectedReference(null)} />}

      <div className="h-28 bg-[#0c1016] text-white px-8 flex items-center justify-start border-b border-amber-900/10 shrink-0">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-amber-500/20 bg-slate-900 ring-8 ring-amber-500/5">
            <img src={icons.shigeki || "https://api.dicebear.com/7.x/avataaars/svg?seed=F"} className="w-full h-full object-cover scale-110" alt="S" />
          </div>
          <div>
            <h2 className="font-bold text-2xl text-amber-50">創業者 尾上しげき</h2>
            <div className="flex items-center gap-2 mt-1">
              <Sparkles size={14} className="text-amber-500" /><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Heritage AI Engine</p>
            </div>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 p-8 lg:p-12 overflow-y-auto space-y-10 bg-[#f8fafc] scroll-smooth">
        {messages.map((m) => {
          if (m.role === 'user') return (
            <div key={m.id} className="flex justify-end animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="flex gap-4 max-w-[80%] flex-row-reverse items-start">
                <div className="w-12 h-12 shrink-0 rounded-xl overflow-hidden border-2 border-white shadow-md">
                  <img src={icons.user || "https://api.dicebear.com/7.x/avataaars/svg?seed=U"} className="w-full h-full object-cover" alt="U" />
                </div>
                <div className="p-5 bg-blue-600 text-white rounded-[1.5rem] rounded-tr-none shadow-lg text-lg font-medium">{m.content}</div>
              </div>
            </div>
          );

          const { bubbles, refs } = renderContent(m.content);
          // 内容が空（ストリーム開始前）の場合は一時的に非表示にするかローダーを待つ
          if (bubbles.length === 0 && !isLoading) return null;

          return (
            <div key={m.id} className="flex flex-col gap-6">
              {bubbles.map((b, idx) => (
                <div key={`${m.id}-b-${idx}`} className="flex justify-start animate-in fade-in slide-in-from-left-4 duration-500">
                  <div className="flex gap-5 max-w-[85%] items-start">
                    <div className={`w-14 h-14 shrink-0 rounded-2xl overflow-hidden border-2 border-amber-600/20 shadow-xl scale-110 ${idx > 0 ? 'invisible h-0' : ''}`}>
                      <img src={icons.shigeki} className="w-full h-full object-cover" alt="S" />
                    </div>
                    <div className="p-6 bg-white border border-slate-100 text-slate-900 rounded-[2rem] rounded-tl-none shadow-sm text-lg leading-relaxed font-medium">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{b}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {refs.length > 0 && (
                <div className="flex flex-wrap gap-3 pl-20 animate-in fade-in slide-in-from-bottom-2 duration-700">
                  {refs.map((r, i) => (
                    <button key={`${m.id}-ref-${i}`} onClick={() => setSelectedReference(r)} className="flex items-center gap-3 px-5 py-3 bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50/10 text-slate-700 rounded-xl text-sm font-bold shadow-sm transition-all hover:-translate-y-1 group">
                      <FileText size={18} className="text-blue-600 group-hover:text-blue-500" />
                      <span className="truncate max-w-[250px]">{r.fileName}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {isLoading && (
          <div className="flex justify-start gap-5 pl-20">
            <div className="p-5 bg-white border border-slate-100 rounded-2xl flex items-center gap-3 shadow-sm border-blue-100 bg-blue-50/10">
              <Loader2 className="animate-spin text-blue-500" size={20} />
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">規則を照合しています...</span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-8 border-t bg-white shrink-0 shadow-2xl z-10">
        <div className="relative max-w-5xl mx-auto">
          <input
            type="text" value={input} onChange={e => setInput(e.target.value)}
            disabled={isLoading || files.length === 0}
            placeholder={files.length === 0 ? "管理画面で規則を登録してください。" : "有給休暇の取得条件を教えてください。"}
            className="w-full pl-8 pr-20 py-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] focus:ring-4 focus:ring-blue-500/5 focus:border-blue-500 outline-none text-xl transition-all"
          />
          <button type="submit" disabled={!input.trim() || isLoading || files.length === 0} className="absolute right-3 top-1/2 -translate-y-1/2 p-4 bg-slate-900 text-amber-50 rounded-full hover:bg-slate-800 transition-all shadow-xl active:scale-90 disabled:opacity-20">
            {isLoading ? <Loader2 className="animate-spin" size={28} /> : <Send size={28} />}
          </button>
        </div>
      </form>
    </div>
  );
};
