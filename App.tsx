
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
  const [targetUrl, setTargetUrl] = useState('');
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [capturedText, setCapturedText] = useState('');
  const [showDbModal, setShowDbModal] = useState(false);

  // Carregar dados da pasta
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

  // Abrir a janela modal para o acórdão específico
  const handleOpenCaptureModal = () => {
    if (!targetUrl.trim() || !targetUrl.startsWith('http')) {
      setError("Por favor, cole uma URL válida de um acórdão.");
      return;
    }
    setCapturedText('');
    setShowCaptureModal(true);
  };

  // Processar o texto copiado (Ctrl+A / Ctrl+C) e colado no modal
  const handleConfirmProcess = async () => {
    if (!capturedText.trim()) {
      setError("A área de captura está vazia. Cole o conteúdo do acórdão primeiro.");
      return;
    }

    setIsLoading(true);
    try {
      // O parser extrai metadados do texto colado
      const result = parseCsmHtml(capturedText, targetUrl);
      
      if (result.success && result.data) {
        const timestamp = Date.now();
        // Nome de ficheiro limpo baseado no processo ou timestamp
        const procClean = result.data.processo?.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '') || `acordao_${timestamp}`;
        
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
        } as Acordao;

        // 1. Gravar TXT (Texto bruto para consulta futura)
        await StorageService.saveRawTxt(procClean, capturedText);
        
        // 2. Gravar JSON (Dados estruturados para IA)
        await StorageService.saveProcessedAcordao(acordaoData);
        
        showNotification(`Sucesso! Criados ficheiros TXT e JSON para o processo ${procClean}.`);
        setShowCaptureModal(false);
        setTargetUrl('');
        await refreshData();
      } else {
        throw new Error("Não foi possível identificar a estrutura do acórdão. Verifique se copiou o texto completo.");
      }
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
      setError("A pasta de destino não foi selecionada ou o acesso foi negado.");
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
      setError("Erro IA: " + (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-slate-100 flex flex-col font-sans overflow-hidden">
      
      {/* HEADER PRINCIPAL */}
      <header className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-xl z-50">
        <div className="flex items-center gap-5">
          <div className="bg-indigo-600 w-11 h-11 rounded-2xl flex items-center justify-center font-black shadow-lg transform rotate-3">J</div>
          <div>
            <h1 className="font-black text-xl tracking-tighter uppercase leading-none">JurisAnalyzer <span className="text-indigo-400">CSM</span></h1>
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              {isFolderSelected ? '📁 Pasta de Destino Ativa' : '⚠️ Selecione uma pasta para começar'}
            </div>
          </div>
        </div>

        <nav className="flex bg-slate-800 p-1 rounded-2xl border border-slate-700">
          <button 
            onClick={() => setActiveTab('browser')}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'browser' ? 'bg-indigo-600 shadow-lg text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Pesquisa Jurisprudência
          </button>
          <button 
            onClick={() => setActiveTab('analysis')}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'analysis' ? 'bg-indigo-600 shadow-lg text-white' : 'text-slate-400 hover:text-white'}`}
          >
            Análise IA
          </button>
        </nav>

        <div className="flex items-center gap-4">
           <button 
             onClick={() => setShowDbModal(true)} 
             className="bg-slate-800 hover:bg-slate-700 px-5 py-2.5 rounded-xl border border-slate-700 flex items-center gap-3 transition-colors"
           >
             <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Meu Arquivo</span>
             <span className="bg-indigo-500 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm">{acordaos.length}</span>
           </button>
           
           {!isFolderSelected && (
             <button onClick={handleActivateFolder} className="bg-amber-500 hover:bg-amber-600 text-slate-900 text-[10px] font-black px-6 py-2.5 rounded-xl shadow-2xl transition-all transform hover:scale-105 active:scale-95">
               SELECIONAR PASTA
             </button>
           )}
        </div>
      </header>

      {/* ÁREA DE CONTEÚDO */}
      <main className="flex-1 overflow-hidden relative flex flex-col">
        
        {/* NAVEGADOR ECLI INTEGRADO */}
        {activeTab === 'browser' && (
          <div className="flex-1 flex flex-col animate-in fade-in duration-500">
            {/* BARRA DE CAPTURA DE URL */}
            <div className="bg-white p-4 border-b border-slate-200 flex items-center gap-4 shadow-sm z-20">
               <div className="flex-1 relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.826a4 4 0 015.656 0l4 4a4 4 0 01-5.656 5.656l-1.103-1.103" /></svg>
                  </div>
                  <input 
                    type="text" 
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="Cole aqui a URL do acórdão copiada do site abaixo..."
                    className="w-full bg-slate-50 border border-slate-200 pl-12 pr-4 py-4 rounded-2xl text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all shadow-inner"
                  />
               </div>
               <button 
                 onClick={handleOpenCaptureModal}
                 disabled={!isFolderSelected || !targetUrl.trim()}
                 className="bg-indigo-600 text-white px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-indigo-700 transition-all disabled:opacity-30 disabled:grayscale flex items-center gap-3 transform active:scale-95"
               >
                 Abrir para Tratamento
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7-7 7" /></svg>
               </button>
            </div>
            {/* IFRAME COM O SITE ECLI */}
            <div className="flex-1 w-full bg-white relative">
               <iframe 
                 src="https://jurisprudencia.csm.org.pt/" 
                 className="w-full h-full border-none shadow-inner" 
                 title="Pesquisa ECLI CSM"
               />
            </div>
          </div>
        )}

        {/* ÁREA DE ANÁLISE IA */}
        {activeTab === 'analysis' && (
          <div className="flex-1 bg-slate-50 p-10 flex flex-col items-center">
             <div className="w-full max-w-5xl h-full flex flex-col bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-5 duration-500">
                <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
                      <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">Motor de Análise Jurisprudencial</h2>
                   </div>
                   <span className="text-[10px] font-black text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-100">
                     CONTEXTO: {acordaos.length} DOCUMENTOS
                   </span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                   {messages.length === 0 && (
                     <div className="h-full flex flex-col items-center justify-center text-slate-200 text-center select-none">
                        <svg className="w-24 h-24 mb-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                        <p className="text-sm font-black uppercase tracking-widest opacity-40">Pronto para analisar divergências jurisprudenciais</p>
                     </div>
                   )}
                   {messages.map((msg, i) => (
                     <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-7 rounded-[35px] text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-slate-50 border border-slate-200 text-slate-800 rounded-tl-none'}`}>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                     </div>
                   ))}
                   {isLoading && <div className="text-xs font-black text-indigo-600 animate-pulse tracking-[0.2em] uppercase">O Assistente está a analisar os acórdãos...</div>}
                </div>

                <div className="p-8 border-t border-slate-100 bg-white">
                   <div className="relative max-w-4xl mx-auto">
                      <input 
                        type="text" 
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Ex: Qual a jurisprudência dominante sobre responsabilidade médica neste arquivo?"
                        className="w-full bg-slate-100 border-none p-6 rounded-[25px] outline-none pr-24 text-sm font-medium focus:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all shadow-inner"
                        disabled={acordaos.length === 0}
                      />
                      <button onClick={handleSendMessage} disabled={!userInput.trim() || isLoading} className="absolute right-3 top-3 bg-indigo-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-30">
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/95 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full h-full max-w-[98%] max-h-[95%] rounded-[50px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            
            <div className="p-8 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
               <div className="flex items-center gap-6">
                  <div className="bg-indigo-600 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest">Janela de Tratamento</div>
                  <div>
                    <h3 className="text-sm font-black truncate max-w-2xl opacity-80">{targetUrl}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1">Siga as instruções para criar os ficheiros TXT e JSON</p>
                  </div>
               </div>
               <button onClick={() => setShowCaptureModal(false)} className="w-12 h-12 rounded-full hover:bg-white/10 flex items-center justify-center font-bold text-2xl transition-colors">✕</button>
            </div>

            <div className="flex-1 flex overflow-hidden">
               {/* LADO ESQUERDO: O ACÓRDÃO PARA COPIAR */}
               <div className="flex-1 border-r border-slate-200 bg-white relative flex flex-col">
                  <div className="bg-indigo-600 text-white p-4 font-black text-[10px] uppercase tracking-[0.2em] text-center shadow-lg z-10">
                     1. Clique abaixo &rarr; Selecione tudo (Ctrl+A) &rarr; Copie (Ctrl+C)
                  </div>
                  <iframe src={targetUrl} className="flex-1 w-full border-none" title="Acórdão em Tratamento" />
               </div>

               {/* LADO DIREITO: ÁREA PARA COLAR E CONFIRMAR */}
               <div className="w-[550px] flex flex-col bg-slate-50">
                  <div className="p-10 border-b border-slate-200 bg-white shadow-sm">
                     <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-xs">2</div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest">Área de Captura</h4>
                     </div>
                     <p className="text-[10px] text-slate-400 font-bold uppercase leading-relaxed">
                       Cole aqui o conteúdo copiado da janela à esquerda para gerar automaticamente os ficheiros na pasta selecionada.
                     </p>
                  </div>
                  
                  <div className="flex-1 p-10 flex flex-col overflow-hidden">
                     <textarea 
                       value={capturedText}
                       onChange={(e) => setCapturedText(e.target.value)}
                       placeholder="Cole o conteúdo integral (Ctrl+V) aqui..."
                       className="flex-1 w-full p-10 bg-white border-2 border-slate-100 rounded-[40px] outline-none focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500 transition-all text-xs font-mono leading-loose resize-none shadow-inner custom-scrollbar"
                     />
                  </div>

                  <div className="p-10 bg-white border-t border-slate-200">
                     <button 
                       onClick={handleConfirmProcess}
                       disabled={isLoading || !capturedText.trim()}
                       className="w-full bg-indigo-600 text-white py-7 rounded-[25px] font-black text-sm uppercase tracking-[0.3em] shadow-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-4 disabled:opacity-50 active:scale-95 group"
                     >
                       {isLoading ? 'A GERAR FICHEIROS...' : 'OK - CONFIRMAR ENVIO'}
                       <svg className="w-6 h-6 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                     </button>
                  </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE LISTAGEM DE ARQUIVO */}
      {showDbModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-12 bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-7xl h-[85vh] rounded-[50px] shadow-2xl flex flex-col overflow-hidden">
              <div className="p-10 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <div>
                    <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Arquivo Jurisprudencial</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Documentos processados e prontos para análise</p>
                 </div>
                 <button onClick={() => setShowDbModal(false)} className="w-16 h-16 rounded-3xl bg-white border border-slate-200 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all shadow-sm">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-slate-100/50">
                 {acordaos.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                       <p className="text-xl font-black uppercase tracking-[0.2em]">Sem documentos no arquivo</p>
                    </div>
                 ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                      {acordaos.map((a, i) => (
                        <div key={i} className="bg-white border border-slate-100 p-8 rounded-[40px] hover:border-indigo-500 transition-all shadow-lg group relative overflow-hidden">
                           <div className="absolute top-0 right-0 p-4">
                              <span className="bg-slate-100 text-[8px] font-black px-2 py-1 rounded-md text-slate-500">JSON+TXT</span>
                           </div>
                           <div className="text-[10px] font-black text-indigo-600 mb-4">{a.data}</div>
                           <h4 className="text-sm font-black text-slate-800 mb-2 leading-tight h-10 line-clamp-2">{a.processo}</h4>
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{a.relator}</p>
                           <div className="mt-8 pt-6 border-t border-slate-50 flex flex-wrap gap-2">
                              {a.descritores.slice(0, 3).map((d, idx) => (
                                <span key={idx} className="text-[8px] font-bold bg-indigo-50 text-indigo-500 px-2 py-1 rounded-full">{d}</span>
                              ))}
                           </div>
                        </div>
                      ))}
                    </div>
                 )}
              </div>
           </div>
        </div>
      )}

      {/* FEEDBACKS (TOASTS) */}
      {notification && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-12 py-5 rounded-full shadow-2xl border border-indigo-500 z-[150] animate-in slide-in-from-bottom-10 flex items-center gap-4">
           <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_10px_indigo]"></div>
           <span className="text-[11px] font-black uppercase tracking-widest">{notification}</span>
        </div>
      )}

      {error && (
        <div className="fixed top-28 right-12 bg-red-600 text-white px-10 py-6 rounded-[30px] shadow-2xl z-[150] flex items-center gap-8 border-2 border-red-500 animate-in slide-in-from-right-10 max-w-md">
           <span className="text-xs font-bold leading-relaxed">{error}</span>
           <button onClick={() => setError(null)} className="font-bold text-white/50 hover:text-white transition-colors">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
