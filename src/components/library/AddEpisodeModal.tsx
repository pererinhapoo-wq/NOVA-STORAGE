import React, { useState } from 'react';
import { X, Film, FolderTree, Check, Plus, Hash } from 'lucide-react';
import { Folder, VideoCodec, VideoContainer, VideoResolution } from '../../types/storage';

interface AddEpisodeModalProps {
  folders: Folder[];
  initialFolderId?: string;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    originalFileName: string;
    seriesName: string;
    folderId: string;
    seasonNumber: number;
    episodeNumber: number;
    fileSizeBytes: number;
    durationSeconds: number;
    resolution: VideoResolution;
    dimensions: { width: number; height: number };
    frameRate: number;
    videoCodec: VideoCodec;
    bitrateKbps: number;
    containerFormat: VideoContainer;
    checksumSha256: string;
    audioLanguage: string;
    subtitleLanguage: string;
    originUrl?: string;
    originTitle?: string;
    streamUrl?: string;
    notes?: string;
  }) => void;
}

export const AddEpisodeModal: React.FC<AddEpisodeModalProps> = ({
  folders,
  initialFolderId,
  onClose,
  onSubmit
}) => {
  const [folderId, setFolderId] = useState(initialFolderId || folders[0]?.id || '');
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState('');
  const [seasonNum, setSeasonNum] = useState(1);
  const [episodeNum, setEpisodeNum] = useState(1);
  const [sizeInGb, setSizeInGb] = useState('1.25');
  const [durationMinutes, setDurationMinutes] = useState('24');
  const [resolution, setResolution] = useState<VideoResolution>('1080p');
  const [codec, setCodec] = useState<VideoCodec>('HEVC / H.265');
  const [container, setContainer] = useState<VideoContainer>('MKV');
  const [audioLang, setAudioLang] = useState('Japonês / Português');
  const [subLang, setSubLang] = useState('Português (Brasil)');
  const [originUrl, setOriginUrl] = useState('');
  const [originTitle, setOriginTitle] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [checksum, setChecksum] = useState('');
  const [notes, setNotes] = useState('');

  const generateRandomHash = () => {
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < 64; i++) {
      hash += chars[Math.floor(Math.random() * chars.length)];
    }
    setChecksum(hash);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !fileName.trim()) return;

    const sizeBytes = Math.round(parseFloat(sizeInGb || '1') * 1024 * 1024 * 1024);
    const durationSec = Math.round(parseFloat(durationMinutes || '24') * 60);

    const selectedFolder = folders.find(f => f.id === folderId);
    const seriesName = selectedFolder?.name || 'Série Avulsa';

    let dimensions = { width: 1920, height: 1080 };
    if (resolution === '4K UHD') dimensions = { width: 3840, height: 2160 };
    if (resolution === '720p') dimensions = { width: 1280, height: 720 };

    onSubmit({
      title: title.trim(),
      originalFileName: fileName.trim(),
      seriesName,
      folderId,
      seasonNumber: seasonNum,
      episodeNumber: episodeNum,
      fileSizeBytes: sizeBytes,
      durationSeconds: durationSec,
      resolution,
      dimensions,
      frameRate: 23.976,
      videoCodec: codec,
      bitrateKbps: resolution === '4K UHD' ? 16000 : 7500,
      containerFormat: container,
      checksumSha256: checksum.trim() || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      audioLanguage: audioLang,
      subtitleLanguage: subLang,
      originUrl: originUrl.trim() || undefined,
      originTitle: originTitle.trim() || undefined,
      streamUrl: streamUrl.trim() || undefined,
      notes: notes.trim()
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-cyan-400">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Catalogar Novo Vídeo</h2>
              <p className="text-xs text-neutral-400">Registre arquivos no seu cofre de mídia</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Pasta / Diretório */}
          <div>
            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
              Pasta de Destino *
            </label>
            <select
              value={folderId}
              onChange={(e) => setFolderId(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
            >
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.path})
                </option>
              ))}
            </select>
          </div>

          {/* Título & Nome do Arquivo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                Título do Episódio *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: O Início da Jornada"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                Nome Real do Arquivo *
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Frieren_S01E01_1080p.mkv"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Temporada, Episódio, Tamanho e Duração */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Temporada</label>
              <input
                type="number"
                min="1"
                value={seasonNum}
                onChange={(e) => setSeasonNum(parseInt(e.target.value) || 1)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Episódio Nº</label>
              <input
                type="number"
                min="1"
                value={episodeNum}
                onChange={(e) => setEpisodeNum(parseInt(e.target.value) || 1)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Tamanho (GB)</label>
              <input
                type="number"
                step="0.05"
                min="0.01"
                value={sizeInGb}
                onChange={(e) => setSizeInGb(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Duração (Min)</label>
              <input
                type="number"
                min="1"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono"
              />
            </div>
          </div>

          {/* Resolução, Codec e Contêiner */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Resolução</label>
              <select
                value={resolution}
                onChange={(e) => setResolution(e.target.value as VideoResolution)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="1080p">1080p (Full HD)</option>
                <option value="4K UHD">4K UHD (2160p)</option>
                <option value="720p">720p (HD)</option>
                <option value="1440p">1440p (2K)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Codec de Vídeo</label>
              <select
                value={codec}
                onChange={(e) => setCodec(e.target.value as VideoCodec)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="HEVC / H.265">HEVC / H.265</option>
                <option value="AVC / H.264">AVC / H.264</option>
                <option value="AV1">AV1</option>
                <option value="VP9">VP9</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">Contêiner</label>
              <select
                value={container}
                onChange={(e) => setContainer(e.target.value as VideoContainer)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="MKV">MKV (Matroska)</option>
                <option value="MP4">MP4</option>
                <option value="WEBM">WEBM</option>
              </select>
            </div>
          </div>

          {/* Faixas de Áudio e Legendas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                Idiomas de Áudio
              </label>
              <input
                type="text"
                placeholder="Ex: Japonês 2.0 / Português 5.1"
                value={audioLang}
                onChange={(e) => setAudioLang(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
                Legendas Embutidas
              </label>
              <input
                type="text"
                placeholder="Ex: Português (Brasil) ASS"
                value={subLang}
                onChange={(e) => setSubLang(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200"
              />
            </div>
          </div>

          {/* Checksum SHA-256 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-neutral-300">
                Hash de Integridade (SHA-256)
              </label>
              <button
                type="button"
                onClick={generateRandomHash}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
              >
                <Hash className="w-3 h-3" />
                <span>Gerar hash do arquivo</span>
              </button>
            </div>
            <input
              type="text"
              placeholder="Cole ou gere o hash SHA-256 de 64 caracteres"
              value={checksum}
              onChange={(e) => setChecksum(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono"
            />
          </div>

          {/* Vínculo de Origem e Fluxo (Opcional) */}
          <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800 space-y-3">
            <span className="text-xs font-semibold text-neutral-300 block">
              Vínculo de Origem e Fluxo de Streaming (Opcional)
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                  URL da Página de Origem (Web)
                </label>
                <input
                  type="url"
                  placeholder="https://exemplo.com/animes/ep-01"
                  value={originUrl}
                  onChange={(e) => setOriginUrl(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                  Título da Página de Origem
                </label>
                <input
                  type="text"
                  placeholder="Ex: Assistir Online Full HD"
                  value={originTitle}
                  onChange={(e) => setOriginTitle(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                URL Direta de Reprodução (Stream Direto / Capturada por Sniffer)
              </label>
              <input
                type="url"
                placeholder="https://cdn.exemplo.com/hls/master.m3u8?token=..."
                value={streamUrl}
                onChange={(e) => setStreamUrl(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
              Notas Técnicas (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Master oficial ripado em alta taxa de bits"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors shadow-sm"
            >
              Adicionar ao Catálogo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
