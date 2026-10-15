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
const SAMPLE_MP4_GTV_URL = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
const SAMPLE_MP4_CC0_URL = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

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
        const diag = response.result.diagnostics;
        if (diag.status === 'direct_source_accessible' || response.result.sourcesFound.length > 0) {
          if (onNotify) {
            onNotify(
              'Fonte Direta Identificada',
              `${response.result.sourcesFound.length} fonte(s) direta(s) de mídia identificada(s) na página.`,
              'success'
            );
          }
        } else if (diag.status === 'challenge_or_interstitial_detected') {
          if (onNotify) {
            onNotify(
              'Página Intermediária Detectada',
              `O servidor retornou um desafio anti-bot (${response.result.interstitialChallenge?.provider || 'Proteção'}). Limitação de acesso, não ausência de vídeo.`,
              'info'
            );
          }
        } else if (diag.status === 'embedded_player_detected') {
          if (onNotify) {
            onNotify(
              'Player Incorporado (iframe)',
              `Identificado(s) ${response.result.detectedIframes?.length || 0} iframe(s). Não equivale a fonte direta de vídeo.`,
              'info'
            );
          }
        } else if (diag.status === 'dynamic_loading_detected') {
          if (onNotify) {
            onNotify(
              'Carregamento Dinâmico',
              'A página referencia scripts de reprodução ou configurações dinâmicas de mídia.',
              'info'
            );
          }
        } else if (diag.detectedDrm) {
          if (onNotify) {
            onNotify(
              'Proteção DRM Detectada',
              'A página possui restrições de DRM comercial (Widevine/FairPlay) e não permite reprodução externa direta.',
              'info'
            );
          }
        } else {
          if (onNotify) {
            onNotify('Nenhuma Fonte Aberta', 'Não foram encontradas tags de vídeo, iframes ou scripts dinâmicos.', 'info');
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
    destroyHls();
    setInspectionResult(null);
    setSelectedSourceIndex(0);
    setPlaybackState('idle');
    setPlaybackErrorDetail(null);
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
      videoEl.load();

      const handleLoadedMetadata = () => {
        // Metadados carregados com sucesso pelo navegador
      };

      const handleCanPlay = () => {
        setPlaybackState('canplay');
        setPlaybackErrorDetail(null);
      };

      const handlePlaying = () => {
        setPlaybackState('playing');
        setPlaybackErrorDetail(null);
      };

      const handleWaiting = () => {
        setPlaybackState('connecting');
      };

      const handleVideoErr = () => {
        const error = videoEl.error;
        const code = error?.code;
        const browserMsg = error?.message;

        let codeDesc = '';
        switch (code) {
          case 1:
            codeDesc = 'Operação cancelada (MEDIA_ERR_ABORTED - Código 1)';
            break;
          case 2:
            codeDesc = 'Erro de rede na transferência do arquivo (MEDIA_ERR_NETWORK - Código 2)';
            break;
          case 3:
            codeDesc = 'Falha na decodificação do container/codec (MEDIA_ERR_DECODE - Código 3)';
            break;
          case 4:
            codeDesc = 'Fonte não suportada ou não pôde ser carregada (MEDIA_ERR_SRC_NOT_SUPPORTED - Código 4)';
            break;
          default:
            codeDesc = `Erro no elemento de vídeo HTML5 (Código ${code ?? 'desconhecido'})`;
        }

        const diagnostics: string[] = [codeDesc];

        if (browserMsg) {
          diagnostics.push(`Navegador: ${browserMsg}`);
        }

        // Diagnóstico baseado em evidências concretas registradas na checagem
        if (activeSource?.statusCode === 403) {
          diagnostics.push('Causa confirmada: O servidor remoto recusou o acesso com código HTTP 403 Forbidden. O arquivo não possui permissão pública de leitura no armazenamento de origem.');
        } else if (activeSource?.statusCode === 404) {
          diagnostics.push('Causa confirmada: O servidor remoto retornou HTTP 404 Not Found (arquivo inexistente ou URL expirada).');
        } else if (activeSource?.mimeType && !activeSource.mimeType.toLowerCase().includes('video')) {
          diagnostics.push(`Causa confirmada: O servidor remoto retornou conteúdo "${activeSource.mimeType}" (XML/HTML) em vez de dados de vídeo binário.`);
        } else if (activeSource?.corsSupported === false) {
          diagnostics.push('Evidência de CORS: O servidor remoto não declarou o cabeçalho Access-Control-Allow-Origin, podendo causar bloqueio de origem cruzada no navegador.');
        } else if (activeSource?.supportsRange === false) {
          diagnostics.push('Evidência de Range: O servidor remoto não aceita requisições HTTP Range (206 Partial Content), essenciais para streaming de vídeo no navegador.');
        }

        setPlaybackState('error');
        setPlaybackErrorDetail(diagnostics.join(' | '));
      };

      videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.addEventListener('canplay', handleCanPlay);
      videoEl.addEventListener('playing', handlePlaying);
      videoEl.addEventListener('waiting', handleWaiting);
      videoEl.addEventListener('error', handleVideoErr);

      return () => {
        videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
        videoEl.removeEventListener('canplay', handleCanPlay);
        videoEl.removeEventListener('playing', handlePlaying);
        videoEl.removeEventListener('waiting', handleWaiting);
        videoEl.removeEventListener('error', handleVideoErr);
      };
    }
  }, [activeSource?.url, activeSource?.format, activeSource?.statusCode, activeSource?.mimeType, activeSource?.corsSupported, activeSource?.supportsRange, destroyHls]);

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
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-neutral-400">
          <span className="flex items-center gap-1.5 text-neutral-400 text-xs py-1">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>Exemplos autorizados para teste:</span>
          </span>
          <button
            type="button"
            onClick={() => handleApplyPreset(SAMPLE_HLS_URL)}
            className="px-2.5 py-1 text-xs font-mono text-cyan-400 hover:text-cyan-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-cyan-500/40 rounded-md transition-colors cursor-pointer touch-manipulation select-none active:scale-95"
            aria-label="Preencher com exemplo de stream HLS aberto"
          >
            Stream HLS Aberto (.m3u8)
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset(SAMPLE_MP4_GTV_URL)}
            className="px-2.5 py-1 text-xs font-mono text-cyan-400 hover:text-cyan-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-cyan-500/40 rounded-md transition-colors cursor-pointer touch-manipulation select-none active:scale-95"
            aria-label="Preencher com exemplo de arquivo MP4 aberto"
          >
            Arquivo MP4 Aberto
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset(SAMPLE_MP4_CC0_URL)}
            className="px-2.5 py-1 text-xs font-mono text-emerald-400 hover:text-emerald-300 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 hover:border-emerald-500/40 rounded-md transition-colors cursor-pointer touch-manipulation select-none active:scale-95"
            aria-label="Preencher com exemplo de arquivo MP4 com suporte a Range 206"
          >
            MP4 com Range 206 (CC0)
          </button>
        </div>
      </div>

      {/* Painel com Diagnóstico e Estágios de Confirmação */}
      {inspectionResult && (
        <div className="space-y-4 pt-1">
          {/* Banner de Diagnóstico Principal - Estados Claros */}
          <div
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              playbackState === 'playing'
                ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-300'
                : inspectionResult.diagnostics.status === 'direct_source_accessible'
                ? 'bg-emerald-950/20 border-emerald-800/50 text-emerald-300'
                : inspectionResult.diagnostics.status === 'challenge_or_interstitial_detected'
                ? 'bg-amber-950/30 border-amber-500/50 text-amber-200'
                : inspectionResult.diagnostics.status === 'embedded_player_detected'
                ? 'bg-indigo-950/25 border-indigo-800/50 text-indigo-300'
                : inspectionResult.diagnostics.status === 'dynamic_loading_detected'
                ? 'bg-amber-950/25 border-amber-800/50 text-amber-300'
                : inspectionResult.diagnostics.status === 'drm_or_protected'
                ? 'bg-rose-950/25 border-rose-800/50 text-rose-300'
                : 'bg-neutral-950/70 border-neutral-800 text-neutral-300'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0">
                {playbackState === 'playing' ? (
                  <Play className="w-5 h-5 text-emerald-400 fill-current" />
                ) : inspectionResult.diagnostics.status === 'direct_source_accessible' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : inspectionResult.diagnostics.status === 'challenge_or_interstitial_detected' ? (
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                ) : inspectionResult.diagnostics.status === 'embedded_player_detected' ? (
                  <Layers className="w-5 h-5 text-indigo-400" />
                ) : inspectionResult.diagnostics.status === 'dynamic_loading_detected' ? (
                  <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
                ) : inspectionResult.diagnostics.status === 'drm_or_protected' ? (
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-neutral-400" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    {playbackState === 'playing'
                      ? '5. Reprodução Confirmada no Navegador'
                      : inspectionResult.diagnostics.status === 'direct_source_accessible'
                      ? '4. Fonte Direta Encontrada e Acessível'
                      : inspectionResult.diagnostics.status === 'challenge_or_interstitial_detected'
                      ? 'Página Intermediária / Desafio Anti-Bot Detectado'
                      : inspectionResult.diagnostics.status === 'embedded_player_detected'
                      ? '2. Player Incorporado (iframe) Identificado'
                      : inspectionResult.diagnostics.status === 'dynamic_loading_detected'
                      ? '3. Possível Carregamento Dinâmico de Mídia'
                      : inspectionResult.diagnostics.status === 'drm_or_protected'
                      ? 'Conteúdo com Proteção DRM Proprietária'
                      : '1. Nenhuma Fonte Aberta Encontrada'}
                  </span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-neutral-900 border border-neutral-700/60 text-neutral-300">
                    {inspectionResult.pageTitle || 'Página Web'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed opacity-90">
                  {inspectionResult.diagnostics.summaryMessage}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right sm:self-center font-mono text-[10px] text-neutral-400">
              {inspectionResult.diagnostics.fetchTimeMs}ms · {(inspectionResult.diagnostics.responseSizeBytes / 1024).toFixed(1)} KB
            </div>
          </div>

          {/* Barra de Estágios: Fonte Encontrada -> Fonte Acessível -> Reprodução Confirmada */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Estágio 1: Identificação de Fonte / Elemento */}
            <div
              className={`p-3 rounded-lg border flex items-start gap-2.5 ${
                inspectionResult.sourcesFound.length > 0
                  ? 'bg-emerald-950/20 border-emerald-800/50'
                  : inspectionResult.diagnostics.status === 'challenge_or_interstitial_detected'
                  ? 'bg-amber-950/20 border-amber-800/50'
                  : (inspectionResult.detectedIframes?.length || 0) > 0
                  ? 'bg-indigo-950/20 border-indigo-800/40'
                  : (inspectionResult.dynamicMediaIndicators?.length || 0) > 0
                  ? 'bg-amber-950/20 border-amber-800/40'
                  : 'bg-neutral-950/60 border-neutral-800'
              }`}
            >
              <div className="mt-0.5">
                {inspectionResult.sourcesFound.length > 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : inspectionResult.diagnostics.status === 'challenge_or_interstitial_detected' ? (
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                ) : (inspectionResult.detectedIframes?.length || 0) > 0 ? (
                  <Layers className="w-4 h-4 text-indigo-400" />
                ) : (inspectionResult.dynamicMediaIndicators?.length || 0) > 0 ? (
                  <Radio className="w-4 h-4 text-amber-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-neutral-500" />
                )}
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold uppercase tracking-wider block text-neutral-200">
                  1. Detecção no HTML
                </span>
                <span className="text-xs text-neutral-400 block truncate">
                  {inspectionResult.sourcesFound.length > 0
                    ? `${inspectionResult.sourcesFound.length} fonte(s) direta(s) aberta(s)`
                    : inspectionResult.diagnostics.status === 'challenge_or_interstitial_detected'
                    ? `Página intermediária (${inspectionResult.interstitialChallenge?.provider || 'Proteção'})`
                    : (inspectionResult.detectedIframes?.length || 0) > 0
                    ? `${inspectionResult.detectedIframes?.length} iframe(s) incorporado(s)`
                    : (inspectionResult.dynamicMediaIndicators?.length || 0) > 0
                    ? `${inspectionResult.dynamicMediaIndicators?.length} script(s) de player dinâmico`
                    : 'Nenhum elemento de vídeo'}
                </span>
              </div>
            </div>

            {/* Estágio 2: Fonte Acessível (CORS / HTTP / Range) */}
            {(() => {
              const isChecked = activeSource && activeSource.accessible !== null && activeSource.accessible !== undefined;
              const isAccessible = activeSource?.accessible === true;
              const isDenied = activeSource?.accessible === false;
              const isCors = activeSource?.corsSupported === true;
              const statusCode = activeSource?.statusCode;

              let cardBg = 'bg-neutral-950/60 border-neutral-800';
              let icon = <AlertCircle className="w-4 h-4 text-neutral-500" />;
              let title = '2. Fonte Acessível';
              let subtitle = 'Aguardando verificação';

              if (inspectionResult.diagnostics.status === 'challenge_or_interstitial_detected') {
                cardBg = 'bg-amber-950/20 border-amber-800/40';
                icon = <AlertCircle className="w-4 h-4 text-amber-400" />;
                subtitle = `Acesso interceptado (${inspectionResult.diagnostics.httpStatusCode ? `HTTP ${inspectionResult.diagnostics.httpStatusCode}` : 'Desafio'})`;
              } else if (inspectionResult.sourcesFound.length === 0) {
                cardBg = 'bg-neutral-950/40 border-neutral-800/60';
                icon = <AlertCircle className="w-4 h-4 text-neutral-600" />;
                subtitle = (inspectionResult.detectedIframes?.length || 0) > 0
                  ? 'Iframe isolado (não acessado por segurança)'
                  : (inspectionResult.dynamicMediaIndicators?.length || 0) > 0
                  ? 'Stream solicitado em tempo de execução'
                  : 'Sem fonte direta para testar';
              } else if (!isChecked) {
                cardBg = 'bg-neutral-950/60 border-neutral-800';
                icon = <AlertCircle className="w-4 h-4 text-neutral-500" />;
                subtitle = 'Aguardando verificação de rede';
              } else if (isAccessible) {
                if (isCors) {
                  cardBg = 'bg-emerald-950/20 border-emerald-800/50';
                  icon = <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
                  subtitle = `HTTP ${statusCode || 200} · CORS Ativo (*) ${activeSource.supportsRange ? '· Range 206' : ''}`;
                } else {
                  cardBg = 'bg-amber-950/20 border-amber-800/50';
                  icon = <AlertTriangle className="w-4 h-4 text-amber-400" />;
                  subtitle = `HTTP ${statusCode || 200} · Sem CORS (Pode falhar no player)`;
                }
              } else if (isDenied) {
                cardBg = 'bg-rose-950/25 border-rose-800/60';
                icon = <AlertCircle className="w-4 h-4 text-rose-400" />;
                subtitle = statusCode === 403
                  ? 'Acesso Negado (HTTP 403 Forbidden)'
                  : statusCode === 404
                  ? 'Não Encontrado (HTTP 404 Not Found)'
                  : `Inacessível (HTTP ${statusCode || 'Erro'})`;
              }

              return (
                <div className={`p-3 rounded-lg border flex items-start gap-2.5 ${cardBg}`}>
                  <div className="mt-0.5">{icon}</div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider block text-neutral-200">
                      {title}
                    </span>
                    <span className="text-xs text-neutral-400 block truncate" title={subtitle}>
                      {subtitle}
                    </span>
                  </div>
                </div>
              );
            })()}

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
                    : inspectionResult.diagnostics.status === 'challenge_or_interstitial_detected'
                    ? 'Aguardando página com player'
                    : inspectionResult.sourcesFound.length === 0
                    ? 'Nenhuma mídia direta para reproduzir'
                    : 'Aguardando Início do Player'}
                </span>
              </div>
            </div>
          </div>

          {/* Card Detalhado de Página Intermediária ou Desafio de Proteção */}
          {inspectionResult.interstitialChallenge?.detected && (
            <div className="p-4 rounded-xl bg-amber-950/25 border border-amber-800/50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-950 border border-amber-800/60 flex items-center justify-center text-amber-400 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wide">
                      Página Intermediária de Proteção Detectada ({inspectionResult.interstitialChallenge.provider})
                    </h4>
                    <span className="text-[11px] text-neutral-400">
                      Resposta interceptada por desafio anti-bot antes do carregamento do conteúdo
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-amber-950 border border-amber-800/60 text-amber-300 self-start sm:self-auto">
                  LIMITAÇÃO DE ACESSO · NÃO AFIRMA AUSÊNCIA DE VÍDEO
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/70 text-xs text-neutral-300 space-y-1.5 leading-relaxed">
                <p>
                  <strong>Por que o analisador não encontrou o vídeo se ele funciona no navegador?</strong> O servidor remoto ({inspectionResult.interstitialChallenge.provider}) enviou uma página intermediária de verificação temporária (ex: <em>"Just a moment..."</em>). No seu navegador comum, essa verificação é resolvida automaticamente em tempo de execução via JavaScript e cookies locais de sessão.
                </p>
                <p className="text-[11px] text-neutral-400">
                  Como o analisador do NOVA STORAGE cumpre rigorosamente as normas de segurança, não executa scripts arbitrários do site, não extrai credenciais nem utiliza proxies para contornar desafios de proteção, a requisição automatizada recebeu apenas o HTML da tela de proteção.
                </p>
              </div>

              {/* Tabela de Metadados Seguros da Resposta */}
              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-neutral-300 block">
                  Metadados Seguros da Resposta Recebida:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs font-mono">
                  <div className="bg-neutral-950/80 p-2 rounded-lg border border-neutral-800/80">
                    <span className="text-[10px] text-neutral-500 uppercase block">Status HTTP</span>
                    <span className="text-amber-400 font-semibold block mt-0.5">
                      {inspectionResult.diagnostics.httpStatusCode ? `HTTP ${inspectionResult.diagnostics.httpStatusCode}` : '200 OK'}
                    </span>
                  </div>
                  <div className="bg-neutral-950/80 p-2 rounded-lg border border-neutral-800/80">
                    <span className="text-[10px] text-neutral-500 uppercase block">Mecanismo</span>
                    <span className="text-cyan-300 font-semibold block mt-0.5">
                      {inspectionResult.interstitialChallenge.provider}
                    </span>
                  </div>
                  <div className="bg-neutral-950/80 p-2 rounded-lg border border-neutral-800/80 sm:col-span-2">
                    <span className="text-[10px] text-neutral-500 uppercase block">Título da Resposta</span>
                    <span className="text-neutral-200 truncate block mt-0.5" title={inspectionResult.interstitialChallenge.pageTitle}>
                      "{inspectionResult.interstitialChallenge.pageTitle}"
                    </span>
                  </div>
                </div>

                {inspectionResult.interstitialChallenge.evidence.length > 0 && (
                  <div className="bg-neutral-950/70 p-2 rounded-lg border border-neutral-800/60 space-y-1">
                    <span className="text-[10px] uppercase text-neutral-500 font-mono block">Evidências Técnicas Registradas:</span>
                    <ul className="list-disc list-inside space-y-0.5 text-[11px] text-neutral-400">
                      {inspectionResult.interstitialChallenge.evidence.map((ev, i) => (
                        <li key={i}>{ev}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Card Detalhado de Players Incorporados (iframes) */}
          {inspectionResult.detectedIframes && inspectionResult.detectedIframes.length > 0 && (
            <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-800/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-950 border border-indigo-800/60 flex items-center justify-center text-indigo-400 shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-indigo-200 uppercase tracking-wide">
                      Player Incorporado (iframe) Identificado ({inspectionResult.detectedIframes.length})
                    </h4>
                    <span className="text-[11px] text-neutral-400">
                      Elemento(s) &lt;iframe&gt; detectado(s) no HTML da página
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800/60 text-indigo-300 self-start sm:self-auto">
                  FRAME ISOLADO · NÃO AFIRMA VÍDEO
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/70 text-xs text-neutral-300 space-y-1 leading-relaxed">
                <p>
                  <strong>Diretriz de Conformidade & Segurança:</strong> A presença de um elemento <code className="text-indigo-300 font-mono">&lt;iframe&gt;</code> indica que a página utiliza um frame encapsulado de terceiro. <strong>Não é possível afirmar que existe um vídeo ativo apenas por ter sido encontrado um iframe.</strong>
                </p>
                <p className="text-[11px] text-neutral-400">
                  Por razões de segurança, proteção contra SSRF e a política de mesma origem (Same-Origin Policy), o NOVA STORAGE não tenta acessar o conteúdo interno de iframes de outros domínios, nem contornar restrições de acesso.
                </p>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-semibold text-neutral-300 block">
                  Domínio(s) de Origem Registrado(s):
                </span>
                <div className="divide-y divide-neutral-800/60 rounded-lg border border-neutral-800/80 bg-neutral-950/80 overflow-hidden">
                  {inspectionResult.detectedIframes.map((iframe, idx) => (
                    <div key={`${iframe.url}-${idx}`} className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-semibold text-cyan-300 bg-cyan-950/40 px-2 py-0.5 rounded text-[11px] border border-cyan-800/40">
                            {iframe.domain}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${
                              iframe.isCrossOrigin
                                ? 'text-amber-400 bg-amber-950/30 border-amber-800/30'
                                : 'text-emerald-400 bg-emerald-950/30 border-emerald-800/30'
                            }`}
                          >
                            {iframe.isCrossOrigin ? 'Cross-Origin (Terceiro)' : 'Same-Origin'}
                          </span>
                          {iframe.title && (
                            <span className="text-[11px] text-neutral-400 italic truncate max-w-xs" title={iframe.title}>
                              "{iframe.title}"
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[10px] text-neutral-500 truncate mt-1" title={iframe.url}>
                          Destino: {iframe.url}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Card Detalhado de Carregamento Dinâmico de Mídia */}
          {inspectionResult.dynamicMediaIndicators && inspectionResult.dynamicMediaIndicators.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-950 border border-amber-800/60 flex items-center justify-center text-amber-400 shrink-0">
                    <Radio className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-amber-200 uppercase tracking-wide">
                      Possível Carregamento Dinâmico de Mídia
                    </h4>
                    <span className="text-[11px] text-neutral-400">
                      Scripts de reprodução ou configurações dinâmicas detectados sem execução de JS arbitrário
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-amber-950 border border-amber-800/60 text-amber-300 self-start sm:self-auto">
                  CARREGAMENTO VIA SCRIPT
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-neutral-950/60 border border-neutral-800/70 text-xs text-neutral-300 space-y-1 leading-relaxed">
                <p>
                  <strong>Por que a URL da página não muda e não há links abertos?</strong> O site analisado utiliza bibliotecas de player ou scripts assíncronos. Quando o episódio começa a tocar, os fragmentos de vídeo são requisitados em segundo plano via JavaScript no navegador do usuário, sem alterar a URL da barra de endereços e sem expor URLs estáticas de mídia no HTML inicial.
                </p>
              </div>

              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-neutral-300 block">
                  Evidências Identificadas no Código Fonte:
                </span>
                <ul className="space-y-1 text-xs">
                  {inspectionResult.dynamicMediaIndicators.map((ind, idx) => (
                    <li key={idx} className="flex items-start gap-2 bg-neutral-950/70 p-2 rounded-lg border border-neutral-800/60 font-mono text-[11px]">
                      <span className="text-amber-400 font-semibold shrink-0">[{ind.patternMatched}]</span>
                      <span className="text-neutral-300 font-sans">{ind.description}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

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
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Status HTTP & Código</span>
                  <span
                    className={`font-mono block mt-0.5 font-semibold ${
                      activeSource.statusCode === 200 || activeSource.statusCode === 206
                        ? 'text-emerald-400'
                        : activeSource.statusCode === 403 || activeSource.statusCode === 404
                        ? 'text-rose-400'
                        : 'text-neutral-300'
                    }`}
                  >
                    {activeSource.statusCode ? `HTTP ${activeSource.statusCode}` : 'Não avaliado'}
                    {activeSource.statusCode === 403 && ' (Forbidden)'}
                    {activeSource.statusCode === 404 && ' (Not Found)'}
                    {activeSource.statusCode === 206 && ' (Partial Content)'}
                    {activeSource.statusCode === 200 && ' (OK)'}
                  </span>
                </div>

                <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Suporte a Range (206)</span>
                  <span
                    className={`font-mono block mt-0.5 ${
                      activeSource.supportsRange ? 'text-emerald-400 font-semibold' : 'text-neutral-400'
                    }`}
                  >
                    {activeSource.supportsRange ? 'Suportado (206 Partial)' : 'Sem Range parcial'}
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
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Tipo de Conteúdo (MIME)</span>
                  <span
                    className={`font-mono block mt-0.5 truncate ${
                      activeSource.mimeType && !activeSource.mimeType.toLowerCase().includes('video')
                        ? 'text-rose-400 font-semibold'
                        : 'text-neutral-300'
                    }`}
                    title={activeSource.mimeType || activeSource.format}
                  >
                    {activeSource.mimeType || activeSource.format}
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
                    <span>Abrir Link Direto</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Mensagem de Alerta se nenhuma fonte direta for encontrada */}
          {inspectionResult.sourcesFound.length === 0 && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                inspectionResult.diagnostics.status === 'challenge_or_interstitial_detected'
                  ? 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                  : inspectionResult.diagnostics.status === 'embedded_player_detected'
                  ? 'bg-indigo-950/20 border-indigo-800/40 text-indigo-300'
                  : inspectionResult.diagnostics.status === 'dynamic_loading_detected'
                  ? 'bg-amber-950/20 border-amber-800/40 text-amber-300'
                  : 'bg-neutral-900/70 border-neutral-800 text-neutral-300'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 text-cyan-400" />
                <span>{inspectionResult.diagnostics.summaryMessage}</span>
              </div>
              <p className="text-neutral-400 text-[11px] leading-relaxed">
                {inspectionResult.diagnostics.status === 'challenge_or_interstitial_detected'
                  ? 'Atenção: Esta resposta representa uma limitação de acesso automatizado devido a uma proteção intermediária (ex: Cloudflare "Just a moment..."), e NÃO significa que o episódio não possui vídeo no site de origem. O vídeo pode estar presente e funcional no navegador de uso comum.'
                  : inspectionResult.diagnostics.status === 'embedded_player_detected'
                  ? 'O conteúdo desta página depende de um iframe isolado de outro domínio. O NOVA STORAGE respeita os limites de segurança da web e não executa scraping forçado nem acessa conteúdo protegido de terceiros.'
                  : inspectionResult.diagnostics.status === 'dynamic_loading_detected'
                  ? 'O streaming de vídeo desta página é orquestrado sob demanda via JavaScript dinâmico no navegador. Fontes diretas estáticas (.m3u8/.mp4) não foram expostas no HTML inicial.'
                  : 'O HTML inicial da página não expõe tags de vídeo abertas, iframes incorporados nem scripts de carregamento de mídia reconhecidos.'}
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
                    <span className="font-semibold text-neutral-300 block">Diagnóstico Baseado em Evidências:</span>
                    <ul className="list-disc list-inside space-y-1 text-neutral-400">
                      {activeSource.statusCode === 403 && (
                        <li className="text-rose-300">
                          <strong>Acesso Negado (HTTP 403 Forbidden):</strong> O servidor de origem (ex: Google Cloud Storage) retornou documento XML de recusa (AccessDenied). O arquivo é privado e não possui permissão de leitura anônima.
                        </li>
                      )}
                      {activeSource.corsSupported ? (
                        <li className="text-emerald-300">
                          <strong>CORS Verificado:</strong> O servidor de origem retornou o cabeçalho <code className="text-emerald-400">Access-Control-Allow-Origin: *</code>. A falha NÃO foi causada por restrição de CORS.
                        </li>
                      ) : (
                        <li className="text-amber-300">
                          <strong>Ausência de CORS Declarado:</strong> O servidor de mídia não enviou cabeçalho de CORS aberto para conexões de outros domínios.
                        </li>
                      )}
                      {activeSource.supportsRange ? (
                        <li className="text-emerald-300">
                          <strong>Suporte a Range:</strong> O servidor responde a requisições parciais (HTTP 206 Partial Content).
                        </li>
                      ) : (
                        <li className="text-amber-300">
                          <strong>Sem Suporte a Range (206):</strong> Arquivos MP4 transmitidos via streaming necessitam de suporte a requisições parciais por bytes para decodificação no navegador.
                        </li>
                      )}
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
