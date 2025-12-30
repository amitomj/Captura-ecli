
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StorageService } from './services/storageService';
import { parseCsmHtml, fetchAcordaoHtml } from './services/parserService';
import { Acordao, ChatMessage } from './types';
import { analyzeJurisprudence } from './services/geminiService';

const App: React.FC = () => {
  const [isFolderSelected, setIsFolderSelected] = useState(false);
  const [storageMode, setStorageMode] = useState<'native' | 'virtual' | null>(null);
  const [rawFiles, setRawFiles] = useState<{name: string, content: string}[]>([]);
  const [acordaos, setAcordaos] = useState<Acordao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(true);
  const lastProcessedUrl = useRef<string>('');

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
    setTimeout(() => setNotification(null), 4000);
  };

  const processSingleUrl = async (url: string) => {
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith('https://jurisprudencia.csm.org.pt/')) return;
    
    try {
      showNotification(`A descarregar: ${cleanUrl.split('/').pop()}`);
      const html = await fetchAcordaoHtml(cleanUrl);
      const fileName = cleanUrl.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
      
      await StorageService.saveRawTxt(fileName, html);
      return true;
    } catch (e) {
      if ((e as Error).message === 'CORS_ERROR') {
        const manual = confirm(`Erro de Acesso (CORS) para:\n${cleanUrl}\n\nO site do CSM não permite captura direta. Deseja colar o conteúdo HTML manualmente para este acórdão?`);
        if (manual) {
          const htmlContent = prompt(`Cole o conteúdo HTML de: ${cleanUrl}`);
          if (htmlContent) {
            const fileName = cleanUrl.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
            await StorageService.saveRawTxt(fileName, htmlContent);
            return true;
          }
        }
      }
      return false;
    }
  };

  const handleBulkCapture = async () => {
    const urls = bulkUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length === 0) return;
    
    setIsLoading(true);
    let successCount = 0;
    for (const url of urls) {
      const ok = await processSingleUrl(url);
      if (ok) successCount++;
    }
    setBulkUrls('');
    await refreshData();
    showNotification(`${successCount} documentos guardados na pasta.`);
    setIsLoading(false);
  };

  const handleClipboardCheck = useCallback(async () => {
    if (!isMonitoring || !isFolderSelected || isLoading) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text.startsWith('https://jurisprudencia.csm.org.pt/') && text !== lastProcessedUrl.current) {
        lastProcessedUrl.current = text;
        setIsLoading(true);
        await processSingleUrl(text);
        await refreshData();
        setIsLoading(false);
      }
    } catch (err) {}
  }, [isMonitoring, isFolderSelected, isLoading, refreshData]);

  useEffect(() => {
    window.addEventListener('focus', handleClipboardCheck);
    return () => window.removeEventListener('focus', handleClipboardCheck);
  }, [handleClipboardCheck]);

  const handleSelectFolder = async () => {
    const result = await StorageService.selectDirectory();
    if (result.success) {
      setIsFolderSelected(true);
      setStorageMode(result.mode);
      refreshData();
    }
  };

  const handleRunExtraction = async () => {
    if (rawFiles.length === 0) return;
    setIsLoading(true);
    try {
      let count = 0;
      for (const file of rawFiles) {
        const extraction = parseCsmHtml(file.content, "https://jurisprudencia.csm.org.pt/");
        if (extraction.success && extraction.data) {
          await StorageService.saveProcessedAcordao(extraction.data as Acordao);
          count++;
        }
      }
      await refreshData();
      showNotification(`${count} acórdãos extraídos e estruturados.`);
    } catch (err) {
      setError("Erro na extração: " + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportJson = () => {
    if (acordaos.length === 0) return;
    const blob = new Blob([JSON.stringify(acordaos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jurisprudencia_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification("Base de dados exportada com sucesso.");
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
    <div className="min-h-screen bg-[#f8fafc] flex flex-col font-sans text-slate-900">
      <header className="bg-slate-900 text-white p-5 shadow-2xl border-b-4 border-amber-600 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-5">
            <div className="bg-amber-600 w-12 h-12 rounded-xl flex items-center justify-center font-black text-2xl shadow-inner transform -rotate-3">J</div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter uppercase italic">JurisAnalyzer <span className="text-amber-500 not-italic">PT</span></h1>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                {isMonitoring ? 'Sistema de Escuta Ativo' : 'Auto-Captura Pausada'}
              </div>
            </div>
          </div>
          <div className="flex gap-6">
            <div className="text-right">
              <div className="text-[10px] font-black text-slate-400 uppercase">Arquivos TXT</div>
              <div className="text-xl font-black text-white">{rawFiles.length}</div>
            </div>
            <div className="text-right border-l border-slate-700 pl-6">
              <div className="text-[10px] font-black text-slate-400 uppercase">Base Estruturada</div>
              <div className="text-xl font-black text-amber-500">{acordaos.length}</div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1600px] mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-100px)] overflow-hidden">
        
        {/* Lado Esquerdo - Gestão e Importação */}
        <div className="lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          
          {/* 1. Folder Config */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter text-xs">1. Diretório de Trabalho</h2>
              {storageMode && <span className="text-[9px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-bold uppercase">{storageMode}</span>}
            </div>
            <div className="p-5">
              {!isFolderSelected ? (
                <button onClick={handleSelectFolder} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl flex items-center justify-center gap-3">
                  <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                  Conectar Pasta do PC
                </button>
              ) : (
                <div className="bg-green-50 p-4 rounded-2xl border border-green-100 flex items-center gap-4">
                  <div className="bg-green-500 p-2 rounded-full text-white">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  </div>
                  <div className="flex-1">
                    <div className="text-green-800 font-black text-xs uppercase">Pasta Ativa</div>
                    <div className="text-[10px] text-green-600 truncate opacity-70">A ler subpastas e ficheiros...</div>
                  </div>
                  <button onClick={() => setIsMonitoring(!isMonitoring)} className={`text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors ${isMonitoring ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-400'}`}>
                    {isMonitoring ? 'STOP LIVE' : 'START LIVE'}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* 2. Captura em Lote */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter text-xs">2. Captura em Lote (URLs)</h2>
            </div>
            <div className="p-5 space-y-4">
              <textarea 
                value={bulkUrls}
                onChange={(e) => setBulkUrls(e.target.value)}
                placeholder="Cole aqui várias URLs do CSM (uma por linha)..."
                className="w-full h-32 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-[11px] font-mono focus:border-amber-500 outline-none transition-all custom-scrollbar"
                disabled={!isFolderSelected || isLoading}
              />
              <button 
                onClick={handleBulkCapture}
                disabled={!isFolderSelected || !bulkUrls.trim() || isLoading}
                className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 disabled:bg-slate-200 transition-all flex items-center justify-center gap-2"
              >
                {isLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" /></svg>}
                Descarregar Lista
              </button>
              <p className="text-[9px] text-slate-400 text-center italic">Nota: Devido a restrições do CSM, pode ser solicitada colagem manual.</p>
            </div>
          </section>

          {/* 3. Processamento e Exportação */}
          <section className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-5 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter text-xs">3. Base de Dados</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              <button 
                onClick={handleRunExtraction}
                disabled={rawFiles.length === 0 || isLoading}
                className="bg-indigo-600 text-white p-4 rounded-2xl font-black text-xs hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 transition-all shadow-lg flex flex-col items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                Extrair Dados
              </button>
              <button 
                onClick={handleExportJson}
                disabled={acordaos.length === 0 || isLoading}
                className="bg-amber-500 text-white p-4 rounded-2xl font-black text-xs hover:bg-amber-600 disabled:bg-slate-100 disabled:text-slate-400 transition-all shadow-lg flex flex-col items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Exportar JSON
              </button>
            </div>
          </section>

          <div className="p-4 text-center">
             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">JurisAnalyzer Pro v4.0</p>
          </div>
        </div>

        {/* Lado Direito - Analista IA */}
        <div className="lg:col-span-8 flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden h-full">
          <div className="bg-slate-900 p-6 flex items-center justify-between border-b-4 border-indigo-500">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <div>
                <h2 className="text-white font-black uppercase tracking-tighter text-sm">Analista Jurídico de IA</h2>
                <div className="text-indigo-400 text-[9px] font-black uppercase tracking-widest">Baseado em {acordaos.length} acórdãos locais</div>
              </div>
            </div>
            <div className="flex gap-2">
               <div className="w-2 h-2 rounded-full bg-slate-700"></div>
               <div className="w-2 h-2 rounded-full bg-slate-700"></div>
               <div className="w-2 h-2 rounded-full bg-slate-700"></div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-6 py-20 animate-in fade-in duration-700">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-2xl border border-slate-100 transform -rotate-12">
                   <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                </div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tighter leading-none">Pronto para a análise jurisprudencial</h3>
                <p className="text-slate-500 text-sm font-medium leading-relaxed">
                  Importe os links do CSM, extraia os dados e coloque a sua questão jurídica. A IA analisará divergências entre os {acordaos.length} documentos da sua pasta.
                </p>
                <div className="grid grid-cols-2 gap-4 w-full">
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 text-[10px] text-left">
                    <span className="font-black text-indigo-600 uppercase block mb-1">Dica 1</span>
                    "Qual a posição sobre roubo simples com vítimas vulneráveis?"
                  </div>
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 text-[10px] text-left">
                    <span className="font-black text-amber-600 uppercase block mb-1">Dica 2</span>
                    "Identifica divergências na aplicação da Lei do Perdão."
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-4 duration-500`}>
                  <div className={`max-w-[85%] rounded-[2rem] p-6 shadow-xl ${
                    msg.role === 'user' 
                      ? 'bg-slate-900 text-white rounded-tr-none border-r-4 border-amber-500' 
                      : 'bg-white border border-slate-200 rounded-tl-none text-slate-800 border-l-4 border-indigo-600'
                  }`}>
                    <div className="serif whitespace-pre-wrap leading-relaxed text-[15px]">
                      {msg.content.split('\n').map((line, idx) => {
                        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                        const parts = [];
                        let lastIndex = 0;
                        let match;
                        while ((match = linkRegex.exec(line)) !== null) {
                          parts.push(line.substring(lastIndex, match.index));
                          parts.push(<a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-amber-500 underline font-black hover:text-amber-600 transition-colors">{match[1]}</a>);
                          lastIndex = match.index + match[0].length;
                        }
                        parts.push(line.substring(lastIndex));
                        return <div key={idx} className={line.trim() === '' ? 'h-4' : 'mb-2'}>{parts.length > 0 ? parts : line}</div>;
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoading && messages.length > 0 && messages[messages.length-1].role === 'user' && (
              <div className="flex justify-start animate-pulse">
                <div className="bg-white border border-slate-200 rounded-[2rem] rounded-tl-none p-6 text-slate-400 italic text-sm">
                  O Analista está a processar a jurisprudência...
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-white border-t border-slate-100">
            <div className="flex items-center gap-4 bg-slate-100 p-2 rounded-[2rem] focus-within:ring-4 focus-within:ring-indigo-100 focus-within:bg-white transition-all">
              <input 
                type="text" 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={acordaos.length > 0 ? "O que deseja pesquisar na jurisprudência?" : "Importe acórdãos para começar..."}
                className="flex-1 bg-transparent border-none outline-none px-6 py-4 text-slate-700 text-sm font-bold placeholder:text-slate-400"
                disabled={acordaos.length === 0 || isLoading}
              />
              <button 
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim() || acordaos.length === 0}
                className="bg-indigo-600 text-white w-14 h-14 rounded-full hover:bg-indigo-700 disabled:bg-slate-300 transition-all shadow-xl flex items-center justify-center transform active:scale-90"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Notificações Flutuantes (Toasts) */}
        {notification && (
          <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-[100] border-2 border-amber-500 animate-in fade-in slide-in-from-bottom-10 duration-300">
            <div className="bg-amber-500 p-1.5 rounded-full">
              <svg className="w-4 h-4 text-slate-900" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            </div>
            <span className="text-xs font-black uppercase tracking-widest">{notification}</span>
          </div>
        )}

      </main>

      {error && (
        <div className="fixed top-24 right-10 bg-red-600 text-white px-8 py-5 rounded-3xl shadow-2xl flex items-center gap-5 animate-in fade-in slide-in-from-right-10 duration-500 z-50">
          <div className="bg-white/20 p-2 rounded-full font-black text-sm">!</div>
          <div className="text-sm font-bold">{error}</div>
          <button onClick={() => setError(null)} className="ml-4 hover:opacity-50 font-black">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
