
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
  const [browserUrl, setBrowserUrl] = useState('https://jurisprudencia.csm.org.pt/');
  const [capturedText, setCapturedText] = useState<string | null>(null);
  
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

  // Monitor de Clipboard para capturar texto quando o utilizador faz Ctrl+C no iframe
  const handleClipboardCheck = useCallback(async () => {
    if (!isFolderSelected || isLoading) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text === lastProcessedContent.current) return;
      
      if (text.startsWith('https://jurisprudencia.csm.org.pt/')) {
        setBrowserUrl(text);
        lastProcessedContent.current = text;
        showNotification("URL detetada e carregada no navegador.");
      } 
      else if (text.length > 1500 && (text.includes('Acórdão') || text.includes('Processo'))) {
        setCapturedText(text); // Abre o modal de captura
        lastProcessedContent.current = text;
      }
    } catch (err) {
      // Browsers podem bloquear o acesso ao clipboard sem interação direta
    }
  }, [isFolderSelected, isLoading]);

  useEffect(() => {
    window.addEventListener('focus', handleClipboardCheck);
    return () => window.removeEventListener('focus', handleClipboardCheck);
  }, [handleClipboardCheck]);

  const processCapturedText = async () => {
    if (!capturedText) return;
    setIsLoading(true);
    try {
      const fileName = `captura_${new Date().getTime()}`;
      // 1. Guarda o TXT original
      await StorageService.saveRawTxt(fileName, capturedText);
      // 2. Extrai os dados para JSON
      const result = parseCsmHtml(capturedText, browserUrl);
      if (result.success && result.data) {
        await StorageService.saveProcessedAcordao(result.data as Acordao);
        showNotification("Acórdão capturado, guardado e convertido!");
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
        setTimeout(refreshData, 100);
      }
    } catch (e) {
      setError("Necessário selecionar uma pasta para trabalhar.");
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
    <div className="h-screen bg-slate-100 flex flex-col font-sans overflow-hidden">
      {/* Header Profissional */}
      <header className="bg-slate-900 text-white px-6 py-3 flex justify-between items-center shadow-md z-30">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-1.5 rounded-lg shadow-inner font-black text-xs">CSM</div>
          <h1 className="font-bold text-sm tracking-tight">JurisAnalyzer <span className="text-indigo-400">PRO</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          {!isFolderSelected ? (
            <button onClick={handleActivateFolder} className="bg-amber-500 hover:bg-amber-600 text-slate-900 text-[10px] font-black px-4 py-2 rounded-lg transition-all animate-pulse">
              CONECTAR PASTA DE TRABALHO
            </button>
          ) : (
            <div className="text-[10px] font-bold text-green-400 flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div> REPOSITÓRIO ATIVO
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        
        {/* COLUNA 1: REPOSITÓRIO */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Explorador</span>
            <button onClick={refreshData} className="text-slate-400 hover:text-indigo-600 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
            <div>
              <h4 className="text-[9px] font-black text-amber-600 uppercase mb-2">Rascunhos (TXT)</h4>
              {rawFiles.length === 0 && <p className="text-[9px] text-slate-300 italic">Nenhum rascunho</p>}
              {rawFiles.map((f, i) => (
                <div key={i} className="mb-1 p-2 bg-slate-50 border border-slate-100 rounded text-[10px] truncate font-medium flex justify-between items-center">
                  <span className="truncate flex-1 mr-2">{f.name}</span>
                  <button onClick={() => setCapturedText(f.content)} className="text-indigo-600 font-black hover:underline text-[8px]">ABRIR</button>
                </div>
              ))}
            </div>

            <div>
              <h4 className="text-[9px] font-black text-indigo-600 uppercase mb-2">Processados (JSON)</h4>
              {acordaos.length === 0 && <p className="text-[9px] text-slate-300 italic">Aguardando extração</p>}
              {acordaos.map((a, i) => (
                <div key={i} className="mb-1 p-2 bg-white border border-slate-200 rounded-lg shadow-sm">
                  <p className="text-[10px] font-black text-slate-800 truncate">{a.processo}</p>
                  <p className="text-[8px] text-slate-400 mt-1 uppercase font-bold">{a.relator}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* COLUNA 2: NAVEGADOR ECLI CSM */}
        <section className="flex-1 flex flex-col bg-white border-r border-slate-200">
          {/* Barra de Endereços */}
          <div className="bg-slate-50 p-2 border-b border-slate-200 flex items-center gap-2">
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={browserUrl}
                onChange={(e) => setBrowserUrl(e.target.value)}
                placeholder="Cole aqui a URL do Acórdão..."
                className="w-full bg-white border border-slate-200 px-4 py-1.5 rounded-full text-[11px] font-medium outline-none focus:border-indigo-500 shadow-sm"
              />
            </div>
            <button onClick={() => setBrowserUrl(browserUrl)} className="p-1.5 text-slate-400 hover:text-indigo-600">
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
          </div>
          
          <div className="flex-1 relative bg-slate-200">
            <iframe 
              src={browserUrl} 
              className="w-full h-full border-none bg-white"
              title="CSM Browser"
            />
          </div>
        </section>

        {/* COLUNA 3: CHAT IA */}
        <section className="w-80 flex flex-col bg-slate-50">
          <div className="p-4 border-b border-slate-200 bg-white text-center">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Motor de Análise Jurídica</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                <svg className="w-10 h-10 mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                <p className="text-[10px] font-bold uppercase">Carregue acórdãos para iniciar a análise comparativa</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`p-3 rounded-xl text-[11px] leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-slate-900 text-white ml-4' : 'bg-white border border-slate-200 text-slate-800 mr-4'}`}>
                {msg.content}
              </div>
            ))}
            {isLoading && <div className="text-[10px] font-bold text-indigo-600 animate-pulse">A processar...</div>}
          </div>

          <div className="p-3 bg-white border-t border-slate-200">
            <div className="relative">
              <input 
                type="text" 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Questão de Direito..."
                className="w-full bg-slate-100 border-none outline-none p-3 rounded-xl text-[11px] font-bold pr-10"
                disabled={acordaos.length === 0}
              />
              <button onClick={handleSendMessage} className="absolute right-2 top-2 bg-indigo-600 text-white p-1.5 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-30" disabled={!userInput.trim() || acordaos.length === 0}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* MODAL DE CAPTURA (CTRL+A + CTRL+C) */}
      {capturedText && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95">
            <div className="p-4 bg-indigo-600 text-white flex justify-between items-center">
              <h3 className="font-black text-xs uppercase tracking-widest">Acórdão Detetado no Clipboard</h3>
              <button onClick={() => setCapturedText(null)} className="text-white/60 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50 text-[11px] font-mono leading-relaxed whitespace-pre-wrap select-all custom-scrollbar">
              {capturedText}
            </div>
            <div className="p-4 bg-white border-t border-slate-200 flex justify-end gap-3">
              <button onClick={() => setCapturedText(null)} className="px-6 py-2 text-[10px] font-bold text-slate-400 hover:text-slate-600">CANCELAR</button>
              <button 
                onClick={processCapturedText} 
                disabled={isLoading}
                className="bg-indigo-600 text-white px-8 py-2 rounded-xl text-[10px] font-black shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2"
              >
                {isLoading ? 'A CONVERTER...' : 'GUARDAR TXT E CONVERTER PARA JSON'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notificações */}
      {notification && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-full shadow-2xl z-50 text-[10px] font-black border border-indigo-500 animate-in fade-in slide-in-from-bottom-4">
          {notification}
        </div>
      )}
      
      {error && (
        <div className="fixed top-6 right-6 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl z-50 text-xs font-bold animate-in slide-in-from-right-4">
          {error}
          <button onClick={() => setError(null)} className="ml-4 opacity-50">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
