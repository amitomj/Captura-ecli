
import React, { useState, useEffect, useCallback } from 'react';
import { StorageService } from './services/storageService';
import { parseCsmHtml } from './services/parserService';
import { Acordao, ChatMessage } from './types';
import { analyzeJurisprudence } from './services/geminiService';

const App: React.FC = () => {
  const [isFolderSelected, setIsFolderSelected] = useState(false);
  const [acordaos, setAcordaos] = useState<Acordao[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  
  // Estados de Navegação e Captura
  const [activeTab, setActiveTab] = useState<'browser' | 'analysis'>('browser');
  const [browserBaseUrl, setBrowserBaseUrl] = useState('https://jurisprudencia.csm.org.pt/');
  const [targetUrl, setTargetUrl] = useState('');
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [capturedText, setCapturedText] = useState('');
  const [showDbModal, setShowDbModal] = useState(false);

  const refreshData = useCallback(async () => {
    if (StorageService.isReady()) {
      const processed = await StorageService.listProcessedAcordaos();
      setAcordaos(processed);
    }
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleOpenCaptureModal = () => {
    if (!targetUrl.trim()) {
      setError("Por favor, cole a URL de um acórdão no campo de captura.");
      return;
    }
    setCapturedText('');
    setShowCaptureModal(true);
  };

  const handleConfirmProcess = async () => {
    if (!capturedText.trim()) {
      setError("Por favor, cole o conteúdo do acórdão na área de texto.");
      return;
    }

    setIsLoading(true);
    try {
      const result = parseCsmHtml(capturedText, targetUrl);
      
      if (result.success && result.data) {
        const timestamp = Date.now();
        const procClean = result.data.processo?.replace(/[/\\?%*:|"<>]/g, '_') || `proc_${timestamp}`;
        
        const acordaoData: Acordao = {
          ...result.data,
          id: result.data.id || `ecli_${timestamp}`,
          ecli: result.data.ecli || `ECLI:PT:UNKNOWN:${timestamp}`,
          relator: result.data.relator || 'Desconhecido',
          descritores: result.data.descritores || [],
          processo: result.data.processo || 'Desconhecido',
          data: result.data.data || 'Desconhecida',
          sumario: result.data.sumario || '',
          textoIntegral: capturedText,
          adjuntos: result.data.adjuntos || [],
          url: targetUrl,
          fileName: procClean
        };

        // 1. Gravar TXT
        await StorageService.saveRawTxt(procClean, capturedText);
        
        // 2. Gravar JSON
        await StorageService.saveProcessedAcordao(acordaoData);
        
        showNotification(`Acórdão ${procClean} processado com sucesso!`);
        setShowCaptureModal(false);
        setTargetUrl('');
        await refreshData();
      } else {
        throw new Error("Não foi possível extrair os dados do texto colado.");
      }
    } catch (e) {
      setError("Erro: " + (e as Error).message);
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
      setError("IA: " + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans overflow-hidden">
      
      {/* HEADER SUPERIOR */}
      <header className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-xl z-50">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center font-black shadow-lg">J</div>
          <h1 className="font-black text-lg tracking-tighter uppercase hidden sm:block">JurisAnalyzer <span className="text-indigo-400">PRO</span></h1>
        </div>

        <nav className="flex bg-slate-800 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('browser')}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'browser' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400'}`}
          >
            Navegador CSM
          </button>
          <button 
            onClick={() => setActiveTab('analysis')}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'analysis' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400'}`}
          >
            Análise IA
          </button>
        </nav>

        <div className="flex items-center gap-4">
           <button onClick={() => setShowDbModal(true)} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-700 flex items-center gap-3">
             <span className="text-[10px] font-black uppercase">Base</span>
             <span className="bg-indigo-500 px-2 py-0.5 rounded text-[10px]">{acordaos.length}</span>
           </button>
           {!isFolderSelected && (
             <button onClick={handleActivateFolder} className="bg-amber-500 hover:bg-amber-600 text-slate-900 text-[10px] font-black px-4 py-2 rounded-xl shadow-lg">
               ATIVAR PASTA
             </button>
           )}
        </div>
      </header>

      {/* ÁREA PRINCIPAL */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        
        {/* MODO NAVEGADOR COM BARRA DE CAPTURA */}
        {activeTab === 'browser' && (
          <div className="flex-1 flex flex-col">
            {/* Barra de Ação de Captura */}
            <div className="bg-white p-3 border-b border-slate-200 flex items-center gap-4 shadow-sm">
               <div className="flex-1 relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.826a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.103-1.103" /></svg>
                  </div>
                  <input 
                    type="text" 
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="Cole aqui a URL do acórdão para abrir a janela de tratamento..."
                    className="w-full bg-slate-50 border border-slate-200 pl-12 pr-4 py-3 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 transition-all"
                  />
               </div>
               <button 
                 onClick={handleOpenCaptureModal}
                 disabled={!isFolderSelected || !targetUrl.trim()}
                 className="bg-indigo-600 text-white px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-30 flex items-center gap-2"
               >
                 Tratar este Acórdão
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" /></svg>
               </button>
            </div>
            {/* Site do ECLI/CSM */}
            <iframe src={browserBaseUrl} className="flex-1 w-full border-none bg-white" title="Jurisprudência CSM" />
          </div>
        )}

        {/* MODO ANÁLISE IA */}
        {activeTab === 'analysis' && (
          <div className="flex-1 bg-slate-100 p-8">
             <div className="max-w-4xl mx-auto h-full flex flex-col bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden">
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                   <h2 className="text-sm font-black uppercase tracking-widest">Análise de Divergências</h2>
                   <span className="text-[10px] font-bold text-slate-400">Contexto: {acordaos.length} documentos</span>
                </div>
                <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
                   {messages.map((msg, i) => (
                     <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-6 rounded-[32px] text-sm leading-relaxed ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none shadow-lg' : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-none'}`}>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                     </div>
                   ))}
                </div>
                <div className="p-8 border-t border-slate-100">
                   <div className="relative">
                      <input 
                        type="text" 
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Pesquise contradições no seu arquivo..."
                        className="w-full bg-slate-100 border-none p-6 rounded-3xl outline-none pr-20 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all"
                      />
                      <button onClick={handleSendMessage} className="absolute right-3 top-3 bg-indigo-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                      </button>
                   </div>
                </div>
             </div>
          </div>
        )}
      </main>

      {/* JANELA MODAL DE CAPTURA (O FLOW SOLICITADO) */}
      {showCaptureModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/90 backdrop-blur-md p-6">
          <div className="bg-white w-full h-full max-w-[95%] max-h-[95%] rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
               <div className="flex items-center gap-4">
                  <div className="bg-indigo-600 px-3 py-1 rounded text-[10px] font-black uppercase">Tratamento de Acórdão</div>
                  <h3 className="text-sm font-bold truncate max-w-xl opacity-70">{targetUrl}</h3>
               </div>
               <button onClick={() => setShowCaptureModal(false)} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center font-bold text-xl">✕</button>
            </div>

            <div className="flex-1 flex overflow-hidden">
               {/* LADO ESQUERDO: O SITE PARA SELEÇÃO */}
               <div className="flex-1 border-r border-slate-200 bg-white relative">
                  <div className="absolute top-4 left-4 right-4 bg-indigo-600 text-white p-3 rounded-xl border border-indigo-400 text-[10px] font-black uppercase z-10 text-center shadow-xl">
                     1. Selecione tudo no site (Ctrl+A) -> Copie (Ctrl+C)
                  </div>
                  <iframe src={targetUrl} className="w-full h-full border-none" title="CSM Viewer" />
               </div>

               {/* LADO DIREITO: ÁREA PARA COLAR */}
               <div className="w-[480px] flex flex-col bg-slate-50">
                  <div className="p-8 border-b border-slate-200 bg-white">
                     <h4 className="text-[11px] font-black text-slate-900 uppercase mb-2 tracking-widest">Área de Captura</h4>
                     <p className="text-[10px] text-slate-400 font-bold uppercase leading-tight">2. Cole o conteúdo copiado aqui para processar.</p>
                  </div>
                  <div className="flex-1 p-8 flex flex-col">
                     <textarea 
                       value={capturedText}
                       onChange={(e) => setCapturedText(e.target.value)}
                       placeholder="Cole o texto integral aqui..."
                       className="flex-1 w-full p-8 bg-white border border-slate-200 rounded-3xl outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-xs font-mono leading-relaxed resize-none shadow-inner"
                     />
                  </div>
                  <div className="p-8 bg-white border-t border-slate-200">
                     <button 
                       onClick={handleConfirmProcess}
                       disabled={isLoading || !capturedText.trim()}
                       className="w-full bg-indigo-600 text-white p-6 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 disabled:opacity-50 active:scale-95"
                     >
                       {isLoading ? 'A PROCESSAR...' : 'OK - CRIAR TXT E JSON'}
                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                     </button>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE ARQUIVO */}
      {showDbModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-12 bg-slate-900/80 backdrop-blur-sm">
           <div className="bg-white w-full max-w-6xl h-[85vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <h2 className="text-2xl font-black uppercase tracking-tighter">Arquivo Jurisprudencial</h2>
                 <button onClick={() => setShowDbModal(false)} className="w-14 h-14 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-slate-50">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {acordaos.map((a, i) => (
                      <div key={i} className="bg-white border border-slate-100 p-8 rounded-[35px] hover:border-indigo-500 transition-all shadow-sm">
                         <div className="text-[10px] font-black text-indigo-600 mb-3">{a.data}</div>
                         <h4 className="text-sm font-black text-slate-800 mb-2 truncate">{a.processo}</h4>
                         <p className="text-[10px] font-bold text-slate-400 uppercase">{a.relator}</p>
                         <div className="mt-6 pt-6 border-t border-slate-50 flex gap-2">
                            <span className="text-[8px] font-black bg-slate-100 px-2 py-1 rounded text-slate-500 uppercase">TXT</span>
                            <span className="text-[8px] font-black bg-slate-100 px-2 py-1 rounded text-slate-500 uppercase">JSON</span>
                         </div>
                      </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* FEEDBACK */}
      {notification && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-10 py-5 rounded-full shadow-2xl border border-indigo-500 z-[150] animate-in slide-in-from-bottom-10 flex items-center gap-3">
           <div className="w-2 h-2 bg-indigo-500 rounded-full animate-ping"></div>
           <span className="text-xs font-black uppercase tracking-widest">{notification}</span>
        </div>
      )}

      {error && (
        <div className="fixed top-24 right-10 bg-red-600 text-white px-8 py-5 rounded-3xl shadow-2xl z-[150] flex items-center gap-6 border-2 border-red-500">
           <span className="text-xs font-bold leading-tight max-w-xs">{error}</span>
           <button onClick={() => setError(null)} className="font-bold text-white/50 hover:text-white">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
