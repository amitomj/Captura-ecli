
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
  const lastProcessedContent = useRef<string>('');
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
      if (!text || text === lastProcessedContent.current) return;
      
      // Caso 1: É um URL do CSM
      if (text.startsWith('https://jurisprudencia.csm.org.pt/')) {
        lastProcessedContent.current = text;
        setIsLoading(true);
        showNotification("URL detetada. A capturar...");
        try {
          const html = await fetchAcordaoHtml(text);
          const fileName = text.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
          await StorageService.saveRawTxt(fileName, html);
          await refreshData();
          showNotification("Rascunho capturado via URL.");
        } catch (e) {
          setError("Erro CORS: Por favor, faça Ctrl+A e Ctrl+C no texto do acórdão.");
        } finally {
          setIsLoading(false);
        }
      } 
      // Caso 2: É conteúdo de texto longo (provavelmente Ctrl+A + Ctrl+C)
      else if (text.length > 2000 && (text.includes('Acórdão') || text.includes('Processo'))) {
        lastProcessedContent.current = text;
        const fileName = `manual_${new Date().getTime()}`;
        await StorageService.saveRawTxt(fileName, text);
        await refreshData();
        showNotification("Conteúdo copiado guardado como rascunho.");
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
        showNotification("Acórdão convertido para JSON.");
      } else {
        setError(result.error || "Erro na extração.");
      }
    } catch (e) {
      setError("Falha crítica: " + (e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivateFolder = async () => {
    try {
      const result = await StorageService.selectDirectory();
      if (result.success) {
        setIsFolderSelected(true);
        setTimeout(refreshData, 100);
      }
    } catch (e) {
      setError("Acesso à pasta negado.");
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
    <div className="h-screen bg-slate-100 flex flex-col font-sans text-slate-900 overflow-hidden">
      {/* Header Compacto */}
      <header className="bg-slate-900 text-white px-6 py-3 flex justify-between items-center shadow-lg z-20">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-lg">J</div>
          <h1 className="font-bold tracking-tight text-lg">JurisAnalyzer <span className="text-indigo-400 font-normal">v4.5</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 text-[10px] font-bold px-3 py-1.5 rounded-full bg-slate-800 border ${isFolderSelected ? 'border-green-500/50 text-green-400' : 'border-red-500/50 text-red-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isFolderSelected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            {isFolderSelected ? 'REPOSITÓRIO ATIVO' : 'PASTA DESLIGADA'}
          </div>
          
          <div className="flex gap-2">
            <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-slate-800 rounded-lg transition-colors" title="Importar JSON">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            </button>
            <button onClick={() => StorageService.downloadJson(acordaos, 'export_juris')} className="p-2 hover:bg-slate-800 rounded-lg transition-colors" title="Exportar Tudo">
              <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4-4v12" /></svg>
            </button>
            <input type="file" ref={fileInputRef} onChange={(e) => {/* impl import logic */}} className="hidden" accept=".json" />
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* COLUNA 1: REPOSITÓRIO (20%) */}
        <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shadow-inner">
          <div className="p-4 bg-slate-50 border-b border-slate-200">
            {!isFolderSelected ? (
              <button 
                onClick={handleActivateFolder} 
                className="w-full bg-indigo-600 text-white text-[10px] font-black py-3 rounded-xl hover:bg-indigo-700 transition-all shadow-md active:scale-95"
              >
                ATIVAR PASTA TRABALHO
              </button>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ficheiros</span>
                <button onClick={refreshData} className="text-indigo-600 hover:rotate-180 transition-all duration-500">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {/* Rascunhos Section */}
            <div>
              <h3 className="text-[9px] font-black text-amber-600 uppercase mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                Rascunhos ({rawFiles.length})
              </h3>
              <div className="space-y-2">
                {rawFiles.map((f, i) => (
                  <div key={i} className="group bg-slate-50 border border-slate-200 p-2.5 rounded-lg hover:border-amber-400 transition-all cursor-default">
                    <p className="text-[10px] font-bold text-slate-700 truncate mb-1.5">{f.name}</p>
                    <button onClick={() => extractFile(f)} className="w-full bg-white border border-slate-200 text-[8px] font-black py-1.5 rounded-md group-hover:bg-amber-500 group-hover:text-white transition-all">PROCESSAR</button>
                  </div>
                ))}
              </div>
            </div>

            {/* Base de Dados Section */}
            <div>
              <h3 className="text-[9px] font-black text-indigo-600 uppercase mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></div>
                Base de Dados ({acordaos.length})
              </h3>
              <div className="space-y-2">
                {acordaos.map((a, i) => (
                  <div key={i} className="bg-white border border-slate-200 p-2.5 rounded-lg shadow-sm">
                    <p className="text-[10px] font-black text-slate-800 truncate">{a.processo}</p>
                    <p className="text-[8px] text-slate-400 font-bold mt-1 uppercase">{a.relator} | {a.data}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* COLUNA 2: BROWSER CSM (45%) */}
        <section className="flex-1 flex flex-col bg-white border-r border-slate-200 relative">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <div className="flex items-center gap-2">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
              Navegador Jurisprudência CSM
            </div>
            <a href="https://jurisprudencia.csm.org.pt/" target="_blank" className="hover:text-indigo-600 transition-colors">Abrir noutra aba ↗</a>
          </div>
          <div className="flex-1 bg-slate-200 relative">
            <iframe 
              src="https://jurisprudencia.csm.org.pt/" 
              className="w-full h-full border-none"
              title="CSM Browser"
            />
            {/* Overlay informativo flutuante */}
            <div className="absolute bottom-4 right-4 bg-slate-900/80 text-white p-3 rounded-lg backdrop-blur-sm text-[9px] font-bold pointer-events-none">
              DICA: Faça Ctrl+A e Ctrl+C num acórdão para importar.
            </div>
          </div>
        </section>

        {/* COLUNA 3: ANÁLISE IA (35%) */}
        <section className="w-1/3 flex flex-col bg-slate-50 relative">
          <div className="p-4 border-b border-slate-200 bg-white flex items-center gap-2">
             <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
             <h2 className="text-[11px] font-black uppercase tracking-widest">Motor de Análise IA</h2>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-6">
                <div className="w-12 h-12 bg-white rounded-xl shadow-md flex items-center justify-center mb-4 text-indigo-600 border border-slate-100">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                </div>
                <p className="text-[11px] font-bold text-slate-400 leading-relaxed uppercase tracking-tight">
                  Selecione acórdãos à esquerda e pergunte por divergências ou resumos aqui.
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] p-4 rounded-2xl shadow-sm text-xs leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-slate-900 text-white rounded-tr-none' 
                      : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-white border border-slate-200 p-4 rounded-2xl rounded-tl-none w-2/3">
                  <div className="h-2 bg-slate-200 rounded w-full mb-2"></div>
                  <div className="h-2 bg-slate-200 rounded w-3/4"></div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input Bar */}
          <div className="p-4 bg-white border-t border-slate-200">
            <div className="relative">
              <input 
                type="text" 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Questão jurídica..."
                className="w-full bg-slate-50 border border-slate-200 outline-none pl-4 pr-12 py-3 rounded-xl text-xs font-bold focus:bg-white focus:border-indigo-500 transition-all"
                disabled={acordaos.length === 0 || isLoading}
              />
              <button 
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim() || acordaos.length === 0}
                className="absolute right-2 top-1.5 bg-indigo-600 text-white w-8 h-8 rounded-lg hover:bg-indigo-700 disabled:bg-slate-200 flex items-center justify-center transition-all"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Notificações Toasts */}
      {notification && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 z-50 border border-indigo-500 animate-in fade-in slide-in-from-bottom-4">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
          <span className="text-[10px] font-black uppercase tracking-widest">{notification}</span>
        </div>
      )}

      {error && (
        <div className="fixed top-20 right-6 bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 z-[60] animate-in slide-in-from-right-4">
          <div className="text-sm font-bold">{error}</div>
          <button onClick={() => setError(null)} className="text-white/50 hover:text-white font-bold">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
