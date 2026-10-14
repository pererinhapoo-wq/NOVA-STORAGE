import React, { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';
import { Folder } from '../../types/storage';

interface NewFolderModalProps {
  onClose: () => void;
  onSubmit: (name: string, description: string, category: Folder['category']) => void;
}

export const NewFolderModal: React.FC<NewFolderModalProps> = ({ onClose, onSubmit }) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Folder['category']>('anime');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit(name.trim(), description.trim(), category);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-neutral-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div
        className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-cyan-400">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Nova Pasta / Coleção</h2>
              <p className="text-xs text-neutral-400">Diretório para organizar episódios</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
              Nome da Pasta *
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Solo Leveling - Temporada 1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
              Categoria
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Folder['category'])}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="anime">Anime</option>
              <option value="series">Série de TV</option>
              <option value="movies">Longas / Filmes</option>
              <option value="specials">Especiais & OVAs</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-300 block mb-1.5">
              Descrição
            </label>
            <textarea
              rows={3}
              placeholder="Ex: Master ripado em 1080p com áudio dual..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-cyan-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-neutral-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-neutral-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors shadow-sm"
            >
              Criar Pasta
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
