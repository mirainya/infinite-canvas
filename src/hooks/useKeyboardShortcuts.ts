import { useEffect } from 'react';

interface KeyboardShortcutActions {
  undo: () => void;
  redo: () => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  saveCanvas: () => void;
  openSearch: () => void;
  toggleShortcutHelp: () => void;
  closeAll: () => void;
}

export function useKeyboardShortcuts(actions: KeyboardShortcutActions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); actions.undo(); }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); actions.redo(); }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); actions.duplicateSelected(); }
      if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); actions.openSearch(); }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); actions.saveCanvas(); }
      if (e.key === '?') { e.preventDefault(); actions.toggleShortcutHelp(); }
      if (e.key === 'Escape') { actions.closeAll(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actions.deleteSelected(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions]);
}
