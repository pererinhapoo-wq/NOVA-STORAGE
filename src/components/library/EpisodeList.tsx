import React, { useMemo, useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  Film,
  RotateCcw,
  Plus,
  ArrowUpDown,
  FileVideo,
  Clock,
  HardDrive,
  FolderOpen,
  Check,
  ChevronDown
} from 'lucide-react';
import { EpisodeFile, FilterState, Folder, VideoContainer, VideoResolution } from '../../types/storage';
import { LocalCatalogService } from '../../services/storage/localCatalogService';

interface EpisodeListProps {
  episodes: EpisodeFile[];
  folders: Folder[];
  filterState: FilterState;
  onFilterChange: (filters: Partial<FilterState>) => void;
  onResetFilters: () => void;
  onSelectEpisode: (episode: EpisodeFile) => void;
  onOpenAddModal: () => void;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const EpisodeList: React.FC<EpisodeListProps> = ({
  episodes,
  folders,
  filterState,
  onFilterChange,
  onResetFilters,
  onSelectEpisode,
  onOpenAddModal,
  isLoading = false,
  error = null,
  onRetry
}) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const folderMap = useMemo(() => {
    return new Map(folders.map(f => [f.id, f.name]));
  }, [folders]);

  // Client-side filtering & sorting
  const filteredEpisodes = useMemo(() => {
    let result = [...episodes];

    // Search query
    if (filterState.searchQuery.trim()) {
      const q = filterState.searchQuery.toLowerCase().trim();
      result = result.filter(
        ep =>
          ep.title.toLowerCase().includes(q) ||
          ep.originalFileName.toLowerCase().includes(q) ||
          ep.seriesName.toLowerCase().includes(q) ||
          ep.checksumSha256.toLowerCase().includes(q)
      );
    }

    // Folder filter
    if (filterState.folderId !== 'all') {
      result = result.filter(ep => ep.folderId === filterState.folderId);
    }

    // Resolution filter
    if (filterState.resolution !== 'all') {
      result = result.filter(ep => ep.resolution === filterState.resolution);
    }

    // Container filter
    if (filterState.container !== 'all') {
      result = result.filter(ep => ep.containerFormat === filterState.container);
    }

    // Sort
    result.sort((a, b) => {
      switch (filterState.sortBy) {
        case 'date_desc':
          return new Date(b.catalogedAt).getTime() - new Date(a.catalogedAt).getTime();
        case 'date_asc':
          return new Date(a.catalogedAt).getTime() - new Date(b.catalogedAt).getTime();
        case 'size_desc':
          return b.fileSizeBytes - a.fileSizeBytes;
        case 'size_asc':
          return a.fileSizeBytes - b.fileSizeBytes;
        case 'episode_asc':
          if (a.seriesName === b.seriesName) {
            return a.episodeNumber - b.episodeNumber;
          }
          return a.seriesName.localeCompare(b.seriesName);
        case 'title_asc':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    return result;
  }, [episodes, filterState]);

  const hasActiveFilters =
    filterState.searchQuery !== '' ||
    filterState.folderId !== 'all' ||
    filterState.resolution !== 'all' ||
    filterState.container !== 'all';

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 bg-neutral-900 animate-pulse rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-neutral-900/60 border border-neutral-800 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-8 text-center rounded-xl bg-neutral-900/80 border border-rose-900/40 space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-950/60 border border-rose-800/60 flex items-center justify-center mx-auto text-rose-400">
          <Film className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-white">Falha ao carregar catálogo</h2>
          <p className="text-xs text-neutral-400 mt-1 max-w-md mx-auto">{error}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-neutral-950 bg-cyan-400 rounded-lg hover:bg-cyan-300"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Tentar Novamente</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Search & Filter Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          {/* Live Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={filterState.searchQuery}
              onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
              placeholder="Buscar por título, nome do arquivo ou SHA-256..."
              className="w-full bg-neutral-900/90 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
            />
            {filterState.searchQuery && (
              <button
                onClick={() => onFilterChange({ searchQuery: '' })}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400 hover:text-white"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Action & Filter Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Sort Dropdown */}
            <div className="relative">
              <select
                value={filterState.sortBy}
                onChange={(e) => onFilterChange({ sortBy: e.target.value as FilterState['sortBy'] })}
                className="appearance-none bg-neutral-900 border border-neutral-800 rounded-lg pl-3 pr-8 py-2 text-xs font-medium text-neutral-300 hover:text-white hover:border-neutral-700 cursor-pointer focus:outline-none focus:border-cyan-500"
              >
                <option value="date_desc">Mais recentes primeiro</option>
                <option value="date_asc">Mais antigos primeiro</option>
                <option value="size_desc">Maior tamanho</option>
                <option value="size_asc">Menor tamanho</option>
                <option value="episode_asc">Ordem por Série / Episódio</option>
                <option value="title_asc">Título (A-Z)</option>
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-neutral-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>

            {/* Advanced Filters Toggle */}
            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                showAdvancedFilters || hasActiveFilters
                  ? 'bg-neutral-800 text-cyan-400 border-neutral-700'
                  : 'bg-neutral-900 text-neutral-400 hover:text-white border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filtros</span>
              {hasActiveFilters && (
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
              )}
            </button>

            {/* Catalog Button */}
            <button
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">Catalogar</span>
            </button>
          </div>
        </div>

        {/* Expandable Filter Drawer */}
        {showAdvancedFilters && (
          <div className="p-4 rounded-xl bg-neutral-900/90 border border-neutral-800 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Folder Selector */}
              <div>
                <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                  Filtrar por Pasta / Série
                </label>
                <select
                  value={filterState.folderId}
                  onChange={(e) => onFilterChange({ folderId: e.target.value })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">Todas as pastas ({folders.length})</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Container Selector */}
              <div>
                <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                  Formato do Contêiner
                </label>
                <select
                  value={filterState.container}
                  onChange={(e) => onFilterChange({ container: e.target.value as VideoContainer | 'all' })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">Todos os formatos</option>
                  <option value="MKV">MKV (Matroska)</option>
                  <option value="MP4">MP4 (MPEG-4)</option>
                  <option value="WEBM">WEBM</option>
                </select>
              </div>

              {/* Resolution Selector */}
              <div>
                <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                  Resolução de Vídeo
                </label>
                <select
                  value={filterState.resolution}
                  onChange={(e) => onFilterChange({ resolution: e.target.value as VideoResolution | 'all' })}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="all">Todas as resoluções</option>
                  <option value="4K UHD">4K UHD (2160p)</option>
                  <option value="1080p">1080p (Full HD)</option>
                  <option value="720p">720p (HD)</option>
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                <span className="text-xs text-neutral-400">
                  {filteredEpisodes.length} {filteredEpisodes.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}
                </span>
                <button
                  onClick={onResetFilters}
                  className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Redefinir Filtros</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Counter summary */}
      <div className="flex items-center justify-between text-xs text-neutral-400 px-1">
        <span>
          Exibindo <span className="font-mono text-neutral-200 tabular-nums">{filteredEpisodes.length}</span> de{' '}
          <span className="font-mono text-neutral-200 tabular-nums">{episodes.length}</span> episódios catalogados
        </span>
        {filterState.folderId !== 'all' && (
          <span className="text-neutral-500">
            Filtrado por: <span className="text-neutral-300">{folderMap.get(filterState.folderId)}</span>
          </span>
        )}
      </div>

      {/* Empty State */}
      {filteredEpisodes.length === 0 ? (
        <div className="py-16 text-center rounded-xl bg-neutral-900/40 border border-neutral-800 space-y-4">
          <div className="w-12 h-12 rounded-full bg-neutral-800/60 flex items-center justify-center mx-auto text-neutral-500">
            <FileVideo className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Nenhum episódio localizado</h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto leading-relaxed">
              {hasActiveFilters
                ? 'Nenhum arquivo corresponde aos filtros aplicados. Tente ajustar os termos ou redefinir a busca.'
                : 'Sua biblioteca ainda não possui arquivos de vídeo cadastrados.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-1">
            {hasActiveFilters ? (
              <button
                onClick={onResetFilters}
                className="px-3.5 py-1.5 text-xs font-semibold text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
              >
                Limpar Todos os Filtros
              </button>
            ) : (
              <button
                onClick={onOpenAddModal}
                className="px-3.5 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
              >
                Catalogar Primeiro Episódio
              </button>
            )}
          </div>
        </div>
      ) : (
        /* Episode Cards/List */
        <div className="space-y-2.5">
          {filteredEpisodes.map((ep) => {
            const folderName = ep.seriesName || folderMap.get(ep.folderId) || 'Avulso';
            return (
              <div
                key={ep.id}
                onClick={() => onSelectEpisode(ep)}
                className="group relative p-4 rounded-xl bg-neutral-900/70 hover:bg-neutral-900 border border-neutral-800/80 hover:border-neutral-700 transition-colors cursor-pointer"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Left Column: Designation, Title, Filename & Metadata */}
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-cyan-400 shrink-0 bg-neutral-950/80 px-2 py-0.5 rounded border border-neutral-800">
                        S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
                      </span>
                      <h3 className="text-sm font-semibold text-neutral-100 group-hover:text-white truncate">
                        {ep.title}
                      </h3>
                    </div>

                    <p className="text-xs text-neutral-400 font-mono truncate max-w-2xl">
                      {ep.originalFileName}
                    </p>

                    {/* Zero-Pill Unboxed Metadata with · separator */}
                    <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400 pt-0.5">
                      <span className="text-neutral-300 font-medium">{folderName}</span>
                      <span aria-hidden="true" className="text-neutral-600">·</span>
                      <span className="font-mono tabular-nums text-neutral-300">
                        {LocalCatalogService.formatBytes(ep.fileSizeBytes)}
                      </span>
                      <span aria-hidden="true" className="text-neutral-600">·</span>
                      <span>{ep.containerFormat}</span>
                      <span aria-hidden="true" className="text-neutral-600">·</span>
                      <span>{ep.resolution}</span>
                      <span aria-hidden="true" className="text-neutral-600">·</span>
                      <span>{ep.videoCodec}</span>
                      <span aria-hidden="true" className="text-neutral-600">·</span>
                      <span>{ep.audioStreams.length} áudio{ep.audioStreams.length > 1 ? 's' : ''}</span>
                      {ep.subtitleStreams.length > 0 && (
                        <>
                          <span aria-hidden="true" className="text-neutral-600">·</span>
                          <span>{ep.subtitleStreams.length} legenda{ep.subtitleStreams.length > 1 ? 's' : ''}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Time, Date & Inspection Trigger */}
                  <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-neutral-800/60">
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      <Clock className="w-3.5 h-3.5 text-neutral-500" />
                      <span className="font-mono tabular-nums">
                        {LocalCatalogService.formatDuration(ep.durationSeconds)}
                      </span>
                    </div>

                    <div className="text-[11px] text-neutral-500">
                      Adicionado em {LocalCatalogService.formatDate(ep.catalogedAt)}
                    </div>

                    <div className="hidden md:inline-flex items-center gap-1 text-xs text-cyan-400 group-hover:text-cyan-300 font-medium pt-1">
                      <span>Ver detalhes técnicos</span>
                      <ChevronDown className="w-3.5 h-3.5 -rotate-90 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
