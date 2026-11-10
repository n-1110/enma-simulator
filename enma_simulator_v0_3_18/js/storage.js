/*
 * localStorageの読み書きをまとめるファイルです。
 * ゲーム進行・手動セーブ・行いの記録を保存します。説明を二度と表示しない設定も別に保存します。
 * 保存キーの接頭辞を変更すると、以前の版のデータとは別扱いになります。
 */
window.EnmaStorage = (() => {
  const SAVE_PREFIX = 'enma_v0318_';
  const key = {
    active: mode => `${SAVE_PREFIX}active_${mode}`,
    saves: mode => `${SAVE_PREFIX}saves_${mode}`,
    collection: mode => `${SAVE_PREFIX}collection_${mode}`,
    tutorialNever: `${SAVE_PREFIX}tutorial_never`,
    firstNoticeSeen: `${SAVE_PREFIX}first_notice_seen`,
    endingsSeen: `${SAVE_PREFIX}endings_seen`,
    autoSave: mode => `${SAVE_PREFIX}auto_${mode}`
  };

  // ブラウザ設定でlocalStorageが使えない場合も、ゲーム全体が停止しないよう例外を受け止めます。
  function getRaw(k) {
    try { return localStorage.getItem(k); }
    catch { return null; }
  }

  function setRaw(k, value) {
    try { localStorage.setItem(k, value); return true; }
    catch { return false; }
  }

  // JSONが壊れている場合は、呼び出し元が指定した初期値を返します。
  function read(k, fallback) {
    try {
      const value = getRaw(k);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(k, value) {
    try {
      localStorage.setItem(k, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  return {
    key, getRaw, setRaw, read, write,

    getActive(mode) {
      return read(key.active(mode), null);
    },

    // 進行データにはmodeも含め、別モードのデータを誤って上書きしないようにします。
    setActive(mode, record) {
      if (!mode || !record || !record.state || record.state.mode !== mode) return false;
      return write(key.active(mode), record);
    },

    getCollection(mode) {
      return read(key.collection(mode), []);
    },
    setCollection(mode, ids) {
      return write(key.collection(mode), ids);
    },

    getSaves(mode) {
      return read(key.saves(mode), Array(window.EnmaConfig.saveSlots).fill(null));
    },
    setSaves(mode, saves) {
      return write(key.saves(mode), saves);
    },

    // オートセーブは手動セーブ枠と独立して、モードごとに1件だけ保持します。
    getAutoSave(mode) {
      return read(key.autoSave(mode), null);
    },
    setAutoSave(mode, record) {
      if (!mode || !record || !record.state || record.state.mode !== mode) return false;
      return write(key.autoSave(mode), record);
    },

    // エンディングの発見状況はゲームモード共通で保持します。
    getSeenEndings() {
      const seen = read(key.endingsSeen, []);
      return Array.isArray(seen) ? seen : [];
    },
    markEndingSeen(endingId) {
      const known = (window.EnmaEndingCatalog || []).some(ending => ending.id === endingId);
      if (!known) return false;
      const seen = this.getSeenEndings();
      if (!seen.includes(endingId)) seen.push(endingId);
      return write(key.endingsSeen, seen);
    },
    getUnlockedAvatars() {
      const seen = this.getSeenEndings();
      return ['default', ...(window.EnmaEndingCatalog || []).filter(ending => seen.includes(ending.id)).map(ending => ending.avatar)];
    },

    neverShowTutorial() {
      return getRaw(key.tutorialNever) === '1';
    },
    setNeverShowTutorial() {
      return setRaw(key.tutorialNever, '1');
    },

    // 初回注意書きはモードを問わず一度だけ表示します。
    hasSeenFirstNotice() {
      return getRaw(key.firstNoticeSeen) === '1';
    },
    markFirstNoticeSeen() {
      return setRaw(key.firstNoticeSeen, '1');
    },

    // 本作のゲームデータだけを、保存形式の世代を問わず削除します。
    clearAllGameData() {
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const name = localStorage.key(i);
          if (name && name.startsWith('enma_')) keys.push(name);
        }
        keys.forEach(name => localStorage.removeItem(name));
        return true;
      } catch (error) {
        console.error(error);
        return false;
      }
    }
  };
})();
