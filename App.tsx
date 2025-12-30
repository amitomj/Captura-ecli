
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { StorageService } from './services/storageService';
import { parseCsmHtml, fetchAcordaoHtml } from './services/parserService';
import { Acordao, ChatMessage } from './types';
import { analyzeJurisprudence } from './services/geminiService';

const App: React.FC = () => {
  const [isFolderSelected, setIsFolderSelected] = useState(false);
  const [storageMode, setStorageMode] = useState<'native' | 'virtual'>('native');
  const [rawFiles, setRawFiles] = useState<{name: string, content: string}[]>([]);
  const [acordaos, setAcordaos] = useState<Acordao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
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

  const processClipboardLink = useCallback(async (text: string) => {
    if (!text.startsWith('https://jurisprudencia.csm.org.pt/') || text === lastProcessedUrl.current) return;
    
    lastProcessedUrl.current = text;
    setIsLoading(true);
    
    try {
      showNotification(`A descarregar acórdão: ${text.split('/').pop()}`);
      const html = await fetchAcordaoHtml(text);
      const fileName = text.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
      
      await StorageService.saveRawTxt(fileName, html);
      await refreshData();
      showNotification(`Sucesso: Ficheiro ${fileName}.txt guardado na pasta.`);
    } catch (e) {
      const manual = confirm(`Link detectado na área de transferência!\n\nO site do CSM bloqueou o acesso automático (CORS).\n\nLink: ${text}\n\nDeseja colar o conteúdo manualmente?`);
      if (manual) {
        const htmlContent = prompt("Cole o conteúdo HTML da página:");
        if (htmlContent) {
          const fileName = text.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
          await StorageService.saveRawTxt(fileName, htmlContent);
          await refreshData();
          showNotification(`Ficheiro ${fileName}.txt guardado com conteúdo manual.`);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [refreshData]);

  const handleClipboardCheck = useCallback(async () => {
    if (!isMonitoring || !isFolderSelected || isLoading) return;
    try {
      const text = await navigator.clipboard.readText();
      await processClipboardLink(text);
    } catch (err) {
      // Silencioso se não houver permissão ainda
    }
  }, [isMonitoring, isFolderSelected, isLoading, processClipboardLink]);

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
      showNotification(`${count} acórdãos extraídos com sucesso para dados estruturados.`);
    } catch (err) {
      setError("Erro na extração: " + (err as Error).message);
    } finally {
      setIsLoading(false);
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
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <header className="bg-slate-900 text-white p-5 shadow-lg border-b-2 border-amber-600">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-amber-600 w-10 h-10 rounded flex items-center justify-center font-bold text-xl shadow-lg animate-pulse">J</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">JurisAnalyzer <span className="text-amber-500 italic">Pro</span></h1>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 uppercase tracking-widest font-bold">
                <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-green-500 shadow-[0_0_5px_green]' : 'bg-red-500'}`}></div>
                {isMonitoring ? 'Auto-Captura: Ativa (Copie e volte aqui)' : 'Auto-Captura: Pausada'}
              </div>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="text-right">
              <div className="text-xs font-bold text-slate-300">Base de Dados Local</div>
              <div className="text-[10px] text-amber-500 font-mono">{rawFiles.length} TXT / {acordaos.length} JSON</div>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
        
        {/* Lado Esquerdo - Gestão */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-6 border-b border-slate-100 flex justify-between items-center">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter text-sm">1. Configuração</h2>
              <button onClick={() => setIsMonitoring(!isMonitoring)} className="text-[10px] bg-slate-200 px-2 py-1 rounded-md font-bold text-slate-600 hover:bg-amber-100 hover:text-amber-700 transition">
                {isMonitoring ? 'PAUSAR MONITOR' : 'ACTIVAR MONITOR'}
              </button>
            </div>
            <div className="p-6 space-y-4">
              {!isFolderSelected ? (
                <button onClick={handleSelectFolder} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                  Escolher Pasta do PC
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                    <div className="text-green-800 font-bold text-xs flex items-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      Pasta Selecionada e Monitor Ativo
                    </div>
                    <p className="text-[10px] text-green-700 mt-2 leading-tight">
                      Basta copiar o URL no site do CSM e voltar a clicar aqui. A app assume o link e cria o ficheiro .txt automaticamente.
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <span>Últimos TXT Capturados</span>
                      <span className="bg-slate-200 px-2 rounded-full">{rawFiles.length}</span>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-2 max-h-48 overflow-y-auto custom-scrollbar border border-slate-100">
                      {rawFiles.length === 0 ? (
                        <div className="py-10 text-center text-slate-300 text-[11px] italic">Aguardando que copie um link do CSM...</div>
                      ) : (
                        rawFiles.slice().reverse().map((f, i) => (
                          <div key={i} className="p-2 border-b border-white last:border-0 flex items-center gap-3 animate-in slide-in-from-left duration-300">
                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                            <span className="text-[11px] font-bold text-slate-600 truncate">{f.name}.txt</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-6 border-b border-slate-100">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter text-sm">2. Processamento</h2>
            </div>
            <div className="p-6">
              <button 
                onClick={handleRunExtraction}
                disabled={rawFiles.length === 0 || isLoading}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 disabled:bg-slate-200 transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                )}
                Extrair Dados Estruturados
              </button>
              <div className="mt-4 flex gap-4">
                <div className="flex-1 bg-indigo-50 p-3 rounded-2xl border border-indigo-100 text-center">
                  <div className="text-lg font-black text-indigo-700">{acordaos.length}</div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase">Processados</div>
                </div>
                <div className="flex-1 bg-amber-50 p-3 rounded-2xl border border-amber-100 text-center">
                  <div className="text-lg font-black text-amber-700">{rawFiles.length - acordaos.length}</div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase">Por Extrair</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Lado Direito - Chatbot IA */}
        <div className="lg:col-span-8 flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden min-h-[700px] transform transition-all duration-500">
          <div className="bg-slate-900 p-6 flex items-center justify-between border-b-4 border-indigo-500">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <h2 className="text-white font-black uppercase tracking-widest text-xs">Fase 3: Inteligência de Jurisprudência</h2>
            </div>
            <div className="text-slate-400 text-[10px] font-mono tracking-tighter">
              IA ANALYST v3.0
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/50 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-20 animate-in fade-in duration-1000">
                <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-2xl mb-8 transform rotate-6 border-b-4 border-indigo-200">
                   <svg className="w-10 h-10 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                </div>
                <h3 className="text-3xl font-black text-slate-800 leading-tight tracking-tighter">Analista Jurisprudencial</h3>
                <p className="text-slate-500 text-sm mt-4 leading-relaxed font-medium">
                  Após extrair os dados (ECLI, Relator, Adjuntos) na Fase 2, a IA poderá identificar divergências profundas entre os documentos na sua pasta.
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2`}>
                  <div className={`max-w-[92%] rounded-3xl p-6 shadow-2xl ${
                    msg.role === 'user' 
                      ? 'bg-slate-900 text-white rounded-tr-none border-r-4 border-amber-500' 
                      : 'bg-white border border-slate-200 rounded-tl-none text-slate-800 border-l-4 border-indigo-500'
                  }`}>
                    <div className="serif whitespace-pre-wrap leading-relaxed text-base">
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
          </div>

          <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-20px_40px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-4 bg-slate-100 p-2 rounded-3xl focus-within:ring-4 focus-within:ring-indigo-100 focus-within:bg-white transition-all">
              <input 
                type="text" 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={acordaos.length > 0 ? "Ex: Existe divergência sobre o roubo simples?" : "Extraia os dados primeiro na Fase 2..."}
                className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-slate-700 text-sm font-bold placeholder:text-slate-400"
                disabled={acordaos.length === 0 || isLoading}
              />
              <button 
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim() || acordaos.length === 0}
                className="bg-indigo-600 text-white w-14 h-14 rounded-2xl hover:bg-indigo-700 disabled:bg-slate-300 transition-all shadow-xl flex items-center justify-center transform active:scale-90"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* Notificações Flutuantes (Toasts) */}
        {notification && (
          <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-4 z-[100] border-2 border-amber-500 animate-in fade-in slide-in-from-top-10 duration-300">
            <div className="bg-amber-500 p-1 rounded-full animate-bounce">
              <svg className="w-4 h-4 text-slate-900" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
            </div>
            <span className="text-xs font-black uppercase tracking-widest">{notification}</span>
          </div>
        )}

      </main>

      {error && (
        <div className="fixed bottom-10 right-10 bg-red-600 text-white px-8 py-5 rounded-3xl shadow-2xl flex items-center gap-5 animate-in fade-in slide-in-from-right-10 duration-500 z-50">
          <div className="bg-white/20 p-2 rounded-full font-black text-sm">!</div>
          <div className="text-sm font-bold">{error}</div>
          <button onClick={() => setError(null)} className="ml-4 hover:opacity-50">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
