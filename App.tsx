
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
  const [progress, setProgress] = useState({ current: 0, total: 0 });

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

  const processSingleUrl = async (url: string) => {
    const cleanUrl = url.trim();
    if (!cleanUrl.startsWith('https://jurisprudencia.csm.org.pt/')) return false;
    
    try {
      // 1. Descarrega o HTML real usando o proxy
      const html = await fetchAcordaoHtml(cleanUrl);
      
      // 2. Extrai dados básicos para o nome do ficheiro
      const extraction = parseCsmHtml(html, cleanUrl);
      const ecli = extraction.data?.ecli || cleanUrl.split('/').pop() || `doc_${Date.now()}`;
      const safeFileName = ecli.replace(/[:/\\?%*|"<>]/g, '_');

      // 3. Guarda o TXT integral (HTML Bruto ou Texto Limpo)
      await StorageService.saveRawTxt(safeFileName, html);
      
      // 4. Se a extração foi boa, já guarda também o JSON estruturado
      if (extraction.success && extraction.data) {
        await StorageService.saveProcessedAcordao(extraction.data as Acordao);
      }
      
      return true;
    } catch (e) {
      console.warn(`Falha no URL: ${cleanUrl}`, e);
      return false;
    }
  };

  const handleBulkCapture = async () => {
    const lines = bulkUrls.split('\n').map(u => u.trim()).filter(u => u.startsWith('http'));
    if (lines.length === 0) return;
    
    setIsLoading(true);
    setProgress({ current: 0, total: lines.length });
    
    let successCount = 0;
    for (let i = 0; i < lines.length; i++) {
      setProgress(prev => ({ ...prev, current: i + 1 }));
      const ok = await processSingleUrl(lines[i]);
      if (ok) successCount++;
      // Pequeno delay para não sobrecarregar o proxy
      await new Promise(r => setTimeout(r, 500));
    }
    
    setBulkUrls('');
    await refreshData();
    setIsLoading(false);
    setProgress({ current: 0, total: 0 });
    showNotification(`${successCount} acórdãos processados com sucesso.`);
  };

  const handleSelectFolder = async () => {
    const result = await StorageService.selectDirectory();
    if (result.success) {
      setIsFolderSelected(true);
      setStorageMode(result.mode);
      refreshData();
    }
  };

  const handleExportJson = () => {
    if (acordaos.length === 0) return;
    const blob = new Blob([JSON.stringify(acordaos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jurisprudencia_total_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    showNotification("JSON exportado.");
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
      setError("Erro na IA: " + (err as Error).message);
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
            <h1 className="text-xl font-black tracking-tighter uppercase">JurisAnalyzer <span className="text-amber-500">PRO</span></h1>
          </div>
          <div className="flex gap-4 text-xs font-bold uppercase tracking-widest text-slate-400">
            <div>Arquivos: <span className="text-white">{rawFiles.length}</span></div>
            <div className="border-l border-slate-700 pl-4">Estruturados: <span className="text-amber-500">{acordaos.length}</span></div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-80px)] overflow-hidden">
        
        {/* Painel de Controlo */}
        <div className="lg:col-span-4 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
          
          <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">1. Configuração</h2>
            {!isFolderSelected ? (
              <button onClick={handleSelectFolder} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                Selecionar Pasta de Destino
              </button>
            ) : (
              <div className="bg-green-50 p-3 rounded-xl border border-green-100 flex items-center gap-3">
                <div className="bg-green-500 w-2 h-2 rounded-full animate-pulse"></div>
                <span className="text-xs font-bold text-green-700 uppercase">Pasta Conectada ({storageMode})</span>
              </div>
            )}
          </section>

          <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">2. Captura do CSM</h2>
            <textarea 
              value={bulkUrls}
              onChange={(e) => setBulkUrls(e.target.value)}
              placeholder="Cole as URLs dos acórdãos aqui (uma por linha)..."
              className="w-full h-40 bg-slate-50 border-2 border-slate-100 rounded-xl p-3 text-[11px] font-mono focus:border-amber-500 outline-none transition-all mb-4"
              disabled={!isFolderSelected || isLoading}
            />
            {progress.total > 0 && (
              <div className="mb-4">
                <div className="flex justify-between text-[10px] font-bold mb-1 uppercase">
                  <span>A processar...</span>
                  <span>{progress.current} / {progress.total}</span>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full transition-all duration-300" style={{ width: `${(progress.current/progress.total)*100}%` }}></div>
                </div>
              </div>
            )}
            <button 
              onClick={handleBulkCapture}
              disabled={!isFolderSelected || !bulkUrls.trim() || isLoading}
              className="w-full bg-amber-500 text-white py-3 rounded-xl font-black text-sm hover:bg-amber-600 disabled:bg-slate-200 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? 'A descarregar...' : 'Iniciar Captura Integral'}
            </button>
          </section>

          <section className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">3. Ficheiros na Pasta</h2>
              <button onClick={handleExportJson} className="text-[10px] font-black text-indigo-600 uppercase hover:underline">Exportar Tudo</button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-2 custom-scrollbar pr-2">
              {rawFiles.length === 0 ? (
                <div className="text-[10px] text-slate-300 italic text-center py-4">Nenhum ficheiro detetado</div>
              ) : (
                rawFiles.map((f, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg border border-slate-100">
                    <span className="text-[10px] font-mono truncate max-w-[180px]">{f.name}</span>
                    <span className="text-[9px] bg-slate-200 px-1.5 rounded font-bold uppercase">{f.content.length > 5000 ? 'HTML' : 'TXT'}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Analista IA */}
        <div className="lg:col-span-8 flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden h-full">
          <div className="bg-slate-900 p-4 flex items-center justify-between">
            <h2 className="text-white font-black uppercase text-xs tracking-tighter">Chatbot de Análise Jurisprudencial</h2>
            <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{acordaos.length} Acórdãos Analisáveis</div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4 opacity-40">
                <svg className="w-16 h-16 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                <p className="text-sm font-medium">Após capturar os acórdãos, coloque a sua questão para analisar as divergências.</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] p-4 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                    <div className="serif whitespace-pre-wrap text-sm leading-relaxed">
                      {msg.content.split('\n').map((line, idx) => {
                        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
                        const parts = [];
                        let lastIndex = 0;
                        let match;
                        while ((match = linkRegex.exec(line)) !== null) {
                          parts.push(line.substring(lastIndex, match.index));
                          parts.push(<a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer" className="text-amber-500 underline font-bold">{match[1]}</a>);
                          lastIndex = match.index + match[0].length;
                        }
                        parts.push(line.substring(lastIndex));
                        return <div key={idx} className="mb-1">{parts.length > 0 ? parts : line}</div>;
                      })}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 text-xs italic text-slate-400 animate-pulse">
                  A analisar jurisprudência...
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100">
            <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
              <input 
                type="text" 
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder="Ex: Qual a posição sobre roubo simples e lei do perdão?"
                className="flex-1 bg-transparent border-none outline-none px-4 py-3 text-sm"
                disabled={acordaos.length === 0 || isLoading}
              />
              <button 
                onClick={handleSendMessage}
                disabled={isLoading || !userInput.trim() || acordaos.length === 0}
                className="bg-slate-900 text-white px-6 rounded-lg font-bold text-xs hover:bg-slate-800 transition-all disabled:bg-slate-300"
              >
                Analisar
              </button>
            </div>
          </div>
        </div>
      </main>

      {notification && (
        <div className="fixed bottom-6 left-6 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl z-50 text-xs font-bold border border-amber-500 animate-in fade-in slide-in-from-left-4">
          {notification}
        </div>
      )}

      {error && (
        <div className="fixed top-6 right-6 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl z-50 text-xs font-bold animate-in fade-in slide-in-from-right-4">
          {error} <button onClick={() => setError(null)} className="ml-2 font-black">✕</button>
        </div>
      )}
    </div>
  );
};

export default App;
