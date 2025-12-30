
import React, { useState, useEffect, useCallback } from 'react';
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
  
  // Estados para o Fluxo de Captura Guiada
  const [captureQueue, setCaptureQueue] = useState<string[]>([]);
  const [currentCaptureIndex, setCurrentCaptureIndex] = useState(-1);
  const [showCaptureModal, setShowCaptureModal] = useState(false);

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

  const saveContent = async (html: string, url: string) => {
    const extraction = parseCsmHtml(html, url);
    const ecli = extraction.data?.ecli || url.split('/').pop() || `doc_${Date.now()}`;
    const safeFileName = ecli.replace(/[:/\\?%*|"<>]/g, '_');
    
    await StorageService.saveRawTxt(safeFileName, html);
    if (extraction.success && extraction.data) {
      await StorageService.saveProcessedAcordao(extraction.data as Acordao);
    }
    await refreshData();
    showNotification(`Capturado: ${ecli}`);
  };

  const handleStartCapture = () => {
    const urls = bulkUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length === 0) return;
    setCaptureQueue(urls);
    setCurrentCaptureIndex(0);
    setShowCaptureModal(true);
    // Abre logo o primeiro link
    window.open(urls[0], '_blank');
  };

  const handleConfirmCapture = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.length < 500) {
        setError("O conteúdo copiado parece demasiado curto. Certifique-se de que fez CTRL+A e CTRL+C no site do acórdão.");
        return;
      }

      await saveContent(text, captureQueue[currentCaptureIndex]);
      
      const nextIndex = currentCaptureIndex + 1;
      if (nextIndex < captureQueue.length) {
        setCurrentCaptureIndex(nextIndex);
        window.open(captureQueue[nextIndex], '_blank');
      } else {
        setShowCaptureModal(false);
        setCaptureQueue([]);
        setCurrentCaptureIndex(-1);
        setBulkUrls('');
        showNotification("Lote de captura concluído!");
      }
    } catch (e) {
      setError("Não foi possível aceder à área de transferência. Por favor, permita o acesso ou tente novamente.");
    }
  };

  const handleSelectFolder = async () => {
    const result = await StorageService.selectDirectory();
    if (result.success) {
      setIsFolderSelected(true);
      setStorageMode(result.mode);
      refreshData();
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
      <header className="bg-slate-900 text-white p-4 shadow-xl border-b-4 border-amber-600 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="bg-amber-600 w-10 h-10 rounded-lg flex items-center justify-center font-black text-xl shadow-lg">J</div>
            <h1 className="text-xl font-black tracking-tighter uppercase italic">JurisAnalyzer <span className="text-amber-500 not-italic">PRO</span></h1>
          </div>
          <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
            <div className="text-right">
              <span className="text-white block text-sm leading-none">{rawFiles.length}</span>
              Ficheiros TXT
            </div>
            <div className="text-right border-l border-slate-700 pl-4">
              <span className="text-amber-500 block text-sm leading-none">{acordaos.length}</span>
              Analisáveis
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-80px)] overflow-hidden">
        
        {/* Painel Lateral */}
        <div className="lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          
          <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">1. Repositório</h2>
            {!isFolderSelected ? (
              <button onClick={handleSelectFolder} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-3">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                Conectar Pasta Local
              </button>
            ) : (
              <div className="bg-green-50 p-4 rounded-2xl border border-green-100 flex items-center gap-4">
                <div className="bg-green-500 w-3 h-3 rounded-full animate-pulse shadow-lg shadow-green-200"></div>
                <div>
                  <div className="text-[10px] font-black text-green-700 uppercase leading-none mb-1">Modo {storageMode}</div>
                  <div className="text-xs font-bold text-green-900">Ligado à Pasta do PC</div>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">2. URLs para Capturar</h2>
            <textarea 
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              placeholder="Cole as URLs dos acórdãos (uma por linha)..."
              className="w-full h-40 bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 text-[11px] font-mono focus:border-amber-500 outline-none transition-all mb-4 custom-scrollbar"
              disabled={!isFolderSelected || showCaptureModal}
            />
            <button 
              onClick={handleStartCapture}
              disabled={!isFolderSelected || !bulkUrls.trim() || showCaptureModal}
              className="w-full bg-amber-500 text-white py-4 rounded-2xl font-black text-xs hover:bg-amber-600 disabled:bg-slate-200 transition-all shadow-lg shadow-amber-500/20"
            >
              Iniciar Assistente de Captura
            </button>
          </section>

          <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <h2 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Acórdãos na Pasta</h2>
            <div className="max-h-52 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {rawFiles.length === 0 ? (
                <div className="text-[10px] text-slate-300 italic text-center py-6 border-2 border-dashed border-slate-50 rounded-2xl">Aguardando importação</div>
              ) : (
                rawFiles.map((f, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100 hover:border-amber-200 transition-all">
                    <span className="text-[10px] font-mono truncate max-w-[160px] font-bold text-slate-600">{f.name}</span>
                    <span className="text-[8px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-black uppercase">Pronto</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Analista IA */}
        <div className="lg:col-span-8 flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden h-full">
          <div className="bg-slate-900 p-5 flex items-center justify-between border-b-4 border-indigo-600">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              </div>
              <h2 className="text-white font-black uppercase text-xs tracking-tighter">Analista Jurídico Gemini</h2>
            </div>
            <div className="bg-slate-800 px-3 py-1 rounded-full text-[9px] text-slate-400 font-bold uppercase tracking-widest">
              Analisando <span className="text-white font-black">{acordaos.length} acórdãos</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/30 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto space-y-6 opacity-30">
                <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center">
                  <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </div>
                <p className="text-sm font-black uppercase tracking-tight">Utilize o Assistente de Captura para importar acórdãos e iniciar a análise jurisprudencial.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] p-6 rounded-[2rem] shadow-lg ${
                    msg.role === 'user' 
                      ? 'bg-slate-900 text-white rounded-tr-none' 
                      : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none border-l-8 border-indigo-600'
                  }`}>
                    <div className="serif whitespace-pre-wrap text-[15px] leading-relaxed">
                      {msg.content.split('\n').map((line, idx) => {
                        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                        const parts = [];
                        let lastIndex = 0;
                        let match;
                        while ((match = linkRegex.exec(line)) !== null) {
                          parts.push(line.substring(lastIndex, match.index));
                          parts.push(<a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-amber-600 underline font-black hover:text-amber-700">{match[1]}</a>);
                          lastIndex = match.index + match[0].length;
                        }
                        parts.push(line.substring(lastIndex));
                        return <div key={idx} className="mb-2">{parts.length > 0 ? parts : line}</div>;
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-[2rem] rounded-tl-none p-5 text-xs font-bold text-slate-400 animate-pulse flex items-center gap-3">
                  <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                  O Analista está a processar os fundamentos...
                </div>
              </div>
            )}
          </div>

          <div className="p-6 bg-white border-t border-slate-100">
            <div className="flex gap-3 bg-slate-100 p-2 rounded-2xl focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-100 transition-all shadow-inner">
              <input 
                type="text" 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={acordaos.length > 0 ? "Indica a posição da jurisprudência sobre..." : "Adicione acórdãos primeiro."}
                className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-sm font-bold placeholder:text-slate-400"
                disabled={acordaos.length === 0 || isLoading}
              />
              <button 
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim() || acordaos.length === 0}
                className="bg-indigo-600 text-white w-12 h-12 rounded-xl flex items-center justify-center hover:bg-indigo-700 transition-all shadow-lg active:scale-95 disabled:bg-slate-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* MODAL DE CAPTURA GUIADA (O SEU NOVO FLUXO) */}
      {showCaptureModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in zoom-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden border-8 border-indigo-600">
            <div className="bg-indigo-600 p-8 text-white">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Assistente de Captura</h2>
                <div className="bg-white/20 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest">
                  Processo {currentCaptureIndex + 1} de {captureQueue.length}
                </div>
              </div>
              <div className="w-full bg-indigo-900/40 h-2 rounded-full mb-2">
                <div 
                  className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                  style={{ width: `${((currentCaptureIndex + 1) / captureQueue.length) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="p-10 space-y-8">
              <div className="space-y-4">
                <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Link em Processamento:</p>
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 font-mono text-[10px] text-slate-400 truncate">
                  {captureQueue[currentCaptureIndex]}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 flex flex-col items-center text-center space-y-3">
                  <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg">1</div>
                  <p className="text-sm font-bold text-indigo-900">Na página aberta:<br/><span className="text-xs font-medium text-indigo-600">Pressione CTRL+A e CTRL+C</span></p>
                  <button 
                    onClick={() => window.open(captureQueue[currentCaptureIndex], '_blank')}
                    className="text-[10px] font-black uppercase text-indigo-600 hover:underline"
                  >
                    Reabrir Página
                  </button>
                </div>
                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex flex-col items-center text-center space-y-3">
                  <div className="w-12 h-12 bg-amber-500 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg">2</div>
                  <p className="text-sm font-bold text-amber-900">Aqui na App:<br/><span className="text-xs font-medium text-amber-600">Clique no botão OK abaixo</span></p>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => { setShowCaptureModal(false); setCaptureQueue([]); }}
                  className="flex-1 py-5 rounded-2xl font-black text-sm text-slate-400 hover:text-slate-600 transition-all uppercase tracking-widest"
                >
                  Cancelar Lote
                </button>
                <button 
                  onClick={handleConfirmCapture}
                  className="flex-[2] bg-indigo-600 text-white py-5 rounded-[2rem] font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 flex items-center justify-center gap-3 uppercase"
                >
                  Confirmar e Próximo
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed bottom-10 left-10 bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-2xl z-50 text-[10px] font-black uppercase tracking-widest border border-amber-500 animate-in fade-in slide-in-from-left-10">
          {notification}
        </div>
      )}

      {error && (
        <div className="fixed top-10 right-10 bg-red-600 text-white px-8 py-5 rounded-2xl shadow-2xl z-50 text-xs font-bold animate-in fade-in slide-in-from-right-10 max-w-md">
          <div className="flex justify-between items-start gap-4">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="font-black text-lg leading-none hover:text-white/70">✕</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
