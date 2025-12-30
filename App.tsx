
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StorageService } from './services/storageService';
import { parseCsmHtml } from './services/parserService';
import { Acordao, ChatMessage } from './types';
import { analyzeJurisprudence } from './services/geminiService';

const App: React.FC = () => {
  const [isFolderSelected, setIsFolderSelected] = useState(false);
  const [acordaos, setAcordaos] = useState<Acordao[]>([]);
  const [pendingFiles, setPendingFiles] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState('https://jurisprudencia.csm.org.pt/');
  const [showDbModal, setShowDbModal] = useState(false);
  const [capturedText, setCapturedText] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'browser' | 'analysis'>('browser');
  
  const lastProcessedContent = useRef<string>('');
  const isAutoProcessing = useRef<boolean>(false);

  const autoProcessFiles = useCallback(async () => {
    if (isAutoProcessing.current || !StorageService.isReady()) return;
    
    const raw = await StorageService.listRawFiles();
    if (raw.length === 0) {
      setPendingFiles(0);
      return;
    }

    isAutoProcessing.current = true;
    setPendingFiles(raw.length);
    
    for (const file of raw) {
      try {
        const result = parseCsmHtml(file.content, `https://jurisprudencia.csm.org.pt/${file.name}`);
        if (result.success && result.data) {
          await StorageService.saveProcessedAcordao(result.data as Acordao);
          await StorageService.deleteRawFile(file.name);
        }
      } catch (e) {
        console.error("Erro no auto-processamento:", e);
      }
    }
    
    const updatedAcordaos = await StorageService.listProcessedAcordaos();
    setAcordaos(updatedAcordaos);
    setPendingFiles(0);
    isAutoProcessing.current = false;
  }, []);

  const refreshData = useCallback(async () => {
    if (StorageService.isReady()) {
      const processed = await StorageService.listProcessedAcordaos();
      setAcordaos(processed);
      autoProcessFiles();
    }
  }, [autoProcessFiles]);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleClipboardCheck = useCallback(async () => {
    if (!isFolderSelected || isLoading || capturedText) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text === lastProcessedContent.current) return;
      
      if (text.startsWith('https://jurisprudencia.csm.org.pt/')) {
        setBrowserUrl(text);
        lastProcessedContent.current = text;
        showNotification("URL detetada. Navegando...");
      } 
      else if (text.length > 2000 && (text.includes('Acórdão') || text.includes('Processo') || text.includes('Relator'))) {
        lastProcessedContent.current = text;
        setCapturedText(text);
      }
    } catch (err) {}
  }, [isFolderSelected, isLoading, capturedText]);

  useEffect(() => {
    window.addEventListener('focus', handleClipboardCheck);
    const interval = setInterval(autoProcessFiles, 10000);
    return () => {
      window.removeEventListener('focus', handleClipboardCheck);
      clearInterval(interval);
    };
  }, [handleClipboardCheck, autoProcessFiles]);

  const confirmCapture = async () => {
    if (!capturedText) return;
    setIsLoading(true);
    try {
      const timestamp = Date.now();
      const fileName = `captura_${timestamp}`;
      await StorageService.saveRawTxt(fileName, capturedText);
      
      const result = parseCsmHtml(capturedText, browserUrl);
      if (result.success && result.data) {
        await StorageService.saveProcessedAcordao({
          ...result.data,
          id: result.data.id || `ID_${timestamp}`
        } as Acordao);
        await StorageService.deleteRawFile(fileName);
        showNotification("Acórdão capturado com sucesso!");
      }
      setCapturedText(null);
      await refreshData();
    } catch (e) {
      setError("Erro ao processar: " + (e as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivateFolder = async () => {
    try {
      const result = await StorageService.selectDirectory();
      if (result.success) {
        setIsFolderSelected(true);
        refreshData();
      }
    } catch (e) {
      setError("Acesso à pasta necessário.");
    }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading) return;
    const msg = userInput;
    setUserInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: new Date() }]);
    setIsLoading(true);
    try {
      const response = await analyzeJurisprudence(msg, messages, acordaos);
      setMessages(prev => [...prev, { role: 'assistant', content: response, timestamp: new Date() }]);
    } catch (err) {
      setError("Erro na IA: " + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
      {/* Header Premium de Navegação */}
      <header className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-xl z-40">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transform rotate-3">
             <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
          </div>
          <div className="hidden sm:block">
            <h1 className="font-black text-lg tracking-tighter leading-none">JurisAnalyzer <span className="text-indigo-400">OS</span></h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Lawtech Suite Portugal</p>
          </div>
        </div>
        
        {/* Navegação de Modos */}
        <div className="flex bg-slate-800 p-1 rounded-2xl border border-slate-700">
           <button 
             onClick={() => setActiveTab('browser')}
             className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'browser' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
           >
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
             Navegador CSM
           </button>
           <button 
             onClick={() => setActiveTab('analysis')}
             className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'analysis' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
           >
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
             Análise IA
           </button>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowDbModal(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-700 transition-all group"
          >
            <span className="text-[10px] font-black tracking-widest uppercase">Base de Dados</span>
            <div className="bg-indigo-500 text-white text-[10px] font-black px-2 py-0.5 rounded-md group-hover:scale-110 transition-transform">
              {acordaos.length}
            </div>
          </button>

          {!isFolderSelected ? (
            <button onClick={handleActivateFolder} className="bg-amber-500 hover:bg-amber-600 text-slate-900 text-[10px] font-black px-5 py-2.5 rounded-xl transition-all shadow-lg active:scale-95">
              ATIVAR REPOSITÓRIO
            </button>
          ) : (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 px-4 py-2 rounded-xl">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
              <span className="text-[9px] font-black text-green-500 uppercase tracking-tighter">Online</span>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        
        {/* LAYOUT CONDICIONAL: MODO BROWSER */}
        {activeTab === 'browser' ? (
          <div className="flex-1 flex">
             {/* Barra Lateral de Controlos Rápidos */}
             <aside className="w-16 bg-white border-r border-slate-200 flex flex-col items-center py-6 gap-6 shadow-inner">
                <button onClick={() => setBrowserUrl('https://jurisprudencia.csm.org.pt/')} className="w-10 h-10 bg-slate-100 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-xl flex items-center justify-center transition-all shadow-sm" title="Página Inicial CSM">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
                </button>
                <button onClick={() => refreshData()} className="w-10 h-10 bg-slate-100 text-slate-400 rounded-xl flex items-center justify-center hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-sm" title="Recarregar Dados">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <div className="mt-auto group cursor-help relative">
                   <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${pendingFiles > 0 ? 'bg-amber-100 text-amber-600 animate-bounce' : 'bg-slate-100 text-slate-400'}`}>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>
                   </div>
                </div>
             </aside>

             <section className="flex-1 flex flex-col bg-white">
                <div className="bg-slate-50 p-3 border-b border-slate-200 flex items-center gap-3">
                  <div className="flex-1 relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                       <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </div>
                    <input 
                      type="text" 
                      value={browserUrl}
                      onChange={(e) => setBrowserUrl(e.target.value)}
                      placeholder="Navegar para URL ou ECLI..."
                      className="w-full bg-white border border-slate-200 pl-10 pr-4 py-2 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 shadow-sm transition-all"
                    />
                  </div>
                </div>
                <div className="flex-1 relative">
                  <iframe 
                    src={browserUrl} 
                    className="w-full h-full border-none bg-white"
                    title="CSM Browser"
                  />
                  {pendingFiles > 0 && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-900 px-4 py-1.5 rounded-full shadow-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 animate-bounce border-2 border-white">
                       A processar {pendingFiles} ficheiros pendentes...
                    </div>
                  )}
                </div>
             </section>
          </div>
        ) : (
          /* LAYOUT CONDICIONAL: MODO ANÁLISE IA */
          <div className="flex-1 flex bg-slate-100">
             {/* Preview Lateral da Base de Dados na Análise */}
             <aside className="w-72 bg-white border-r border-slate-200 flex flex-col">
                <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Contexto IA</h3>
                  <span className="bg-indigo-100 text-indigo-600 text-[9px] font-black px-2 py-0.5 rounded-md">{acordaos.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                   {acordaos.map((a, i) => (
                     <div key={i} className="p-3 bg-slate-50 border border-slate-100 rounded-xl hover:border-indigo-200 transition-all">
                        <p className="text-[10px] font-black text-slate-800 truncate">{a.processo}</p>
                        <p className="text-[8px] text-slate-400 font-bold uppercase mt-1">{a.relator}</p>
                     </div>
                   ))}
                </div>
             </aside>

             {/* Chat IA Centralizado */}
             <section className="flex-1 flex flex-col max-w-4xl mx-auto bg-white shadow-2xl my-6 rounded-3xl overflow-hidden border border-slate-200">
                <div className="p-6 border-b border-slate-100 bg-white flex items-center gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-widest text-slate-900">Motor de Inteligência Jurídica</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Analisando divergências entre {acordaos.length} acórdãos</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar bg-slate-50/30">
                  {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto opacity-30">
                       <svg className="w-16 h-16 mb-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                       <h4 className="font-black text-xs uppercase mb-2">Pronto para Analisar</h4>
                       <p className="text-[10px] font-bold leading-relaxed">Ex: "Identifica contradições no entendimento da norma X nestes acórdãos."</p>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] p-5 rounded-3xl text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-white border border-slate-100 text-slate-800 rounded-tl-none'}`}>
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                       <div className="bg-white border border-slate-100 p-6 rounded-3xl rounded-tl-none w-2/3 animate-pulse shadow-sm">
                          <div className="h-2 bg-slate-200 rounded w-full mb-4"></div>
                          <div className="h-2 bg-slate-200 rounded w-5/6 mb-4"></div>
                          <div className="h-2 bg-slate-200 rounded w-4/6"></div>
                       </div>
                    </div>
                  )}
                </div>

                <div className="p-8 bg-white border-t border-slate-100">
                  <div className="relative group">
                    <input 
                      type="text" 
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Descreva o conflito jurídico para análise..."
                      className="w-full bg-slate-50 border border-slate-200 outline-none p-5 rounded-2xl text-xs font-bold pr-16 focus:bg-white focus:border-indigo-500 transition-all shadow-inner"
                      disabled={acordaos.length === 0 || isLoading}
                    />
                    <button 
                      onClick={handleSendMessage} 
                      className="absolute right-3 top-3 bg-indigo-600 text-white w-12 h-12 rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-30 flex items-center justify-center shadow-lg active:scale-90"
                      disabled={!userInput.trim() || acordaos.length === 0 || isLoading}
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                  {acordaos.length === 0 && (
                    <p className="text-[9px] text-center text-amber-600 font-black uppercase mt-4 tracking-[0.2em] animate-pulse">Base de dados vazia - Regresse ao navegador para capturar acórdãos</p>
                  )}
                </div>
             </section>
          </div>
        )}
      </main>

      {/* MODAL DE CAPTURA (CTRL+A + CTRL+C) - Sempre visível se houver captura */}
      {capturedText && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-900/75 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl h-[85vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
            <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
              <div>
                <h3 className="font-black text-sm uppercase tracking-[0.3em]">Captura de Jurisprudência</h3>
                <p className="text-[10px] font-bold text-indigo-100 mt-2 uppercase">Deteção inteligente de texto integral. Confirme para processar.</p>
              </div>
              <button onClick={() => setCapturedText(null)} className="w-12 h-12 rounded-2xl hover:bg-white/10 transition-colors flex items-center justify-center font-bold text-xl">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 bg-slate-50 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-all custom-scrollbar text-slate-600">
              {capturedText}
            </div>
            
            <div className="p-8 bg-white border-t border-slate-100 flex justify-end gap-6 items-center">
              <button 
                onClick={() => setCapturedText(null)} 
                className="text-[11px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest"
              >
                Ignorar
              </button>
              <button 
                onClick={confirmCapture} 
                disabled={isLoading}
                className="bg-indigo-600 text-white px-12 py-4 rounded-2xl text-[11px] font-black shadow-2xl hover:bg-indigo-700 transition-all flex items-center gap-3 transform active:scale-95 group"
              >
                {isLoading ? 'A PROCESSAR...' : 'GUARDAR E INDEXAR ACÓRDÃO'}
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REPOSITÓRIO JSON */}
      {showDbModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-12 bg-slate-900/85 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-6xl h-full rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-black tracking-tighter text-slate-900 uppercase">Repositório Indexado</h2>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-2">{acordaos.length} registos estruturados disponíveis para o Gemini</p>
              </div>
              <button onClick={() => setShowDbModal(false)} className="w-14 h-14 rounded-3xl bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-100 flex items-center justify-center transition-all shadow-sm font-bold text-2xl">
                ✕
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              {acordaos.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                   <svg className="w-16 h-16 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                   <p className="font-bold uppercase tracking-widest text-[10px]">Aguardando Capturas do CSM</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {acordaos.map((a, i) => (
                    <div key={i} className="bg-white border border-slate-100 p-8 rounded-[32px] hover:border-indigo-500 transition-all shadow-sm hover:shadow-xl relative group">
                       <div className="text-[10px] font-black text-indigo-600 mb-3">{a.data}</div>
                       <h4 className="text-sm font-black text-slate-800 mb-2 leading-tight">{a.processo}</h4>
                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-6">{a.relator}</p>
                       <div className="pt-6 border-t border-slate-50 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[9px] font-bold text-slate-300">ECLI ID: {a.ecli.substring(0, 15)}...</span>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(JSON.stringify(a, null, 2));
                              showNotification("Estrutura JSON copiada.");
                            }}
                            className="text-[10px] font-black text-indigo-600 hover:underline"
                          >
                            COPIAR JSON
                          </button>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="p-10 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-6">
               <button onClick={() => StorageService.downloadJson(acordaos, 'juris_full_export')} className="bg-slate-900 text-white px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 shadow-xl">
                 Exportar Base de Dados Local
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Toasts e Erros */}
      {notification && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center gap-4 z-[120] border border-indigo-500 animate-in fade-in slide-in-from-bottom-12">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
          <span className="text-xs font-black uppercase tracking-[0.2em]">{notification}</span>
        </div>
      )}
      
      {error && (
        <div className="fixed top-28 right-10 bg-red-600 text-white px-8 py-5 rounded-3xl shadow-2xl z-[120] flex items-center gap-6 border-2 border-red-500 animate-in slide-in-from-right-12">
          <span className="text-xs font-bold leading-tight">{error}</span>
          <button onClick={() => setError(null)} className="text-white/40 hover:text-white font-bold text-lg">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
