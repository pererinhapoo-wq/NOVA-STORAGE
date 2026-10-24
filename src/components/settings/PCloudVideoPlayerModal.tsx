import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Clock,
  AlertTriangle,
  Shield,
  RefreshCw,
  AlertCircle,
  Film,
  Download
} from 'lucide-react';
import { PCloudStorageAdapter } from '../../services/storage/providers/pcloudAdapter';

export interface PCloudVideoModalItem {
  id: string;
  name: string;
  sizeBytes?: number;
  format?: string;
  modifiedTime?: string;
}

interface PCloudVideoPlayerModalProps {
  video: PCloudVideoModalItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PCloudVideoPlayerModal: React.FC<PCloudVideoPlayerModalProps> = ({
  video,
  isOpen,
  onClose
}) => {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carrega o link de streaming oficial do pCloud via backend
  useEffect(() => {
    if (!video || !isOpen) {
      setStreamUrl(null);
      setError(null);
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setError(null);

    const adapter = new PCloudStorageAdapter();
    adapter
      .getFileLink(video.id)
      .then((res) => {
        if (isCancelled) return;
        if (res.success && res.streamUrl) {
          setStreamUrl(res.streamUrl);
          setExpiresAt(res.expiresAt || null);
        } else {
          setError(res.message || 'Não foi possível gerar link de streaming direto do pCloud.');
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        setError(err?.message || 'Falha de comunicação ao solicitar streaming.');
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [video?.id, isOpen]);

  // Fechamento com tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Previne rolagem de fundo
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen || !video) return null;

  const format = video.format || PCloudStorageAdapter.inferFormat(video.name);
  const formattedSize = video.sizeBytes ? PCloudStorageAdapter.formatBytes(video.sizeBytes) : '—';
  const formattedDate = PCloudStorageAdapter.formatDate(video.modifiedTime);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Player de vídeo: ${video.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:px-6 border-b border-neutral-800/80 bg-neutral-900/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-cyan-400 shrink-0">
              <Film className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white truncate max-w-xs sm:max-w-md lg:max-w-xl">
                {video.name}
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400 pt-0.5">
                <span className="font-mono text-cyan-400 font-bold bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-800/50">
                  {format}
                </span>
                <span>· {formattedSize}</span>
                <span>· Modificado: {formattedDate}</span>
                <span className="text-neutral-500 font-mono text-[10px]">ID: {video.id}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors shrink-0"
            aria-label="Fechar player"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player Container */}
        <div className="relative flex-1 min-h-[300px] sm:min-h-[420px] bg-black flex items-center justify-center overflow-hidden">
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
              <p className="text-xs font-mono text-neutral-400">
                Gerando link de streaming HTTP Range com a API pCloud...
              </p>
            </div>
          )}

          {!isLoading && error && (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center max-w-md">
              <AlertCircle className="w-10 h-10 text-rose-400 shrink-0" />
              <h4 className="text-sm font-bold text-rose-300">Falha ao iniciar reprodução</h4>
              <p className="text-xs text-neutral-400 leading-relaxed">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  setError(null);
                  new PCloudStorageAdapter().getFileLink(video.id).then((r) => {
                    if (r.success && r.streamUrl) {
                      setStreamUrl(r.streamUrl);
                    } else {
                      setError(r.message || 'Falha ao obter link.');
                    }
                    setIsLoading(false);
                  });
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar Novamente</span>
              </button>
            </div>
          )}

          {!isLoading && !error && streamUrl && (
            <video
              controls
              autoPlay
              playsInline
              preload="metadata"
              className="w-full h-full max-h-[60vh] object-contain"
              src={streamUrl}
            >
              Seu navegador não suporta reprodução direta deste formato de vídeo.
            </video>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:px-6 bg-neutral-950 border-t border-neutral-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-neutral-400 shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-[11px]">
              Streaming oficial pCloud com suporte a busca rápida (HTTP Range 206).
              {expiresAt && ` Expira em: ${expiresAt}`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {streamUrl && (
              <a
                href={streamUrl}
                download={video.name}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg transition-colors"
              >
                <Download className="w-3 h-3" />
                <span>Baixar</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1 text-xs font-semibold text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
