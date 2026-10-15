import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
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
  KeyRound,
  X,
  RefreshCw,
  Sliders,
  Radio
} from 'lucide-react';
import Hls from 'hls.js';
import {
  validateMuxInput,
  MuxValidationResult
} from '../../services/storage/muxLinkValidator';

interface MuxVideoTesterProps {
  onNotify?: (title: string, message?: string, type?: 'success' | 'info' | 'error') => void;
}

type MuxPlaybackStatus = 'idle' | 'connecting' | 'ready' | 'playing' | 'error';

// Playback ID público oficial de demonstração do Mux (Big Buck Bunny)
const MUX_SAMPLE_PUBLIC_ID = 'qxb01i6T202018GFS2ahnssMsGraphsLWy';

export const MuxVideoTester: React.FC<MuxVideoTesterProps> = ({ onNotify }) => {
  const [inputVal, setInputVal] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [showTokenField, setShowTokenField] = useState(false);
  const [activeTest, setActiveTest] = useState<MuxValidationResult | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<MuxPlaybackStatus>('idle');
  const [playbackErrorDetail, setPlaybackErrorDetail] = useState<string | null>(null);
  const [copiedStream, setCopiedStream] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Limpeza de instâncias Hls ativas
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
    setInputVal('');
    setTokenInput('');
    setActiveTest(null);
    setPlaybackStatus('idle');
    setPlaybackErrorDetail(null);
  };

  const handleTestPlayback = () => {
    const trimmed = inputVal.trim();
    if (!trimmed) {
      if (onNotify) {
        onNotify('Campo Vazio', 'Insira um Playback ID ou URL do Mux para testar.', 'info');
      }
      return;
    }

    destroyHls();
    const validation = validateMuxInput(trimmed, tokenInput.trim() || undefined);
    setActiveTest(validation);
    setPlaybackStatus('idle');
    setPlaybackErrorDetail(null);

    if (validation.isValid) {
      if (onNotify) {
        onNotify(
          'Formato Reconhecido',
          `Playback ID "${validation.playbackId}" identificado. Iniciando requisição HLS...`,
          'info'
        );
      }
    } else {
      if (onNotify) {
        onNotify('Entrada Inválida', validation.error || 'Não foi possível validar o link do Mux.', 'error');
      }
    }
  };

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputVal(text);
          if (onNotify) {
            onNotify('Copiado', 'Texto inserido da área de transferência.', 'info');
          }
        }
      }
    } catch {
      // Ignora erro de permissão de clipboard
    }
  };

  const handleApplyPreset = (presetId: string) => {
    destroyHls();
    setInputVal(presetId);
    setTokenInput('');
    const validation = validateMuxInput(presetId);
    setActiveTest(validation);
    setPlaybackStatus('idle');
    setPlaybackErrorDetail(null);
  };

  const handleCopyStreamUrl = () => {
    if (!activeTest?.streamUrl) return;
    navigator.clipboard.writeText(activeTest.streamUrl);
    setCopiedStream(true);
    setTimeout(() => setCopiedStream(false), 2000);
    if (onNotify) {
      onNotify('URL Copiada', 'Manifesto HLS copiado para a área de transferência.', 'success');
    }
  };

  // Inicialização e gerenciamento do player HLS quando activeTest mudar
  useEffect(() => {
    if (!activeTest?.isValid || !videoRef.current) return;

    const videoEl = videoRef.current;
    const streamUrl = activeTest.streamUrl;

    destroyHls();
    setPlaybackStatus('connecting');
    setPlaybackErrorDetail(null);

    // 1. Suporte HLS via Hls.js (Desktop Chrome, Firefox, Edge, Android)
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPlaybackStatus('ready');
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        // Diagnóstico preciso com base em códigos HTTP retornados pelo Mux
        const responseCode = data.response?.code;
        let errorMessage = 'Erro de carregamento do stream HLS do Mux.';

        if (responseCode === 403) {
          errorMessage =
            'HTTP 403 Forbidden: Este vídeo possui política de reprodução restrita (Signed Playback ID). É necessário fornecer um Playback Token JWT válido e não expirado.';
        } else if (responseCode === 404) {
          errorMessage =
            'HTTP 404 Not Found: O Playback ID informado não foi encontrado nos servidores do Mux. Verifique se o asset existe ou foi excluído.';
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          errorMessage = `Falha de rede ao carregar os fragmentos de vídeo (Status HTTP: ${responseCode || 'Sem resposta'}). Verifique sua conexão e CORS.`;
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          errorMessage = 'Erro interno de decodificação na faixa de mídia do stream.';
        }

        if (data.fatal) {
          setPlaybackStatus('error');
          setPlaybackErrorDetail(errorMessage);
          if (onNotify) {
            onNotify('Falha na Reprodução HLS', errorMessage, 'error');
          }
          hls.destroy();
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      // 2. Suporte HLS nativo do navegador (Safari iOS e macOS)
      videoEl.src = streamUrl;

      const handleLoadedMetadata = () => {
        setPlaybackStatus('ready');
      };

      const handleNativeError = () => {
        setPlaybackStatus('error');
        setPlaybackErrorDetail(
          'O navegador encontrou um erro ao carregar o stream HLS (possível Playback ID inexistente ou token não autorizado).'
        );
      };

      videoEl.addEventListener('loadedmetadata', handleLoadedMetadata);
      videoEl.addEventListener('error', handleNativeError);

      return () => {
        videoEl.removeEventListener('loadedmetadata', handleLoadedMetadata);
        videoEl.removeEventListener('error', handleNativeError);
      };
    } else {
      setPlaybackStatus('error');
      setPlaybackErrorDetail('Seu navegador não oferece suporte à tecnologia de reprodução HLS (.m3u8).');
    }
  }, [activeTest?.streamUrl, activeTest?.isValid, destroyHls, onNotify]);

  return (
    <div className="p-4 sm:p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-6">
      {/* Cabeçalho da Seção */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5 shadow-inner">
            <Tv className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">Testador de Vídeos Mux</h3>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/50 flex items-center gap-1">
                <Radio className="w-3 h-3 text-cyan-400 animate-pulse" />
                HLS UNIVERSAL · STREAM.MUX.COM
              </span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed max-w-2xl">
              Teste de reprodução para fluxos HLS do <strong>Mux Video</strong> com suporte a Playback IDs públicos e tokens assinados (Signed Playback JWT), sem expor chaves privadas.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <a
            href="https://docs.mux.com/guides/secure-video-playback"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-cyan-400 transition-colors"
          >
            <span>Docs Mux Video</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Formulário de Entrada: Playback ID / URL e Token Opcional */}
      <div className="space-y-3">
        <div>
          <label htmlFor="mux-input" className="text-xs font-semibold text-neutral-300 block mb-1">
            Playback ID ou URL de Stream do Mux
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                id="mux-input"
                type="text"
                placeholder="Ex: qxb01i6T202018GFS2ahnssMsGraphsLWy ou https://stream.mux.com/{id}.m3u8"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleTestPlayback();
                  }
                }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-3 pr-20 py-2.5 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500 placeholder:text-neutral-600 transition-colors"
              />
              {inputVal && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-9 top-1/2 -translate-y-1/2 p-1 text-neutral-500 hover:text-neutral-300 transition-colors"
                  title="Limpar campo"
                  aria-label="Limpar campo"
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
              onClick={handleTestPlayback}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors shrink-0 shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Testar Reprodução</span>
            </button>
          </div>
        </div>

        {/* Toggle para Campo de Token Assinado Opcional */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => setShowTokenField(!showTokenField)}
              className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-cyan-300 transition-colors"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showTokenField ? 'Ocultar parâmetro de Playback Token JWT' : 'Adicionar Playback Token JWT (para vídeos com política Signed)'}</span>
              {tokenInput && (
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
              )}
            </button>
          </div>

          {showTokenField && (
            <div className="p-3.5 rounded-lg bg-neutral-950/90 border border-neutral-800 space-y-2">
              <label htmlFor="mux-token-input" className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1.5">
                <KeyRound className="w-3 h-3 text-cyan-400" />
                <span>Playback Token Assinado (JWT)</span>
              </label>
              <input
                id="mux-token-input"
                type="text"
                placeholder="Ex: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500 placeholder:text-neutral-600 transition-colors"
              />
              <p className="text-[10px] text-neutral-500">
                Utilizado para Playback IDs com restrição de acesso. O token temporário é assinado no backend e anexado à requisição sem expor sua chave privada.
              </p>
            </div>
          )}
        </div>

        {/* Presets de demonstração */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-neutral-500">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            Demonstração rápida:
          </span>
          <button
            type="button"
            onClick={() => handleApplyPreset(MUX_SAMPLE_PUBLIC_ID)}
            className="text-neutral-400 hover:text-cyan-300 underline underline-offset-2 transition-colors font-mono"
          >
            Exemplo Público Mux (ID {MUX_SAMPLE_PUBLIC_ID.slice(0, 10)}...)
          </button>
        </div>
      </div>

      {/* Painel de Diagnóstico da URL e Metadados */}
      {activeTest && (
        <div className="space-y-4 pt-1">
          {activeTest.isValid ? (
            <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-3">
              {/* Badges de Identificação e Validação */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 pb-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/60 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    FORMATO VÁLIDO
                  </span>

                  <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/60 flex items-center gap-1">
                    <Tv className="w-3 h-3 text-cyan-400" />
                    Mux HLS Stream (.m3u8)
                  </span>

                  {activeTest.isSigned ? (
                    <span className="text-[11px] font-mono text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/50 flex items-center gap-1">
                      <KeyRound className="w-3 h-3 text-amber-400" />
                      Stream Assinado (Token Anexado)
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                      Playback ID Público
                    </span>
                  )}
                </div>

                {/* Status em tempo real do reprodutor */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-400 font-medium">Estado do Sinal:</span>
                  {playbackStatus === 'error' ? (
                    <span className="text-[11px] font-mono text-rose-400 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-800/50 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Falha de Conexão Mux
                    </span>
                  ) : playbackStatus === 'playing' ? (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50 flex items-center gap-1">
                      <Play className="w-3 h-3 fill-current" />
                      Reproduzindo
                    </span>
                  ) : playbackStatus === 'ready' ? (
                    <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/50">
                      Sinal Recebido (Pronto)
                    </span>
                  ) : playbackStatus === 'connecting' ? (
                    <span className="text-[11px] font-mono text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Carregando Manifesto...
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                      Aguardando
                    </span>
                  )}
                </div>
              </div>

              {/* Informações detalhadas de Playback ID e Token */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Playback ID</span>
                  <span className="font-mono text-neutral-200 truncate block mt-0.5" title={activeTest.playbackId}>
                    {activeTest.playbackId}
                  </span>
                </div>

                <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Domínio do Stream</span>
                  <span className="font-mono text-cyan-400 block mt-0.5">stream.mux.com</span>
                </div>

                {activeTest.tokenDetails?.expiresFormatted && (
                  <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Expiração do Token</span>
                    <span
                      className={`font-mono truncate block mt-0.5 ${
                        activeTest.tokenDetails.isExpired ? 'text-rose-400 font-bold' : 'text-amber-300'
                      }`}
                      title={activeTest.tokenDetails.expiresFormatted}
                    >
                      {activeTest.tokenDetails.expiresFormatted}
                      {activeTest.tokenDetails.isExpired && ' (EXPIRADO)'}
                    </span>
                  </div>
                )}

                <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Protocolo</span>
                  <span className="font-mono text-emerald-400 block mt-0.5">HTTPS Seguro (TLS)</span>
                </div>
              </div>

              {/* Alerta de Token JWT Expirado */}
              {activeTest.tokenDetails?.isExpired && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    Atenção: O timestamp de expiração deste token JWT indica que ele já expirou. O Mux provavelmente recusará a reprodução com HTTP 403.
                  </span>
                </div>
              )}

              {/* URL do Stream HLS e Botões de Ação */}
              <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Endpoint HLS (.m3u8)</span>
                  <p className="font-mono text-[11px] text-neutral-300 truncate mt-0.5" title={activeTest.streamUrl}>
                    {activeTest.streamUrl}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleCopyStreamUrl}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors"
                    title="Copiar URL do manifesto"
                  >
                    {copiedStream ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedStream ? 'Copiado' : 'Copiar'}</span>
                  </button>
                  <a
                    href={activeTest.streamUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors"
                    title="Abrir manifesto .m3u8 em nova aba"
                  >
                    <span>Abrir manifesto</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            /* Erro de Formato */
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>Entrada Inválida ou Não Reconhecida</span>
              </div>
              <p className="text-neutral-300 leading-relaxed text-[11px]">
                {activeTest.error}
              </p>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-2.5 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  Limpar e Tentar Novamente
                </button>
              </div>
            </div>
          )}

          {/* Área de Reprodução (Player HLS Universal) */}
          {activeTest.isValid && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    Área de Teste de Reprodução HLS
                  </h4>
                </div>
                <div className="text-[11px] text-neutral-500">
                  {Hls.isSupported() ? 'Hls.js Engine Ativa' : 'HLS Nativo do Sistema'}
                </div>
              </div>

              {/* Container do Player */}
              <div className="relative w-full aspect-video rounded-xl bg-black border border-neutral-800 overflow-hidden shadow-2xl flex items-center justify-center">
                <video
                  ref={videoRef}
                  controls
                  playsInline
                  poster={activeTest.thumbnailUrl}
                  onPlay={() => setPlaybackStatus('playing')}
                  onWaiting={() => setPlaybackStatus('connecting')}
                  className="w-full h-full object-contain"
                >
                  Seu navegador não suporta reprodução de vídeo HTML5.
                </video>
              </div>

              {/* Diagnóstico Detalhado em caso de erro na reprodução real */}
              {playbackStatus === 'error' && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-2.5">
                  <div className="flex items-center gap-2 font-semibold text-rose-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>Falha no Carregamento do Stream Mux</span>
                  </div>
                  <p className="text-neutral-300 text-[11px] leading-relaxed">
                    {playbackErrorDetail || 'Não foi possível carregar o fluxo HLS a partir dos servidores do Mux.'}
                  </p>

                  <div className="bg-neutral-950/70 p-3 rounded-lg border border-neutral-800/80 space-y-1.5 text-[11px] text-neutral-400">
                    <span className="font-semibold text-neutral-300 block">Dicas de Diagnóstico Mux:</span>
                    <ul className="list-disc list-inside space-y-1 text-neutral-400">
                      <li>
                        <strong>Playback ID Assinado (HTTP 403):</strong> Se o asset foi criado com política <code className="text-cyan-400">signed</code>, a reprodução exige um token JWT assinado pela sua Signing Key. Expanda o campo de token acima e informe o JWT correspondente.
                      </li>
                      <li>
                        <strong>Playback ID Inexistente (HTTP 404):</strong> Certifique-se de que o Playback ID foi copiado corretamente do painel do Mux e que o asset não foi deletado.
                      </li>
                      <li>
                        <strong>Asset em Processamento:</strong> Novos vídeos recém-enviados podem demorar alguns segundos até que os manifestos e faixas HLS estejam prontos para entrega.
                      </li>
                    </ul>
                  </div>

                  <div className="pt-1 flex items-center gap-2">
                    <a
                      href={activeTest.streamUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-200 bg-rose-950/60 border border-rose-800/60 rounded-lg hover:bg-rose-900/60 transition-colors"
                    >
                      <span>Inspecionar resposta do manifesto no navegador</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {/* Aviso de Não Presunção de Reproduzibilidade */}
              <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 text-[11px] text-neutral-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Aviso de Validação:</strong> A validação do formato apenas confirma que o Playback ID e a URL seguem o padrão estrutural do Mux. A disponibilidade real do vídeo e as permissões de acesso dependem da resposta dos servidores do Mux durante a execução do stream HLS.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rodapé de Segurança e Isolamento */}
      <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800 text-[11px] text-neutral-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Isolamento Total: Nenhuma chave privada ou credencial do Mux é armazenada no navegador.</span>
        </div>
        <span className="text-neutral-500 font-mono text-[10px]">
          Proteção Anti-Arbitrary Hostname Ativa
        </span>
      </div>
    </div>
  );
};
