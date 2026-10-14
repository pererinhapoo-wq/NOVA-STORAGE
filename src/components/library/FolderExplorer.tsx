import React from 'react';
import {
  FolderTree,
  Folder as FolderIcon,
  Plus,
  ArrowRight,
  HardDrive,
  Film,
  Calendar,
  Trash2,
  FolderOpen
} from 'lucide-react';
import { EpisodeFile, Folder } from '../../types/storage';
import { LocalCatalogService } from '../../services/storage/localCatalogService';

interface FolderExplorerProps {
  folders: Folder[];
  episodes: EpisodeFile[];
  onSelectFolder: (folderId: string) => void;
  onOpenNewFolderModal: () => void;
  onDeleteFolder: (folderId: string) => void;
}

export const FolderExplorer: React.FC<FolderExplorerProps> = ({
  folders,
  episodes,
  onSelectFolder,
  onOpenNewFolderModal,
  onDeleteFolder
}) => {
  // Aggregate stats per folder
  const folderStats = React.useMemo(() => {
    const stats = new Map<string, { count: number; totalBytes: number }>();
    for (const f of folders) {
      stats.set(f.id, { count: 0, totalBytes: 0 });
    }

    for (const ep of episodes) {
      const current = stats.get(ep.folderId) || { count: 0, totalBytes: 0 };
      current.count += 1;
      current.totalBytes += ep.fileSizeBytes;
      stats.set(ep.folderId, current);
    }
    return stats;
  }, [folders, episodes]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-neutral-900/60 border border-neutral-800">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-cyan-400" />
            <span>Estrutura de Pastas e Séries</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Organize temporadas, lançamentos e animes em diretórios independentes com controle de volume.
          </p>
        </div>

        <button
          onClick={onOpenNewFolderModal}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Criar Nova Pasta</span>
        </button>
      </div>

      {/* Folders Grid */}
      {folders.length === 0 ? (
        <div className="py-16 text-center rounded-xl bg-neutral-900/40 border border-neutral-800 space-y-4">
          <FolderOpen className="w-10 h-10 text-neutral-600 mx-auto" />
          <div>
            <h3 className="text-sm font-semibold text-white">Nenhuma pasta cadastrada</h3>
            <p className="text-xs text-neutral-400 mt-1">Crie pastas para organizar seus episódios por série ou temporada.</p>
          </div>
          <button
            onClick={onOpenNewFolderModal}
            className="px-3.5 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 rounded-lg hover:bg-cyan-300"
          >
            Criar Primeira Pasta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
          {folders.map((folder) => {
            const data = folderStats.get(folder.id) || { count: 0, totalBytes: 0 };
            return (
              <div
                key={folder.id}
                className="group p-5 rounded-xl bg-neutral-900/70 hover:bg-neutral-900 border border-neutral-800/80 hover:border-neutral-700 transition-colors flex flex-col justify-between space-y-4"
              >
                {/* Header */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-cyan-400 group-hover:border-cyan-500/40 transition-colors">
                        <FolderIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors">
                          {folder.name}
                        </h3>
                        <p className="text-[11px] font-mono text-neutral-500">{folder.path}</p>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Excluir a pasta "${folder.name}"? Os episódios continuarão no catálogo como avulsos.`)) {
                          onDeleteFolder(folder.id);
                        }
                      }}
                      className="p-1.5 text-neutral-600 hover:text-rose-400 rounded transition-colors"
                      title="Excluir pasta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {folder.description && (
                    <p className="text-xs text-neutral-400 leading-relaxed line-clamp-2">
                      {folder.description}
                    </p>
                  )}
                </div>

                {/* Footer Metrics & Navigation Trigger */}
                <div className="pt-3 border-t border-neutral-800/60 flex items-center justify-between text-xs text-neutral-400">
                  {/* Clean unboxed stats */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono tabular-nums text-neutral-200">
                      {data.count} {data.count === 1 ? 'episódio' : 'episódios'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-neutral-200">
                      {LocalCatalogService.formatBytes(data.totalBytes)}
                    </span>
                  </div>

                  <button
                    onClick={() => onSelectFolder(folder.id)}
                    className="inline-flex items-center gap-1 text-cyan-400 group-hover:text-cyan-300 font-medium hover:underline"
                  >
                    <span>Abrir pasta</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
