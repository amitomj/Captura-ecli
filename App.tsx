
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
  const [isMonitoring, setIsMonitoring] = useState(true);
  const [clipboardPermission, setClipboardPermission] = useState<'granted' | 'prompt' | 'denied'>('prompt');
  const lastProcessedUrl = useRef<string>('');

  const refreshData = useCallback(async () => {
    if (StorageService.isReady()) {
      const raw = await StorageService.listRawFiles();
      const processed = await StorageService.listProcessedAcordaos();
      setRawFiles(raw);
      setAcordaos(processed);
    }
  }, []);

  // Função central que "assume" o link
  const processClipboardLink = useCallback(async (text: string) => {
    if (!text.startsWith('https://jurisprudencia.csm.org.pt/') || text === lastProcessedUrl.current) return;
    
    lastProcessedUrl.current = text;
    setIsLoading(true);
    
    try {
      // Tenta descarregar o conteúdo bruto (HTML)
      const html = await fetchAcordaoHtml(text);
      const fileName = text.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
      
      // GUARDA COMO TXT (Fase 1 solicitada)
      await StorageService.saveRawTxt(fileName, html);
      await refreshData();
      console.log("Link assumido e gravado como .txt:", fileName);
    } catch (e) {
      // Fallback para CORS: Se o browser bloquear o download direto
      const manual = confirm(`Link detetado: ${text}\n\nO site do CSM bloqueou o acesso automático. Deseja colar o conteúdo manualmente para este acórdão?`);
      if (manual) {
        const htmlContent = prompt("Cole aqui o conteúdo HTML (ou o texto integral) da página do acórdão:");
        if (htmlContent) {
          const fileName = text.split('/').filter(Boolean).pop()?.replace(/:/g, '_') || `acordao_${Date.now()}`;
          await StorageService.saveRawTxt(fileName, htmlContent);
          await refreshData();
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [refreshData]);

  // Monitor de Foco: Executa sempre que o utilizador volta à app
  const handleClipboardCheck = useCallback(async () => {
    if (!isMonitoring || !isFolderSelected || isLoading) return;

    try {
      const text = await navigator.clipboard.readText();
      await processClipboardLink(text);
    } catch (err) {
      console.warn("Permissão de clipboard necessária ou erro de leitura.");
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
      // Tenta obter permissão de clipboard logo no início
      try {
        const status = await navigator.permissions.query({ name: 'clipboard-read' as any });
        setClipboardPermission(status.state as any);
      } catch (e) {}
    }
  };

  const handleRunExtraction = async () => {
    if (rawFiles.length === 0) return;
    setIsLoading(true);
    try {
      let count = 0;
      for (const file of rawFiles) {
        // Regra de extração solicitada (Sem IA nesta fase)
        const extraction = parseCsmHtml(file.content, "https://jurisprudencia.csm.org.pt/");
        if (extraction.success && extraction.data) {
          await StorageService.saveProcessedAcordao(extraction.data as Acordao);
          count++;
        }
      }
      await refreshData();
      alert(`Fase 2 Concluída: ${count} acórdãos extraídos e transformados em dados estruturados.`);
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
            <div className="bg-amber-600 w-10 h-10 rounded flex items-center justify-center font-bold text-xl shadow-lg">J</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">JurisAnalyzer <span className="text-amber-500 italic">Pro</span></h1>
              <div className="flex items-center gap-2 text-[10px] text-slate-400 uppercase tracking-widest">
                <div className={`w-2 h-2 rounded-full ${isMonitoring ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
                Monitor de Captura Ativo
              </div>
            </div>
          </div>
          <div className="hidden md:flex gap-6 items-center">
             <div className="text-right">
                <div className="text-xs font-bold text-slate-300">{rawFiles.length} Ficheiros Brutos</div>
                <div className="text-[10px] text-amber-500">{acordaos.length} Extrações Concluídas</div>
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Painel de Controlo */}
        <div className="lg:col-span-4 space-y-6">
          
          <section className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-50 p-6 border-b border-slate-100">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                <span className="bg-amber-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                Captura Automática
              </h2>
            </div>
            <div className="p-6 space-y-5">
              {!isFolderSelected ? (
                <button onClick={handleSelectFolder} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold hover:bg-slate-800 transition-all transform hover:scale-[1.02] shadow-xl">
                  Configurar Pasta de Trabalho
                </button>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 rounded-2xl border-2 border-dashed border-amber-200 text-xs text-amber-900 leading-relaxed">
                    <p className="font-bold mb-1">Fluxo Ativo:</p>
                    1. Copie o URL no CSM.<br/>
                    2. Volte a esta aba.<br/>
                    3. A app grava o .txt automaticamente.
                  </div>
                  
                  {clipboardPermission !== 'granted' && (
                    <button 
                      onClick={handleClipboardCheck}
                      className="w-full text-[10px] bg-slate-100 py-2 rounded-lg text-slate-600 hover:bg-slate-200 transition"
                    >
                      Clique aqui para autorizar acesso à Área de Transferência
                    </button>
                  )}

                  <div className="space-y-2">
                    <div className="flex justify-between items-center px-1">
                       <span className="text-[10px] font-bold text-slate-400 uppercase">Recentes (.txt)</span>
                       <button onClick={refreshData} className="text-[10px] text-indigo-600 hover:underline">Atualizar</button>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-2 max-h-40 overflow-y-auto custom-scrollbar">
                      {rawFiles.length === 0 ? (
                        <div className="py-8 text-center text-slate-300 text-xs italic">Nenhum link assumido ainda...</div>
                      ) : (
                        rawFiles.map((f, i) => (
                          <div key={i} className="p-2 border-b border-white last:border-0 flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                            <span className="text-[11px] font-medium text-slate-600 truncate">{f.name}</span>
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
              <h2 className="font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2">
                <span className="bg-indigo-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                Extração de Dados
              </h2>
            </div>
            <div className="p-6">
              <button 
                onClick={handleRunExtraction}
                disabled={rawFiles.length === 0 || isLoading}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 disabled:bg-slate-200 transition-all shadow-lg flex items-center justify-center gap-3"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                )}
                Executar Extração Fina
              </button>
              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="bg-slate-50 p-3 rounded-2xl">
                  <div className="text-xl font-black text-indigo-600">{acordaos.length}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Processados</div>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl">
                  <div className="text-xl font-black text-amber-600">{rawFiles.length - acordaos.length}</div>
                  <div className="text-[9px] font-bold text-slate-400 uppercase">Pendentes</div>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Chatbot Coluna Principal */}
        <div className="lg:col-span-8 flex flex-col bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden min-h-[700px]">
          <div className="bg-slate-900 p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div>
              <h2 className="text-white font-black uppercase tracking-widest text-sm">Fase 3: Inteligência de Jurisprudência</h2>
            </div>
            <div className="text-slate-400 text-[10px] font-bold uppercase tracking-tighter">
              Gemini 3 Pro Ativo
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-slate-50/50 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-20">
                <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-xl mb-6 transform -rotate-12">
                   <svg className="w-12 h-12 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
                <h3 className="text-2xl font-black text-slate-800 leading-tight">Pronto para a sua Consulta</h3>
                <p className="text-slate-500 text-sm mt-3 leading-relaxed">
                  Após a extração na Fase 2, a IA terá acesso a todos os detalhes (ECLI, Relator, Processo, Sumário) para realizar análises de divergência profunda.
                </p>
                <div className="mt-8 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-[11px] text-indigo-700 font-medium italic">
                  Exemplo: "Existe divergência sobre a aplicação do perdão no crime de roubo simples?"
                </div>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-3xl p-6 shadow-xl ${
                    msg.role === 'user' 
                      ? 'bg-slate-900 text-white rounded-tr-none border-b-4 border-amber-600' 
                      : 'bg-white border border-slate-200 rounded-tl-none text-slate-800'
                  }`}>
                    <div className="serif whitespace-pre-wrap leading-loose text-base">
                      {msg.content.split('\n').map((line, idx) => {
                        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                        const parts = [];
                        let lastIndex = 0;
                        let match;
                        while ((match = linkRegex.exec(line)) !== null) {
                          parts.push(line.substring(lastIndex, match.index));
                          parts.push(<a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-amber-600 underline font-black hover:text-amber-700 transition-colors">{match[1]}</a>);
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

          <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_30px_rgba(0,0,0,0.03)]">
            <div className="flex items-center gap-4 bg-slate-100 p-3 rounded-3xl focus-within:ring-4 focus-within:ring-indigo-100 focus-within:bg-white transition-all">
              <input 
                type="text" 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={acordaos.length > 0 ? "Descreva o tema para análise jurisprudencial..." : "Extraia os dados primeiro na Fase 2..."}
                className="flex-1 bg-transparent border-none outline-none px-4 py-2 text-slate-700 text-sm font-medium"
                disabled={acordaos.length === 0 || isLoading}
              />
              <button 
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim() || acordaos.length === 0}
                className="bg-indigo-600 text-white w-14 h-14 rounded-2xl hover:bg-indigo-700 disabled:bg-slate-300 transition-all shadow-xl flex items-center justify-center transform active:scale-95"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              </button>
            </div>
          </div>
        </div>
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
