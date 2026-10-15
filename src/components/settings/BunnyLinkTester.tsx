import React, { useState, useRef, useEffect } from 'react';
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
  RotateCcw,
  Sparkles,
  Info,
  Maximize2,
  Tv,
  FileVideo,
  KeyRound,
  X
} from 'lucide-react';
import {
  validateBunnyUrl,
  BunnyValidationResult
} from '../../services/storage/bunnyLinkValidator';

interface BunnyLinkTesterProps {
  onNotify?: (title: string, message?: string, type?: 'success' | 'info' | 'error') => void;
}

type PlaybackStatus = 'idle' | 'loading' | 'canplay' | 'playing' | 'error';

export const BunnyLinkTester: React.FC<BunnyLinkTesterProps> = ({ onNotify }) => {
  const [inputUrl, setInputUrl] = useState('');
  const [activeTest, setActiveTest] = useState<BunnyValidationResult | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');
  const [playbackErrorDetail, setPlaybackErrorDetail] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Limpa estados ao alterar a URL de entrada
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputUrl(e.target.value);
  };

  const handleClear = () => {
    setInputUrl('');
    setActiveTest(null);
    setPlaybackStatus('idle');
    setPlaybackErrorDetail(null);
  };

  const handleTestPlayback = () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      if (onNotify) {
        onNotify('Campo Vazio', 'Por favor, cole uma URL do Bunny para testar.', 'info');
      }
      return;
    }

    const validation = validateBunnyUrl(trimmed);
    setActiveTest(validation);
    setPlaybackStatus('idle');
    setPlaybackErrorDetail(null);

    if (validation.isValid) {
      if (onNotify) {
        const typeLabel = validation.type === 'bunny_embed' ? 'Bunny Stream Embed' : 'Vídeo Direto MP4/WebM';
        onNotify('Formato Reconhecido', `${typeLabel} validado com sucesso. Testando sinal de mídia...`, 'info');
      }
    } else {
      if (onNotify) {
        onNotify('Link Não Compatível', validation.error || 'A URL informada não pôde ser validada.', 'error');
      }
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
      // Ignora erro de permissão de clipboard
    }
  };

  const handleCopyUrl = () => {
    const target = activeTest?.originalUrl || inputUrl;
    if (!target) return;
    navigator.clipboard.writeText(target);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (onNotify) {
      onNotify('Copiado', 'URL copiada para a área de transferência.', 'success');
    }
  };

  const handleApplyPreset = (presetUrl: string) => {
    setInputUrl(presetUrl);
    const validation = validateBunnyUrl(presetUrl);
    setActiveTest(validation);
    setPlaybackStatus('idle');
    setPlaybackErrorDetail(null);
  };

  // Trata erros reais disparados pelo elemento <video>
  const handleVideoError = () => {
    const error = videoRef.current?.error;
    let message = 'O vídeo não pôde ser reproduzido.';

    if (error) {
      switch (error.code) {
        case 1: // MEDIA_ERR_ABORTED
          message = 'A busca e carregamento do vídeo foram interrompidos pelo navegador.';
          break;
        case 2: // MEDIA_ERR_NETWORK
          message = 'Erro de rede ao baixar o vídeo. Verifique a conectividade com o CDN Bunny.';
          break;
        case 3: // MEDIA_ERR_DECODE
          message = 'Falha ao decodificar a faixa de vídeo. O codec de compressão pode ser incompatível com este navegador.';
          break;
        case 4: // MEDIA_ERR_SRC_NOT_SUPPORTED
          message =
            'Falha de carregamento da fonte (HTTP 403 / 404 ou formato incompatível). Verifique se o token temporário expirou, se há restrições de Referer/CORS na Pull Zone do Bunny ou se o arquivo existe.';
          break;
        default:
          message = `Erro de reprodução de mídia (código ${error.code}).`;
      }
    }

    setPlaybackStatus('error');
    setPlaybackErrorDetail(message);
    if (onNotify) {
      onNotify('Falha na Reprodução', message, 'error');
    }
  };

  // Garante que o vídeo reset de eventos quando a URL mudar
  useEffect(() => {
    if (activeTest?.type === 'direct_video' && videoRef.current) {
      setPlaybackStatus('loading');
    }
  }, [activeTest?.normalizedUrl]);

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
              <h3 className="text-sm font-bold text-white tracking-wide">Testador de Links Bunny</h3>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/50 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-cyan-400" />
                HTTPS & DOMÍNIOS OFICIAIS
              </span>
            </div>
            <p className="text-xs text-neutral-400 leading-relaxed max-w-2xl">
              Validação, inspeção de tokens e teste de reprodução para URLs de <strong>Bunny Stream Embed</strong> e links diretos de vídeo <strong>MP4/WebM</strong> hospedados em CDN Bunny.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <a
            href="https://bunny.net/stream/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-cyan-400 transition-colors"
          >
            <span>Docs Bunny Stream</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Campo de Entrada de URL e Botão de Ação */}
      <div className="space-y-2">
        <label htmlFor="bunny-url-input" className="text-xs font-semibold text-neutral-300 block">
          URL do Player Embed ou Arquivo de Vídeo Bunny
        </label>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              id="bunny-url-input"
              type="url"
              placeholder="Ex: https://iframe.mediadelivery.net/embed/12345/abc-def... ou https://vz-xxx.b-cdn.net/video.mp4"
              value={inputUrl}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleTestPlayback();
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

        {/* Sugestões rápidas de teste / Presets de demonstração */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-neutral-500">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            Links rápidos para teste:
          </span>
          <button
            type="button"
            onClick={() =>
              handleApplyPreset(
                'https://iframe.mediadelivery.net/embed/15234/9a8b7c6d-1234-5678-90ab-cdef12345678?autoplay=false&loop=false'
              )
            }
            className="text-neutral-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
          >
            Bunny Stream Embed
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() =>
              handleApplyPreset(
                'https://vz-742a0b.b-cdn.net/sample-storage/play_720p.mp4?token=temp_preview_token&expires=1890000000'
              )
            }
            className="text-neutral-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
          >
            Vídeo MP4 com Token (*.b-cdn.net)
          </button>
        </div>
      </div>

      {/* Painel de Diagnóstico da URL e Metadados Detectados */}
      {activeTest && (
        <div className="space-y-4 pt-1">
          {activeTest.isValid ? (
            <div className="p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-3">
              {/* Badges de Identificação e Validação */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 pb-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/60 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    URL VÁLIDA
                  </span>

                  <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/60 flex items-center gap-1">
                    {activeTest.type === 'bunny_embed' ? (
                      <>
                        <Tv className="w-3 h-3 text-cyan-400" />
                        Bunny Stream Embed (iframe)
                      </>
                    ) : (
                      <>
                        <FileVideo className="w-3 h-3 text-cyan-400" />
                        Vídeo Direto ({activeTest.detectedFormat})
                      </>
                    )}
                  </span>

                  {activeTest.detectedResolution && (
                    <span className="text-[11px] font-mono text-neutral-300 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                      Resolução: {activeTest.detectedResolution}
                    </span>
                  )}

                  {activeTest.hasAuthToken && (
                    <span className="text-[11px] font-mono text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/50 flex items-center gap-1">
                      <KeyRound className="w-3 h-3 text-amber-400" />
                      Token de Segurança Preservado
                    </span>
                  )}
                </div>

                {/* Status em tempo real da reprodução */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-400 font-medium">Estado do Player:</span>
                  {playbackStatus === 'error' ? (
                    <span className="text-[11px] font-mono text-rose-400 bg-rose-950/50 px-2 py-0.5 rounded border border-rose-800/50 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Falha na Reprodução
                    </span>
                  ) : playbackStatus === 'playing' ? (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/50 flex items-center gap-1">
                      <Play className="w-3 h-3 fill-current" />
                      Reproduzindo
                    </span>
                  ) : playbackStatus === 'canplay' ? (
                    <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-800/50">
                      Pronto para Iniciar
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                      {activeTest.type === 'bunny_embed' ? 'Iframe Carregado' : 'Aguardando Início'}
                    </span>
                  )}
                </div>
              </div>

              {/* Informações detalhadas de domínio e parâmetros */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Domínio Validado</span>
                  <span className="font-mono text-neutral-200 truncate block mt-0.5" title={activeTest.domain}>
                    {activeTest.domain}
                  </span>
                </div>

                {activeTest.type === 'bunny_embed' && activeTest.details?.libraryId && (
                  <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Biblioteca Bunny</span>
                    <span className="font-mono text-neutral-200 block mt-0.5">
                      ID {activeTest.details.libraryId}
                    </span>
                  </div>
                )}

                {activeTest.type === 'bunny_embed' && activeTest.details?.videoId && (
                  <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">ID do Vídeo</span>
                    <span className="font-mono text-neutral-200 truncate block mt-0.5" title={activeTest.details.videoId}>
                      {activeTest.details.videoId}
                    </span>
                  </div>
                )}

                {activeTest.hasAuthToken && activeTest.details?.expiresFormatted && (
                  <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Expiração do Token</span>
                    <span className="font-mono text-amber-300 truncate block mt-0.5" title={activeTest.details.expiresFormatted}>
                      {activeTest.details.expiresFormatted}
                    </span>
                  </div>
                )}

                <div className="bg-neutral-900/60 p-2.5 rounded-lg border border-neutral-800/60">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">Protocolo</span>
                  <span className="font-mono text-emerald-400 block mt-0.5">HTTPS Seguro (Criptografado)</span>
                </div>
              </div>

              {/* URL Original e Ações: Abrir em nova aba / Copiar */}
              <div className="p-2.5 rounded-lg bg-neutral-900/90 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">URL Original Preservada</span>
                  <p className="font-mono text-[11px] text-neutral-300 truncate mt-0.5" title={activeTest.originalUrl}>
                    {activeTest.originalUrl}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors"
                    title="Copiar URL original"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? 'Copiada' : 'Copiar'}</span>
                  </button>
                  <a
                    href={activeTest.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-md transition-colors"
                    title="Abrir URL original em nova aba"
                  >
                    <span>Abrir em nova aba</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            /* Mensagem de Erro / Link Não Suportado */
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>Link Inválido ou Não Compatível</span>
              </div>
              <p className="text-neutral-300 leading-relaxed text-[11px]">
                {activeTest.error}
              </p>
              <div className="pt-1 flex flex-wrap items-center gap-2">
                {activeTest.originalUrl && (
                  <a
                    href={activeTest.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-rose-300 bg-rose-950/60 border border-rose-800/60 rounded-md hover:bg-rose-900/60 transition-colors"
                  >
                    <span>Tentar abrir URL diretamente</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-2.5 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
                >
                  Limpar
                </button>
              </div>
            </div>
          )}

          {/* Área de Reprodução (Player) */}
          {activeTest.isValid && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-cyan-400" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                    Área de Teste de Reprodução
                  </h4>
                </div>
                <div className="text-[11px] text-neutral-500">
                  {activeTest.type === 'bunny_embed' ? 'Iframe Oficial Bunny' : 'HTML5 Video com playsInline'}
                </div>
              </div>

              {/* Player Container */}
              <div className="relative w-full aspect-video rounded-xl bg-black border border-neutral-800 overflow-hidden shadow-2xl flex items-center justify-center">
                {activeTest.type === 'bunny_embed' ? (
                  /* Bunny Stream Embed Iframe */
                  <iframe
                    key={activeTest.normalizedUrl}
                    src={activeTest.normalizedUrl}
                    loading="lazy"
                    title="Bunny Stream Embed Player"
                    className="w-full h-full border-0"
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                    allowFullScreen
                  />
                ) : (
                  /* Vídeo Direto MP4 / WebM (HTML5) */
                  <video
                    key={activeTest.normalizedUrl}
                    ref={videoRef}
                    src={activeTest.normalizedUrl}
                    controls
                    playsInline
                    preload="metadata"
                    onCanPlay={() => setPlaybackStatus('canplay')}
                    onPlay={() => setPlaybackStatus('playing')}
                    onWaiting={() => setPlaybackStatus('loading')}
                    onError={handleVideoError}
                    className="w-full h-full object-contain"
                  >
                    Seu navegador não suporta a tag de vídeo HTML5.
                  </video>
                )}
              </div>

              {/* Banner de Diagnóstico quando ocorre falha real no carregamento */}
              {playbackStatus === 'error' && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-2.5">
                  <div className="flex items-center gap-2 font-semibold text-rose-200">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>Falha ao Carregar o Fluxo de Vídeo</span>
                  </div>
                  <p className="text-neutral-300 text-[11px] leading-relaxed">
                    {playbackErrorDetail || 'O reprodutor não conseguiu obter ou decodificar os bytes deste arquivo.'}
                  </p>

                  <div className="bg-neutral-950/70 p-3 rounded-lg border border-neutral-800/80 space-y-1.5 text-[11px] text-neutral-400">
                    <span className="font-semibold text-neutral-300 block">Dicas de Diagnóstico Bunny:</span>
                    <ul className="list-disc list-inside space-y-1 text-neutral-400">
                      <li>
                        <strong>Token Temporário Expirado:</strong> Se a URL utiliza segurança com assinatura de token (<code className="text-cyan-400">?token=...&expires=...</code>), confira se o timestamp expirou.
                      </li>
                      <li>
                        <strong>Restrição de Referrer / Origem:</strong> Algumas Pull Zones do Bunny bloqueiam incorporação ou reprodução quando o domínio de origem não está na lista autorizada (Allowed Referrers).
                      </li>
                      <li>
                        <strong>CORS (Cross-Origin Resource Sharing):</strong> Verifique se a Pull Zone possui os cabeçalhos CORS habilitados para carregamento web.
                      </li>
                      <li>
                        <strong>Arquivo Removido:</strong> O arquivo ou ID de vídeo pode não existir mais no armazenamento Bunny.
                      </li>
                    </ul>
                  </div>

                  <div className="pt-1 flex items-center gap-2">
                    <a
                      href={activeTest.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-200 bg-rose-950/60 border border-rose-800/60 rounded-lg hover:bg-rose-900/60 transition-colors"
                    >
                      <span>Abrir URL no navegador para ver resposta do servidor</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}

              {/* Nota sobre não presumir reproduzibilidade */}
              <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800/80 text-[11px] text-neutral-400 flex items-start gap-2">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Aviso de Validação:</strong> O reconhecimento do formato indica que a estrutura da URL é compatível, mas a reprodução efetiva depende do status ativo do vídeo no Bunny, validade dos tokens temporários e das políticas de segurança da CDN configuradas pelo provedor.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rodapé com Informações de Segurança */}
      <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800 text-[11px] text-neutral-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Segurança estrita: Nenhuma chave secreta do Bunny é solicitada ou gravada nesta aplicação.</span>
        </div>
        <span className="text-neutral-500 font-mono text-[10px]">
          Filtro Anti-Arbitrary Hostname Ativo
        </span>
      </div>
    </div>
  );
};
