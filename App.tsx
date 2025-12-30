
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StorageService } from './services/storageService';
import { parseCsmHtml, fetchAcordaoHtml } from './services/parserService';
import { Acordao, ChatMessage } from './types';
import { analyzeJurisprudence } from './services/geminiService';

const App: React.FC = () => {
  const [isFolderSelected, setIsFolderSelected] = useState(false);
  const [rawFiles, setRawFiles] = useState<{name: string, content: string}[]>([]);
  const [acordaos, setAcordaos] = useState<Acordao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const lastProcessedUrl = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshData = useCallback(async () => {
    if (StorageService.isReady()) {
      const raw = await StorageService.listRawFiles();
      const processed = await StorageService.listProcessedAcordaos();
      setRawFiles(raw);
      setAcordaos(processed);
    }
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleClipboardCheck = useCallback(async () => {
    if (!isMonitoring || !isFolderSelected || isLoading) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text.startsWith('https://jurisprudencia.csm.org.pt/') && text !== lastProcessedUrl.current) {
        lastProcessedUrl.current = text;
        setIsLoading(true);
        showNotification("Link detetado. A capturar...");
        try {
          const html = await fetchAcordaoHtml(text);
          const fileName = text.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
          await StorageService.saveRawTxt(fileName, html);
          await refreshData();
          showNotification("Captura .txt concluída!");
        } catch (e) {
          const htmlContent = prompt("O CSM bloqueou o acesso direto. Cole aqui o conteúdo (Ctrl+A / Ctrl+C na página do CSM):");
          if (htmlContent) {
            const fileName = text.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
            await StorageService.saveRawTxt(fileName, htmlContent);
            await refreshData();
          }
        } finally {
          setIsLoading(false);
        }
      }
    } catch (err) {}
  }, [isMonitoring, isFolderSelected, isLoading, refreshData]);

  useEffect(() => {
    window.addEventListener('focus', handleClipboardCheck);
    return () => window.removeEventListener('focus', handleClipboardCheck);
  }, [handleClipboardCheck]);

  const extractFile = async (file: {name: string, content: string}) => {
    setIsLoading(true);
    try {
      const result = parseCsmHtml(file.content, `https://jurisprudencia.csm.org.pt/${file.name}`);
      if (result.success && result.data) {
        await StorageService.saveProcessedAcordao(result.data as Acordao);
        await StorageService.deleteRawFile(file.name);
        await refreshData();
        showNotification("Acórdão convertido em JSON!");
      }
    } catch (e) {
      setError("Erro ao processar: " + (e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.ecli) await StorageService.saveProcessedAcordao(item);
      }
      await refreshData();
      showNotification("Sessão carregada com sucesso!");
    } catch (e) {
      setError("Ficheiro JSON inválido.");
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading) return;
    const newUserMessage: ChatMessage = { role: 'user', content: userInput, timestamp: new Date() };
    setMessages(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsLoading(true);
    try {
      const response = await analyzeJurisprudence(userInput, messages, acordaos);
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date() }]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Header Fino */}
      <header className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-slate-900">J</div>
          <h1 className="font-black tracking-tight text-lg">JurisAnalyzer <span className="text-amber-500 italic">v4.0</span></h1>
        </div>
        <div className="flex gap-4">
          <button onClick={() => fileInputRef.current?.click()} className="text-[11px] font-bold uppercase tracking-widest bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-full border border-slate-700 transition">
            Importar JSON
          </button>
          <button onClick={() => StorageService.downloadJson(acordaos, `juris_export_${Date.now()}`)} className="text-[11px] font-bold uppercase tracking-widest bg-amber-500 hover:bg-amber-400 text-slate-900 px-4 py-2 rounded-full transition">
            Exportar Tudo
          </button>
          <input type="file" ref={fileInputRef} onChange={handleImportJson} className="hidden" accept=".json" />
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        
        {/* Painel de Controlo Esquerdo (Gestão de Documentos) */}
        <div className="lg:col-span-4 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h2 className="font-black text-xs uppercase tracking-widest text-slate-400">Ambiente de Trabalho</h2>
              <p className="text-[10px] text-slate-500 font-medium">Pasta: {isFolderSelected ? 'Ligada' : 'Não Selecionada'}</p>
            </div>
            {!isFolderSelected && (
              <button onClick={async () => { await StorageService.selectDirectory(); setIsFolderSelected(true); refreshData(); }} 
                className="bg-indigo-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-md shadow-lg">
                ATIVAR PASTA
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {/* Secção 1: Capturados (TXT) */}
            <div>
              <div className="flex justify-between items-center mb-3 px-2">
                <h3 className="text-[11px] font-black uppercase text-slate-500 tracking-tighter flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                  Ficheiros Brutos (.txt)
                </h3>
                <span className="text-[10px] bg-slate-100 px-2 rounded-full font-bold">{rawFiles.length}</span>
              </div>
              <div className="space-y-2">
                {rawFiles.map((f, i) => (
                  <div key={i} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between group">
                    <div className="truncate flex-1 pr-4">
                      <p className="text-[11px] font-bold text-slate-700 truncate">{f.name}</p>
                      <p className="text-[9px] text-slate-400 uppercase">Aguardando Extração</p>
                    </div>
                    <button onClick={() => extractFile(f)} className="opacity-0 group-hover:opacity-100 bg-indigo-600 text-white text-[9px] font-bold px-3 py-1.5 rounded-lg transition-all transform hover:scale-105">
                      EXTRAIR JSON
                    </button>
                  </div>
                ))}
                {rawFiles.length === 0 && (
                  <div className="py-8 text-center text-slate-300 text-[10px] italic border-2 border-dashed border-slate-100 rounded-2xl">
                    Copie um link do CSM para começar...
                  </div>
                )}
              </div>
            </div>

            {/* Secção 2: Base de Dados (JSON) */}
            <div>
              <div className="flex justify-between items-center mb-3 px-2">
                <h3 className="text-[11px] font-black uppercase text-slate-500 tracking-tighter flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  Acórdãos Processados (.json)
                </h3>
                <span className="text-[10px] bg-green-100 text-green-700 px-2 rounded-full font-bold">{acordaos.length}</span>
              </div>
              <div className="space-y-2">
                {acordaos.map((a, i) => (
                  <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div className="truncate flex-1 pr-4">
                      <p className="text-[11px] font-black text-slate-800 truncate">{a.processo}</p>
                      <p className="text-[9px] text-indigo-500 font-bold uppercase">{a.relator}</p>
                    </div>
                    <div className="text-[9px] text-slate-400 font-mono">
                      {a.data}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Analista IA (Direito) */}
        <div className="lg:col-span-8 flex flex-col bg-slate-100 overflow-hidden relative">
          
          <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-20">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-xl mb-6 transform -rotate-6">
                  <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="text-2xl font-black text-slate-800 leading-tight">Análise de Jurisprudência</h3>
                <p className="text-slate-500 text-sm mt-3 leading-relaxed">
                  Utilize os {acordaos.length} acórdãos da sua base de dados para encontrar divergências, tendências ou fundamentos específicos.
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl p-5 shadow-lg ${
                    msg.role === 'user' 
                      ? 'bg-slate-900 text-white rounded-tr-none' 
                      : 'bg-white text-slate-800 rounded-tl-none border-l-4 border-amber-500'
                  }`}>
                    <div className="serif text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-6 bg-white border-t border-slate-200">
            <div className="max-w-4xl mx-auto flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
              <input 
                type="text" 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={acordaos.length > 0 ? "Pergunte sobre a jurisprudência carregada..." : "Extraia ou importe acórdãos primeiro..."}
                className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-sm font-medium"
                disabled={acordaos.length === 0 || isLoading}
              />
              <button 
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim() || acordaos.length === 0}
                className="bg-indigo-600 text-white w-12 h-12 rounded-xl hover:bg-indigo-700 disabled:bg-slate-300 transition-all flex items-center justify-center shadow-lg transform active:scale-95"
              >
                {isLoading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
              </button>
            </div>
          </div>
        </div>

        {/* Notificações Toasts */}
        {notification && (
          <div className="fixed bottom-32 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-50 border border-slate-700 animate-in fade-in slide-in-from-bottom-5">
            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
            <span className="text-[10px] font-black uppercase tracking-widest">{notification}</span>
          </div>
        )}
      </main>

      {error && (
        <div className="fixed top-20 right-10 bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-50 animate-in slide-in-from-right-10">
          <span className="text-xs font-bold">{error}</span>
          <button onClick={() => setError(null)} className="text-white/50 hover:text-white">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
