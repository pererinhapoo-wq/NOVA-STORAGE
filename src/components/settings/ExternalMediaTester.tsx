import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Globe,
  Play,
  Film,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Sparkles,
  Info,
  Tv,
  X,
  RefreshCw,
  Search,
  Radio,
  FileVideo,
  Layers,
  ArrowRight
} from 'lucide-react';
import Hls from 'hls.js';
import {
  ExternalMediaService,
  PageInspectionResult,
  ExtractedMediaSource
} from '../../services/storage/externalMediaService';

interface ExternalMediaTesterProps {
  onNotify?: (title: string, message?: string, type?: 'success' | 'info' | 'error') => void;
}

type PlaybackState = 'idle' | 'connecting' | 'canplay' | 'playing' | 'error';

// Presets de demonstração autorizada (Creative Commons / Open Source)
const SAMPLE_HLS_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';
const SAMPLE_MP4_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const SAMPLE_PAGE_URL = 'https://developer.mozilla.org/en-US/docs/Web/HTML/Element/video';

export const ExternalMediaTester: React.FC<ExternalMediaTesterProps> = ({ onNotify }) => {
  const [inputUrl, setInputUrl] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState<PageInspectionResult | null>(null);
  const [selectedSourceIndex, setSelectedSourceIndex] = useState<number>(0);
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [playbackErrorDetail, setPlaybackErrorDetail] = useState<string | null>(null);
  const [copiedStream, setCopiedStream] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      destroyHls();
    };
  }, [destroyHls]);

  const handleClear = () => {
    destroyHls();
    setInputUrl('');
    setInspectionResult(null);
    setSelectedSourceIndex(0);
    setPlaybackState('idle');
    setPlaybackErrorDetail(null);
  };

  const handleInspect = async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      if (onNotify) {
        onNotify('Campo Vazio', 'Por favor, insira a URL da página web ou link de mídia para análise.', 'info');
      }
      return;
    }

    destroyHls();
    setIsInspecting(true);
    setInspectionResult(null);
    setSelectedSourceIndex(0);
    setPlaybackState('idle');
    setPlaybackErrorDetail(null);

    try {
      const response = await ExternalMediaService.inspectPage(trimmed);
      if (response.success && response.result) {
        setInspectionResult(response.result);
        if (response.result.sourcesFound.length > 0) {
          if (onNotify) {
            onNotify(
              'Análise Concluída',
              `${response.result.sourcesFound.length} fonte(s) de mídia identificada(s) na página.`,
              'success'
            );
          }
        } else if (response.result.diagnostics.detectedDrm) {
          if (onNotify) {
            onNotify(
              'Proteção DRM Detectada',
              'A página possui restrições de DRM comercial (Widevine/FairPlay) e não permite reprodução externa direta.',
              'info'
            );
          }
        } else {
          if (onNotify) {
            onNotify('Nenhuma Fonte Aberta', 'Não foram encontradas tags de vídeo ou streams abertos na página.', 'info');
          }
        }
      } else {
        const errorMsg = response.error || 'Falha ao analisar a página remota.';
        if (onNotify) {
          onNotify('Erro na Análise', errorMsg, 'error');
        }
      }
    } finally {
      setIsInspecting(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputUrl(text);
          if (onNotify) {
            onNotify('URL Colada', 'Link inserido da área de transferência.', 'info');
          }
        }
      }
    } catch {
      // Ignora erro de clipboard
    }
  };

  const handleApplyPreset = (url: string) => {
    setInputUrl(url);
    handleClear();
    setInputUrl(url);
  };

  const activeSource: ExtractedMediaSource | undefined =
    inspectionResult?.sourcesFound && inspectionResult.sourcesFound.length > 0
      ? inspectionResult.sourcesFound[selectedSourceIndex]
      : undefined;

  const handleCopyStream = () => {
    if (!activeSource?.url) return;
    navigator.clipboard.writeText(activeSource.url);
    setCopiedStream(true);
    setTimeout(() => setCopiedStream(false), 2000);
    if (onNotify) {
      onNotify('URL Copiada', 'Link direto do stream copiado com sucesso.', 'success');
    }
  };

  // Inicializa o player quando a fonte selecionada mudar
  useEffect(() => {
    if (!activeSource?.url || !videoRef.current) return;

    const videoEl = videoRef.current;
    const mediaUrl = activeSource.url;
    const isHls = activeSource.format === 'HLS' || mediaUrl.includes('.m3u8');

    destroyHls();
    setPlaybackState('connecting');
    setPlaybackErrorDetail(null);

    if (isHls) {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true
        });
        hlsRef.current = hls;

        hls.loadSource(mediaUrl);
        hls.attachMedia(videoEl);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setPlaybackState('canplay');
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          const code = data.response?.code;
          let msg = 'Erro ao carregar o stream HLS remoto.';
          if (code === 403) {
            msg = 'HTTP 403 Forbidden: O servidor remoto exige autenticação, token temporário ou bloqueou o Referer.';
          } else if (code === 404) {
            msg = 'HTTP 404 Not Found: O arquivo de manifesto HLS não existe mais no servidor remoto.';
          } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            msg = 'Erro de rede ou bloqueio de CORS (Cross-Origin Resource Sharing) ao carregar os fragmentos de vídeo.';
          }

          if (data.fatal) {
            setPlaybackState('error');
            setPlaybackErrorDetail(msg);
            hls.destroy();
          }
        });
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = mediaUrl;
        const handleLoaded = () => setPlaybackState('canplay');
        const handleError = () => {
          setPlaybackState('error');
          setPlaybackErrorDetail('Falha na reprodução HLS nativa pelo navegador (possível bloqueio de CORS).');
        };

        videoEl.addEventListener('loadedmetadata', handleLoaded);
        videoEl.addEventListener('error', handleError);

        return () => {
          videoEl.removeEventListener('loadedmetadata', handleLoaded);
          videoEl.removeEventListener('error', handleError);
        };
      } else {
        setPlaybackState('error');
        setPlaybackErrorDetail('Este navegador não oferece suporte a HLS (.m3u8).');
      }
    } else {
      // Vídeo direto MP4 / WebM
      videoEl.src = mediaUrl;
      const handleCanPlay = () => setPlaybackState('canplay');
      const handleVideoErr = () => {
        const code = videoEl.error?.code;
        let msg = 'Erro ao reproduzir o arquivo de vídeo.';
        if (code === 4) {
          msg = 'O vídeo não pôde ser carregado (possível restrição de CORS na CDN remota ou formato incompatível).';
        } else if (code === 2) {
          msg = 'Erro de rede ao baixar o vídeo remoto.';
        }
        setPlaybackState('error');
        setPlaybackErrorDetail(msg);
      };

      videoEl.addEventListener('canplay', handleCanPlay);
      videoEl.addEventListener('error', handleVideoErr);

      return () => {
        videoEl.removeEventListener('canplay', handleCanPlay);
        videoEl.removeEventListener('error', handleVideoErr);
      };
    }
  }, [activeSource?.url, activeSource?.format, destroyHls]);

  return (
    <div className="p-4 sm:p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-6">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5 shadow-inner">
            <Globe className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">
                Analisador & Testador de Fontes Externas
              </h3>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/50 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-cyan-400" />
                PROTEÇÃO SSRF & ZERO DOWNLOAD
              </span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed max-w-2xl">
              Inspecione páginas web para identificar e testar fontes abertas de vídeo (<strong>HLS .m3u8</strong> ou <strong>MP4 direto</strong>) sem baixar arquivos para o celular e sem custos de upload para o Mux.
            </p>
          </div>
        </div>
      </div>

      {/* Campo de Entrada de URL e Botão de Ação */}
      <div className="space-y-3">
        <div>
          <label htmlFor="external-url-input" className="text-xs font-semibold text-neutral-300 block mb-1">
            URL da Página Web ou Link Direto de Vídeo
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                id="external-url-input"
                type="url"
                placeholder="Ex: https://meuservidor.com/episodios/ep01 ou https://cdn.exemplo.com/stream.m3u8"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleInspect();
                  }
                }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-3 pr-20 py-2.5 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500 placeholder:text-neutral-600 transition-colors"
              />
              {inputUrl && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-9 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
                  title="Limpar campo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePasteClipboard}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] font-mono font-medium text-neutral-400 hover:text-cyan-300 bg-neutral-900 border border-neutral-800 rounded transition-colors"
                title="Colar da área de transferência"
              >
                Colar
              </button>
            </div>

            <button
              type="button"
              onClick={handleInspect}
              disabled={isInspecting}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-lg transition-colors shrink-0 shadow-sm"
            >
              <Search className={`w-3.5 h-3.5 ${isInspecting ? 'animate-spin' : ''}`} />
              <span>{isInspecting ? 'Inspecionando...' : 'Analisar Página & Mídia'}</span>
            </button>
          </div>
        </div>

        {/* Presets de Demonstração Autorizada */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-neutral-500">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            Exemplos autorizados para teste:
          </span>
          <button
            type="button"
            onClick={() => handleApplyPreset(SAMPLE_HLS_URL)}
            className="text-neutral-400 hover:text-cyan-300 underline underline-offset-2 transition-colors font-mono"
          >
            Stream HLS Aberto (.m3u8)
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => handleApplyPreset(SAMPLE_MP4_URL)}
            className="text-neutral-400 hover:text-cyan-300 underline underline-offset-2 transition-colors font-mono"
          >
            Arquivo MP4 Aberto
          </button>
        </div>
      </div>

      {/* Painel com os 3 Estágios de Confirmação */}
      {inspectionResult && (
        <div className="space-y-4 pt-1">
          {/* Barra de Estágios: Fonte Encontrada -> Fonte Acessível -> Reprodução Confirmada */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Estágio 1: Fonte Encontrada */}
            <div
              className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                inspectionResult.sourcesFound.length > 0
                  ? 'bg-emerald-950/20 border-emerald-800/50'
                  : 'bg-neutral-950/60 border-neutral-800'
              }`}
            >
              <div className="mt-0.5">
                {inspectionResult.sourcesFound.length > 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-neutral-500" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider block text-neutral-200">
                  1. Fonte Encontrada
                </span>
                <span className="text-xs text-neutral-400 block truncate">
                  {inspectionResult.sourcesFound.length > 0
                    ? `${inspectionResult.sourcesFound.length} mídia(s) identificada(s)`
                    : 'Nenhuma tag de vídeo detectada'}
                </span>
              </div>
            </div>

            {/* Estágio 2: Fonte Acessível (CORS / HTTP) */}
            <div
              className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                activeSource?.accessible
                  ? activeSource.corsSupported
                    ? 'bg-emerald-950/20 border-emerald-800/50'
                    : 'bg-amber-950/20 border-amber-800/50'
                  : 'bg-neutral-950/60 border-neutral-800'
              }`}
            >
              <div className="mt-0.5">
                {activeSource?.accessible ? (
                  activeSource.corsSupported ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                  )
                ) : (
                  <AlertCircle className="w-4 h-4 text-neutral-500" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider block text-neutral-200">
                  2. Fonte Acessível
                </span>
                <span className="text-xs text-neutral-400 block truncate">
                  {activeSource?.accessible
                    ? activeSource.corsSupported
                      ? 'HTTP 200 / CORS Autorizado'
                      : 'Sem CORS declarado (Pode falhar no navegador)'
                    : 'Aguardando verificação'}
                </span>
              </div>
            </div>

            {/* Estágio 3: Reprodução Confirmada */}
            <div
              className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                playbackState === 'playing'
                  ? 'bg-emerald-950/30 border-emerald-500/60'
                  : playbackState === 'canplay'
                  ? 'bg-cyan-950/30 border-cyan-500/50'
                  : playbackState === 'error'
                  ? 'bg-rose-950/30 border-rose-800/60'
                  : 'bg-neutral-950/60 border-neutral-800'
              }`}
            >
              <div className="mt-0.5">
                {playbackState === 'playing' ? (
                  <Play className="w-4 h-4 text-emerald-400 fill-current" />
                ) : playbackState === 'canplay' ? (
                  <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                ) : playbackState === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-neutral-500" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider block text-neutral-200">
                  3. Reprodução Confirmada
                </span>
                <span className="text-xs text-neutral-400 block truncate">
                  {playbackState === 'playing'
                    ? 'Decodificação e Streaming Ativos'
                    : playbackState === 'canplay'
                    ? 'Buffer Pronto para Iniciar'
                    : playbackState === 'connecting'
                    ? 'Bufferizando Fragmentos...'
                    : playbackState === 'error'
                    ? 'Falha na Reprodução'
                    : 'Aguardando Início do Player'}
                </span>
              </div>
            </div>
          </div>

          {/* Seletor de Fontes se mais de uma for encontrada */}
          {inspectionResult.sourcesFound.length > 1 && (
            <div className="p-3 rounded-lg bg-neutral-950/80 border border-neutral-800 space-y-2">
              <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Fontes de Vídeo Alternativas Identificadas ({inspectionResult.sourcesFound.length})</span>
              </span>
              <div className="flex flex-wrap gap-2">
                {inspectionResult.sourcesFound.map((src, idx) => (
                  <button
                    key={`${src.url}-${idx}`}
                    type="button"
                    onClick={() => {
                      setSelectedSourceIndex(idx);
                      setPlaybackState('idle');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors flex items-center gap-1.5 ${
                      selectedSourceIndex === idx
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                    }`}
                  >
                    <span>Fonte {idx + 1}: {src.format}</span>
                    <span className="text-[10px] text-neutral-500">({src.discoveryMethod})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Detalhes Técnicos da Fonte Selecionada */}
          {activeSource && (
            <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Título da Página</span>
                  <span className="font-medium text-neutral-200 truncate block mt-0.5" title={inspectionResult.pageTitle}>
                    {inspectionResult.pageTitle}
                  </span>
                </div>

                <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Formato & Método</span>
                  <span className="font-mono text-cyan-400 block mt-0.5">
                    {activeSource.format} ({activeSource.discoveryMethod})
                  </span>
                </div>

                <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Suporte a CORS</span>
                  <span
                    className={`font-mono block mt-0.5 ${
                      activeSource.corsSupported ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {activeSource.corsSupported ? 'CORS Habilitado (*)' : 'Não declarado na CDN'}
                  </span>
                </div>

                <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Tempo de Resposta</span>
                  <span className="font-mono text-neutral-300 block mt-0.5">
                    {inspectionResult.diagnostics.fetchTimeMs} ms
                  </span>
                </div>
              </div>

              {/* URL do Stream e Ações */}
              <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">URL Direta do Vídeo Extraída</span>
                  <p className="font-mono text-[11px] text-neutral-300 truncate mt-0.5" title={activeSource.url}>
                    {activeSource.url}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleCopyStream}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors"
                  >
                    {copiedStream ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedStream ? 'Copiado' : 'Copiar URL'}</span>
                  </button>
                  <a
                    href={inspectionResult.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors"
                  >
                    <span>Abrir Página Original</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Mensagem de Alerta se nenhuma fonte for encontrada ou se for DRM */}
          {inspectionResult.sourcesFound.length === 0 && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-200">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>{inspectionResult.diagnostics.summaryMessage}</span>
              </div>
              <p className="text-neutral-300 text-[11px] leading-relaxed">
                Páginas que utilizam players ofuscados por JavaScript, DRM fechado ou iframes de terceiros não disponibilizam links abertos de mídia. O NOVA STORAGE respeita mecanismos de segurança e não realiza extrações ilegais ou contornos de proteção.
              </p>
            </div>
          )}

          {/* Área de Reprodução (Player HLS / MP4) */}
          {activeSource && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    Player de Teste de Reprodução Direta
                  </h4>
                </div>
                <div className="text-[11px] text-neutral-500">
                  {activeSource.format === 'HLS' ? 'Hls.js Engine Ativa' : 'HTML5 Nativo'}
                </div>
              </div>

              {/* Container de Vídeo */}
              <div className="relative w-full aspect-video rounded-xl bg-black border border-neutral-800 overflow-hidden shadow-2xl flex items-center justify-center">
                <video
                  ref={videoRef}
                  controls
                  playsInline
                  onPlay={() => setPlaybackState('playing')}
                  onWaiting={() => setPlaybackState('connecting')}
                  className="w-full h-full object-contain"
                >
                  Seu navegador não suporta reprodução de vídeo HTML5.
                </video>
              </div>

              {/* Diagnóstico em caso de falha de reprodução */}
              {playbackState === 'error' && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-2.5">
                  <div className="flex items-center gap-2 font-semibold text-rose-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>Falha na Reprodução no Navegador</span>
                  </div>
                  <p className="text-neutral-300 text-[11px] leading-relaxed">
                    {playbackErrorDetail || 'O navegador não conseguiu carregar o fluxo de vídeo da fonte remota.'}
                  </p>

                  <div className="bg-neutral-950/70 p-3 rounded-lg border border-neutral-800/80 space-y-1.5 text-[11px] text-neutral-400">
                    <span className="font-semibold text-neutral-300 block">Causas Frequentes de Falha Externa:</span>
                    <ul className="list-disc list-inside space-y-1 text-neutral-400">
                      <li>
                        <strong>Bloqueio de CORS na CDN:</strong> O servidor de mídia não envia o cabeçalho <code className="text-cyan-400">Access-Control-Allow-Origin: *</code> para conexões de outros domínios.
                      </li>
                      <li>
                        <strong>Validação de Referer:</strong> O servidor remoto rejeita requisições se o cabeçalho Referer não for o domínio do site de origem.
                      </li>
                      <li>
                        <strong>Tokens Temporários Expirados:</strong> A URL extraída continha uma assinatura com validade curta que expirou antes da reprodução.
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Informação sobre Integração Futura com NOVA STREAM & HIKARI */}
              <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800/80 text-[11px] text-neutral-400 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="leading-relaxed">
                    <strong>Integração com NOVA STREAM & HIKARI:</strong> Se esta fonte reproduzir de forma autorizada e sem bloqueios de CORS, o link direto do stream (<code className="text-cyan-400 font-mono">.m3u8</code> ou <code className="text-cyan-400 font-mono">.mp4</code>) poderá ser cadastrado no manifesto JSON exportado para a NOVA STREAM. No HIKARI, o vídeo será reproduzido no seu <em>player nativo com sua própria identidade visual</em>, sem exibir a interface do site de origem.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rodapé Informativo */}
      <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800 text-[11px] text-neutral-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Filtro de Segurança Ativo: Bloqueio contra SSRF, IPs privados (RFC 1918) e serviços de metadados.</span>
        </div>
        <span className="text-neutral-500 font-mono text-[10px]">
          Limite Máximo: 512 KB por requisição · Timeout: 5s
        </span>
      </div>
    </div>
  );
};
