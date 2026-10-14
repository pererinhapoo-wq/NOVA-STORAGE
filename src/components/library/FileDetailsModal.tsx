import React, { useState } from 'react';
import {
  X,
  FileVideo,
  HardDrive,
  Clock,
  Film,
  Volume2,
  Subtitles,
  ShieldCheck,
  Copy,
  Check,
  Share2,
  Trash2,
  FolderOpen,
  Info,
  Layers,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { EpisodeFile, Folder } from '../../types/storage';
import { LocalCatalogService } from '../../services/storage/localCatalogService';

interface FileDetailsModalProps {
  episode: EpisodeFile | null;
  folders: Folder[];
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit?: (episode: EpisodeFile) => void;
  onNotify: (title: string, message?: string, type?: 'success' | 'info' | 'error') => void;
}

export const FileDetailsModal: React.FC<FileDetailsModalProps> = ({
  episode,
  folders,
  onClose,
  onDelete,
  onEdit,
  onNotify
}) => {
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  if (!episode) return null;

  const folder = folders.find(f => f.id === episode.folderId);
  const folderName = episode.seriesName || folder?.name || 'Diretório Raiz';

  const handleCopyHash = () => {
    navigator.clipboard.writeText(episode.checksumSha256);
    setCopiedHash(true);
    onNotify('Checksum SHA-256 copiado', 'Hash copiado para a área de transferência.', 'success');
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(episode, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    onNotify('Metadados exportados', 'Estrutura JSON copiada com sucesso.', 'success');
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleDelete = () => {
    if (confirm(`Remover "${episode.title}" do catálogo da NOVA STORAGE?`)) {
      onDelete(episode.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6">
      <div
        className="relative w-full max-w-3xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-neutral-800 bg-neutral-950/50">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-cyan-400 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-700/60">
                S{String(episode.seasonNumber).padStart(2, '0')}E{String(episode.episodeNumber).padStart(2, '0')}
              </span>
              <span className="text-xs text-neutral-400">{folderName}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">
              {episode.title}
            </h2>
            <p className="text-xs font-mono text-neutral-400 truncate">
              {episode.originalFileName}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Honest Storage Status Alert */}
          <div className="p-3.5 rounded-xl bg-neutral-950/80 border border-neutral-800 flex items-start gap-3">
            <HardDrive className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-200">Localização do Arquivo:</span>
                <span className="text-cyan-400 font-mono">Catálogo Local Registrado</span>
              </div>
              <p className="text-neutral-400 leading-relaxed">
                Este arquivo está catalogado com especificações técnicas completas. O vínculo com armazenamento
                remoto persistente (Google Drive / MEGA) será estabelecido após a configuração do provedor.
              </p>
            </div>
          </div>

          {/* Technical Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/80">
              <span className="text-[11px] text-neutral-500 block">Tamanho</span>
              <span className="text-sm font-semibold text-neutral-200 font-mono tabular-nums block mt-0.5">
                {LocalCatalogService.formatBytes(episode.fileSizeBytes)}
              </span>
              <span className="text-[10px] font-mono text-neutral-600 tabular-nums">
                {episode.fileSizeBytes.toLocaleString()} bytes
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/80">
              <span className="text-[11px] text-neutral-500 block">Duração</span>
              <span className="text-sm font-semibold text-neutral-200 font-mono tabular-nums block mt-0.5">
                {LocalCatalogService.formatDuration(episode.durationSeconds)}
              </span>
              <span className="text-[10px] font-mono text-neutral-600 tabular-nums">
                {episode.durationSeconds}s totais
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/80">
              <span className="text-[11px] text-neutral-500 block">Resolução / Contêiner</span>
              <span className="text-sm font-semibold text-neutral-200 block mt-0.5">
                {episode.resolution}
              </span>
              <span className="text-[10px] text-neutral-500">
                Formato {episode.containerFormat}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/80">
              <span className="text-[11px] text-neutral-500 block">Taxa de Quadros</span>
              <span className="text-sm font-semibold text-neutral-200 font-mono tabular-nums block mt-0.5">
                {episode.frameRate} fps
              </span>
              <span className="text-[10px] text-neutral-500">
                {episode.dimensions.width}×{episode.dimensions.height} px
              </span>
            </div>
          </div>

          {/* Video Stream & Codec Details */}
          <div className="p-4 rounded-xl bg-neutral-950/50 border border-neutral-800 space-y-3">
            <h3 className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
              <Film className="w-3.5 h-3.5 text-cyan-400" />
              <span>Fluxo de Vídeo (Video Stream)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-neutral-500 block">Codec</span>
                <span className="text-neutral-200 font-medium">{episode.videoCodec}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Bitrate Médio</span>
                <span className="text-neutral-200 font-mono tabular-nums">
                  {episode.bitrateKbps.toLocaleString()} kbps
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">Perfil de Cor</span>
                <span className="text-neutral-200">10-bit YUV420p (HDR/BT.709)</span>
              </div>
            </div>
          </div>

          {/* Audio Tracks */}
          <div className="p-4 rounded-xl bg-neutral-950/50 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
                <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Faixas de Áudio ({episode.audioStreams.length})</span>
              </h3>
            </div>

            <div className="space-y-2">
              {episode.audioStreams.map((audio, idx) => (
                <div
                  key={audio.id || idx}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-neutral-500">#{idx + 1}</span>
                    <span className="font-medium text-neutral-200">{audio.language}</span>
                    {audio.isDefault && (
                      <span className="text-[10px] text-cyan-400 font-mono">(Padrão)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-neutral-400 font-mono">
                    <span>{audio.codec}</span>
                    <span>·</span>
                    <span>{audio.channels}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Subtitles */}
          <div className="p-4 rounded-xl bg-neutral-950/50 border border-neutral-800 space-y-3">
            <h3 className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
              <Subtitles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Faixas de Legendas ({episode.subtitleStreams.length})</span>
            </h3>

            {episode.subtitleStreams.length === 0 ? (
              <p className="text-xs text-neutral-500">Sem legendas embutidas no contêiner.</p>
            ) : (
              <div className="space-y-2">
                {episode.subtitleStreams.map((sub, idx) => (
                  <div
                    key={sub.id || idx}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-neutral-900/60 border border-neutral-800 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-neutral-500">#{idx + 1}</span>
                      <span className="font-medium text-neutral-200">{sub.language}</span>
                      {sub.isDefault && (
                        <span className="text-[10px] text-cyan-400 font-mono">(Padrão)</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-neutral-400 font-mono">
                      <span>Formato {sub.format}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Integrity Checksum SHA-256 */}
          <div className="p-4 rounded-xl bg-neutral-950/50 border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-300 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Integridade do Arquivo (SHA-256)</span>
              </span>
              <button
                onClick={handleCopyHash}
                className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedHash ? 'Copiado' : 'Copiar Hash'}</span>
              </button>
            </div>
            <p className="font-mono text-xs text-neutral-400 bg-neutral-900 p-2.5 rounded border border-neutral-800 break-all select-all">
              {episode.checksumSha256}
            </p>
          </div>

          {/* Future NOVA STREAM Compatibility Notice */}
          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs space-y-1.5">
            <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Compatibilidade com NOVA STREAM</span>
            </span>
            <p className="text-neutral-300 leading-relaxed">
              Formato contêiner <strong className="text-white">{episode.containerFormat}</strong> com codec{' '}
              <strong className="text-white">{episode.videoCodec}</strong>. Pronto para Direct Play ou Remux no player
              quando a integração de streaming da NOVA STREAM for conectada via API segura.
            </p>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 sm:p-5 border-t border-neutral-800 bg-neutral-950/70">
          <button
            onClick={handleDelete}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 rounded-lg transition-colors border border-transparent hover:border-rose-900/50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remover do Catálogo</span>
          </button>

          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={handleCopyJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
            >
              {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>Exportar JSON</span>
            </button>

            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-950 bg-neutral-200 hover:bg-white rounded-lg transition-colors"
            >
              Concluído
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
