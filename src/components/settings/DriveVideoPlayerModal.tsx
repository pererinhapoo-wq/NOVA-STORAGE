import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ExternalLink,
  Clock,
  AlertTriangle,
  Shield,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { DriveVideoItem, GoogleDriveStorageAdapter } from '../../services/storage/providers/googleDriveAdapter';

interface DriveVideoPlayerModalProps {
  video: DriveVideoItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DriveVideoPlayerModal: React.FC<DriveVideoPlayerModalProps> = ({
  video,
  isOpen,
  onClose
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  // Reset loading state and set safety timeout when a video is selected or reloaded
  useEffect(() => {
    if (video && isOpen) {
      setIsLoading(true);
      setLoadTimedOut(false);

      // Safety timeout: 5.0 seconds to prevent interface from staying stuck in the spinner
      const timer = setTimeout(() => {
        setIsLoading(false);
        setLoadTimedOut(true);
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [video?.id, isOpen, iframeKey]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Prevent background scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !video || typeof document === 'undefined') return null;

  const formatBadge = GoogleDriveStorageAdapter.inferFormat(video.name, video.mimeType);
  const formattedSize = GoogleDriveStorageAdapter.formatBytes(video.sizeBytes);
  const formattedDate = GoogleDriveStorageAdapter.formatDate(video.modifiedTime || video.createdTime);

  const durationFormatted = video.videoDetails?.durationMillis
    ? `${Math.round(video.videoDetails.durationMillis / 1000)}s`
    : null;

  const dimensionsFormatted = video.videoDetails?.width && video.videoDetails?.height
    ? `${video.videoDetails.width}×${video.videoDetails.height}`
    : null;

  const isMkvOrHeavyFormat = formatBadge === 'MKV' || formatBadge === 'AVI';

  const handleReloadIframe = () => {
    setIsLoading(true);
    setLoadTimedOut(false);
    setIframeKey((prev) => prev + 1);
  };

  const handleIframeLoaded = () => {
    setIsLoading(false);
    setLoadTimedOut(false);
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      onClick={(e) => {
        // Fechar ao clicar no backdrop sem precisar de stopPropagation no card
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="drive-modal-title"
    >
      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] my-auto">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 p-4 sm:p-5 border-b border-neutral-800 bg-neutral-950/70">
          <div className="space-y-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded border ${
                formatBadge === 'MP4' || formatBadge === 'WEBM'
                  ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                  : 'bg-amber-950/40 text-amber-400 border-amber-800/60'
              }`}>
                {formatBadge}
              </span>
              <span className="text-xs font-mono text-neutral-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                {formattedSize}
              </span>
              {dimensionsFormatted && (
                <span className="text-xs font-mono text-cyan-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                  {dimensionsFormatted}
                </span>
              )}
              {durationFormatted && (
                <span className="text-xs font-mono text-neutral-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-neutral-500" />
                  {durationFormatted}
                </span>
              )}
            </div>

            <h2 id="drive-modal-title" className="text-base sm:text-lg font-bold text-white truncate" title={video.name}>
              {video.name}
            </h2>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleReloadIframe}
              title="Recarregar player"
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
              aria-label="Fechar modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
          {/* Video Player Frame Container */}
          <div className="relative w-full aspect-video bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden shadow-inner flex items-center justify-center">
            {/* Loading Indicator */}
            {isLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-950/90 z-10 text-neutral-400 gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
                <span className="text-xs font-mono">Conectando ao player oficial do Google Drive...</span>
              </div>
            )}

            {/* Embedded Google Drive Preview Player */}
            <iframe
              key={iframeKey}
              src={video.previewUrl}
              title={video.name}
              className="w-full h-full border-0"
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
              onLoad={handleIframeLoaded}
            />
          </div>

          {/* Safety Timeout Notice when preview takes long or is blocked */}
          {loadTimedOut && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-2 font-semibold text-amber-300">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>A pré-visualização pode estar demorando para carregar ou bloqueada pelo navegador</span>
                </div>
                <p className="text-neutral-400 leading-relaxed text-[11px]">
                  O Google Drive pode exigir permissões/cookies em iframes ou estar processando o vídeo. Para assistir diretamente no Drive, utilize o botão ao lado.
                </p>
              </div>

              <a
                href={video.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto shadow-sm"
              >
                <span>Abrir no Drive</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Quick Action: Open directly in Google Drive */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-neutral-950/90 border border-neutral-800">
            <div className="text-xs text-neutral-300 space-y-0.5">
              <span className="font-semibold text-white block">Visualização Direta no Google Drive</span>
              <p className="text-neutral-400 text-[11px]">
                Caso o player embutido apresente restrições de cookies ou processamento no navegador.
              </p>
            </div>

            <a
              href={video.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shadow-sm self-start sm:self-auto"
            >
              <span>Abrir no Google Drive</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Honest Notice on Format Compatibility & Serverless Streaming */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-neutral-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Aviso de Compatibilidade de Formatos & Restrições Técnicas</span>
            </div>
            <div className="text-neutral-400 space-y-1.5 leading-relaxed text-[11px]">
              <p>
                • <strong className="text-neutral-200">Compatibilidade de Formatos:</strong> O player web do Google Drive suporta nativamente formatos comuns como <strong className="text-white">MP4</strong> e <strong className="text-white">WebM</strong> (codec H.264/AAC). Contêineres de alta fidelidade como <strong className="text-white">MKV</strong> {isMkvOrHeavyFormat && <span className="text-amber-400 font-semibold">(detectado neste arquivo)</span>} ou codecs de áudio avançados (FLAC, AC3, DTS) podem exigir processamento de transcodificação no Google Drive ou apresentar mensagem de &quot;Não é possível visualizar o arquivo&quot;.
              </p>
              <p>
                • <strong className="text-neutral-200">Sem Download via Vercel:</strong> Esta aplicação não realiza download ou retransmissão de arquivos pesados pelo servidor serverless da Vercel. A reprodução ocorre de forma descentralizada e segura diretamente entre o cliente e o Google Drive.
              </p>
              <p>
                • <strong className="text-neutral-200">Cookies de Terceiros e Permissões:</strong> Se você estiver navegando em modo anônimo ou se seu navegador bloquear cookies de terceiros em iframes, o Google Drive pode exibir tela de login ou erro. Basta utilizar o botão <span className="text-cyan-400">&quot;Abrir no Google Drive&quot;</span> acima.
              </p>
            </div>
          </div>

          {/* Technical Metadata Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800">
              <span className="text-[10px] text-neutral-500 block">ID do Arquivo (Drive)</span>
              <span className="text-xs font-mono text-neutral-300 truncate block mt-0.5" title={video.id}>
                {video.id}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800">
              <span className="text-[10px] text-neutral-500 block">Tipo MIME</span>
              <span className="text-xs font-mono text-neutral-300 truncate block mt-0.5" title={video.mimeType}>
                {video.mimeType}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800">
              <span className="text-[10px] text-neutral-500 block">Última Modificação</span>
              <span className="text-xs text-neutral-300 block mt-0.5">
                {formattedDate}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800">
              <span className="text-[10px] text-neutral-500 block">Checksum MD5</span>
              <span className="text-xs font-mono text-neutral-400 truncate block mt-0.5" title={video.md5Checksum || 'Não disponível'}>
                {video.md5Checksum ? `${video.md5Checksum.substring(0, 12)}...` : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-neutral-800 bg-neutral-950/70">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            <span>Nenhum token ou segredo confidencial exposto.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-neutral-950 bg-neutral-200 hover:bg-white rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
