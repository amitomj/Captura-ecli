
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
      if (isFolderSelected) {
        showNotification(`Sincronizado: ${raw.length} rascunhos e ${processed.length} na base.`);
      }
    }
  }, [isFolderSelected]);

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
        showNotification("URL detetada. A capturar conteúdo...");
        try {
          const html = await fetchAcordaoHtml(text);
          const fileName = text.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
          await StorageService.saveRawTxt(fileName, html);
          await refreshData();
          showNotification("Rascunho .txt guardado.");
        } catch (e) {
          const htmlContent = prompt("Bloqueio de CORS detetado. Vá ao site do CSM, faça Ctrl+A, Ctrl+C e cole o texto aqui:");
          if (htmlContent) {
            const fileName = text.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
            await StorageService.saveRawTxt(fileName, htmlContent);
            await refreshData();
            showNotification("Conteúdo manual guardado.");
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
        showNotification("Convertido com sucesso!");
      } else {
        setError(result.error || "Erro desconhecido na extração.");
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
        // Pequeno delay para garantir que o handle está pronto
        setTimeout(refreshData, 100);
      }
    } catch (e) {
      setError("Acesso à pasta negado.");
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Suportar tanto um acórdão único como uma lista de acórdãos
      const items = Array.isArray(data) ? data : [data];
      let importedCount = 0;

      for (const item of items) {
        if (item.ecli || item.processo) {
          await StorageService.saveProcessedAcordao(item);
          importedCount++;
        }
      }
      
      await refreshData();
      showNotification(`Sucesso: ${importedCount} acórdãos importados.`);
    } catch (e) {
      setError("O ficheiro JSON não é válido ou está corrompido.");
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
      {/* Topbar Revestida */}
      <header className="bg-slate-900 text-white px-8 py-5 flex justify-between items-center shadow-2xl border-b border-indigo-500/30">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-indigo-500 to-indigo-700 w-10 h-10 rounded-xl flex items-center justify-center font-black text-white shadow-lg shadow-indigo-500/20 rotate-3">J</div>
          <div>
            <h1 className="font-black tracking-tighter text-xl leading-none">JurisAnalyzer <span className="text-indigo-400">v4.2</span></h1>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-[0.2em] mt-1.5">Legal Data Intelligence</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => fileInputRef.current?.click()} 
            className="text-[10px] font-black uppercase tracking-widest bg-slate-800 hover:bg-slate-700 px-5 py-3 rounded-xl border border-slate-700 transition-all flex items-center gap-2 hover:border-indigo-500/50"
            title="Importar um ou vários acórdãos de um ficheiro JSON"
          >
            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Carregar Sessão
          </button>
          <button 
            onClick={() => StorageService.downloadJson(acordaos, `juris_sessao_${new Date().toISOString().split('T')[0]}`)} 
            className="text-[10px] font-black uppercase tracking-widest bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
            title="Exportar todos os acórdãos processados para um ficheiro JSON único"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4-4v12" /></svg>
            Exportar Tudo
          </button>
          <input type="file" ref={fileInputRef} onChange={handleImportJson} className="hidden" accept=".json" />
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        
        {/* Painel Esquerdo: Ficheiros Locais */}
        <div className="lg:col-span-4 bg-white border-r border-slate-200 flex flex-col overflow-hidden">
          
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-black text-[10px] uppercase tracking-widest text-slate-400">Repositório Local</h2>
              <div className={`flex items-center gap-1.5 text-[9px] font-bold ${isFolderSelected ? 'text-green-600' : 'text-red-500'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isFolderSelected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                {isFolderSelected ? 'LIGADO' : 'DESLIGADO'}
              </div>
            </div>
            
            {!isFolderSelected ? (
              <button 
                onClick={handleActivateFolder} 
                className="w-full bg-slate-900 text-white text-[10px] font-black py-4 rounded-2xl shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3 active:scale-95 border-b-4 border-indigo-600"
              >
                <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                SELECIONAR PASTA DE TRABALHO
              </button>
            ) : (
              <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-indigo-900 font-black text-[10px] uppercase tracking-tighter">Pasta Ativa</p>
                  <p className="text-indigo-600/70 text-[9px] font-bold">Gerindo ficheiros individuais...</p>
                </div>
                <button onClick={refreshData} className="p-2 hover:bg-indigo-100 rounded-lg transition-colors text-indigo-600" title="Sincronizar ficheiros">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar">
            {/* Rascunhos TXT */}
            <section>
              <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.15em] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Rascunhos (.txt)
                </h3>
                <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded-md font-black text-slate-500">{rawFiles.length}</span>
              </div>
              <div className="space-y-2">
                {rawFiles.map((f, i) => (
                  <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200/50 flex items-center justify-between group hover:border-amber-300 transition-all">
                    <div className="truncate flex-1 pr-4">
                      <p className="text-[11px] font-bold text-slate-700 truncate">{f.name}</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase mt-1">Aguardando Extração</p>
                    </div>
                    <button 
                      onClick={() => extractFile(f)} 
                      className="bg-amber-500 hover:bg-amber-600 text-slate-900 text-[9px] font-black px-3 py-1.5 rounded-lg shadow-md transition-all opacity-0 group-hover:opacity-100"
                    >
                      PROCESSAR
                    </button>
                  </div>
                ))}
                {rawFiles.length === 0 && (
                  <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl px-6">
                    <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest leading-relaxed">
                      O monitor de clipboard está ativo. Copie um URL do CSM para capturar o rascunho.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Base de Dados JSON */}
            <section>
              <div className="flex justify-between items-center mb-4 px-2">
                <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.15em] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                  Base de Dados (.json)
                </h3>
                <span className="text-[9px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-md font-black">{acordaos.length}</span>
              </div>
              <div className="space-y-2">
                {acordaos.map((a, i) => (
                  <div key={i} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between hover:shadow-md hover:border-indigo-200 transition-all">
                    <div className="truncate flex-1 pr-4">
                      <p className="text-[11px] font-black text-slate-800 truncate">{a.processo}</p>
                      <div className="flex gap-2 mt-1 items-center">
                        <span className="text-[8px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-black">{a.relator}</span>
                        <span className="text-[8px] text-slate-400 font-bold">{a.data}</span>
                      </div>
                    </div>
                    <div className="text-indigo-200">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        {/* Painel Central: Análise IA */}
        <div className="lg:col-span-8 flex flex-col bg-slate-100 overflow-hidden relative">
          
          <div className="flex-1 overflow-y-auto p-12 space-y-8 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-2xl mx-auto">
                <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-2xl mb-10 border-b-8 border-indigo-600 transform -rotate-2">
                  <svg className="w-12 h-12 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
                <h3 className="text-4xl font-black text-slate-900 tracking-tight leading-none mb-6">Motor de Análise Jurídica</h3>
                <p className="text-slate-500 text-base leading-relaxed font-medium mb-10">
                  {acordaos.length > 0 
                    ? `A sua base de dados contém ${acordaos.length} acórdãos prontos para análise. Utilize a IA para detetar contradições, teses dominantes ou resumir fundamentos.` 
                    : "Ative a sua pasta de trabalho e processe alguns acórdãos para começar a análise inteligente."}
                </p>
                <div className="flex gap-4 w-full max-w-md">
                  <div className="flex-1 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-[10px] font-black text-indigo-600 uppercase mb-1">Privacidade</p>
                    <p className="text-[11px] font-bold text-slate-400 leading-tight">Dados locais, inteligência Gemini.</p>
                  </div>
                  <div className="flex-1 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-[10px] font-black text-amber-600 uppercase mb-1">Persistência</p>
                    <p className="text-[11px] font-bold text-slate-400 leading-tight">O seu trabalho é salvo em tempo real.</p>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-[2rem] p-8 shadow-2xl ${
                    msg.role === 'user' 
                      ? 'bg-slate-900 text-white rounded-tr-none border-r-[12px] border-indigo-500' 
                      : 'bg-white text-slate-800 rounded-tl-none border-l-[12px] border-amber-500'
                  }`}>
                    <div className="serif text-lg leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Área de Input de Chat */}
          <div className="p-10 bg-white border-t border-slate-200 shadow-[0_-30px_60px_rgba(0,0,0,0.03)]">
            <div className="max-w-5xl mx-auto relative group">
              <input 
                type="text" 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={acordaos.length > 0 ? "Ex: Faça um quadro comparativo das teses sobre furto qualificado nestes acórdãos." : "Extraia acórdãos primeiro..."}
                className="w-full bg-slate-50 border-2 border-slate-200 outline-none pl-8 pr-20 py-6 rounded-3xl text-base font-bold placeholder:text-slate-400 focus:bg-white focus:border-indigo-500 transition-all shadow-inner"
                disabled={acordaos.length === 0 || isLoading}
              />
              <button 
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim() || acordaos.length === 0}
                className="absolute right-3 top-3 bg-indigo-600 text-white w-14 h-14 rounded-2xl hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-all flex items-center justify-center shadow-lg transform active:scale-90"
              >
                {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>}
              </button>
            </div>
          </div>
        </div>

        {/* Notificações Toasts */}
        {notification && (
          <div className="fixed bottom-40 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-5 rounded-full shadow-2xl flex items-center gap-5 z-50 border-2 border-indigo-500 animate-in fade-in slide-in-from-bottom-12 duration-300">
            <div className="bg-indigo-500 p-1.5 rounded-full shadow-lg">
              <svg className="w-4 h-4 text-slate-900" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            </div>
            <span className="text-xs font-black uppercase tracking-[0.2em]">{notification}</span>
          </div>
        )}
      </main>

      {error && (
        <div className="fixed top-28 right-12 bg-red-600 text-white px-8 py-6 rounded-3xl shadow-2xl flex items-center gap-5 z-[60] animate-in slide-in-from-right-10 border-b-4 border-red-800">
          <div className="bg-white/20 w-8 h-8 rounded-full flex items-center justify-center font-black">!</div>
          <div>
            <p className="text-[10px] font-black uppercase opacity-60">Erro Detetado</p>
            <p className="text-xs font-bold leading-tight">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-4 text-white/50 hover:text-white font-black text-lg">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
