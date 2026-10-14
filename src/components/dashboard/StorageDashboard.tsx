import React from 'react';
import {
  HardDrive,
  Film,
  FolderTree,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Plus,
  ExternalLink,
  Sparkles,
  Layers,
  FileCode2
} from 'lucide-react';
import { EpisodeFile, Folder, StorageCatalogStats } from '../../types/storage';
import { LocalCatalogService } from '../../services/storage/localCatalogService';

interface StorageDashboardProps {
  stats: StorageCatalogStats;
  recentEpisodes: EpisodeFile[];
  folders: Folder[];
  onNavigateTab: (tab: 'dashboard' | 'library' | 'folders' | 'settings' | 'bridge') => void;
  onSelectEpisode: (episode: EpisodeFile) => void;
  onOpenAddModal: () => void;
  onOpenNewFolderModal: () => void;
}

export const StorageDashboard: React.FC<StorageDashboardProps> = ({
  stats,
  recentEpisodes,
  folders,
  onNavigateTab,
  onSelectEpisode,
  onOpenAddModal,
  onOpenNewFolderModal
}) => {
  const folderMap = new Map(folders.map(f => [f.id, f.name]));

  // Calculate format percentages
  const totalFiles = stats.totalFiles || 1;
  const mkvPercent = Math.round(((stats.formatCounts.MKV || 0) / totalFiles) * 100);
  const mp4Percent = Math.round(((stats.formatCounts.MP4 || 0) / totalFiles) * 100);
  const webmPercent = Math.round(((stats.formatCounts.WEBM || 0) / totalFiles) * 100);

  return (
    <div className="space-y-8">
      {/* Hero Showcase Vault Banner */}
      <div className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/60 shadow-2xl">
        <div className="absolute inset-0 z-0">
          <img
            src="/src/assets/images/nova_storage_hero_1791993498582.jpg"
            alt="Cofre de Armazenamento NOVA STORAGE"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover object-center opacity-30 mix-blend-luminosity filter contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/85 to-neutral-950/40" />
        </div>

        <div className="relative z-10 p-6 sm:p-8 lg:p-10">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-cyan-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Painel Privado de Mídia & Catalogação</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight">
              Gerencie seus episódios com integridade técnica e metadados detalhados.
            </h1>

            <p className="text-sm text-neutral-300 leading-relaxed">
              O NOVA STORAGE opera como seu catálogo central de arquivos de vídeo, preparado
              com camada de serviço desacoplada para conexão futura com Google Drive, MEGA e
              integração segura com a NOVA STREAM.
            </p>

            {/* Storage state disclaimer: explicit and honest */}
            <div className="pt-2">
              <div className="flex items-start gap-3 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-neutral-200">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-amber-300">
                    Conexão com armazenamento real ainda não configurada
                  </p>
                  <p className="text-neutral-400 leading-relaxed">
                    Nesta fase inicial, os metadados e arquivos estão registrados no catálogo seguro local.
                    Nenhum upload fictício é realizado. Para vincular provedores remotos, acesse a aba Armazenamento.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                onClick={() => onNavigateTab('library')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shadow-sm"
              >
                <span>Explorar Biblioteca</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => onNavigateTab('settings')}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 rounded-lg transition-colors whitespace-nowrap"
              >
                <span>Configurar Provedores</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="p-5 rounded-xl bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700 transition-colors">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium">Volume Total Indexado</span>
            <HardDrive className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-white font-mono tabular-nums">
            {stats.totalSizeFormatted}
          </div>
          <p className="text-xs text-neutral-500 mt-1">Calculado sobre a soma dos episódios</p>
        </div>

        {/* Metric 2 */}
        <div className="p-5 rounded-xl bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700 transition-colors">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium">Episódios Registrados</span>
            <Film className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-white font-mono tabular-nums">
            {stats.totalFiles}
          </div>
          <p className="text-xs text-neutral-500 mt-1">Arquivos de mídia no catálogo</p>
        </div>

        {/* Metric 3 */}
        <div className="p-5 rounded-xl bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700 transition-colors">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium">Diretórios / Séries</span>
            <FolderTree className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-white font-mono tabular-nums">
            {stats.totalFolders}
          </div>
          <p className="text-xs text-neutral-500 mt-1">Pastas estruturadas</p>
        </div>

        {/* Metric 4 */}
        <div className="p-5 rounded-xl bg-neutral-900/80 border border-neutral-800/80 hover:border-neutral-700 transition-colors">
          <div className="flex items-center justify-between text-neutral-400 mb-2">
            <span className="text-xs font-medium">Modo de Operação</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-lg font-bold tracking-tight text-neutral-200">
            Catálogo Local Seguro
          </div>
          <p className="text-xs text-neutral-500 mt-1">Isolado sem dados falsificados</p>
        </div>
      </div>

      {/* Breakdown Grid: Formats & Resolutions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Format breakdown */}
        <div className="p-5 sm:p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white">Contêineres de Vídeo</h2>
              <p className="text-xs text-neutral-400">Distribuição dos formatos no armazenamento</p>
            </div>
            <Layers className="w-4 h-4 text-neutral-500" />
          </div>

          <div className="space-y-3 pt-2">
            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-neutral-300">MKV (Matroska)</span>
                <span className="text-neutral-400 font-mono tabular-nums">
                  {stats.formatCounts.MKV || 0} arquivos ({mkvPercent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                  style={{ width: `${mkvPercent}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-neutral-300">MP4 (MPEG-4 Part 14)</span>
                <span className="text-neutral-400 font-mono tabular-nums">
                  {stats.formatCounts.MP4 || 0} arquivos ({mp4Percent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${mp4Percent}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium mb-1.5">
                <span className="text-neutral-300">WEBM (VP9 / AV1)</span>
                <span className="text-neutral-400 font-mono tabular-nums">
                  {stats.formatCounts.WEBM || 0} arquivos ({webmPercent}%)
                </span>
              </div>
              <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${webmPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Resolution Breakdown */}
        <div className="p-5 sm:p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold text-white">Resoluções do Catálogo</h2>
              <p className="text-xs text-neutral-400">Classificação de fidelidade de imagem</p>
            </div>
            <Film className="w-4 h-4 text-neutral-500" />
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800 text-center">
              <span className="text-xs text-cyan-400 font-semibold block">4K UHD</span>
              <span className="text-xl font-bold text-white font-mono tabular-nums mt-1 block">
                {stats.resolutionCounts['4K UHD'] || 0}
              </span>
              <span className="text-[11px] text-neutral-500">2160p Master</span>
            </div>

            <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800 text-center">
              <span className="text-xs text-cyan-400 font-semibold block">1080p FHD</span>
              <span className="text-xl font-bold text-white font-mono tabular-nums mt-1 block">
                {stats.resolutionCounts['1080p'] || 0}
              </span>
              <span className="text-[11px] text-neutral-500">Full HD Stream</span>
            </div>

            <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800 text-center">
              <span className="text-xs text-neutral-400 font-semibold block">720p HD</span>
              <span className="text-xl font-bold text-white font-mono tabular-nums mt-1 block">
                {stats.resolutionCounts['720p'] || 0}
              </span>
              <span className="text-[11px] text-neutral-500">Compacto</span>
            </div>
          </div>

          <div className="text-xs text-neutral-400 pt-1 leading-relaxed">
            Todos os itens contêm registros de faixas de áudio e legendas estilizadas (ASS/SRT)
            preparados para passthrough ou remux direto.
          </div>
        </div>
      </div>

      {/* Recent Catalog Items & Quick Actions */}
      <div className="p-5 sm:p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Arquivos Recentes no Catálogo</h2>
            <p className="text-xs text-neutral-400">Últimos episódios registrados e inspecionados</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenNewFolderModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Nova Pasta</span>
            </button>
            <button
              onClick={onOpenAddModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300 bg-cyan-950/50 border border-cyan-800/50 rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Catalogar Vídeo</span>
            </button>
          </div>
        </div>

        {recentEpisodes.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <Film className="w-8 h-8 text-neutral-600 mx-auto" />
            <p className="text-sm font-medium text-neutral-300">Nenhum arquivo no catálogo</p>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              Comece catalogando um episódio de vídeo com metadados para organizar sua coleção.
            </p>
            <button
              onClick={onOpenAddModal}
              className="px-3.5 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 rounded-lg hover:bg-cyan-300"
            >
              Catalogar Primeiro Vídeo
            </button>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800/60 overflow-hidden">
            {recentEpisodes.slice(0, 5).map((ep) => (
              <div
                key={ep.id}
                onClick={() => onSelectEpisode(ep)}
                className="group py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-800/30 px-3 -mx-3 rounded-lg cursor-pointer transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium text-cyan-400 shrink-0">
                      E{String(ep.episodeNumber).padStart(2, '0')}
                    </span>
                    <span className="text-sm font-medium text-neutral-200 group-hover:text-white truncate">
                      {ep.title}
                    </span>
                  </div>

                  {/* Clean unboxed metadata with separators */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    <span className="text-neutral-400">
                      {ep.seriesName || folderMap.get(ep.folderId) || 'Pasta Geral'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{LocalCatalogService.formatBytes(ep.fileSizeBytes)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ep.containerFormat}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ep.resolution}</span>
                    <span aria-hidden="true">·</span>
                    <span>{ep.videoCodec}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-xs text-neutral-500 self-end sm:self-center">
                  <span className="font-mono tabular-nums">{LocalCatalogService.formatDuration(ep.durationSeconds)}</span>
                  <div className="flex items-center gap-1 text-cyan-400 group-hover:translate-x-0.5 transition-transform">
                    <span>Inspecionar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {recentEpisodes.length > 5 && (
          <div className="pt-2 text-right">
            <button
              onClick={() => onNavigateTab('library')}
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
            >
              <span>Ver todos os {recentEpisodes.length} arquivos na Biblioteca</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Integration Readiness Footnote */}
      <div className="p-4 rounded-xl bg-neutral-900/40 border border-neutral-800/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-neutral-400">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>
            Arquitetura pronta para integração com a NOVA STREAM através de contrato de API REST read-only.
          </span>
        </div>
        <button
          onClick={() => onNavigateTab('bridge')}
          className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-medium whitespace-nowrap"
        >
          <span>Ver Especificação da API</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
