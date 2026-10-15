import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/common/Header';
import { NotificationToast, ToastMessage } from './components/common/NotificationToast';
import { StorageDashboard } from './components/dashboard/StorageDashboard';
import { EpisodeList } from './components/library/EpisodeList';
import { FolderExplorer } from './components/library/FolderExplorer';
import { FileDetailsModal } from './components/library/FileDetailsModal';
import { AddEpisodeModal } from './components/library/AddEpisodeModal';
import { NewFolderModal } from './components/library/NewFolderModal';
import { StorageSettings } from './components/settings/StorageSettings';
import { NovaStreamBridge } from './components/settings/NovaStreamBridge';
import { LocalCatalogService } from './services/storage/localCatalogService';
import { EpisodeFile, FilterState, Folder, StorageProviderConfig } from './types/storage';
import { RotateCcw } from 'lucide-react';

type TabId = 'dashboard' | 'library' | 'folders' | 'settings' | 'bridge';
const VALID_TABS: readonly TabId[] = ['dashboard', 'library', 'folders', 'settings', 'bridge'] as const;

const STORAGE_TAB_KEY = 'nova_storage_active_tab_v1';
const STORAGE_SCROLL_KEY = 'nova_storage_scroll_positions_v1';

function isValidTab(value: unknown): value is TabId {
  return typeof value === 'string' && (VALID_TABS as readonly string[]).includes(value);
}

