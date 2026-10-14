import React, { useState } from 'react';
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
  Info
} from 'lucide-react';
import { StorageProviderConfig } from '../../types/storage';
import { GoogleDriveStorageAdapter } from '../../services/storage/providers/googleDriveAdapter';
import { MegaStorageAdapter } from '../../services/storage/providers/megaAdapter';

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

  const fetchDriveStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/storage/drive/status');
      if (res.ok) {
        const data = await res.json();
        setDriveStatus(data);
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
          const res = await fetch('/api/storage/drive/status');
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
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fetchDriveStatus, onNotify]);

  const popupWindowRef = React.useRef<Window | null>(null);

  const handleConnectDrive = async () => {
    const prov = providers.find(p => p.id === 'google_drive');
    const folderId = prov?.settings.targetFolderId;
    const adapter = new GoogleDriveStorageAdapter(prov?.settings.clientId, folderId);

    const authData = await adapter.getAuthUrl(folderId);
    if (!authData || !authData.url) {
      onNotify(
        'Configuração Pendente no Servidor',
        'Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env antes de iniciar a autorização.',
        'info'
      );
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
      fetchDriveStatus();
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
              Camada de serviço desacoplada para conexão futura com Google Drive, MEGA e S3
            </p>
          </div>
        </div>

        {/* Prominent Truthful Notice */}
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-neutral-300 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Estado da Conexão: Não Configurada (Catálogo Local Ativo)</span>
          </div>
          <p className="text-neutral-400 leading-relaxed">
            Em conformidade com a arquitetura da NOVA STORAGE, nenhum serviço externo pago ou conta de nuvem foi
            vinculada ainda. Esta interface permite estruturar os parâmetros e credenciais técnicas que serão
            utilizadas pelo backend proxy quando o provisionamento remoto for solicitado.
          </p>
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
        <div className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5">
                <Cloud className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Google Drive API (v3)</h3>
                  {driveStatus?.connected ? (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/50">
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
                    Conta vinculada: <span className="font-mono text-white">{driveStatus.userEmail}</span>
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
                placeholder="Ex: 1A2b3C4d5E6f_G7h8I9j0K"
                value={providers.find(p => p.id === 'google_drive')?.settings.targetFolderId || ''}
                onChange={(e) => handleFieldChange('google_drive', 'targetFolderId', e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500"
              />
              <span className="text-[10px] text-neutral-500 mt-1 block">
                Filtra a listagem remota para uma pasta específica
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
                  const uri = driveStatus?.redirectUri || 'https://ais-dev-ybwzp7bluwrxebqiuulyzh-875945009084.us-east1.run.app/api/storage/drive/callback';
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
              {driveStatus?.redirectUri || 'https://ais-dev-ybwzp7bluwrxebqiuulyzh-875945009084.us-east1.run.app/api/storage/drive/callback'}
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

            <div className="flex items-center gap-2 self-start sm:self-auto">
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
                <span>Testar Estado da Conexão</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. MEGA Card */}
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
    </div>
  );
};
