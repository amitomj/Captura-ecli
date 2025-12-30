
import React, { useState, useEffect, useCallback } from 'react';
import { StorageService } from './services/storageService';
import { parseCsmHtml } from './services/parserService';
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
  
  // Abas e Navegação
  const [activeTab, setActiveTab] = useState<'browse' | 'chat'>('browse');
  
  // Modal de Captura
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [currentIframeUrl, setCurrentIframeUrl] = useState('');

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

  const handleOpenCapture = (url: string) => {
    setCurrentIframeUrl(url);
    setShowCaptureModal(true);
  };

  const handleConfirmCapture = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.length < 500) {
        setError("O conteúdo copiado parece insuficiente. Pressione CTRL+A e CTRL+C dentro do acórdão.");
        return;
      }
      await saveContent(text, currentIframeUrl);
      setShowCaptureModal(false);
    } catch (e) {
      setError("Permita o acesso à área de transferência para capturar.");
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
              DOCS TXT
            </div>
            <div className="text-right border-l border-slate-700 pl-4">
              <span className="text-amber-500 block text-sm leading-none">{acordaos.length}</span>
              PROCESSADOS
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-80px)] overflow-hidden">
        
        {/* Painel Lateral */}
        <div className="lg:col-span-4 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
          
          <section className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">1. Repositório Local</h2>
            {!isFolderSelected ? (
              <button onClick={handleSelectFolder} className="w-full bg-slate-900 text-white py-3 rounded-2xl font-black text-xs hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                Conectar Pasta
              </button>
            ) : (
              <div className="bg-green-50 p-3 rounded-2xl border border-green-100 flex items-center gap-3">
                <div className="bg-green-500 w-2 h-2 rounded-full animate-pulse"></div>
                <div className="text-[10px] font-bold text-green-800 uppercase">Modo {storageMode} Ativo</div>
              </div>
            )}
          </section>

          <section className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">2. URLs do CSM</h2>
            <textarea 
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              placeholder="Cole URLs (uma por linha)..."
              className="w-full h-24 bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-[10px] font-mono focus:border-amber-500 outline-none transition-all mb-3 custom-scrollbar"
            />
            <button 
              onClick={() => {
                const urls = bulkUrls.split('\n').filter(u => u.trim().startsWith('http'));
                if (urls.length > 0) handleOpenCapture(urls[0]);
              }}
              disabled={!isFolderSelected || !bulkUrls.trim()}
              className="w-full bg-slate-800 text-white py-3 rounded-xl font-black text-[10px] uppercase hover:bg-slate-700 disabled:bg-slate-100"
            >
              Capturar URLs Coladas
            </button>
          </section>

          <section className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <h2 className="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">Acórdãos na Pasta</h2>
            <div className="max-h-64 overflow-y-auto space-y-1 custom-scrollbar pr-1">
              {rawFiles.length === 0 ? (
                <div className="text-[9px] text-slate-300 italic text-center py-4 border-2 border-dashed border-slate-50 rounded-xl uppercase font-black">Pasta Vazia</div>
              ) : (
                rawFiles.map((f, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-[9px] font-mono truncate max-w-[150px] font-bold text-slate-600">{f.name}</span>
                    <span className="text-[7px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-black">OK</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Área Principal (Direita) */}
        <div className="lg:col-span-8 flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden h-full relative">
          
          {/* Seletor de Abas */}
          <div className="bg-slate-900 flex items-center p-1 border-b-2 border-indigo-600">
            <button 
              onClick={() => setActiveTab('browse')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-t-2xl ${activeTab === 'browse' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Navegador CSM
            </button>
            <button 
              onClick={() => setActiveTab('chat')}
              className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all rounded-t-2xl ${activeTab === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Analista IA ({acordaos.length})
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden">
            {activeTab === 'browse' ? (
              <div className="h-full w-full flex flex-col">
                <iframe 
                  src="https://jurisprudencia.csm.org.pt/" 
                  className="flex-1 w-full border-none"
                  title="CSM Browser"
                />
                <div className="absolute bottom-6 right-6 group">
                  <button 
                    onClick={() => {
                      const msg = "Para capturar, abra o acórdão desejado e cole a URL aqui em baixo ou clique no botão de captura.";
                      showNotification(msg);
                    }}
                    className="bg-amber-500 text-white p-4 rounded-full shadow-2xl hover:bg-amber-600 transition-all hover:scale-110 active:scale-95"
                    title="Ajuda de Captura"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col bg-slate-50/30">
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-20 grayscale">
                      <div className="w-16 h-16 bg-slate-300 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                      </div>
                      <p className="text-xs font-black uppercase tracking-widest">Base de Dados aguardando consultas...</p>
                    </div>
                  ) : (
                    messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] p-5 rounded-[1.5rem] shadow-sm ${
                          msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-800 border-l-4 border-indigo-600'
                        }`}>
                          <div className="serif text-sm leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {isLoading && <div className="text-[10px] font-black text-indigo-500 animate-pulse">ANALISTA ESTÁ A PROCESSAR...</div>}
                </div>

                <div className="p-4 bg-white border-t border-slate-100">
                  <div className="flex gap-2 bg-slate-100 p-1.5 rounded-xl">
                    <input 
                      type="text" 
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                      placeholder="Faça uma pergunta jurídica..."
                      className="flex-1 bg-transparent border-none outline-none px-4 text-xs font-bold"
                      disabled={acordaos.length === 0 || isLoading}
                    />
                    <button onClick={handleSendMessage} className="bg-indigo-600 text-white p-3 rounded-lg hover:bg-indigo-700 shadow-md">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL DE CAPTURA COM IFRAME INTEGRADO */}
      {showCaptureModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border-4 border-indigo-600 animate-in zoom-in duration-200">
            
            <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest">Janela de Captura</h3>
                <p className="text-[9px] opacity-70 truncate max-w-md">{currentIframeUrl}</p>
              </div>
              <button 
                onClick={() => setShowCaptureModal(false)}
                className="text-white hover:opacity-50 transition-all font-black"
              >
                FECHAR ✕
              </button>
            </div>

            <div className="flex-1 bg-slate-100 relative">
              <iframe 
                src={currentIframeUrl} 
                className="w-full h-full border-none bg-white"
                title="Capture Frame"
              />
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-6 py-2 rounded-full shadow-lg text-[10px] font-black uppercase tracking-tighter animate-bounce">
                Pressione CTRL+A e CTRL+C dentro desta janela
              </div>
            </div>

            <div className="bg-slate-50 p-6 flex gap-4 border-t border-slate-200">
              <button 
                onClick={() => setShowCaptureModal(false)}
                className="flex-1 py-4 text-slate-400 font-black text-xs uppercase hover:text-slate-600 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmCapture}
                className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm uppercase shadow-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                Confirmar Captura (OK)
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed bottom-6 left-6 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl z-[300] text-[9px] font-black uppercase border-l-4 border-amber-500 animate-in slide-in-from-left-full">
          {notification}
        </div>
      )}

      {error && (
        <div className="fixed top-6 right-6 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl z-[300] text-[10px] font-bold animate-in slide-in-from-right-full">
          {error}
          <button onClick={() => setError(null)} className="ml-4 font-black">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
