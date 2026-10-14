import React, { useState } from 'react';
import {
  Cpu,
  Download,
  Copy,
  Check,
  ArrowRight,
  ShieldCheck,
  FileJson,
  Layers,
  Sparkles,
  ExternalLink
} from 'lucide-react';
import { EpisodeFile, Folder } from '../../types/storage';
import { NovaStreamIntegrationService } from '../../services/storage/novaStreamIntegration';

interface NovaStreamBridgeProps {
  episodes: EpisodeFile[];
  folders: Folder[];
  onNotify: (title: string, message?: string, type?: 'success' | 'info' | 'error') => void;
}

export const NovaStreamBridge: React.FC<NovaStreamBridgeProps> = ({
  episodes,
  folders,
  onNotify
}) => {
  const [copied, setCopied] = useState(false);

  const manifest = NovaStreamIntegrationService.generateExportManifest(episodes, folders);
  const jsonString = JSON.stringify(manifest, null, 2);
  const apiSpec = NovaStreamIntegrationService.getApiHandshakeSpecification();

  const handleCopyManifest = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    onNotify('Manifesto Copiado', 'JSON de integração para a NOVA STREAM copiado para a área de transferência.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadManifest = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nova-storage-manifest-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify('Download Concluído', 'Arquivo nova-storage-manifest.json gerado com sucesso.', 'success');
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Top Banner */}
      <div className="p-6 rounded-xl bg-neutral-900/60 border border-neutral-800 space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-center text-cyan-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Ponte de Integração com NOVA STREAM</h1>
            <p className="text-xs text-neutral-400">
              Contrato de API REST seguro e desacoplado para sincronização de episódios
            </p>
          </div>
        </div>

        <p className="text-xs text-neutral-300 leading-relaxed max-w-3xl">
          O NOVA STORAGE foi concebido como autoridade técnica de armazenamento e metadados.
          No futuro, a NOVA STREAM poderá consultar este manifesto de forma totalmente independente,
          sem acesso direto aos provedores de nuvem e sem compartilhamento de código ou credenciais sensíveis.
        </p>
      </div>

      {/* Architecture Separation Diagram */}
      <div className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400">
          Arquitetura de Comunicação Futura
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {/* Box 1: NOVA STORAGE */}
          <div className="p-4 rounded-xl bg-neutral-950/70 border border-cyan-800/50 space-y-2">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              <span>NOVA STORAGE (Cofre)</span>
            </div>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              • Catálogo mestre de episódios<br />
              • Checksums SHA-256 e codecs<br />
              • Validação de integridade física<br />
              • Orquestrador de storage remoto
            </p>
          </div>

          {/* Box 2: Secure Bridge */}
          <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-2">
            <div className="flex items-center gap-2 text-neutral-300 font-semibold">
              <span className="w-2 h-2 rounded-full bg-neutral-400" />
              <span>Ponte de API Segura</span>
            </div>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              • Rota read-only: <code className="text-cyan-400 font-mono">/api/v1/vault/manifest</code><br />
              • Handshake via Bearer Token<br />
              • Sem expor credenciais de nuvem<br />
              • Compatível com webhooks de atualização
            </p>
          </div>

          {/* Box 3: NOVA STREAM */}
          <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-2">
            <div className="flex items-center gap-2 text-purple-400 font-semibold">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span>NOVA STREAM (Player)</span>
            </div>
            <p className="text-neutral-400 leading-relaxed text-[11px]">
              • Interface de reprodução do usuário<br />
              • Navegação por temporadas<br />
              • Renderização de legendas e áudio<br />
              • Consome apenas URLs assinadas
            </p>
          </div>
        </div>
      </div>

      {/* Live Manifest Preview & Actions */}
      <div className="p-6 rounded-xl bg-neutral-900/70 border border-neutral-800/80 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <FileJson className="w-4 h-4 text-cyan-400" />
              <span>Manifesto Dinâmico Gerado ({manifest.totalItems} episódios)</span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Estrutura pronta para exportação ou consumo por serviço cliente
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyManifest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar JSON'}</span>
            </button>

            <button
              onClick={handleDownloadManifest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Baixar Manifesto</span>
            </button>
          </div>
        </div>

        {/* JSON Code Viewer */}
        <div className="relative rounded-xl overflow-hidden border border-neutral-800 bg-neutral-950">
          <div className="px-4 py-2 border-b border-neutral-800/80 bg-neutral-900/60 flex items-center justify-between text-xs text-neutral-400 font-mono">
            <span>nova-storage-manifest.json</span>
            <span className="text-[11px] text-neutral-500 font-mono">Versão {manifest.manifestVersion}</span>
          </div>
          <pre className="p-4 text-xs font-mono text-cyan-300/90 overflow-x-auto max-h-96 leading-relaxed select-all">
            {jsonString}
          </pre>
        </div>

        <div className="p-3 rounded-lg bg-neutral-950/60 border border-neutral-800 text-xs text-neutral-400 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>
            Notice padrão injetado no manifesto: <em>&quot;Conexão com armazenamento real ainda não configurada no NOVA STORAGE.&quot;</em> Garantia de conformidade com a primeira fase da arquitetura.
          </span>
        </div>
      </div>
    </div>
  );
};