export default function App() {
  // Inicialização segura com validação a partir do sessionStorage
  const [activeTab, setActiveTabState] = useState<TabId>(() => {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const savedTab = window.sessionStorage.getItem(STORAGE_TAB_KEY);
        if (isValidTab(savedTab)) {
          return savedTab;
        }
      }
    } catch {
      // Fallback seguro caso sessionStorage esteja bloqueado no navegador
    }
    return 'dashboard';
  });

  const isRestoringScrollRef = useRef(false);
  const initialScrollRestoredRef = useRef(false);

  // Transição de aba com persistência no sessionStorage e reset de rolagem para o topo
  const handleTabChange = useCallback((newTab: TabId) => {
    if (!isValidTab(newTab)) return;
    setActiveTabState(newTab);

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(STORAGE_TAB_KEY, newTab);
        // Ao alternar ativamente de aba, a intenção é ver o início da nova seção
        const raw = window.sessionStorage.getItem(STORAGE_SCROLL_KEY);
        const map = raw ? JSON.parse(raw) : {};
        map[newTab] = 0;
        window.sessionStorage.setItem(STORAGE_SCROLL_KEY, JSON.stringify(map));
      }
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch {
      // Ignore
    }
  }, []);

  const [folders, setFolders] = useState<Folder[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeFile[]>([]);
  const [providers, setProviders] = useState<StorageProviderConfig[]>([]);
  const [stats, setStats] = useState(LocalCatalogService.getStats());

  // Filter state for library
  const [filterState, setFilterState] = useState<FilterState>({
    searchQuery: '',
    folderId: 'all',
    resolution: 'all',
    container: 'all',
    codec: 'all',
    sortBy: 'date_desc'
  });

  // Modals & Inspector
  const [selectedEpisode, setSelectedEpisode] = useState<EpisodeFile | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isNewFolderModalOpen, setIsNewFolderModalOpen] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((title: string, message?: string, type: 'success' | 'info' | 'error' = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Load initial data
  const refreshData = useCallback(() => {
    const loadedFolders = LocalCatalogService.getFolders();
    const loadedEpisodes = LocalCatalogService.getEpisodes();
    const loadedProviders = LocalCatalogService.getProviders();
    const computedStats = LocalCatalogService.getStats();

    setFolders(loadedFolders);
    setEpisodes(loadedEpisodes);
    setProviders(loadedProviders);
    setStats(computedStats);
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Salvar a posição vertical de rolagem no sessionStorage para a aba ativa
  useEffect(() => {
    let scrollTimeout: number | undefined;

    const saveCurrentScroll = () => {
      if (isRestoringScrollRef.current) return;
      try {
        const currentY = window.scrollY || document.documentElement.scrollTop || 0;
        const raw = window.sessionStorage.getItem(STORAGE_SCROLL_KEY);
        const map = raw ? JSON.parse(raw) : {};
        map[activeTab] = Math.max(0, currentY);
        window.sessionStorage.setItem(STORAGE_SCROLL_KEY, JSON.stringify(map));
      } catch {
        // Ignore
      }
    };

    const handleScroll = () => {
      window.clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(saveCurrentScroll, 100);
    };

    const handleBeforeUnload = () => {
      saveCurrentScroll();
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.clearTimeout(scrollTimeout);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [activeTab]);

  // Restaurar a posição vertical de rolagem APENAS no carregamento / recarregamento inicial
  useEffect(() => {
    if (initialScrollRestoredRef.current) return;

    let targetY = 0;
    try {
      const raw = window.sessionStorage.getItem(STORAGE_SCROLL_KEY);
      if (raw) {
        const map = JSON.parse(raw);
        if (typeof map[activeTab] === 'number' && Number.isFinite(map[activeTab]) && map[activeTab] > 0) {
          targetY = map[activeTab];
        }
      }
    } catch {
      targetY = 0;
    }

    if (targetY === 0) {
      initialScrollRestoredRef.current = true;
      return;
    }

    isRestoringScrollRef.current = true;

    let attempts = 0;
    const maxAttempts = 20; // Aguarda renderização dos componentes por até ~350ms
    let rafId: number;

    const checkAndScroll = () => {
      attempts++;
      const currentScrollHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;

      // Aguarda o DOM estar renderizado e expandido para acomodar a rolagem salva
      if (currentScrollHeight >= targetY + viewportHeight || attempts >= maxAttempts) {
        window.scrollTo({
          top: targetY,
          behavior: 'instant'
        });
        initialScrollRestoredRef.current = true;
        requestAnimationFrame(() => {
          isRestoringScrollRef.current = false;
        });
      } else {
        rafId = requestAnimationFrame(checkAndScroll);
      }
    };

    rafId = requestAnimationFrame(checkAndScroll);

    return () => {
      cancelAnimationFrame(rafId);
      isRestoringScrollRef.current = false;
    };
  }, [activeTab]);

  // Handler: Add Episode
  const handleAddEpisode = (data: {
    title: string;
    originalFileName: string;
    seriesName: string;
    folderId: string;
    seasonNumber: number;
    episodeNumber: number;
    fileSizeBytes: number;
    durationSeconds: number;
    resolution: any;
    dimensions: { width: number; height: number };
    frameRate: number;
    videoCodec: any;
    bitrateKbps: number;
    containerFormat: any;
    checksumSha256: string;
    audioLanguage: string;
    subtitleLanguage: string;
    notes?: string;
  }) => {
    const newEp = LocalCatalogService.addEpisode({
      title: data.title,
      originalFileName: data.originalFileName,
      seriesName: data.seriesName,
      folderId: data.folderId,
      seasonNumber: data.seasonNumber,
      episodeNumber: data.episodeNumber,
      fileSizeBytes: data.fileSizeBytes,
      durationSeconds: data.durationSeconds,
      resolution: data.resolution,
      dimensions: data.dimensions,
      frameRate: data.frameRate,
      videoCodec: data.videoCodec,
      bitrateKbps: data.bitrateKbps,
      containerFormat: data.containerFormat,
      checksumSha256: data.checksumSha256,
      audioStreams: [
        {
          id: 'a1',
          language: data.audioLanguage,
          codec: data.containerFormat === 'MKV' ? 'FLAC' : 'AAC-LC',
          channels: '2.0',
          isDefault: true
        }
      ],
      subtitleStreams: data.subtitleLanguage
        ? [
            {
              id: 's1',
              language: data.subtitleLanguage,
              format: data.containerFormat === 'MKV' ? 'ASS' : 'SRT',
              isDefault: true
            }
          ]
        : [],
      notes: data.notes
    });

    refreshData();
    setIsAddModalOpen(false);
    addToast('Episódio catalogado', `"${newEp.title}" foi registrado no catálogo com sucesso.`, 'success');
  };

  // Handler: Add Folder
  const handleAddFolder = (name: string, description: string, category: Folder['category']) => {
    const newFld = LocalCatalogService.addFolder(name, description, category);
    refreshData();
    setIsNewFolderModalOpen(false);
    addToast('Pasta criada', `Diretório "${newFld.name}" criado com sucesso.`, 'success');
  };

  // Handler: Delete Folder
  const handleDeleteFolder = (folderId: string) => {
    LocalCatalogService.deleteFolder(folderId);
    refreshData();
    addToast('Pasta excluída', 'A pasta foi removida e os episódios desvinculados.', 'info');
  };

  // Handler: Delete Episode
  const handleDeleteEpisode = (id: string) => {
    const ok = LocalCatalogService.deleteEpisode(id);
    if (ok) {
      refreshData();
      addToast('Arquivo removido', 'O episódio foi excluído do catálogo local.', 'info');
    }
  };

  // Handler: Update Provider config
  const handleUpdateProvider = (id: string, updates: Partial<StorageProviderConfig>) => {
    const updated = LocalCatalogService.updateProviderConfig(id, updates);
    setProviders(updated);
    addToast('Configurações salvas', 'Parâmetros atualizados no nó local.', 'success');
  };

  // Handler: Select folder from FolderExplorer
  const handleSelectFolder = (folderId: string) => {
    setFilterState((prev) => ({ ...prev, folderId }));
    handleTabChange('library');
  };

  // Reset to default sample catalog
  const handleResetCatalog = () => {
    if (confirm('Restaurar o catálogo de demonstração da NOVA STORAGE? Seus arquivos atuais serão resetados.')) {
      LocalCatalogService.resetToDefaultCatalog();
      refreshData();
      addToast('Catálogo Restaurado', 'Dados de demonstração restabelecidos.', 'success');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100 selection:bg-cyan-500/20 selection:text-cyan-200">
      {/* Top Bar Header */}
      <Header
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'dashboard' && (
          <StorageDashboard
            stats={stats}
            recentEpisodes={episodes}
            folders={folders}
            onNavigateTab={handleTabChange}
            onSelectEpisode={setSelectedEpisode}
            onOpenAddModal={() => setIsAddModalOpen(true)}
            onOpenNewFolderModal={() => setIsNewFolderModalOpen(true)}
          />
        )}

        {activeTab === 'library' && (
          <EpisodeList
            episodes={episodes}
            folders={folders}
            filterState={filterState}
            onFilterChange={(updates) => setFilterState((prev) => ({ ...prev, ...updates }))}
            onResetFilters={() =>
              setFilterState({
                searchQuery: '',
                folderId: 'all',
                resolution: 'all',
                container: 'all',
                codec: 'all',
                sortBy: 'date_desc'
              })
            }
            onSelectEpisode={setSelectedEpisode}
            onOpenAddModal={() => setIsAddModalOpen(true)}
          />
        )}

        {activeTab === 'folders' && (
          <FolderExplorer
            folders={folders}
            episodes={episodes}
            onSelectFolder={handleSelectFolder}
            onOpenNewFolderModal={() => setIsNewFolderModalOpen(true)}
            onDeleteFolder={handleDeleteFolder}
          />
        )}

        {activeTab === 'settings' && (
          <StorageSettings
            providers={providers}
            onUpdateProvider={handleUpdateProvider}
            onNotify={addToast}
          />
        )}

        {activeTab === 'bridge' && (
          <NovaStreamBridge
            episodes={episodes}
            folders={folders}
            onNotify={addToast}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-6 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-300">NOVA STORAGE</span>
            <span>·</span>
            <span>Painel Privado de Vídeos</span>
            <span>·</span>
            <span className="font-mono text-cyan-400/80">v1.0.0 Architecture</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleResetCatalog}
              className="text-neutral-500 hover:text-neutral-300 inline-flex items-center gap-1.5 transition-colors"
              title="Restaurar dados padrão de exemplo"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar Catálogo Padrão</span>
            </button>
            <span>·</span>
            <span className="text-neutral-600">Armazenamento Remoto Desacoplado</span>
          </div>
        </div>
      </footer>

      {/* Modals & Inspectors */}
      {selectedEpisode && (
        <FileDetailsModal
          episode={selectedEpisode}
          folders={folders}
          onClose={() => setSelectedEpisode(null)}
          onDelete={handleDeleteEpisode}
          onNotify={addToast}
        />
      )}

      {isAddModalOpen && (
        <AddEpisodeModal
          folders={folders}
          initialFolderId={filterState.folderId !== 'all' ? filterState.folderId : undefined}
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={handleAddEpisode}
        />
      )}

      {isNewFolderModalOpen && (
        <NewFolderModal
          onClose={() => setIsNewFolderModalOpen(false)}
          onSubmit={handleAddFolder}
        />
      )}

      {/* Discrete Notification Toasts */}
      <NotificationToast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
