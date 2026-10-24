import React, { useState, useMemo } from 'react';
import {
  Cloud,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ExternalLink,
  RefreshCw,
  HardDrive,
  Shield,
  KeyRound,
  FileCode,
  Info,
  Film,
  Play,
  Search,
  FolderOpen,
  X,
  FileVideo,
  Clock,
  Eye,
  AlertCircle,
  CheckSquare,
  Square,
  ArrowUpDown,
  FileText,
  Filter
} from 'lucide-react';
import { StorageProviderConfig } from '../../types/storage';
import { GoogleDriveStorageAdapter, DriveVideoItem } from '../../services/storage/providers/googleDriveAdapter';
import { MegaStorageAdapter } from '../../services/storage/providers/megaAdapter';
import { PCloudStorageAdapter } from '../../services/storage/providers/pcloudAdapter';
import { DriveVideoPlayerModal } from './DriveVideoPlayerModal';
import { MuxVideoTester } from './MuxVideoTester';
import { ExternalMediaTester } from './ExternalMediaTester';

interface StorageSettingsProps {
  providers: StorageProviderConfig[];
  onUpdateProvider: (id: string, updates: Partial<StorageProviderConfig>) => void;
  onNotify: (title: string, message?: string, type?: 'success' | 'info' | 'error') => void;
}

