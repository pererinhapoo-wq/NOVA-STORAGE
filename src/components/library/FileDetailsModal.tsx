import React, { useState, useEffect } from 'react';
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
  Trash2,
  ExternalLink,
  Globe,
  Link2,
  RotateCcw,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Pencil,
  Save,
  Radio,
  Sparkles,
  ShieldAlert,
  Loader2
} from 'lucide-react';
import { EpisodeFile, Folder } from '../../types/storage';
import { LocalCatalogService } from '../../services/storage/localCatalogService';
import {
  StreamResolverService,
  StreamResolutionResult,
  ResolutionStrategy
} from '../../services/storage/streamResolverService';
import {
  sanitizeMediaUrlForDisplay,
  detectTemporaryUrlSignature
} from '../../services/storage/externalMediaService';

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
  // Estado local do episódio para refletir atualizações imediatas sem fechar o modal
  const [currentEpisode, setCurrentEpisode] = useState<EpisodeFile | null>(episode);

  // Sincroniza se a prop episode mudar
  useEffect(() => {
    setCurrentEpisode(episode);
    setResolutionResult(null);
    setResolutionError(null);
    setIsEditingOrigin(false);
    setSnifferCapturedUrl('');
  }, [episode?.id]);

  // Edição e associação de URL de origem e stream
  const [isEditingOrigin, setIsEditingOrigin] = useState(false);
  const [editOriginUrl, setEditOriginUrl] = useState('');
  const [editOriginTitle, setEditOriginTitle] = useState('');
  const [editStreamUrl, setEditStreamUrl] = useState('');

  // Resolução e Renovação
  const [isResolving, setIsResolving] = useState(false);
  const [forceOriginInspection, setForceOriginInspection] = useState(false);
  const [resolutionResult, setResolutionResult] = useState<StreamResolutionResult | null>(null);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [isApplyingCandidate, setIsApplyingCandidate] = useState(false);

  // Inserção assistida direta do Sniffer
  const [snifferCapturedUrl, setSnifferCapturedUrl] = useState('');
  const [isApplyingSnifferUrl, setIsApplyingSnifferUrl] = useState(false);

  // Estados de cópia
  const [copiedHash, setCopiedHash] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [copiedStreamUrl, setCopiedStreamUrl] = useState(false);
  const [copiedCandidateUrl, setCopiedCandidateUrl] = useState(false);

  if (!currentEpisode) return null;

  const folder = folders.find(f => f.id === currentEpisode.folderId);
  const folderName = currentEpisode.seriesName || folder?.name || 'Diretório Raiz';

  // Assinatura do link atual
  const currentSig = currentEpisode.streamUrl
    ? detectTemporaryUrlSignature(currentEpisode.streamUrl)
    : undefined;

  const handleCopyHash = () => {
    navigator.clipboard.writeText(currentEpisode.checksumSha256);
    setCopiedHash(true);
    onNotify('Checksum SHA-256 copiado', 'Hash copiado para a área de transferência.', 'success');
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleCopyJson = () => {
    const jsonStr = JSON.stringify(currentEpisode, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopiedJson(true);
    onNotify('Metadados exportados', 'Estrutura JSON copiada com sucesso.', 'success');
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleCopyStreamUrl = () => {
    if (!currentEpisode.streamUrl) return;
    navigator.clipboard.writeText(currentEpisode.streamUrl);
    setCopiedStreamUrl(true);
    onNotify('URL copiada', 'Link direto copiado para a área de transferência.', 'success');
    setTimeout(() => setCopiedStreamUrl(false), 2000);
  };

  const handleCopyCandidateUrl = () => {
    if (!resolutionResult?.candidateStreamUrl) return;
    navigator.clipboard.writeText(resolutionResult.candidateStreamUrl);
    setCopiedCandidateUrl(true);
    onNotify('URL candidata copiada', 'Link candidato copiado com sucesso.', 'success');
    setTimeout(() => setCopiedCandidateUrl(false), 2000);
  };

  const handleDelete = () => {
    if (confirm(`Remover "${currentEpisode.title}" do catálogo da NOVA STORAGE?`)) {
      onDelete(currentEpisode.id);
      onClose();
    }
  };

  // Abrir modo de edição de origem/stream
  const handleStartEditingOrigin = () => {
    setEditOriginUrl(currentEpisode.originUrl || '');
    setEditOriginTitle(currentEpisode.originTitle || '');
    setEditStreamUrl(currentEpisode.streamUrl || '');
    setIsEditingOrigin(true);
  };

  // Salvar associação de origem/stream preservando rigorosamente o ID e metadados
  const handleSaveOrigin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOrigin = editOriginUrl.trim();
    const cleanTitle = editOriginTitle.trim();
    const cleanStream = editStreamUrl.trim();

    const updates: Partial<EpisodeFile> = {
      originUrl: cleanOrigin || undefined,
      originTitle: cleanTitle || undefined
    };

    if (cleanStream) {
      updates.streamUrl = cleanStream;
      const sig = detectTemporaryUrlSignature(cleanStream);
      updates.streamUrlExpiresAt = StreamResolverService.formatExpirationDate(sig.expirationTimestamp);
      if (!currentEpisode.capturedAt) {
        updates.capturedAt = new Date().toISOString();
      }
    } else if (editStreamUrl === '') {
      // Se explicitamente limpou
      updates.streamUrl = undefined;
      updates.streamUrlExpiresAt = null;
    }

    const updated = LocalCatalogService.updateEpisode(currentEpisode.id, updates);
    if (updated) {
      setCurrentEpisode(updated);
      onEdit?.(updated);
      setIsEditingOrigin(false);
      setResolutionResult(null);
      onNotify('Metadados de Origem Salvos', 'Página de origem e links associados preservando as especificações.', 'success');
    } else {
      onNotify('Erro ao salvar', 'Não foi possível atualizar o registro no catálogo.', 'error');
    }
  };

  // Executar resolução de link usando StreamResolverService com verificação real da acessibilidade da streamUrl
  const handleResolveLink = async () => {
    setIsResolving(true);
    setResolutionError(null);
    try {
      const result = await StreamResolverService.resolveEpisode(currentEpisode, {
        forceOriginInspection,
        probeCurrentStream: true
      });
      setResolutionResult(result);
    } catch (err: any) {
      setResolutionError(err?.message || 'Falha de comunicação ao tentar resolver o link do episódio.');
    } finally {
      setIsResolving(false);
    }
  };

  // Aplicar URL candidata validada ao catálogo (com confirmação explícita)
  const handleApplyCandidate = () => {
    if (!resolutionResult?.candidateStreamUrl) return;
    setIsApplyingCandidate(true);
    try {
      const updated = LocalCatalogService.updateEpisode(currentEpisode.id, {
        streamUrl: resolutionResult.candidateStreamUrl,
        streamUrlExpiresAt: resolutionResult.formattedExpirationDate,
        capturedAt: new Date().toISOString()
      });

      if (updated) {
        setCurrentEpisode(updated);
        onEdit?.(updated);
        onNotify(
          'Link Atualizado',
          'A nova URL de fluxo foi aplicada ao episódio mantendo ID e metadados intactos.',
          'success'
        );
        // Atualiza resultado para refletir adoção
        setResolutionResult((prev) =>
          prev
            ? {
                ...prev,
                strategy: 'direct_usable',
                status: 'usable',
                canDirectPlay: true,
                summaryMessage: 'Nova URL de fluxo adotada com sucesso pelo episódio.',
                currentStreamUrl: resolutionResult.candidateStreamUrl,
                candidateStreamUrl: undefined
              }
            : null
        );
      }
    } catch (err: any) {
      onNotify('Erro ao atualizar link', err?.message || 'Não foi possível salvar o link.', 'error');
    } finally {
      setIsApplyingCandidate(false);
    }
  };

  // Aplicar link capturado manualmente com NOVA Sniffer
  const handleApplySnifferUrl = () => {
    const trimmed = snifferCapturedUrl.trim();
    if (!trimmed) {
      onNotify('URL em branco', 'Cole a URL de stream capturada pelo NOVA Sniffer.', 'error');
      return;
    }
    setIsApplyingSnifferUrl(true);
    try {
      const sig = detectTemporaryUrlSignature(trimmed);
      const expirationDate = StreamResolverService.formatExpirationDate(sig.expirationTimestamp);
      const updated = LocalCatalogService.updateEpisode(currentEpisode.id, {
        streamUrl: trimmed,
        streamUrlExpiresAt: expirationDate,
        capturedAt: new Date().toISOString()
      });

      if (updated) {
        setCurrentEpisode(updated);
        onEdit?.(updated);
        setSnifferCapturedUrl('');
        setResolutionResult(null);
        onNotify(
          'Link do Sniffer Aplicado',
          'A nova URL capturada foi vinculada ao episódio preservando todos os metadados técnicos.',
          'success'
        );
      }
    } catch (err: any) {
      onNotify('Erro ao aplicar URL', err?.message || 'Falha ao atualizar o catálogo.', 'error');
    } finally {
      setIsApplyingSnifferUrl(false);
    }
  };

  // Render do selo de estratégia
  const renderStrategyBadge = (strategy: ResolutionStrategy) => {
    switch (strategy) {
      case 'direct_usable':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-950/60 border border-emerald-500/50 text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Link Acessível na Verificação Atual</span>
          </span>
        );
      case 'auto_renewable':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-cyan-950/60 border border-cyan-500/50 text-cyan-300">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Renovação Automática Viável</span>
          </span>
        );
      case 'assisted_renewal_required':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-950/60 border border-amber-500/50 text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Renovação Assistida Necessária (NOVA Sniffer)</span>
          </span>
        );
      case 'origin_unavailable':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-950/60 border border-rose-500/50 text-rose-300">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Origem Indisponível ou Restrita</span>
          </span>
        );
      case 'inconclusive':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-900 border border-neutral-700 text-neutral-300">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Resultado Inconclusivo</span>
          </span>
        );
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
                S{String(currentEpisode.seasonNumber).padStart(2, '0')}E{String(currentEpisode.episodeNumber).padStart(2, '0')}
              </span>
              <span className="text-xs text-neutral-400">{folderName}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white truncate">
              {currentEpisode.title}
            </h2>
            <p className="text-xs font-mono text-neutral-400 truncate">
              {currentEpisode.originalFileName}
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

          {/* ========================================================================= */}
          {/* SEÇÃO DA ETAPA 3: PÁGINA DE ORIGEM, STATUS DO LINK E RENOVAÇÃO SEGURA     */}
          {/* ========================================================================= */}
          <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-semibold text-neutral-200">
                  Página de Origem e Renovação de Link
                </h3>
              </div>

              {!isEditingOrigin ? (
                <button
                  onClick={handleStartEditingOrigin}
                  className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 font-medium transition-colors self-start sm:self-auto"
                >
                  <Pencil className="w-3 h-3" />
                  <span>{currentEpisode.originUrl ? 'Editar Vínculo' : 'Vincular Origem'}</span>
                </button>
              ) : null}
            </div>

            {/* Formulário Inline de Associação/Edição de Origem e Link */}
            {isEditingOrigin ? (
              <form onSubmit={handleSaveOrigin} className="space-y-3 p-3.5 rounded-lg bg-neutral-900/80 border border-neutral-700/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-200 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Associar Página de Origem e URL Direta</span>
                  </span>
                  <span className="text-[11px] text-neutral-400">ID: {currentEpisode.id}</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-neutral-400 mb-1 font-medium">
                      URL da Página Web de Origem (onde o vídeo é hospedado):
                    </label>
                    <input
                      type="url"
                      placeholder="https://exemplo.com/animes/episodio-01"
                      value={editOriginUrl}
                      onChange={(e) => setEditOriginUrl(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      Permite consultas automatizadas e renovação assistida via NOVA Sniffer.
                    </p>
                  </div>

                  <div>
                    <label className="block text-neutral-400 mb-1 font-medium">
                      Título da Página de Origem (Opcional):
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Frieren S01E01 - Assistir Online Full HD"
                      value={editOriginTitle}
                      onChange={(e) => setEditOriginTitle(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-neutral-400 mb-1 font-medium">
                      URL Direta de Stream (Opcional - Capturada pelo NOVA Sniffer ou manual):
                    </label>
                    <input
                      type="url"
                      placeholder="https://cdn.exemplo.com/hls/master.m3u8?token=..."
                      value={editStreamUrl}
                      onChange={(e) => setEditStreamUrl(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="p-2.5 rounded bg-neutral-950/60 border border-neutral-800 text-[11px] text-neutral-400 flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                  <span>
                    Ao salvar, o ID do episódio ({currentEpisode.id}) e todas as especificações técnicas
                    (tamanho, duração, codecs, faixas e checksum) são rigorosamente preservados.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsEditingOrigin(false)}
                    className="px-3 py-1.5 text-xs text-neutral-400 hover:text-white rounded-lg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Salvar Vínculo</span>
                  </button>
                </div>
              </form>
            ) : (
              /* Modo de Visualização do Vínculo de Origem e Link */
              <div className="space-y-3 text-xs">
                {/* Linha da Página de Origem */}
                <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-neutral-400">Página Web de Origem</span>
                    {currentEpisode.capturedAt && (
                      <span className="text-[10px] text-neutral-500">
                        Capturado em: {LocalCatalogService.formatDate(currentEpisode.capturedAt)}
                      </span>
                    )}
                  </div>

                  {currentEpisode.originUrl ? (
                    <div className="space-y-1">
                      {currentEpisode.originTitle && (
                        <p className="text-xs font-medium text-neutral-200 truncate">
                          {currentEpisode.originTitle}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-cyan-400 truncate select-all">
                          {currentEpisode.originUrl}
                        </span>
                        <a
                          href={currentEpisode.originUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-neutral-400 hover:text-white transition-colors shrink-0 px-2 py-0.5 rounded bg-neutral-800 hover:bg-neutral-700"
                          title="Abrir página de origem em nova aba"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Abrir</span>
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500 italic">Nenhuma página de origem vinculada a este episódio.</span>
                      <button
                        onClick={handleStartEditingOrigin}
                        className="text-cyan-400 hover:text-cyan-300 text-[11px] font-medium underline"
                      >
                        Vincular página web
                      </button>
                    </div>
                  )}
                </div>

                {/* Linha do Link Direto de Stream */}
                <div className="p-3 rounded-lg bg-neutral-900/50 border border-neutral-800/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-neutral-400">URL Direta de Reprodução</span>
                      {currentSig?.isPotentiallyTemporary ? (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-950/60 border border-amber-600/40 text-amber-300 font-mono">
                          Assinatura Temporária Declarada
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-neutral-900 border border-neutral-750 text-neutral-400 font-mono">
                          Validade Não Declarada (Não Verificado)
                        </span>
                      )}
                    </div>

                    {currentEpisode.streamUrl && (
                      <button
                        onClick={handleCopyStreamUrl}
                        className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        {copiedStreamUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedStreamUrl ? 'Copiado' : 'Copiar URL'}</span>
                      </button>
                    )}
                  </div>

                  {currentEpisode.streamUrl ? (
                    <div className="space-y-1">
                      <p className="font-mono text-xs text-neutral-300 break-all select-all bg-neutral-950/80 p-2 rounded border border-neutral-850">
                        {sanitizeMediaUrlForDisplay(currentEpisode.streamUrl)}
                      </p>
                      {currentEpisode.streamUrlExpiresAt && (
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>Validade estimada: <strong className="text-neutral-200">{currentEpisode.streamUrlExpiresAt}</strong></span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-neutral-500 italic">Nenhuma URL de stream associada a este episódio.</p>
                  )}
                </div>

                {/* Painel de Ação: Verificação e Renovação de Link */}
                <div className="pt-1 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-neutral-950 border border-neutral-800">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Radio className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="font-medium text-neutral-200">Verificação de Acessibilidade & Renovação</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-relaxed">
                        Avalia de forma segura se o link atual continua utilizável ou se uma nova URL legítima
                        pode ser obtida da página de origem.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                      {currentEpisode.originUrl && currentEpisode.streamUrl && (
                        <label className="flex items-center gap-1.5 text-[11px] text-neutral-400 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={forceOriginInspection}
                            onChange={(e) => setForceOriginInspection(e.target.checked)}
                            className="rounded border-neutral-700 text-cyan-500 focus:ring-0 bg-neutral-900"
                          />
                          <span>Forçar consulta na origem</span>
                        </label>
                      )}

                      <button
                        type="button"
                        onClick={handleResolveLink}
                        disabled={isResolving}
                        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 disabled:bg-neutral-800 disabled:text-neutral-500 rounded-lg transition-colors whitespace-nowrap shadow-sm"
                      >
                        {isResolving ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Verificando...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Verificar ou Renovar Link</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Mensagem de Erro de Execução (se houver) */}
                  {resolutionError && (
                    <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                      <div>
                        <strong>Falha na Resolução:</strong> {resolutionError}
                        <p className="text-[11px] text-rose-400/80 mt-1">
                          A URL atual do episódio permanece inalterada no catálogo.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Resultados Detalhados da Resolução */}
                  {resolutionResult && (
                    <div className="p-4 rounded-xl bg-neutral-900/90 border border-neutral-750 space-y-3.5 animate-in fade-in duration-150">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-neutral-300">Diagnóstico da Resolução:</span>
                          {renderStrategyBadge(resolutionResult.strategy)}
                        </div>

                        {resolutionResult.formattedExpirationDate && (
                          <span className="text-[11px] font-mono text-neutral-400">
                            Expiração: {resolutionResult.formattedExpirationDate}
                          </span>
                        )}
                      </div>

                      {/* Resumo */}
                      <p className="text-xs text-neutral-200 leading-relaxed bg-neutral-950/70 p-2.5 rounded-lg border border-neutral-800">
                        {resolutionResult.summaryMessage}
                      </p>

                      {/* Lista de Evidências e Detalhes Técnicos */}
                      {resolutionResult.details && resolutionResult.details.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-[11px] font-medium text-neutral-400 block">
                            Evidências Técnicas Levantadas:
                          </span>
                          <ul className="space-y-1 text-[11px] text-neutral-400 list-disc list-inside">
                            {resolutionResult.details.map((item, idx) => (
                              <li key={idx} className="leading-relaxed">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* CENÁRIO 1: CANDIDATA OBTIDA COM RENOVAÇÃO AUTOMÁTICA VIÁVEL */}
                      {resolutionResult.candidateStreamUrl && resolutionResult.canAutoRenew && (
                        <div className="p-3.5 rounded-lg bg-cyan-950/30 border border-cyan-700/50 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Nova URL Candidata Acessível Encontrada</span>
                            </span>
                            <button
                              type="button"
                              onClick={handleCopyCandidateUrl}
                              className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300"
                            >
                              {copiedCandidateUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedCandidateUrl ? 'Copiado' : 'Copiar Candidata'}</span>
                            </button>
                          </div>

                          <p className="font-mono text-xs text-neutral-200 break-all select-all bg-neutral-950/90 p-2.5 rounded border border-cyan-900/60">
                            {sanitizeMediaUrlForDisplay(resolutionResult.candidateStreamUrl)}
                          </p>

                          {/* Notificação Rigorosa: Não afirmar que funciona apenas por HTTP 200/206 */}
                          <div className="p-2.5 rounded bg-neutral-950/80 border border-neutral-800 text-[11px] text-neutral-400 space-y-1">
                            <div className="flex items-center gap-1.5 text-neutral-300 font-medium">
                              <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Nota de Validação Técnica:</span>
                            </div>
                            <p className="leading-relaxed">
                              A sondagem remota confirmou que o servidor responde com código acessível (HTTP 200/206).
                              Conforme os requisitos da NOVA STORAGE, respostas HTTP não equivalem isoladamente a reprodução confirmada.
                              A confirmação definitiva depende da decodificação contínua dos frames pelo player.
                            </p>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={handleApplyCandidate}
                              disabled={isApplyingCandidate}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 disabled:bg-neutral-800 disabled:text-neutral-500 rounded-lg transition-colors shadow-sm"
                            >
                              {isApplyingCandidate ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Atualizando...</span>
                                </>
                              ) : (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Aplicar Nova URL ao Episódio</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* CENÁRIO 2: RENOVAÇÃO ASSISTIDA NECESSÁRIA (IFRAME, DESAFIO ANTI-BOT, DINÂMICO OU SEM ACESSO DIRETO) */}
                      {(resolutionResult.requiresSniffer || resolutionResult.strategy === 'assisted_renewal_required') && (
                        <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-700/50 space-y-3">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="space-y-1 text-xs">
                              <span className="font-semibold text-amber-200">
                                Renovação Assistida Obrigatória pelo Navegador
                              </span>
                              <p className="text-neutral-300 leading-relaxed">
                                A página de origem requer interação ativa do usuário (desafio anti-bot, player embutido em iframe,
                                scripts dinâmicos de inicialização ou restrição de sessão). O NOVA STORAGE não contorna proteções de segurança.
                              </p>
                            </div>
                          </div>

                          {/* Abertura da Página de Origem para NOVA Sniffer */}
                          {currentEpisode.originUrl && (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded bg-neutral-950/80 border border-neutral-800">
                              <span className="text-[11px] text-neutral-300">
                                Abra a página de origem no navegador para acionar o NOVA Sniffer:
                              </span>
                              <a
                                href={currentEpisode.originUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-200 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-600/50 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>Abrir Página de Origem</span>
                              </a>
                            </div>
                          )}

                          {/* Entrada rápida para colar a nova URL obtida com o Sniffer */}
                          <div className="space-y-1.5 pt-1">
                            <label className="text-[11px] font-medium text-neutral-300 block">
                              Cole a nova URL de mídia capturada pelo NOVA Sniffer:
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="url"
                                placeholder="https://cdn.exemplo.com/hls/master.m3u8?token=..."
                                value={snifferCapturedUrl}
                                onChange={(e) => setSnifferCapturedUrl(e.target.value)}
                                className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 font-mono focus:outline-none focus:border-amber-500"
                              />
                              <button
                                type="button"
                                onClick={handleApplySnifferUrl}
                                disabled={isApplyingSnifferUrl || !snifferCapturedUrl.trim()}
                                className="px-3 py-1.5 text-xs font-semibold text-neutral-950 bg-amber-400 hover:bg-amber-300 disabled:bg-neutral-800 disabled:text-neutral-500 rounded-lg transition-colors whitespace-nowrap"
                              >
                                {isApplyingSnifferUrl ? 'Salvando...' : 'Aplicar Link'}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* CENÁRIO 3: ORIGEM INDISPONÍVEL OU INCONCLUSIVA */}
                      {(resolutionResult.strategy === 'origin_unavailable' ||
                        (resolutionResult.strategy === 'inconclusive' && !resolutionResult.requiresSniffer)) && (
                        <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 text-xs space-y-1">
                          <span className="font-semibold text-neutral-300 block">
                            Preservação de Integridade:
                          </span>
                          <p className="text-neutral-400 leading-relaxed">
                            A renovação automática não pôde ser completada com segurança. A URL de stream atual e
                            todos os metadados do episódio continuam preservados intactos no catálogo.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Technical Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/80">
              <span className="text-[11px] text-neutral-500 block">Tamanho</span>
              <span className="text-sm font-semibold text-neutral-200 font-mono tabular-nums block mt-0.5">
                {LocalCatalogService.formatBytes(currentEpisode.fileSizeBytes)}
              </span>
              <span className="text-[10px] font-mono text-neutral-600 tabular-nums">
                {currentEpisode.fileSizeBytes.toLocaleString()} bytes
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/80">
              <span className="text-[11px] text-neutral-500 block">Duração</span>
              <span className="text-sm font-semibold text-neutral-200 font-mono tabular-nums block mt-0.5">
                {LocalCatalogService.formatDuration(currentEpisode.durationSeconds)}
              </span>
              <span className="text-[10px] font-mono text-neutral-600 tabular-nums">
                {currentEpisode.durationSeconds}s totais
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/80">
              <span className="text-[11px] text-neutral-500 block">Resolução / Contêiner</span>
              <span className="text-sm font-semibold text-neutral-200 block mt-0.5">
                {currentEpisode.resolution}
              </span>
              <span className="text-[10px] text-neutral-500">
                Formato {currentEpisode.containerFormat}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950/50 border border-neutral-800/80">
              <span className="text-[11px] text-neutral-500 block">Taxa de Quadros</span>
              <span className="text-sm font-semibold text-neutral-200 font-mono tabular-nums block mt-0.5">
                {currentEpisode.frameRate} fps
              </span>
              <span className="text-[10px] text-neutral-500">
                {currentEpisode.dimensions.width}×{currentEpisode.dimensions.height} px
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
                <span className="text-neutral-200 font-medium">{currentEpisode.videoCodec}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Bitrate Médio</span>
                <span className="text-neutral-200 font-mono tabular-nums">
                  {currentEpisode.bitrateKbps.toLocaleString()} kbps
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
                <span>Faixas de Áudio ({currentEpisode.audioStreams.length})</span>
              </h3>
            </div>

            <div className="space-y-2">
              {currentEpisode.audioStreams.map((audio, idx) => (
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
              <span>Faixas de Legendas ({currentEpisode.subtitleStreams.length})</span>
            </h3>

            {currentEpisode.subtitleStreams.length === 0 ? (
              <p className="text-xs text-neutral-500">Sem legendas embutidas no contêiner.</p>
            ) : (
              <div className="space-y-2">
                {currentEpisode.subtitleStreams.map((sub, idx) => (
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
              {currentEpisode.checksumSha256}
            </p>
          </div>

          {/* Future NOVA STREAM Compatibility Notice */}
          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-xs space-y-1.5">
            <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Compatibilidade com NOVA STREAM</span>
            </span>
            <p className="text-neutral-300 leading-relaxed">
              Formato contêiner <strong className="text-white">{currentEpisode.containerFormat}</strong> com codec{' '}
              <strong className="text-white">{currentEpisode.videoCodec}</strong>. Pronto para Direct Play ou Remux no player
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
