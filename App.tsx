
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [browserUrl, setBrowserUrl] = useState('https://jurisprudencia.csm.org.pt/');
  const [activeTab, setActiveTab] = useState<'browser' | 'analysis'>('browser');
  const [capturedText, setCapturedText] = useState<string | null>(null);
  const [showDbModal, setShowDbModal] = useState(false);
  
  const lastProcessedContent = useRef<string>('');

  // Sincroniza dados da pasta
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

  // Monitoriza clipboard para abrir modal de captura
  const handleClipboardCheck = useCallback(async () => {
    if (!isFolderSelected || capturedText) return;
    try {
      const text = await navigator.clipboard.readText();
      if (!text || text === lastProcessedContent.current || text.length < 1000) return;
      
      // Se detetar texto longo que pareça um acórdão (contém palavras chave)
      if (text.includes('Acórdão') || text.includes('Processo') || text.includes('Relator') || text.includes('ECLI:')) {
        lastProcessedContent.current = text;
        setCapturedText(text); // Abre o modal de confirmação
      }
    } catch (err) {}
  }, [isFolderSelected, capturedText]);

  useEffect(() => {
    window.addEventListener('focus', handleClipboardCheck);
    if (isFolderSelected) refreshData();
    return () => window.removeEventListener('focus', handleClipboardCheck);
  }, [handleClipboardCheck, isFolderSelected, refreshData]);

  // Ação de confirmar: Cria TXT e JSON
  const handleConfirmCapture = async () => {
    if (!capturedText) return;
    setIsLoading(true);
    try {
      const timestamp = Date.now();
      const result = parseCsmHtml(capturedText, browserUrl);
      
      if (result.success && result.data) {
        const acordaoData = {
          ...result.data,
          id: result.data.id || `proc_${timestamp}`,
          fileName: result.data.processo?.replace(/\//g, '_') || `captura_${timestamp}`
        } as Acordao;

        // 1. Salva o TXT (Rascunho)
        await StorageService.saveRawTxt(acordaoData.fileName!, capturedText);
        
        // 2. Salva o JSON (Processado)
        await StorageService.saveProcessedAcordao(acordaoData);
        
        showNotification("Sucesso: TXT e JSON criados!");
      } else {
        throw new Error("Não foi possível extrair dados estruturados deste texto.");
      }
      setCapturedText(null);
      await refreshData();
    } catch (e) {
      setError((e as Error).message);
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
      setError("Acesso à pasta negado.");
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
    <div className="h-screen bg-slate-100 flex flex-col font-sans overflow-hidden text-slate-900">
      
      {/* HEADER PRINCIPAL */}
      <header className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shadow-2xl z-50">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 w-9 h-9 rounded-lg flex items-center justify-center font-black shadow-lg">J</div>
            <h1 className="font-black tracking-tighter text-lg">JurisAnalyzer</h1>
          </div>
          
          {/* Botão de Voltar ao Início/Pesquisa */}
          <button 
            onClick={() => { setBrowserUrl('https://jurisprudencia.csm.org.pt/'); setActiveTab('browser'); }}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-700 transition-all text-[10px] font-black uppercase tracking-widest"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            Pesquisa ECLI
          </button>
        </div>

        {/* NAVEGAÇÃO DE ABAS */}
        <nav className="flex bg-slate-800 p-1 rounded-2xl border border-slate-700">
          <button 
            onClick={() => setActiveTab('browser')}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'browser' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Navegador CSM
          </button>
          <button 
            onClick={() => setActiveTab('analysis')}
            className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'analysis' ? 'bg-indigo-600 shadow-lg' : 'text-slate-400 hover:text-white'}`}
          >
            Análise IA
          </button>
        </nav>

        <div className="flex items-center gap-4">
          <button onClick={() => setShowDbModal(true)} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-700 flex items-center gap-3 transition-all">
            <span className="text-[10px] font-black uppercase tracking-widest">Acórdãos</span>
            <span className="bg-indigo-500 px-2 py-0.5 rounded text-[10px]">{acordaos.length}</span>
          </button>
          
          {!isFolderSelected && (
            <button onClick={handleActivateFolder} className="bg-amber-500 hover:bg-amber-600 text-slate-900 text-[10px] font-black px-4 py-2 rounded-xl transition-all shadow-lg">
              ATIVAR PASTA
            </button>
          )}
        </div>
      </header>

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <main className="flex-1 overflow-hidden flex relative">
        
        {/* MODO 1: BROWSER (Sempre que activeTab for 'browser') */}
        <div className={`flex-1 flex flex-col ${activeTab !== 'browser' ? 'hidden' : ''}`}>
          <div className="bg-white p-2 border-b border-slate-200 flex items-center gap-4">
             <input 
               type="text" 
               value={browserUrl} 
               onChange={(e) => setBrowserUrl(e.target.value)}
               className="flex-1 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
               placeholder="URL do Acórdão..."
             />
             <div className="text-[10px] font-black text-slate-400 uppercase pr-4">
                {isFolderSelected ? '📁 Pasta Conectada' : '⚠️ Pasta Desconectada'}
             </div>
          </div>
          <iframe 
            src={browserUrl} 
            className="flex-1 w-full bg-white" 
            title="Navegador CSM"
          />
        </div>

        {/* MODO 2: ANÁLISE IA (Sempre que activeTab for 'analysis') */}
        <div className={`flex-1 flex bg-slate-50 ${activeTab !== 'analysis' ? 'hidden' : ''}`}>
           <section className="max-w-4xl mx-auto w-full flex flex-col p-6">
              <div className="flex-1 bg-white rounded-3xl shadow-xl border border-slate-200 flex flex-col overflow-hidden">
                 <div className="p-6 border-b border-slate-100 flex items-center gap-4 bg-slate-50/50">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
                       <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                    </div>
                    <div>
                       <h2 className="text-sm font-black uppercase tracking-widest">Motor de Inteligência</h2>
                       <p className="text-[10px] font-bold text-slate-400 uppercase">Analisando contexto de {acordaos.length} acórdãos</p>
                    </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
                    {messages.length === 0 && (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                         <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                         <p className="font-black text-xs uppercase">Sem questões pendentes</p>
                      </div>
                    )}
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-5 rounded-3xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-slate-50 border border-slate-100 text-slate-800 rounded-tl-none'}`}>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                      </div>
                    ))}
                    {isLoading && <div className="text-xs font-black text-indigo-600 animate-pulse uppercase tracking-widest">A IA está a pensar...</div>}
                 </div>

                 <div className="p-6 border-t border-slate-100">
                    <div className="relative">
                       <input 
                         type="text" 
                         value={userInput}
                         onChange={(e) => setUserInput(e.target.value)}
                         onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                         placeholder="Faça uma pergunta sobre a jurisprudência carregada..."
                         className="w-full bg-slate-100 border-none outline-none p-5 rounded-2xl text-sm font-medium pr-16 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 transition-all"
                         disabled={acordaos.length === 0 || isLoading}
                       />
                       <button 
                         onClick={handleSendMessage}
                         disabled={!userInput.trim() || isLoading}
                         className="absolute right-3 top-3 bg-indigo-600 text-white w-12 h-12 rounded-xl flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all active:scale-90 disabled:opacity-30"
                       >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                       </button>
                    </div>
                 </div>
              </div>
           </section>
        </div>
      </main>

      {/* MODAL DE CAPTURA MANUAL (O MAIS IMPORTANTE) */}
      {capturedText && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-slate-900/80 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-4xl h-[85vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
               <div>
                  <h3 className="font-black text-sm uppercase tracking-widest">Deteção de Acórdão</h3>
                  <p className="text-[10px] font-bold text-indigo-100 mt-1 uppercase">Verifique o texto e confirme para criar os ficheiros TXT e JSON</p>
               </div>
               <button onClick={() => setCapturedText(null)} className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-xl font-bold">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 bg-slate-50 font-mono text-[11px] leading-relaxed whitespace-pre-wrap select-all custom-scrollbar text-slate-500">
               {capturedText}
            </div>

            <div className="p-8 bg-white border-t border-slate-100 flex justify-end gap-6 items-center">
               <button onClick={() => setCapturedText(null)} className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest">Cancelar</button>
               <button 
                 onClick={handleConfirmCapture} 
                 disabled={isLoading}
                 className="bg-indigo-600 text-white px-12 py-4 rounded-2xl text-[11px] font-black shadow-2xl hover:bg-indigo-700 transition-all flex items-center gap-3 transform active:scale-95"
               >
                 {isLoading ? 'A PROCESSAR...' : 'OK - CRIAR TXT E JSON'}
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
               </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LISTA DE ACÓRDÃOS NA DB */}
      {showDbModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-12 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
           <div className="bg-white w-full max-w-5xl h-[80vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden">
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                 <h2 className="text-xl font-black uppercase tracking-tighter">Repositório Local</h2>
                 <button onClick={() => setShowDbModal(false)} className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-red-500 flex items-center justify-center transition-all shadow-sm">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {acordaos.map((a, i) => (
                      <div key={i} className="bg-white border border-slate-200 p-6 rounded-[32px] hover:border-indigo-500 transition-all shadow-sm">
                         <div className="text-[10px] font-black text-indigo-600 mb-2">{a.data}</div>
                         <h4 className="text-xs font-black text-slate-800 mb-1">{a.processo}</h4>
                         <p className="text-[9px] font-bold text-slate-400 uppercase">{a.relator}</p>
                      </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* NOTIFICAÇÕES TOASTS */}
      {notification && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-8 py-4 rounded-full shadow-2xl border border-indigo-500 z-[120] animate-in slide-in-from-bottom-10">
           <span className="text-[10px] font-black uppercase tracking-widest">{notification}</span>
        </div>
      )}

      {error && (
        <div className="fixed top-24 right-10 bg-red-600 text-white px-6 py-4 rounded-2xl shadow-2xl z-[120] flex items-center gap-4 border-2 border-red-500">
           <span className="text-xs font-bold">{error}</span>
           <button onClick={() => setError(null)} className="font-bold">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