export const StorageSettings: React.FC<StorageSettingsProps> = ({
  providers,
  onUpdateProvider,
  onNotify
}) => {
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const [serverHealth, setServerHealth] = useState<{
    status: string;
    uptimeSeconds?: number;
    timestamp?: string;
    checked: boolean;
    error?: string;
  }>({ status: 'checking', checked: false });

  const [driveStatus, setDriveStatus] = useState<{
    configured: boolean;
    connected: boolean;
    status: string;
    userEmail?: string | null;
    userName?: string | null;
    targetFolderId?: string | null;
    message: string;
    redirectUri: string;
  } | null>(null);

  const [pcloudStatus, setPcloudStatus] = useState<{
    configured: boolean;
    connected: boolean;
    status: string;
    code?: string;
    message: string;
    details?: {
      email?: string;
      quotaFormatted?: string;
      usedQuotaFormatted?: string;
      apiHost?: string;
      premium?: boolean;
    };
    oauth?: {
      configured: boolean;
      clientIdConfigured: boolean;
      clientSecretConfigured: boolean;
      redirectUri: string;
      connected: boolean;
    };
  } | null>(null);

  // Google Drive Video Explorer State
  const [isExploringDrive, setIsExploringDrive] = useState(false);
  const [driveVideos, setDriveVideos] = useState<DriveVideoItem[]>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [videosError, setVideosError] = useState<string | null>(null);
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [selectedDriveVideo, setSelectedDriveVideo] = useState<DriveVideoItem | null>(null);

  // Classification, Organization & Episode Selection States
  const [explorerTab, setExplorerTab] = useState<'videos' | 'other'>('videos');
  const [formatFilter, setFormatFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'date-desc' | 'size-desc'>('name-asc');
  const [selectedVideoIds, setSelectedVideoIds] = useState<Set<string>>(new Set());

  const fetchDriveStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/storage/drive/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDriveStatus(data);
      }
    } catch {
      // Backend offline
    }
  }, []);

  const fetchPcloudStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/storage/pcloud/status', {
        headers: {
          'Accept': 'application/json',
          'X-Nova-Client': 'storage-v1'
        },
        credentials: 'include'
      });
      if (res.ok) {
        const data = await res.json();
        setPcloudStatus(data);
      }
    } catch {
      // Backend offline
    }
  }, []);

  React.useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setServerHealth({
          status: data.status || 'ok',
          uptimeSeconds: data.uptimeSeconds,
          timestamp: data.timestamp,
          checked: true
        });
      })
      .catch((err) => {
        setServerHealth({
          status: 'offline',
          checked: true,
          error: err.message
        });
      });

    fetchDriveStatus();
    fetchPcloudStatus();

    // Listen for OAuth popup completion with strict origin and source window verification
    const handleMessage = async (event: MessageEvent) => {
      // 1. Verify that the message came from the specific popup window opened
      if (popupWindowRef.current && event.source !== popupWindowRef.current) {
        return;
      }

      // 2. Verify that the event origin matches the trusted application origin exactly
      const expectedOrigin = window.location.origin;
      if (event.origin !== expectedOrigin) {
        return;
      }

      if (event.data?.type === 'GOOGLE_OAUTH_COMPLETED') {
        // 3. Do not trust the postMessage alone as proof: verify real backend connection
        popupWindowRef.current = null;
        try {
          const res = await fetch('/api/storage/drive/status', { credentials: 'include' });
          if (res.ok) {
            const data = await res.json();
            setDriveStatus(data);
            if (data.connected) {
              onNotify('Google Drive Conectado!', `Conta ${data.userEmail || ''} validada com sucesso pelo backend.`, 'success');
            } else {
              onNotify('Aviso de Conexão', data.message || 'Autorização concluída, mas o backend não confirmou a sessão.', 'info');
            }
          }
        } catch {
          onNotify('Erro ao Validar Conexão', 'Não foi possível confirmar o estado com o servidor.', 'error');
        }
      } else if (event.data?.type === 'GOOGLE_OAUTH_ERROR') {
        popupWindowRef.current = null;
        onNotify('Falha na Autorização OAuth', event.data.error || 'Ocorreu um erro ao autorizar.', 'error');
        fetchDriveStatus();
      } else if (event.data?.type === 'PCLOUD_OAUTH_COMPLETED') {
        popupWindowRef.current = null;
        fetchPcloudStatus();
        onNotify('pCloud Conectado!', 'Autorização OAuth 2.0 concluída com sucesso com o pCloud.', 'success');
      } else if (event.data?.type === 'PCLOUD_OAUTH_ERROR') {
        popupWindowRef.current = null;
        onNotify('Falha na Autorização pCloud', event.data.error || 'Ocorreu um erro ao autorizar com o pCloud.', 'error');
        fetchPcloudStatus();
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchDriveStatus, fetchPcloudStatus, onNotify]);

  const popupWindowRef = React.useRef<Window | null>(null);

  const handleConnectDrive = async () => {
    const prov = providers.find(p => p.id === 'google_drive');
    const folderId = prov?.settings.targetFolderId;
    const adapter = new GoogleDriveStorageAdapter(prov?.settings.clientId, folderId);

    const authData = await adapter.getAuthUrl(folderId);
    if (!authData || !authData.url) {
      const errorMessage = authData?.error || 'Não foi possível gerar o link de autorização com o Google Drive.';
      onNotify('Falha na Autorização', errorMessage, 'error');
      return;
    }

    const popup = window.open(authData.url, 'google_oauth_popup', 'width=600,height=700');
    popupWindowRef.current = popup;

    if (!popup) {
      onNotify('Popup Bloqueado', 'Permita popups no navegador para autenticar com a conta Google.', 'error');
    }
  };

  const handleDisconnectDrive = async () => {
    const adapter = new GoogleDriveStorageAdapter();
    const ok = await adapter.disconnect();
    if (ok) {
      onNotify('Desconectado', 'Sessão do Google Drive encerrada no servidor.', 'info');
      setIsExploringDrive(false);
      setDriveVideos([]);
      setSelectedVideoIds(new Set());
      setExplorerTab('videos');
      setFormatFilter('ALL');
      fetchDriveStatus();
    }
  };

  const handleConnectPCloud = async () => {
    try {
      const adapter = new PCloudStorageAdapter();
      const authData = await adapter.getOAuthUrl();
      if (!authData || !authData.url) {
        onNotify('Falha na Autorização', 'Não foi possível gerar o link de autorização com o pCloud.', 'error');
        return;
      }

      const popup = window.open(authData.url, 'pcloud_oauth_popup', 'width=600,height=700');
      popupWindowRef.current = popup;

      if (!popup) {
        onNotify('Popup Bloqueado', 'Permita popups no navegador para autenticar com o pCloud.', 'error');
      }
    } catch (err: any) {
      onNotify('Erro ao Iniciar OAuth', err?.message || 'Falha ao contatar o servidor para autorizar pCloud.', 'error');
    }
  };

  const handleDisconnectPCloud = async () => {
    try {
      const adapter = new PCloudStorageAdapter();
      const ok = await adapter.disconnect();
      if (ok) {
        onNotify('Desconectado', 'Sessão do pCloud encerrada no servidor.', 'info');
        fetchPcloudStatus();
      } else {
        onNotify('Erro ao Desconectar', 'Não foi possível encerrar a sessão pCloud.', 'error');
      }
    } catch {
      onNotify('Erro de Conexão', 'Não foi possível contatar o servidor.', 'error');
    }
  };

  const handleTestConnection = async (provider: StorageProviderConfig) => {
    setTestingId(provider.id);
    try {
      if (provider.id === 'google_drive') {
        const adapter = new GoogleDriveStorageAdapter(
          provider.settings.clientId,
          provider.settings.targetFolderId
        );
        const result = await adapter.testConnection(provider.settings as Record<string, string>);
        setTestResults(prev => ({
          ...prev,
          [provider.id]: {
            success: result.success,
            message: result.message
          }
        }));
        onNotify(
          result.success ? 'Conexão validada' : 'Resultado do Teste',
          result.message,
          result.success ? 'success' : 'info'
        );
        fetchDriveStatus();
      } else if (provider.id === 'pcloud') {
        const adapter = new PCloudStorageAdapter();
        const result = await adapter.testConnection(provider.settings as Record<string, string>);
        setTestResults(prev => ({
          ...prev,
          [provider.id]: {
            success: result.success,
            message: result.message
          }
        }));
        onNotify(
          result.success ? 'Conexão validada' : 'Resultado do Teste',
          result.message,
          result.success ? 'success' : 'info'
        );
        fetchPcloudStatus();
      } else if (provider.id === 'mega') {
        const adapter = new MegaStorageAdapter(
          provider.settings.megaEmail,
          provider.settings.targetFolderId
        );
        const result = await adapter.testConnection(provider.settings as Record<string, string>);
        setTestResults(prev => ({
          ...prev,
          [provider.id]: {
            success: result.success,
            message: result.message
          }
        }));
        onNotify(
          result.success ? 'Conexão validada' : 'Armazenamento Remoto Não Configurado',
          result.message,
          result.success ? 'success' : 'info'
        );
      } else {
        setTestResults(prev => ({
          ...prev,
          [provider.id]: {
            success: false,
            message: 'Endpoint S3 / Local NAS não provisionado nesta versão inicial.'
          }
        }));
        onNotify('Endpoint Pendente', 'Armazenamento S3 aguarda provisionamento.', 'info');
      }
    } finally {
      setTestingId(null);
    }
  };

  const handleFieldChange = (providerId: string, field: string, value: string) => {
    const prov = providers.find(p => p.id === providerId);
    if (!prov) return;
    onUpdateProvider(providerId, {
      settings: {
        ...prov.settings,
        [field]: value
      }
    });
  };

  // Google Drive Video Explorer Handlers
  const handleLoadDriveVideos = async (silent = false) => {
    setIsLoadingVideos(true);
    setVideosError(null);

    const prov = providers.find(p => p.id === 'google_drive');
    const folderId = prov?.settings.targetFolderId?.trim() || '';

    const adapter = new GoogleDriveStorageAdapter(prov?.settings.clientId, folderId || undefined);

    try {
      const result = await adapter.listVideos({
        folderId: folderId || undefined
      });

      if (result.status === 'error' || result.error) {
        setVideosError(result.error || 'Não foi possível carregar a lista de vídeos do Google Drive.');
        if (!silent) {
          onNotify('Erro ao Listar Vídeos', result.error || 'Falha ao consultar API do Drive.', 'error');
        }
      } else {
        setDriveVideos(result.files);
        setSelectedVideoIds(new Set());
        const validVideos = result.files.filter(f => GoogleDriveStorageAdapter.isVideoFile(f.name, f.mimeType));
        const nonVideos = result.files.length - validVideos.length;
        if (!silent) {
          const detail = nonVideos > 0
            ? `${validVideos.length} vídeo(s) compatível(is) e ${nonVideos} outro(s) arquivo(s) separado(s).`
            : `${validVideos.length} arquivo(s) de vídeo encontrado(s).`;
          onNotify(
            'Vídeos do Google Drive',
            detail,
            'success'
          );
        }
      }
    } catch (err: any) {
      const msg = err?.message || 'Falha de comunicação ao listar arquivos do Google Drive.';
      setVideosError(msg);
      if (!silent) {
        onNotify('Erro de Conexão', msg, 'error');
      }
    } finally {
      setIsLoadingVideos(false);
    }
  };

  const handleToggleExplorer = () => {
    if (!isExploringDrive) {
      setIsExploringDrive(true);
      handleLoadDriveVideos();
    } else {
      setIsExploringDrive(false);
    }
  };

  // 1. Classification: Separate recognized videos from non-video files (PDFs, ISOs, archives, etc.)
  const videoFiles = useMemo(() => {
    return driveVideos.filter(f => GoogleDriveStorageAdapter.isVideoFile(f.name, f.mimeType));
  }, [driveVideos]);

  const otherFiles = useMemo(() => {
    return driveVideos.filter(f => !GoogleDriveStorageAdapter.isVideoFile(f.name, f.mimeType));
  }, [driveVideos]);

  // 2. Detected video formats among recognized videos
  const detectedVideoFormats = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of videoFiles) {
      const fmt = GoogleDriveStorageAdapter.inferFormat(v.name, v.mimeType);
      map.set(fmt, (map.get(fmt) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([format, count]) => ({ format, count }))
      .sort((a, b) => b.count - a.count);
  }, [videoFiles]);

  // 3. Filter and Sort recognized video files
  const filteredDriveVideos = useMemo(() => {
    let list = videoFiles.filter((v) => {
      // Filter by format
      if (formatFilter !== 'ALL') {
        const fmt = GoogleDriveStorageAdapter.inferFormat(v.name, v.mimeType);
        if (fmt !== formatFilter) return false;
      }

      // Filter by file name search
      if (videoSearchQuery.trim()) {
        const q = videoSearchQuery.toLowerCase().trim();
        if (!v.name.toLowerCase().includes(q)) {
          return false;
        }
      }

      return true;
    });

    // Sort results
    return [...list].sort((a, b) => {
      if (sortBy === 'name-asc') {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (sortBy === 'name-desc') {
        return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (sortBy === 'date-desc') {
        const dateA = new Date(a.modifiedTime || a.createdTime || 0).getTime();
        const dateB = new Date(b.modifiedTime || b.createdTime || 0).getTime();
        return dateB - dateA;
      }
      if (sortBy === 'size-desc') {
        return (b.sizeBytes || 0) - (a.sizeBytes || 0);
      }
      return 0;
    });
  }, [videoFiles, formatFilter, videoSearchQuery, sortBy]);

  // 4. Filter other (non-video) files
  const filteredOtherFiles = useMemo(() => {
    if (!videoSearchQuery.trim()) return otherFiles;
    const q = videoSearchQuery.toLowerCase().trim();
    return otherFiles.filter(f => f.name.toLowerCase().includes(q));
  }, [otherFiles, videoSearchQuery]);

  // 5. Episode multi-selection handlers
  const handleToggleSelectVideo = (id: string) => {
    setSelectedVideoIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllVisibleSelected = filteredDriveVideos.length > 0 &&
    filteredDriveVideos.every(v => selectedVideoIds.has(v.id));

  const handleToggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedVideoIds(prev => {
        const next = new Set(prev);
        filteredDriveVideos.forEach(v => next.delete(v.id));
        return next;
      });
    } else {
      setSelectedVideoIds(prev => {
        const next = new Set(prev);
        filteredDriveVideos.forEach(v => next.add(v.id));
        return next;
      });
    }
  };

  const handleClearSelection = () => {
    setSelectedVideoIds(new Set());
  };

  const activeFolderId = providers.find(p => p.id === 'google_drive')?.settings.targetFolderId?.trim();

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Overview Banner */}
      <div className="p-6 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-cyan-400">
            <Cloud className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Configurações de Armazenamento Remoto</h1>
            <p className="text-xs text-neutral-400">
              Camada de serviço desacoplada para conexão com Google Drive, MEGA e S3
            </p>
          </div>
        </div>

        {/* Real Backend Server Diagnostics */}
        <div className="p-3.5 rounded-lg bg-neutral-950/80 border border-neutral-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="font-semibold text-neutral-200">Servidor Backend Express:</span>
            {serverHealth.status === 'ok' ? (
              <span className="font-mono text-emerald-400">Ativo (Porta 3000 · /api/health verificado)</span>
            ) : serverHealth.status === 'checking' ? (
              <span className="font-mono text-neutral-400">Verificando /api/health...</span>
            ) : (
              <span className="font-mono text-rose-400">Indisponível ({serverHealth.error || 'Offline'})</span>
            )}
          </div>
          {serverHealth.uptimeSeconds !== undefined && (
            <span className="text-neutral-500 font-mono text-[11px]">
              Uptime: {serverHealth.uptimeSeconds}s · Rotas /api/storage/drive ativas
            </span>
          )}
        </div>
      </div>

      {/* Provider Cards */}
      <div className="space-y-6">
        <h2 className="text-sm font-bold tracking-wide uppercase text-neutral-400 px-1">
          Provedores de Armazenamento Suportados
        </h2>

        {/* 1. Google Drive Card */}
        <div className="p-4 sm:p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                <Cloud className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Google Drive API (v3)</h3>
                  {driveStatus?.connected ? (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/50 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      CONECTADO
                    </span>
                  ) : driveStatus?.status === 'pending_auth' ? (
                    <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/50">
                      AGUARDANDO AUTORIZAÇÃO
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/50">
                      NÃO CONFIGURADO
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400">
                  Escopo: <code className="text-cyan-400 font-mono">drive.readonly</code> (somente leitura de vídeos e metadados)
                </p>
                {driveStatus?.connected && driveStatus.userEmail && (
                  <p className="text-xs text-emerald-300 font-medium pt-1">
                    Conta autorizada: <span className="font-mono text-white">{driveStatus.userEmail}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-cyan-400 transition-colors"
              >
                <span>Console do Google Cloud</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Form parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                Google Cloud Client ID (OAuth 2.0)
              </label>
              <input
                type="text"
                placeholder="Ex: 875945009084-xxx.apps.googleusercontent.com"
                value={providers.find(p => p.id === 'google_drive')?.settings.clientId || ''}
                onChange={(e) => handleFieldChange('google_drive', 'clientId', e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[10px] text-neutral-500 mt-1 block">
                Definido no .env como GOOGLE_CLIENT_ID
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                ID da Pasta Raiz no Drive (Opcional para filtro)
              </label>
              <input
                type="text"
                placeholder="Ex: 1A2b3C4d5E6f_G7h8I9j0K (deixe vazio para listar todos)"
                value={providers.find(p => p.id === 'google_drive')?.settings.targetFolderId || ''}
                onChange={(e) => handleFieldChange('google_drive', 'targetFolderId', e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[10px] text-neutral-500 mt-1 block">
                Vazio lista todos os vídeos acessíveis; preenchido filtra pela pasta especificada
              </span>
            </div>
          </div>

          {/* Redirect URI configuration banner */}
          <div className="p-3.5 rounded-lg bg-neutral-950/90 border border-neutral-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-300">
                URL de Redirecionamento Autorizada (Google Cloud):
              </span>
              <button
                type="button"
                onClick={() => {
                  const uri = driveStatus?.redirectUri || window.location.origin + '/api/storage/drive/callback';
                  navigator.clipboard.writeText(uri);
                  onNotify('URL Copiada', 'Cole em "URIs de redirecionamento autorizados" no console do Google.', 'success');
                }}
                className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-[11px]"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Copiar URL</span>
              </button>
            </div>
            <p className="font-mono text-[11px] text-neutral-400 bg-neutral-900 p-2 rounded border border-neutral-800/80 break-all select-all">
              {driveStatus?.redirectUri || (window.location.origin + '/api/storage/drive/callback')}
            </p>
            <p className="text-[11px] text-neutral-500">
              Cadastre esta URI exata nas credenciais do seu projeto no Google Cloud (Tipo: Aplicativo da Web).
            </p>
          </div>

          {/* Actions & Result */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-neutral-800/60">
            <div className="text-xs text-neutral-400">
              {testResults['google_drive'] ? (
                <span className={testResults['google_drive'].success ? 'text-emerald-400' : 'text-neutral-300'}>
                  {testResults['google_drive'].message}
                </span>
              ) : driveStatus?.connected ? (
                <span className="text-emerald-400">Conectado e validado com a API v3.</span>
              ) : (
                <span>Inicie a autorização OAuth ou execute o teste de parâmetros.</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {/* Requirement: Exibir o botão "Explorar Vídeos do Google Drive" quando a conta estiver conectada */}
              {driveStatus?.connected && (
                <button
                  type="button"
                  onClick={handleToggleExplorer}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shadow-sm"
                >
                  <Film className="w-3.5 h-3.5" />
                  <span>{isExploringDrive ? 'Fechar Explorador' : 'Explorar Vídeos do Google Drive'}</span>
                </button>
              )}

              {driveStatus?.connected ? (
                <button
                  type="button"
                  onClick={handleDisconnectDrive}
                  className="px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/50 rounded-lg transition-colors whitespace-nowrap"
                >
                  Desconectar Conta
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectDrive}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shadow-sm"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Autorizar Google Drive</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const prov = providers.find(p => p.id === 'google_drive');
                  if (prov) handleTestConnection(prov);
                }}
                disabled={testingId === 'google_drive'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:text-white bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingId === 'google_drive' ? 'animate-spin' : ''}`} />
                <span>Testar Conexão</span>
              </button>
            </div>
          </div>

          {/* Interactive Google Drive Video Explorer Panel */}
          {driveStatus?.connected && isExploringDrive && (
            <div className="pt-4 border-t border-cyan-500/30 space-y-4">
              {/* Explorer Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-neutral-950/80 p-4 rounded-xl border border-neutral-800">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Film className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-bold text-white">Explorador de Arquivos do Google Drive</h4>
                    <span className="text-[11px] font-mono text-cyan-300 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
                      {videoFiles.length} vídeo(s)
                    </span>
                    {otherFiles.length > 0 && (
                      <span className="text-[11px] font-mono text-amber-300 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                        {otherFiles.length} não-vídeo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {activeFolderId ? (
                      <span className="text-cyan-400 font-mono flex items-center gap-1">
                        <FolderOpen className="w-3 h-3 text-cyan-400" />
                        Filtro ativo por pasta: <strong className="text-white">{activeFolderId}</strong>
                      </span>
                    ) : (
                      <span className="text-neutral-400 flex items-center gap-1">
                        <HardDrive className="w-3 h-3 text-neutral-500" />
                        Listando todos os arquivos acessíveis (ID de pasta vazio)
                      </span>
                    )}
                  </div>
                </div>

                {/* Explorer Controls: Search & Refresh */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64 min-w-0">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar por nome do arquivo..."
                      value={videoSearchQuery}
                      onChange={(e) => setVideoSearchQuery(e.target.value)}
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-cyan-500"
                    />
                    {videoSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setVideoSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleLoadDriveVideos()}
                    disabled={isLoadingVideos}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded-lg transition-colors shrink-0"
                    title="Recarregar lista de arquivos"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingVideos ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Atualizar</span>
                  </button>
                </div>
              </div>

              {/* Classification Tabs: Videos vs Other Unrecognized Files */}
              {otherFiles.length > 0 && (
                <div className="flex items-center gap-2 border-b border-neutral-800/80 pb-2">
                  <button
                    type="button"
                    onClick={() => setExplorerTab('videos')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      explorerTab === 'videos'
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 border border-transparent'
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Vídeos Compatíveis ({videoFiles.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExplorerTab('other')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      explorerTab === 'other'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900 border border-transparent'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Arquivos Separados ({otherFiles.length})</span>
                  </button>
                </div>
              )}

              {/* Error Banner */}
              {videosError && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Falha ao consultar vídeos no Google Drive</span>
                  </div>
                  <p className="text-neutral-400 leading-relaxed text-[11px]">
                    {videosError}
                  </p>
                  <button
                    type="button"
                    onClick={() => handleLoadDriveVideos()}
                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold text-rose-300 bg-rose-950/60 border border-rose-800/60 rounded-md hover:bg-rose-900/60 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Tentar Novamente</span>
                  </button>
                </div>
              )}

              {/* Loading State */}
              {isLoadingVideos && (
                <div className="p-10 flex flex-col items-center justify-center gap-3 bg-neutral-950/40 rounded-xl border border-neutral-800">
                  <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin" />
                  <p className="text-xs font-mono text-neutral-400">
                    Consultando arquivos disponíveis no Google Drive...
                  </p>
                </div>
              )}

              {/* VIEW 1: Videos Explorer */}
              {!isLoadingVideos && !videosError && explorerTab === 'videos' && (
                <div className="space-y-3">
                  {/* Organization Toolbar: Format Filters & Sorting */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                    {/* Format Filter Chips */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-neutral-400 mr-1 flex items-center gap-1">
                        <Filter className="w-3 h-3 text-neutral-500" />
                        Formato:
                      </span>
                      <button
                        type="button"
                        onClick={() => setFormatFilter('ALL')}
                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                          formatFilter === 'ALL'
                            ? 'bg-cyan-400 text-neutral-950 font-semibold shadow-sm'
                            : 'bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
                        }`}
                      >
                        Todos ({videoFiles.length})
                      </button>

                      {detectedVideoFormats.map(({ format, count }) => (
                        <button
                          key={format}
                          type="button"
                          onClick={() => setFormatFilter(format)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                            formatFilter === format
                              ? 'bg-cyan-400 text-neutral-950 font-semibold shadow-sm'
                              : 'bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-800'
                          }`}
                        >
                          {format} ({count})
                        </button>
                      ))}
                    </div>

                    {/* Sort Order Selector */}
                    <div className="flex items-center gap-1.5 self-start sm:self-auto bg-neutral-900 border border-neutral-800 rounded-lg px-2.5 py-1 text-xs">
                      <ArrowUpDown className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                      <span className="text-neutral-500 text-[11px] font-medium hidden sm:inline">Ordenar:</span>
                      <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-transparent text-xs text-neutral-200 focus:outline-none cursor-pointer"
                        title="Critério de ordenação da lista"
                      >
                        <option value="name-asc" className="bg-neutral-900 text-neutral-200">Nome (A-Z)</option>
                        <option value="name-desc" className="bg-neutral-900 text-neutral-200">Nome (Z-A)</option>
                        <option value="date-desc" className="bg-neutral-900 text-neutral-200">Mais Recentes</option>
                        <option value="size-desc" className="bg-neutral-900 text-neutral-200">Maior Tamanho</option>
                      </select>
                    </div>
                  </div>

                  {/* Episode Multi-Selection Toolbar */}
                  {selectedVideoIds.size > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-xs">
                      <div className="flex items-center gap-2 text-cyan-300 font-semibold">
                        <CheckSquare className="w-4 h-4 text-cyan-400 shrink-0" />
                        <span>
                          {selectedVideoIds.size} {selectedVideoIds.size === 1 ? 'vídeo selecionado' : 'vídeos selecionados'} para organização de episódios
                        </span>
                        <span className="text-[10px] text-cyan-400/80 font-normal hidden lg:inline">
                          (Seleção ativa · Sem alterações no Google Drive nesta etapa)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <button
                          type="button"
                          onClick={handleToggleSelectAllVisible}
                          className="px-2.5 py-1 text-xs font-medium text-neutral-200 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded-lg transition-colors"
                        >
                          {isAllVisibleSelected ? 'Desmarcar visíveis' : 'Selecionar todos visíveis'}
                        </button>
                        <button
                          type="button"
                          onClick={handleClearSelection}
                          className="px-2.5 py-1 text-xs font-medium text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 rounded-lg transition-colors"
                        >
                          Desmarcar todos
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Empty List State */}
                  {filteredDriveVideos.length === 0 && (
                    <div className="p-8 text-center bg-neutral-950/40 rounded-xl border border-neutral-800 space-y-2">
                      <FileVideo className="w-8 h-8 text-neutral-600 mx-auto" />
                      <h5 className="text-xs font-semibold text-neutral-300">
                        {videoSearchQuery || formatFilter !== 'ALL'
                          ? 'Nenhum vídeo compatível com os filtros selecionados'
                          : 'Nenhum arquivo de vídeo encontrado'}
                      </h5>
                      <p className="text-[11px] text-neutral-500 max-w-md mx-auto">
                        {videoSearchQuery || formatFilter !== 'ALL'
                          ? 'Tente limpar a pesquisa ou selecionar "Todos" para exibir todos os vídeos disponíveis.'
                          : activeFolderId
                          ? `Não foram encontrados arquivos de vídeo (.mp4, .mkv, .webm, .avi) na pasta informada (${activeFolderId}). Certifique-se de que o ID da pasta está correto.`
                          : 'Nenhum arquivo de vídeo localizado na raiz ou compartilhado na sua conta do Google Drive.'}
                      </p>
                      {(videoSearchQuery || formatFilter !== 'ALL') && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => {
                              setVideoSearchQuery('');
                              setFormatFilter('ALL');
                            }}
                            className="px-3 py-1 text-xs font-semibold text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 rounded-lg hover:bg-cyan-900/40 transition-colors"
                          >
                            Limpar Filtros
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Video List: Responsive Layout (Mobile Cards + Desktop Table) */}
                  {filteredDriveVideos.length > 0 && (
                    <div className="space-y-3">
                      {/* Mobile Cards View (< md): with episode selection checkbox, zero horizontal scroll */}
                      <div className="block md:hidden space-y-2.5">
                        {filteredDriveVideos.map((video) => {
                          const format = GoogleDriveStorageAdapter.inferFormat(video.name, video.mimeType);
                          const isNativePlayable = GoogleDriveStorageAdapter.isNativePlayable(format);
                          const isSelected = selectedVideoIds.has(video.id);

                          return (
                            <div
                              key={`mobile-${video.id}`}
                              className={`p-3.5 rounded-xl border transition-colors space-y-3 ${
                                isSelected
                                  ? 'bg-cyan-950/20 border-cyan-500/60 shadow-sm'
                                  : 'bg-neutral-950/70 border-neutral-800/90'
                              }`}
                            >
                              {/* File info + Checkbox */}
                              <div className="flex items-start gap-2.5 min-w-0">
                                {/* Episode Selection Checkbox */}
                                <button
                                  type="button"
                                  onClick={() => handleToggleSelectVideo(video.id)}
                                  className="mt-1 p-1 -ml-1 text-neutral-400 hover:text-cyan-400 transition-colors shrink-0"
                                  title={isSelected ? `Desmarcar ${video.name}` : `Selecionar ${video.name}`}
                                  aria-label={isSelected ? `Desmarcar ${video.name}` : `Selecionar ${video.name}`}
                                >
                                  {isSelected ? (
                                    <CheckSquare className="w-4 h-4 text-cyan-400" />
                                  ) : (
                                    <Square className="w-4 h-4 text-neutral-500" />
                                  )}
                                </button>

                                <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                                  <Film className="w-4 h-4" />
                                </div>

                                <div className="min-w-0 flex-1 space-y-1">
                                  <h5
                                    className="font-semibold text-xs text-neutral-100 break-words leading-snug cursor-pointer hover:text-cyan-300"
                                    onClick={() => handleToggleSelectVideo(video.id)}
                                    title={video.name}
                                  >
                                    {video.name}
                                  </h5>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className={`font-mono font-bold px-1.5 py-0.5 rounded border text-[10px] ${
                                      isNativePlayable
                                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                                        : 'bg-amber-950/40 text-amber-400 border-amber-800/60'
                                    }`}>
                                      {format}
                                    </span>
                                    <span className="font-mono text-neutral-400">
                                      {GoogleDriveStorageAdapter.formatBytes(video.sizeBytes)}
                                    </span>
                                    {video.videoDetails?.width && video.videoDetails?.height && (
                                      <span className="font-mono text-cyan-400/80">
                                        · {video.videoDetails.width}×{video.videoDetails.height}
                                      </span>
                                    )}
                                    <span className="text-neutral-500">
                                      · {GoogleDriveStorageAdapter.formatDate(video.modifiedTime || video.createdTime)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Action Buttons: Directly reachable on mobile without horizontal scroll */}
                              <div className="flex items-center gap-2 pt-1 border-t border-neutral-800/60">
                                <button
                                  type="button"
                                  onClick={() => setSelectedDriveVideo(video)}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 active:bg-cyan-500 rounded-lg transition-colors shadow-sm"
                                  title="Assistir no player de teste"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>Testar Player</span>
                                </button>

                                <a
                                  href={video.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center gap-1 px-3 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 border border-neutral-800 rounded-lg transition-colors shrink-0"
                                  title="Abrir no Google Drive (nova aba)"
                                >
                                  <span>Drive</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table View (>= md): Preserved 5-column layout + Episode Checkbox column */}
                      <div className="hidden md:block rounded-xl border border-neutral-800 overflow-hidden bg-neutral-950/50">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-neutral-300 min-w-[680px]">
                            <thead className="bg-neutral-900/80 border-b border-neutral-800 text-[11px] uppercase font-bold text-neutral-400 tracking-wider">
                              <tr>
                                <th className="py-2.5 px-3 w-10 text-center">
                                  <button
                                    type="button"
                                    onClick={handleToggleSelectAllVisible}
                                    className="text-neutral-400 hover:text-cyan-400 transition-colors inline-flex items-center justify-center"
                                    title={isAllVisibleSelected ? 'Desmarcar todos os visíveis' : 'Selecionar todos os visíveis'}
                                    aria-label="Selecionar ou desmarcar todos os visíveis"
                                  >
                                    {isAllVisibleSelected ? (
                                      <CheckSquare className="w-4 h-4 text-cyan-400" />
                                    ) : (
                                      <Square className="w-4 h-4 text-neutral-500" />
                                    )}
                                  </button>
                                </th>
                                <th className="py-2.5 px-3">Nome do Arquivo</th>
                                <th className="py-2.5 px-3 w-24">Formato</th>
                                <th className="py-2.5 px-3 w-28">Tamanho</th>
                                <th className="py-2.5 px-3 w-36">Modificado</th>
                                <th className="py-2.5 px-3 w-48 text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-800/60 font-sans">
                              {filteredDriveVideos.map((video) => {
                                const format = GoogleDriveStorageAdapter.inferFormat(video.name, video.mimeType);
                                const isNativePlayable = GoogleDriveStorageAdapter.isNativePlayable(format);
                                const isSelected = selectedVideoIds.has(video.id);

                                return (
                                  <tr
                                    key={video.id}
                                    className={`transition-colors ${
                                      isSelected
                                        ? 'bg-cyan-950/25 hover:bg-cyan-950/35'
                                        : 'hover:bg-neutral-900/50'
                                    }`}
                                  >
                                    <td className="py-3 px-3 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSelectVideo(video.id)}
                                        className="text-neutral-400 hover:text-cyan-400 transition-colors inline-flex items-center justify-center"
                                        title={isSelected ? `Desmarcar ${video.name}` : `Selecionar ${video.name}`}
                                        aria-label={isSelected ? `Desmarcar ${video.name}` : `Selecionar ${video.name}`}
                                      >
                                        {isSelected ? (
                                          <CheckSquare className="w-4 h-4 text-cyan-400" />
                                        ) : (
                                          <Square className="w-4 h-4 text-neutral-600 hover:text-neutral-400" />
                                        )}
                                      </button>
                                    </td>

                                    <td className="py-3 px-3">
                                      <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="w-7 h-7 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-cyan-400 shrink-0">
                                          <Film className="w-3.5 h-3.5" />
                                        </div>
                                        <div className="min-w-0">
                                          <span
                                            className="font-medium text-neutral-100 truncate block max-w-xs lg:max-w-md cursor-pointer hover:text-cyan-300"
                                            onClick={() => handleToggleSelectVideo(video.id)}
                                            title={video.name}
                                          >
                                            {video.name}
                                          </span>
                                          {video.videoDetails?.width && video.videoDetails?.height && (
                                            <span className="text-[10px] font-mono text-neutral-500">
                                              {video.videoDetails.width}×{video.videoDetails.height} px
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </td>

                                    <td className="py-3 px-3">
                                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                                        isNativePlayable
                                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/60'
                                          : 'bg-amber-950/40 text-amber-400 border-amber-800/60'
                                      }`}>
                                        {format}
                                      </span>
                                    </td>

                                    <td className="py-3 px-3 font-mono text-neutral-300 tabular-nums">
                                      {GoogleDriveStorageAdapter.formatBytes(video.sizeBytes)}
                                    </td>

                                    <td className="py-3 px-3 text-neutral-400 text-[11px] whitespace-nowrap">
                                      {GoogleDriveStorageAdapter.formatDate(video.modifiedTime || video.createdTime)}
                                    </td>

                                    <td className="py-3 px-3 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedDriveVideo(video)}
                                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shadow-sm"
                                          title="Assistir no player de teste"
                                        >
                                          <Play className="w-3 h-3 fill-current" />
                                          <span>Testar Player</span>
                                        </button>

                                        <a
                                          href={video.webViewLink}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors whitespace-nowrap"
                                          title="Abrir no Google Drive (nova aba)"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* VIEW 2: Separate View for Non-Video Files (e.g. PDFs, ISOs, archives) */}
              {!isLoadingVideos && !videosError && explorerTab === 'other' && (
                <div className="space-y-3">
                  {/* Explanatory Banner: Explicit preservation without modifying Google Drive */}
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 space-y-1.5">
                    <div className="flex items-center gap-2 font-semibold text-amber-200">
                      <Info className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>Arquivos Não Reconhecidos como Vídeo ({otherFiles.length})</span>
                    </div>
                    <p className="text-neutral-300 text-[11px] leading-relaxed">
                      Estes arquivos (como documentos PDF, imagens ISO ou arquivos compactados) foram encontrados na conta ou pasta do Google Drive, mas <strong>não foram classificados como vídeos compatíveis</strong> (.mp4, .mkv, .webm, .avi, etc.). Eles são listados aqui separadamente para manter a biblioteca organizada. <em>Nenhum arquivo foi excluído ou modificado no seu Google Drive.</em>
                    </p>
                  </div>

                  {filteredOtherFiles.length === 0 ? (
                    <div className="p-8 text-center bg-neutral-950/40 rounded-xl border border-neutral-800 space-y-2">
                      <FileText className="w-8 h-8 text-neutral-600 mx-auto" />
                      <h5 className="text-xs font-semibold text-neutral-300">
                        {videoSearchQuery ? 'Nenhum arquivo não-vídeo compatível com a pesquisa' : 'Nenhum outro arquivo encontrado'}
                      </h5>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-neutral-800 overflow-hidden bg-neutral-950/50">
                      {/* Mobile Cards for Other Files */}
                      <div className="block md:hidden divide-y divide-neutral-800/60">
                        {filteredOtherFiles.map((file) => {
                          const format = GoogleDriveStorageAdapter.inferFormat(file.name, file.mimeType);
                          return (
                            <div key={`other-mobile-${file.id}`} className="p-3.5 space-y-2">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                                  <FileText className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <h5 className="font-semibold text-xs text-neutral-100 break-words leading-snug" title={file.name}>
                                    {file.name}
                                  </h5>
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className="font-mono font-bold px-1.5 py-0.5 rounded border text-[10px] bg-neutral-900 text-amber-400 border-neutral-800">
                                      {format}
                                    </span>
                                    <span className="font-mono text-neutral-400">
                                      {GoogleDriveStorageAdapter.formatBytes(file.sizeBytes)}
                                    </span>
                                    <span className="text-neutral-500">
                                      · {GoogleDriveStorageAdapter.formatDate(file.modifiedTime || file.createdTime)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="pt-1 flex justify-end">
                                <a
                                  href={file.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:text-white bg-neutral-900 border border-neutral-800 rounded-lg transition-colors"
                                >
                                  <span>Abrir no Google Drive</span>
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Desktop Table for Other Files */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-xs text-neutral-300 min-w-[640px]">
                          <thead className="bg-neutral-900/80 border-b border-neutral-800 text-[11px] uppercase font-bold text-neutral-400 tracking-wider">
                            <tr>
                              <th className="py-2.5 px-3">Nome do Arquivo</th>
                              <th className="py-2.5 px-3 w-28">Tipo / Formato</th>
                              <th className="py-2.5 px-3 w-28">Tamanho</th>
                              <th className="py-2.5 px-3 w-36">Modificado</th>
                              <th className="py-2.5 px-3 w-40 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-neutral-800/60 font-sans">
                            {filteredOtherFiles.map((file) => {
                              const format = GoogleDriveStorageAdapter.inferFormat(file.name, file.mimeType);
                              return (
                                <tr key={`other-desk-${file.id}`} className="hover:bg-neutral-900/50 transition-colors">
                                  <td className="py-3 px-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <div className="w-7 h-7 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-amber-400 shrink-0">
                                        <FileText className="w-3.5 h-3.5" />
                                      </div>
                                      <span className="font-medium text-neutral-100 truncate block max-w-xs lg:max-w-md" title={file.name}>
                                        {file.name}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-3">
                                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border bg-neutral-900 text-amber-400 border-neutral-800">
                                      {format}
                                    </span>
                                  </td>
                                  <td className="py-3 px-3 font-mono text-neutral-300 tabular-nums">
                                    {GoogleDriveStorageAdapter.formatBytes(file.sizeBytes)}
                                  </td>
                                  <td className="py-3 px-3 text-neutral-400 text-[11px] whitespace-nowrap">
                                    {GoogleDriveStorageAdapter.formatDate(file.modifiedTime || file.createdTime)}
                                  </td>
                                  <td className="py-3 px-3 text-right">
                                    <a
                                      href={file.webViewLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:text-white bg-neutral-900 border border-neutral-800 rounded-lg transition-colors whitespace-nowrap"
                                    >
                                      <span>Abrir no Drive</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Informative Security & Compatibility Footer */}
              <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800 text-[11px] text-neutral-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>
                    Visualização direta via Google Drive. Sem proxy de vídeo pesado no servidor da Vercel.
                  </span>
                </div>
                <span className="text-neutral-500 font-mono text-[10px]">
                  Zero tokens ou credenciais confidenciais expostos na interface.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 2. pCloud Card */}
        <div className="p-4 sm:p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                <Cloud className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white">pCloud Storage API (OAuth 2.0)</h3>
                  {pcloudStatus?.connected ? (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/50 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      CONECTADO
                    </span>
                  ) : pcloudStatus?.oauth?.configured ? (
                    <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/50">
                      AGUARDANDO AUTORIZAÇÃO
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/50">
                      NÃO CONFIGURADO
                    </span>
                  )}
                </div>
                <p className="text-xs text-neutral-400">
                  Autenticação server-side oficial · Suporte nativo a HTTP Range (206) para streaming fluido
                </p>
                {pcloudStatus?.connected && pcloudStatus.details?.email && (
                  <div className="text-xs text-emerald-300 font-medium pt-1 flex flex-wrap items-center gap-2">
                    <span>Conta: <strong className="font-mono text-white">{pcloudStatus.details.email}</strong></span>
                    {pcloudStatus.details.usedQuotaFormatted && pcloudStatus.details.quotaFormatted && (
                      <span className="text-neutral-400">
                        · Espaço: <span className="font-mono text-neutral-200">{pcloudStatus.details.usedQuotaFormatted} / {pcloudStatus.details.quotaFormatted}</span>
                      </span>
                    )}
                    {pcloudStatus.details.apiHost && (
                      <span className="text-cyan-400 font-mono text-[11px] bg-cyan-950/50 px-1.5 py-0.5 rounded border border-cyan-800/40">
                        {pcloudStatus.details.apiHost}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto">
              <a
                href="https://docs.pcloud.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-cyan-400 transition-colors"
              >
                <span>Documentação pCloud</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          {/* Redirect URI configuration banner */}
          <div className="p-3.5 rounded-lg bg-neutral-950/90 border border-neutral-800 text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-300">
                URI de Redirecionamento OAuth (pCloud Console):
              </span>
              <button
                type="button"
                onClick={() => {
                  const uri = pcloudStatus?.oauth?.redirectUri || window.location.origin + '/api/storage/pcloud/callback';
                  navigator.clipboard.writeText(uri);
                  onNotify('URL Copiada', 'Cole em "Redirect URI" no aplicativo pCloud Developers.', 'success');
                }}
                className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-[11px]"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Copiar URL</span>
              </button>
            </div>
            <p className="font-mono text-[11px] text-neutral-400 bg-neutral-900 p-2 rounded border border-neutral-800/80 break-all select-all">
              {pcloudStatus?.oauth?.redirectUri || (window.location.origin + '/api/storage/pcloud/callback')}
            </p>
            <p className="text-[11px] text-neutral-500">
              Cadastre esta URI exata na configuração do seu aplicativo pCloud (App Settings &gt; Redirect URIs).
            </p>
          </div>

          {/* Actions & Result */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-neutral-800/60">
            <div className="text-xs text-neutral-400">
              {testResults['pcloud'] ? (
                <span className={testResults['pcloud'].success ? 'text-emerald-400' : 'text-neutral-300'}>
                  {testResults['pcloud'].message}
                </span>
              ) : pcloudStatus?.connected ? (
                <span className="text-emerald-400">Conectado e validado com a API oficial do pCloud.</span>
              ) : (
                <span>Inicie a autorização OAuth ou execute o teste de conexão.</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              {pcloudStatus?.connected ? (
                <button
                  type="button"
                  onClick={handleDisconnectPCloud}
                  className="px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/50 rounded-lg transition-colors whitespace-nowrap"
                >
                  Desconectar pCloud
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectPCloud}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors whitespace-nowrap shadow-sm"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Autorizar pCloud</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const prov = providers.find(p => p.id === 'pcloud') || {
                    id: 'pcloud',
                    name: 'pCloud',
                    status: 'not_configured',
                    statusMessage: '',
                    authMethod: 'oauth2',
                    endpointDoc: '',
                    settings: {},
                    lastCheckTimestamp: null
                  };
                  handleTestConnection(prov);
                }}
                disabled={testingId === 'pcloud'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:text-white bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingId === 'pcloud' ? 'animate-spin' : ''}`} />
                <span>Testar Conexão</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. MEGA Card */}
        <div className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-rose-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">MEGA Cloud Storage</h3>
                  <span className="text-[11px] font-mono text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/50">
                    NÃO CONFIGURADO
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Conexão criptografada ponta a ponta com nó de arquivos MEGA via MEGAcmd ou Web API
                </p>
              </div>
            </div>

            <a
              href="https://mega.io/developers"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-cyan-400 transition-colors self-start sm:self-auto"
            >
              <span>Documentação MEGA</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                E-mail ou Conta Identificadora MEGA
              </label>
              <input
                type="email"
                placeholder="Ex: storage@seu-dominio.com"
                value={providers.find(p => p.id === 'mega')?.settings.megaEmail || ''}
                onChange={(e) => handleFieldChange('mega', 'megaEmail', e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-300 block mb-1">
                Handle da Pasta Raiz / Folder Link
              </label>
              <input
                type="text"
                placeholder="Ex: #F!abc12345!xyz67890"
                value={providers.find(p => p.id === 'mega')?.settings.targetFolderId || ''}
                onChange={(e) => handleFieldChange('mega', 'targetFolderId', e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-neutral-800/60">
            <div className="text-xs text-neutral-400">
              {testResults['mega'] ? (
                <span className={testResults['mega'].success ? 'text-emerald-400' : 'text-neutral-300'}>
                  {testResults['mega'].message}
                </span>
              ) : (
                <span>Aguardando configuração de credenciais no nó de sincronização.</span>
              )}
            </div>

            <button
              onClick={() => {
                const prov = providers.find(p => p.id === 'mega');
                if (prov) handleTestConnection(prov);
              }}
              disabled={testingId === 'mega'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:text-white bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingId === 'mega' ? 'animate-spin' : ''}`} />
              <span>Testar Estado da Conexão</span>
            </button>
          </div>
        </div>
      </div>

      {/* Testador de Vídeos Mux */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold tracking-wide uppercase text-neutral-400 px-1">
          Testador de Vídeos Mux
        </h2>
        <MuxVideoTester onNotify={onNotify} />
      </div>

      {/* Analisador e Testador de Fontes Externas */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold tracking-wide uppercase text-neutral-400 px-1">
          Fontes Externas de Vídeo (HLS / MP4)
        </h2>
        <ExternalMediaTester onNotify={onNotify} />
      </div>

      {/* Security Architecture Principles Card */}
      <div className="p-6 rounded-xl bg-neutral-900/40 border border-neutral-800/70 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span>Arquitetura de Segurança & Isolamento de Credenciais</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-neutral-400 pt-1">
          <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800/70 space-y-1">
            <span className="font-semibold text-neutral-200 block">Zero-Leak no Frontend</span>
            <p className="leading-relaxed">
              Nenhuma chave de API privada, token de acesso ou senha mestra é salva no código cliente do navegador.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800/70 space-y-1">
            <span className="font-semibold text-neutral-200 block">Isolamento entre Projetos</span>
            <p className="leading-relaxed">
              O NOVA STORAGE não compartilha tabelas, sessões ou lógicas internas com NOVA STREAM ou Hikari.
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-neutral-950/60 border border-neutral-800/70 space-y-1">
            <span className="font-semibold text-neutral-200 block">Contrato de API Independente</span>
            <p className="leading-relaxed">
              Comunicação futura será mediada exclusivamente por tokens Bearer temporários e manifests JSON estritos.
            </p>
          </div>
        </div>
      </div>

      {/* Video Player Modal */}
      <DriveVideoPlayerModal
        video={selectedDriveVideo}
        isOpen={Boolean(selectedDriveVideo)}
        onClose={() => setSelectedDriveVideo(null)}
      />
    </div>
  );
};
