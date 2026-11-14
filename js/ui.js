/* 画面描画と操作イベント。HTMLごとの data-page に応じて必要な処理だけ実行します。 */
(() => {
  const G = window.EnmaGame, S = window.EnmaStorage, C = window.EnmaConfig;
  const D = window.EnmaData, H = window.EnmaHellNames, CONTENT = window.EnmaContent;
  const $ = id => document.getElementById(id);
  const page = document.body.dataset.page;
  if (page === 'court') {
    window.addEventListener('resize', () => requestAnimationFrame(fitCourtCharacterNames), { passive: true });
    window.addEventListener('scroll', () => requestAnimationFrame(fitCourtCharacterNames), { passive: true });
  }
  const esc = G.escapeHtml;

  // 現在のモードは画面をまたいで引き継ぐため、ゲーム進行データとは別に保存します。
  const currentMode = () => { try { return localStorage.getItem('enma_v0318_last_mode') || 'normal'; } catch { return 'normal'; } };
  const setMode = mode => { try { localStorage.setItem('enma_v0318_last_mode', mode); return true; } catch { return false; } };
  const route = path => { window.location.href = path; };
  const AVATAR_ASSETS = {
    default: 'assets/judge.svg',
    green: 'assets/judge-green.svg',
    yellow: 'assets/judge-yellow.svg',
    blue: 'assets/judge-blue.svg',
    purple: 'assets/judge-purple.svg'
  };
  const AVATAR_IDS = Object.keys(AVATAR_ASSETS);
  // この版では旧アバターIDの読み替えは行わず、現在のIDだけを使用します。
  const avatarFile = id => AVATAR_ASSETS[id] || AVATAR_ASSETS.default;
  let modalSaveMode = null;
  let modalSaveLoadOnly = false;
  let pendingNewGameMode = 'normal';

  // キーボードで「ENMADEBUG」と入力すると、画面遷移用のデバッグメニューを開きます。
  const DEBUG_CODE = 'ENMADEBUG';
  const DEBUG_PAGES = {
    home: 'index.html', appointment: 'appointment.html', court: 'court.html',
    event: 'event.html', review: 'review.html', ending: 'ending.html', gameover: 'gameover.html'
  };
  let debugInputBuffer = '';
  let debugMode = (() => {
    try { return sessionStorage.getItem('enma_v0318_debug_mode') === '1'; }
    catch { return false; }
  })();
  // デバッグメニューから遷移した画面だけをプレビュー扱いにします。
  // デバッグモードが有効なままでも、通常のゲーム進行画面を上書きしません。
  const isDebugPreview = debugMode && new URLSearchParams(window.location.search).get('debugPreview') === '1';

  function ensureDebugGameState() {
    const mode = currentMode();
    if (!G.loadActive(mode)) {
      G.newGame(mode);
      G.setRulerName('デバッグ大王');
      G.saveActive();
    } else if (!G.ghost || G.deeds.length !== 3) {
      G.createGhost();
      G.saveActive();
    }
  }

  function openDebugMenu() {
    const rows = [
      ['home', 'タイトル画面'], ['appointment', '就任手続き画面'], ['court', '裁判画面'],
      ['event', '獄卒イベント画面'], ['review', '振り返り画面'],
      ['ending', 'クリア画面'], ['gameover', 'ゲームオーバー画面']
    ].map(([id, label]) => `<button class="pixel-button" onclick="EnmaUI.debugNavigate('${id}')">${label}</button>`).join('');
    showModal(`<div class="modal-heading"><h2>デバッグモード</h2><span class="case-tag">DEBUG</span></div>
      <p class="muted small-text">確認したい画面を選択してください。ゲーム進行中のデータがあれば、そのデータを使って表示します。クリア画面はプレビュー表示です。ゲームオーバー条件を満たしている場合は、実際の結果を優先して表示します。</p>
      <div class="debug-page-list">${rows}</div>
      <div class="button-row"><button class="pixel-button danger" onclick="EnmaUI.exitDebugMode()">デバッグモードを終了</button><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>`);
  }

  function toggleDebugMode() {
    if (!debugMode) {
      try { sessionStorage.setItem('enma_v0318_debug_mode', '1'); } catch { return; }
      debugMode = true;
      if (page !== 'home') ensureDebugGameState();
    }
    // デバッグ中は同じコマンドでメニューを何度でも開けます。
    openDebugMenu();
  }

  function debugNavigate(target) {
    if (!debugMode || !Object.prototype.hasOwnProperty.call(DEBUG_PAGES, target)) return;
    if (target !== 'home') ensureDebugGameState();
    // プレビュー指定は遷移先URLにだけ付与し、通常プレイ時の画面とは区別します。
    route(target === 'home' ? DEBUG_PAGES[target] : `${DEBUG_PAGES[target]}?debugPreview=1`);
  }

  function exitDebugMode() {
    try { sessionStorage.removeItem('enma_v0318_debug_mode'); } catch {}
    debugMode = false;
    route('index.html');
  }

  function renderDebugGameOver() {
    setText('gameoverTitle', 'デバッグ表示：地獄の収容限界');
    setText('gameoverReason', 'これは画面確認用のプレビューです。通常のゲームオーバー条件を満たした状態ではありません。');
    setText('gameoverAI', 'デバッグモードでゲームオーバー画面を表示しています。');
  }

  // 指定IDの要素がある場合だけ文字列を更新します。画面ごとにHTMLが異なるため存在確認を行います。
  function setText(id, value) { const el = $(id); if (el) el.textContent = value; }

  // 名前欄は装飾用タグだけを残し、属性・スクリプト・その他のタグを除去します。
  function sanitizeNameMarkup(raw) {
    const template = document.createElement('template');
    template.innerHTML = String(raw || '').slice(0, 120);
    const allowed = new Set(['BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'SMALL', 'SUB', 'SUP']);
    const cleanNode = node => {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
      if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
      const tag = node.tagName.toUpperCase();
      if (!allowed.has(tag)) {
        const fragment = document.createDocumentFragment();
        for (const child of [...node.childNodes]) fragment.append(cleanNode(child));
        return fragment;
      }
      const clean = document.createElement(tag.toLowerCase());
      for (const child of [...node.childNodes]) clean.append(cleanNode(child));
      return clean;
    };
    const output = document.createElement('div');
    for (const child of [...template.content.childNodes]) output.append(cleanNode(child));
    return output.innerHTML;
  }



  // 共通モーダル。lockBackdrop=trueのときは背景クリックで閉じないようにします。
  function showModal(html, lockBackdrop = false, variantClass = '') {
    const back = $('modalBack'), modal = $('modal');
    if (!back || !modal) return;
    modal.className = `modal ${variantClass}`.trim();
    modal.innerHTML = html;
    back.dataset.locked = lockBackdrop ? '1' : '0';
    back.classList.add('show');
  }
  function closeModal() { const back = $('modalBack'); if (back) { back.classList.remove('show'); back.dataset.locked = '0'; } }


  function updateSandboxMenuButton() {
    const button = $('sandboxSettingsButton');
    const isSandbox = G.state?.mode === 'sandbox';
    if (button) button.classList.toggle('hidden', !isSandbox);
    document.body.classList.toggle('sandbox-mode', isSandbox);
  }

  function previewSandboxSlider(name, rawValue) {
    const output = $(`sandboxSettingValue_${name}`);
    if (!output) return;
    const value = Number(rawValue);
    if (name === 'namedNpcChance' || name === 'lieChance') output.textContent = `${value}%`;
    else output.textContent = `${value}人`;
  }

  function openSandboxSettings() {
    if (G.state?.mode !== 'sandbox') return;
    const s = G.getSandboxSettings();
    const slider = (key, label, min, max, step, unit, help) => `
      <div class="sandbox-setting-field">
        <div class="sandbox-setting-heading"><label for="sandboxSetting_${key}">${label}</label><output id="sandboxSettingValue_${key}">${s[key]}${unit}</output></div>
        <input id="sandboxSetting_${key}" type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}"
          oninput="EnmaUI.previewSandboxSlider('${key}',this.value)" onchange="EnmaUI.setSandboxSetting('${key}',this.value)">
        <p class="muted small-text">${help}</p>
      </div>`;
    const toggle = (key, label, description) => `
      <label class="sandbox-setting-toggle"><input type="checkbox" ${s[key] ? 'checked' : ''} onchange="EnmaUI.setSandboxSetting('${key}',this.checked)">
        <span><b>${label}</b><small>${description}</small></span></label>`;
    showModal(`<div class="modal-heading"><h2>サンドボックス設定</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>
      <p class="muted small-text">設定はこのセーブデータに保存されます。スライダーなどを変更すると自動で保存されます。</p>
      <section class="sandbox-settings-section"><h3>進行・イベント</h3>
        ${toggle('skipStaffEvent', '獄卒イベントをスキップ', '現在の期には影響せず、次の期から反映されます。')}
        ${toggle('skipReview', '振り返りをスキップ', '現在の期には影響せず、次の期から反映されます。')}
        ${slider('casesPerPeriod', '1期あたりの亡者数', 1, 10, 1, '人', '現在の期は人数を変更せず、次の期から適用します。')}
      </section>
      <section class="sandbox-settings-section"><h3>亡者の出現</h3>
        ${slider('namedNpcChance', '名前付き亡者の出現率', 0, 100, 1, '%', '次に出現する亡者の抽選から反映します。')}
        ${slider('namedNpcLimit', '名前付き亡者の1期あたり上限', 0, 5, 1, '人', '現在の期の上限は変更せず、次の期から適用します。')}
        ${slider('lieChance', '嘘つき亡者の出現率', 0, 100, 1, '%', '次に出現する亡者の抽選から反映します。')}
      </section>
      <section class="sandbox-settings-section"><h3>地獄の様子</h3>
        <div class="sandbox-setting-field"><label for="sandboxSetting_hellDisplayDivisor">亡者の表示割合</label>
          <select id="sandboxSetting_hellDisplayDivisor" onchange="EnmaUI.setSandboxSetting('hellDisplayDivisor',this.value)">
            <option value="1" ${s.hellDisplayDivisor === 1 ? 'selected' : ''}>÷1（全員）</option>
            <option value="2" ${s.hellDisplayDivisor === 2 ? 'selected' : ''}>÷2（半数）</option>
            <option value="3" ${s.hellDisplayDivisor === 3 ? 'selected' : ''}>÷3（3分の1）</option>
            <option value="4" ${s.hellDisplayDivisor === 4 ? 'selected' : ''}>÷4（4分の1）</option>
          </select><p class="muted small-text">次に地獄の様子を開いたときから反映します。</p>
        </div>
        ${slider('hellDisplayMax', '亡者の表示上限', 30, 80, 5, '人', '実際の表示人数の上限です。標準は50人です。')}
        ${toggle('hellEffects', '地獄の様子の演出', '有効にすると亡者が動き、隕石や着弾エフェクトがアニメーションします。無効でも隕石の命中と倒れる表示は動作します。')}
      </section>
      <p class="muted small-text">変更内容はこのセーブデータにだけ適用されます。別のサンドボックスデータには影響しません。</p><p id="sandboxSettingsSaved" class="sandbox-settings-saved" aria-live="polite"></p>`, false, 'sandbox-settings-modal');
  }

  function setSandboxSetting(name, value) {
    if (!G.setSandboxSetting(name, value)) return;
    const modal = $('modal');
    const output = modal?.querySelector(`#sandboxSettingValue_${name}`);
    if (output) previewSandboxSlider(name, value);
    const notice = $('sandboxSettingsSaved');
    if (notice) notice.textContent = '保存しました';
  }
  // 同じモードで見たことのある行いを一覧表示します。
  function openCollection() {
    const mode = G.state?.mode || currentMode();
    const ids = G.state?.collection || S.getCollection(mode);
    const items = ids.map(id => D.DEED_BY_ID[id]).filter(Boolean);
    const body = items.length ? items.map(d => `
      <article class="collection-item">
        <h3>${esc(d.name)}</h3><p>${esc(d.desc)}</p>
        <small>${esc(d.sourceLabel || 'オリジナル')}</small>
      </article>`).join('') : '<p class="muted">まだ記録がありません。裁判を進めると、生前の行いがここに登録されます。</p>';
    showModal(`<div class="modal-heading"><h2>行いの記録</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>
      <p class="muted">新しく出てきた行いが上に追加されます。同じ行いが再登場しても位置は変わりません。</p>
      <div class="collection-list">${body}</div><p class="muted">登録済み：${items.length}種類</p>`);
  }

  // 振り返り画面から、各地獄の現在の様子を表示します。
  function openHellView(hellNumber) {
    if (!G.state || !Number.isInteger(hellNumber) || hellNumber < 1 || hellNumber > 8) return;
    const inmates = G.state.hellInmates[hellNumber - 1] || [];
    const sandbox = G.state.mode === 'sandbox';
    const settings = sandbox ? G.getSandboxSettings() : null;
    const divisor = sandbox ? settings.hellDisplayDivisor : 1;
    // ノーマルモードは÷1で全員を表示します。サンドボックスのみ設定上限を適用します。
    const displayLimit = sandbox ? settings.hellDisplayMax : Math.max(1, inmates.length);
    const spriteCount = Math.min(displayLimit, Math.ceil(inmates.length / divisor));
    const columns = sandbox ? (window.innerWidth < 560 ? 5 : 10) : 5;
    const rows = Math.max(1, Math.ceil(spriteCount / columns));
    const slots = Array.from({ length: columns * rows }, (_, index) => index);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const chosenSlots = slots.slice(0, spriteCount);
    const effectsEnabled = !sandbox || settings.hellEffects;
    const sprites = chosenSlots.map((slot, index) => {
      const facingLeft = Math.random() < 0.5;
      const baseImage = facingLeft ? 'soul-left.svg' : 'soul.svg';
      const horizontalSpread = Math.min(30, Math.floor(window.innerWidth / (columns * 4.5)));
      const x = Math.round(Math.random() * horizontalSpread * 2 - horizontalSpread);
      const y = Math.round(Math.random() * 28 - 14);
      const motion = effectsEnabled ? (Math.random() < 0.5 ? 'hell-inmate-horizontal' : 'hell-inmate-vertical') : '';
      const column = (slot % columns) + 1;
      const row = Math.floor(slot / columns) + 1;
      return `<span class="hell-inmate-actor ${motion} hell-inmate-facing-${facingLeft ? 'left' : 'right'}" data-base-image="${baseImage}"
        style="grid-column:${column};grid-row:${row};--sprite-x:${x}px;--sprite-y:${y}px">
        <span class="hell-inmate-body"><img class="hell-inmate-sprite" src="assets/${baseImage}" alt="亡者" draggable="false" data-sprite="${index + 1}"></span>
        <span class="hell-inmate-reaction" aria-live="polite">うわー！</span>
      </span>`;
    }).join('');
    const sceneContent = spriteCount
      ? `<div class="hell-inmate-grid" style="--inmate-columns:${columns};--inmate-rows:${rows};--inmate-count:${spriteCount}">${sprites}</div>`
      : '<div class="hell-empty">現在、この地獄に亡者はいません。</div>';
    const displayNote = sandbox
      ? `表示割合：亡者数÷${divisor}（最大${displayLimit}人）／現在の収容人数：${inmates.length}人`
      : 'この地獄に収容されている亡者を表示しています。';
    showModal(`<div class="modal-heading"><h2>${H[hellNumber]}の様子</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>
      <p class="muted small-text">${displayNote}画面をクリックすると、その場所に隕石を落とせます。</p>
      <div class="hell-scene hell-scene-${hellNumber} ${effectsEnabled ? '' : 'effects-disabled'}" role="application" tabindex="0" aria-label="${H[hellNumber]}の収容区画。クリックした場所に隕石を落とせます。" data-effects-enabled="${effectsEnabled ? '1' : '0'}">
        <div class="hell-scene-label">${H[hellNumber]}</div>${sceneContent}
      </div>`, false, 'hell-modal');
    setupMeteorInteraction($('modal').querySelector('.hell-scene'));
  }

  // クリック地点に向かって左上から斜めに隕石を落とし、広めの範囲で命中判定します。
  function setupMeteorInteraction(scene) {
    if (!scene) return;
    scene.addEventListener('click', event => {
      const sceneRect = scene.getBoundingClientRect();
      const impactX = Math.max(8, Math.min(sceneRect.width - 8, event.clientX - sceneRect.left));
      const impactY = Math.max(8, Math.min(sceneRect.height - 8, event.clientY - sceneRect.top));
      const meteor = document.createElement('img');
      meteor.className = 'hell-meteor';
      meteor.src = 'assets/meteor.png';
      meteor.alt = '';
      meteor.setAttribute('aria-hidden', 'true');
      meteor.style.left = `${impactX}px`;
      meteor.style.top = `${impactY}px`;
      const diagonalOffset = Math.max(120, Math.min(210, Math.round(Math.min(sceneRect.width, sceneRect.height) * 0.42)));
      meteor.style.setProperty('--meteor-start-x', `${-diagonalOffset}px`);
      meteor.style.setProperty('--meteor-start-y', `${-diagonalOffset}px`);
      scene.append(meteor);

      // 隕石の大きさに合わせ、以前より約1.7倍広い範囲で命中判定します。
      let hitActor = null;
      let hitDistance = Infinity;
      for (const actor of scene.querySelectorAll('.hell-inmate-actor')) {
        if (actor.classList.contains('is-damaged')) continue;
        const sprite = actor.querySelector('.hell-inmate-sprite');
        const rect = sprite.getBoundingClientRect();
        const aspect = 24 / 20;
        let bodyWidth = rect.width;
        let bodyHeight = bodyWidth / aspect;
        if (bodyHeight > rect.height) {
          bodyHeight = rect.height;
          bodyWidth = bodyHeight * aspect;
        }
        const bodyLeft = rect.left + (rect.width - bodyWidth) / 2;
        const bodyTop = rect.top + (rect.height - bodyHeight) / 2;
        const tolerance = 35;
        const inside = event.clientX >= bodyLeft - tolerance && event.clientX <= bodyLeft + bodyWidth + tolerance
          && event.clientY >= bodyTop - tolerance && event.clientY <= bodyTop + bodyHeight + tolerance;
        if (inside) {
          const distance = Math.hypot(event.clientX - (bodyLeft + bodyWidth / 2), event.clientY - (bodyTop + bodyHeight / 2));
          if (distance < hitDistance) { hitDistance = distance; hitActor = actor; }
        }
      }

      const effectsEnabled = scene.dataset.effectsEnabled !== '0';
      window.setTimeout(() => {
        meteor.remove();
        if (effectsEnabled) {
          const impact = document.createElement('span');
          impact.className = 'hell-meteor-impact';
          impact.setAttribute('aria-hidden', 'true');
          impact.style.left = `${impactX}px`;
          impact.style.top = `${impactY}px`;
          scene.append(impact);
          window.setTimeout(() => impact.remove(), 420);
        }
        if (!hitActor || !scene.contains(hitActor)) return;

        const sprite = hitActor.querySelector('.hell-inmate-sprite');
        const reaction = hitActor.querySelector('.hell-inmate-reaction');
        const baseImage = hitActor.dataset.baseImage || 'soul.svg';
        sprite.src = baseImage === 'soul-left.svg' ? 'assets/soul-damage-left.svg' : 'assets/soul-damage.svg';
        hitActor.classList.add('is-damaged');
        const reactions = CONTENT.meteorReactions || ['うわー！'];
        reaction.textContent = reactions[Math.floor(Math.random() * reactions.length)];
        reaction.classList.add('show');
        if (hitActor._damageTimer) window.clearTimeout(hitActor._damageTimer);
        hitActor._damageTimer = window.setTimeout(() => {
          if (!scene.contains(hitActor)) return;
          sprite.src = `assets/${baseImage}`;
          hitActor.classList.remove('is-damaged');
          reaction.classList.remove('show');
          hitActor._damageTimer = null;
        }, 1500);
      }, effectsEnabled ? 620 : 0);
    });
  }

  // 判決履歴には、裁判中にプレイヤーへ表示された情報だけを掲載します。
  // 行いの妥当な行き先や内部評価など、非公開の判定情報は表示しません。
  function openJudgementHistory() {
    const history = G.state?.history || [];
    const entries = history.slice().reverse().map(item => {
      const deedNames = (item.deeds || []).map(id => D.DEED_BY_ID[id]).filter(Boolean);
      // 表示上の行き先は判決時に選んだ地獄のままにし、非公開の帰還処理は表示しません。
      const destination = H[item.hell] || '不明';
      const term = item.hell === 0 ? '指定なし' : `${Number(item.years).toLocaleString('ja-JP')}年`;
      const deedsHtml = deedNames.length
        ? `<ul class="history-deeds">${deedNames.map(deed => `<li>${esc(deed.name)}</li>`).join('')}</ul>`
        : '<p class="muted small-text">行いの情報はありません。</p>';
      return `<article class="history-entry">
        <div class="history-entry-heading"><span class="case-tag">第${item.period}期・第${item.caseNumber || '?'}号</span><strong>${esc(item.ghostName || '亡者')}</strong></div>
        <div class="history-entry-deeds"><b>生前の行い</b>${deedsHtml}</div>
        <p class="history-verdict"><b>判決：</b>${esc(destination)} ／ <b>刑期：</b>${esc(term)}</p>
        ${item.reaction ? `<p class="history-quote"><b>亡者の反応：</b>「${esc(item.reaction)}」</p>` : ''}
        ${item.aiText ? `<p class="history-ai"><b>閻魔AI：</b>${esc(item.aiText)}</p>` : ''}
      </article>`;
    }).join('');
    showModal(`<div class="modal-heading"><h2>判決履歴</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>
      <p class="muted small-text">これまでに下した判決を新しい順に表示します。</p>
      <div class="history-list">${entries || '<p class="muted">まだ判決履歴がありません。</p>'}</div>`, false, 'history-modal');
  }

  // エンディングの発見状況はモード共通で表示します。
  function openEndings() {
    const seen = new Set(S.getSeenEndings());
    const catalog = window.EnmaEndingCatalog || [];
    const discoveredCount = catalog.filter(ending => seen.has(ending.id)).length;
    const rows = catalog.map(ending => {
      const discovered = seen.has(ending.id);
      return `<article class="ending-entry ${discovered ? 'discovered' : 'undiscovered'}">
        <span class="ending-entry-mark">${discovered ? '◆' : '？'}</span>
        <div><b>${discovered ? esc(ending.title) : '？？？？'}</b>${discovered ? `<p>${esc(ending.description)}</p>` : ''}</div>
      </article>`;
    }).join('');
    showModal(`<div class="modal-heading"><h2>エンディング一覧</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>
      <p class="muted small-text">発見済み：${discoveredCount} / ${catalog.length}</p>
      <div class="ending-list">${rows || '<p class="muted">エンディング情報がありません。</p>'}</div>`);
  }

  // loadOnly=trueはタイトル画面用（ロードのみ）、falseは裁判中などのセーブ・ロード用です。
  function openSave(loadOnly = false) {
    modalSaveLoadOnly = loadOnly;
    const mode = G.state?.mode || (page === 'home' ? ($('modeSelect')?.value || currentMode()) : currentMode());
    modalSaveMode = mode;
    const saves = S.getSaves(mode);
    const available = saves.some(Boolean);
    const cards = saves.map((slot, i) => {
      const validSlot = !!(slot && slot.state);
      const info = validSlot
        ? `<b>第${slot.state.period}期</b> ／ ${(slot.state.history || []).length}件の判決済み<br><small>${esc(new Date(slot.savedAt).toLocaleString('ja-JP'))}</small>`
        : '<span class="muted">データなし</span>';
      const controls = loadOnly
        ? `<button class="pixel-button primary" onclick="EnmaUI.loadSlot(${i})" ${validSlot ? '' : 'disabled'}>このデータを読み込む</button>
           <button class="pixel-button danger" onclick="EnmaUI.deleteSlot(${i})" ${validSlot ? '' : 'disabled'}>削除</button>`
        : `<button class="pixel-button primary" onclick="EnmaUI.saveSlot(${i})" ${G.state ? '' : 'disabled'}>保存</button>
           <button class="pixel-button" onclick="EnmaUI.loadSlot(${i})" ${validSlot ? '' : 'disabled'}>ロード</button>
           <button class="pixel-button danger" onclick="EnmaUI.deleteSlot(${i})" ${validSlot ? '' : 'disabled'}>削除</button>`;
      return `<article class="save-slot"><div><b>スロット ${i + 1}</b><div>${info}</div></div><div class="button-row">${controls}</div></article>`;
    }).join('');
    const autoSave = S.getAutoSave(mode);
    const autoSaveCard = `<article class="save-slot auto-save-slot"><div><b>オートセーブ</b><div>${autoSave?.state
      ? `<span class="muted">第${autoSave.state.period}期・振り返り</span><br><small>${esc(new Date(autoSave.savedAt).toLocaleString('ja-JP'))}</small>`
      : '<span class="muted">データなし</span>'}</div></div><div class="button-row"><button class="pixel-button primary" onclick="EnmaUI.loadAutoSave()" ${autoSave?.state ? '' : 'disabled'}>読み込む</button></div></article>`;
    const emptyMessage = loadOnly && !available && !autoSave?.state
      ? '<p class="muted">このモードにはセーブデータがありません。別のモードを選ぶか、新しいゲームを始めてください。</p>'
      : '';
    showModal(`<div class="modal-heading"><h2>${loadOnly ? 'セーブデータを選択' : 'セーブ・ロード'}</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>
      <p class="muted">${mode === 'sandbox' ? 'サンドボックス' : 'ノーマル'}モードのデータです。モードごとにセーブ枠が分かれています。</p>
      ${autoSaveCard}${emptyMessage}<div class="save-list">${cards}</div><p class="toast" id="saveToast"></p>`);
  }

  function saveSlot(index) {
    if (!G.state) return;
    const ok = G.saveSlot(index, page);
    if (ok) {
      // 保存時刻・期・判決数・ロード可能状態を、画面遷移なしで即時更新します。
      openSave(modalSaveLoadOnly);
      setText('saveToast', `スロット ${index + 1} に保存しました。`);
    } else {
      setText('saveToast', '保存できませんでした。ブラウザの保存設定を確認してください。');
    }
  }
  function deleteSlot(index) {
    const mode = G.state?.mode || modalSaveMode || currentMode();
    const saves = S.getSaves(mode); saves[index] = null; S.setSaves(mode, saves); openSave(modalSaveLoadOnly);
  }
  function loadSlot(index) {
    const mode = modalSaveMode || currentMode();
    const result = G.loadSlot(mode, index);
    if (!result) return;
    setMode(mode); closeModal();
    route(result.page === 'event' ? 'event.html' : result.page === 'review' ? 'review.html' : result.page === 'ending' ? 'ending.html' : result.page === 'gameover' ? 'gameover.html' : result.page === 'appointment' ? 'appointment.html' : 'court.html');
  }

  function loadAutoSave() {
    const mode = modalSaveMode || currentMode();
    const result = G.loadAutoSave(mode);
    if (!result) return;
    setMode(mode); closeModal();
    route('review.html');
  }
  function openHelp(type = 'court') {
    const body = type === 'event'
      ? `<h3>獄卒イベント</h3><p>各期の裁判後に、獄卒から相談や報告が1件届きます。選択肢を選ぶと、求心力や地獄の状況が少し変化します。選択後には相談者の反応が表示され、選択結果はその期の間保存されます。</p>`
      : type === 'review'
      ? `<h3>期末の振り返り</h3><p>期末には地獄ごとの混雑状況、獄卒からの評価、累計の判決数、判決履歴、今期の判決傾向を確認できます。「行いの記録」では、これまでに見た行いを新しい順に確認できます。</p>`
      : `<h3>裁判</h3><p>表示された3つの行いを確認し、送り先と刑期を選んで「判決を確定する」を押します。不審な申告があれば「嘘をついている」で指摘できます。判決の妥当性や評価の考え方はChatGPTが考えたものです。</p>
         <h3>期と滞在期間</h3><p>1期はゲーム上の時間単位です。亡者の基本滞在期間は収容先の地獄によって異なります。</p>`;
    showModal(`<div class="modal-heading"><h2>操作説明</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>${body}
      <h3>記録</h3><p>振り返り画面の「判決履歴」から、これまでの判決と亡者の反応を確認できます。「行いの記録」は同じモード内で引き継がれます。</p>
      <h3>保存</h3><p>ゲーム進行は手動セーブ3枠に保存できます。期末の振り返り画面に入ると、オートセーブ枠も自動で更新されます。エンディングの発見状況はモード共通で記録されます。タイトル画面から全てのデータを削除すると、このゲームの保存データをまとめて消去できます。データはこのブラウザ内に保存されます。</p>`);
  }
  function showCredits() {
  showModal(`<div class="modal-heading"><h2>クレジット</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>
    <p>閻魔大王シミュレータ（仮） 試作版 0.3.20</p>
    <p>本作はAIを用いて作成した、のばまんゲームス非公式ファンゲームの試作品です。特定の人物・団体による公認作品ではありません。</p>

    <h3>利用について</h3>
    <p>本作のコード・画像・アイデアは、以下の条件を守っていただければ自由に利用できます。</p>
    <ul>
      <li>常識と良識の範囲内で公序良俗を守って利用すること</li>
      <li>自作発言をしないこと</li>
    </ul>

    <h3>制作</h3>
    企画・修正：n<br>
    その他ほぼすべて：ChatGPT<br>
    一部画像：Gemini`);
}

  function renderStatus() {
    const s = G.state;
    setText('progressText', `${Math.min(s.caseIndex + (G.verdictDone ? 1 : 0), s.periodCases)} / ${s.periodCases} 件目`);
  }

  // 閻魔大王の名前だけ、表示領域を画面全体に広げます。
  // 文字の中心は従来の名前欄の中心に置き、固定表示のためキャラクター配置には影響しません。
  function fitCourtCharacterNames() {
    if (page !== 'court') return;
    const name = $('enmaName');
    const slot = $('enmaNameSlot');
    if (!name || !slot) return;
    const rect = slot.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    name.style.setProperty('--enma-name-center-x', `${centerX}px`);
    name.style.setProperty('--enma-name-center-y', `${centerY}px`);
  }

  // 画像の読み込みでキャラクターカードの高さが確定した後にも位置を合わせ直します。
  function scheduleCourtCharacterNameFit() {
    if (page !== 'court') return;
    requestAnimationFrame(() => requestAnimationFrame(fitCourtCharacterNames));
  }

  // 亡者・行い・入力欄を現在のゲーム状態から描画します。
  function renderCourtCase() {
    const s = G.state, ghost = G.ghost, deeds = G.displayedDeeds();
    if (!s || !ghost || deeds.length !== 3) { route('index.html'); return; }
    setText('phaseLabel', `第${s.period}期`);
    setText('caseName', `第${s.period}期・第${s.caseIndex + 1}号`);
    setText('caseTag', ghost.tag);
    setText('ghostName', ghost.name);
    $('enmaName').innerHTML = sanitizeNameMarkup(s.rulerName || '閻魔大王');
    const judgeSprite = document.querySelector('.character-image.judge');
    if (judgeSprite) {
      const nextAvatar = avatarFile(s.rulerAvatar || 'default');
      if (judgeSprite.getAttribute('src') !== nextAvatar) {
        judgeSprite.addEventListener('load', scheduleCourtCharacterNameFit, { once: true });
        judgeSprite.addEventListener('error', scheduleCourtCharacterNameFit, { once: true });
        judgeSprite.src = nextAvatar;
      } else if (!judgeSprite.complete) {
        // HTML側で指定済みの初期画像がまだ読み込み中の場合も、完了後に位置を測り直します。
        judgeSprite.addEventListener('load', scheduleCourtCharacterNameFit, { once: true });
        judgeSprite.addEventListener('error', scheduleCourtCharacterNameFit, { once: true });
      }
    }
    scheduleCourtCharacterNameFit();
    setText('ghostSub', '本日の被告人');
    $('ghostSprite').src = G.lieState?.isLie && G.lieState.revealed ? 'assets/soul-lie.svg' : ghost.sprite === 'named' ? 'assets/named-soul.svg' : 'assets/soul.svg';
    $('deeds').innerHTML = deeds.map((d, i) => `
      <article class="deed-card ${G.lieState?.isLie && G.lieState.revealed && G.lieState.targetIndex === i ? 'deed-revealed' : ''}"><span class="deed-number">${String(i + 1).padStart(2, '0')}</span>
        <div><h3>${esc(d.name)}</h3><p>${esc(d.desc)}</p></div></article>`).join('');
    $('hellSelect').innerHTML = H.map((name, i) => `<option value="${i}">${name}</option>`).join('');
    $('hellSelect').disabled = false; $('yearsInput').disabled = false; $('yearsRange').disabled = false;
    $('hellSelect').value = '1'; $('yearsInput').value = '1'; onHellChange();
    if (G.verdictDone) {
      const last = s.history[s.history.length - 1];
      if (last && last.period === s.period) {
        $('hellSelect').value = String(last.hell);
        $('yearsInput').value = last.hell === 0 ? '' : String(last.years);
        onHellChange();
        if (last.hell !== 0) { $('yearsInput').value = String(last.years); updateOverflowPreview(); }
      }
    }
    $('hellSelect').disabled = G.verdictDone;
    $('yearsInput').disabled = G.verdictDone;
    $('yearsRange').disabled = G.verdictDone;
    $('verdictButton').disabled = G.verdictDone;
    $('verdictButton').textContent = '判決を確定する';
    $('verdictButton').onclick = confirmVerdict;
    const lieButton = $('lieButton');
    if (lieButton) {
      lieButton.disabled = G.verdictDone || Boolean(G.lieState?.attempted);
      lieButton.textContent = G.lieState?.attempted ? '指摘済み' : '嘘をついている';
      lieButton.onclick = checkLie;
    }
    renderStatus();
    // 判決確定後に更新・再読み込みされた場合も、結果ポップアップを復元します。
    if (G.verdictDone && !isDebugPreview) {
      // 通常プレイでは、判決直後に更新しても保存済みの結果をそのまま再表示します。
      // デバッグプレビューでは裁判画面の確認を優先し、結果モーダルは開きません。
      showVerdictModal(G.lastVerdict);
    }
  }

  function checkLie() {
    const result = G.checkLie();
    if (!result.ok) return;
    const lieButton = $('lieButton');
    if (lieButton) { lieButton.disabled = true; lieButton.textContent = '指摘済み'; }
    if (result.found) {
      $('ghostSprite').src = 'assets/soul-lie.svg';
      $('deeds').innerHTML = result.deeds.map((deed, index) => `
        <article class="deed-card ${G.lieState.targetIndex === index ? 'deed-revealed' : ''}"><span class="deed-number">${String(index + 1).padStart(2, '0')}</span>
          <div><h3>${esc(deed.name)}</h3><p>${esc(deed.desc)}</p></div></article>`).join('');
    }
    const title = result.found ? '嘘を見抜きました' : '嘘は確認されませんでした';
    showModal(`<div class="modal-heading"><h2>${title}</h2><span class="case-tag">申告の確認</span></div>
      <section class="lie-result-reaction"><p>「${esc(result.reaction)}」</p></section>
      <div class="ai-comment lie-result-ai"><strong class="ai-name"><img src="assets/enma-ai.svg" alt=""><span>閻魔AI：</span></strong><span>${esc(result.aiComment)}</span></div>
      ${result.found ? '<p class="muted small-text">元の行いを表示しました。判決では、明らかになった元の行いが評価対象になります。</p>' : '<p class="muted small-text">この亡者への指摘は終了しました。次の指摘はできません。</p>'}
      <div class="button-row"><button class="pixel-button primary" onclick="EnmaUI.closeModal()">閉じる</button></div>`, true, 'lie-result-modal');
  }

  function showVerdictModal(verdict) {
    const ghost = G.ghost || { name: '亡者', sprite: 'ghost' };
    const image = ghost.sprite === 'named' ? 'assets/named-soul.svg' : 'assets/soul.svg';
    const hellName = H[verdict.hell] || H[0];
    const term = verdict.hell === 0 ? 'なし' : `${Number(verdict.years).toLocaleString('ja-JP')}年`;
    const nextLabel = G.gameOverReason() ? '結果を見る' : G.state.caseIndex + 1 >= G.state.periodCases
      ? (G.state.mode === 'sandbox' && G.shouldSkipStaffEventThisPeriod() ? (G.shouldSkipReviewThisPeriod() ? '次の期へ' : '振り返りへ') : '獄卒イベントへ')
      : '次の亡者へ';
    showModal(`<div class="modal-heading"><h2>判決結果</h2><span class="case-tag">判決確定</span></div>
      <div class="verdict-modal-body">
        <div class="verdict-soul-wrap">
          <img class="verdict-soul" src="${image}" alt="亡者のドット絵">
          <div class="speech-bubble">${esc(verdict.reaction || '……')}</div>
          <b class="verdict-soul-name">${esc(ghost.name)}</b>
        </div>
        <div class="verdict-summary">
          <div class="verdict-summary-label">今回の判決</div>
          <div class="verdict-destination">${esc(hellName)}</div>
          <div class="verdict-term">刑期：<strong>${term}</strong></div>
          <div class="ai-comment verdict-ai"><strong class="ai-name"><img src="assets/enma-ai.svg" alt=""><span>閻魔AI：</span></strong><span>${esc(verdict.aiText || G.lastAiText || '')}</span></div>
        </div>
      </div>
      <div class="verdict-modal-actions"><button class="pixel-button primary" onclick="EnmaUI.advanceAfterVerdict()">${nextLabel}</button></div>`, true);
  }

  // 数値入力に合わせてスライダーだけを追従させます。入力欄の値自体は丸めません。
  function updateOverflowPreview() {
    // オーバーフロー後の負数などを画面に説明表示せず、入力値だけを保持します。
    const raw = $('yearsInput').value.trim();
    if (!raw || Number($('hellSelect').value) === 0) return;
    const parsed = G.parseInt32(raw);
    if (!parsed.ok) return;
    const cap = C.hellCaps[Number($('hellSelect').value) - 1];
    $('yearsRange').value = String(Math.max(1, Math.min(cap, parsed.value)));
  }

  // 天国は刑期入力を隠し、地獄を選んだときは該当するスライダー上限へ切り替えます。
  function onHellChange() {
    const index = Number($('hellSelect').value);
    const termArea = $('termInputArea');
    const rangeWrap = $('rangeWrap');
    const heavenNote = $('heavenTermNote');
    const yearsInput = $('yearsInput');
    const yearsRange = $('yearsRange');

    if (index === 0) {
      termArea.classList.add('hidden');
      rangeWrap.classList.add('hidden');
      heavenNote.classList.remove('hidden');
      yearsInput.disabled = true;
      yearsRange.disabled = true;
      yearsInput.value = '';
      setText('termCapNote', '');
      return;
    }

    termArea.classList.remove('hidden');
    rangeWrap.classList.remove('hidden');
    heavenNote.classList.add('hidden');
    yearsInput.disabled = false;
    yearsRange.disabled = false;

    const cap = C.hellCaps[index - 1];
    yearsRange.max = String(cap);
    setText('termCapNote', `${H[index]}の上限：${cap.toLocaleString('ja-JP')}年`);
    if (yearsInput.value.trim() === '') yearsInput.value = '1';
    const parsed = G.parseInt32(yearsInput.value);
    if (!parsed.ok) yearsInput.value = '1';
    updateOverflowPreview();
  }

  function onRangeInput() { $('yearsInput').value = $('yearsRange').value; updateOverflowPreview(); }
  function onYearsInput() { updateOverflowPreview(); }

  // ゲーム側に判決処理を依頼し、成功した場合だけ結果モーダルを表示します。
  function confirmVerdict() {
    const result = G.judge(Number($('hellSelect').value), $('yearsInput').value);
    if (!result.ok) {
      alert(result.reason === 'too-long' ? '入力できる桁数は最大1000桁です。' : '刑期は整数で入力してください。');
      return;
    }
    renderStatus();
    showVerdictModal({
      hell: result.hell,
      years: result.years,
      reaction: result.reaction,
      aiText: result.aiText,
      returnedToLife: result.evaluation.returnToLife
    });
  }

  function advanceAfterVerdict() {
    closeModal();
    const result = G.advanceCase();
    if (result.gameOver) { route('gameover.html'); return; }
    if (result.event) {
      if (G.shouldSkipStaffEventThisPeriod()) {
        G.skipPeriodStaffEvent();
        if (G.shouldSkipReviewThisPeriod()) { G.saveAutoSave(); nextPeriod(); }
        else route('review.html');
      } else route('event.html');
      return;
    }
    renderCourtCase();
  }

  // 期末データを文章・ゲージに変換して表示します。収容人数の具体的な数値は出しません。
  function renderReview() {
    const s = G.state;
    if (!s) { route('index.html'); return; }
    const data = G.reviewData();
    setText('reviewTitle', `第${s.period}期・振り返り`);
    setText('reviewIntro', `今期の裁判が終了しました。地獄の様子を確認しましょう。`);
    setText('reviewAI', data.ai);
    setText('staffEvaluationLabel', s.mode === 'sandbox' ? `${data.staff.label}（${Math.round(s.appeal)}）` : data.staff.label);
    setText('staffEvaluationText', data.staff.text);
    $('reviewStats').innerHTML = `
      <div class="review-stat"><small>累計の判決</small><strong>${s.history.length}件</strong></div>
      <div class="review-stat"><small>今期の判決傾向</small><strong>${s.periodSevere >= 4 ? '極端な判決が多め' : s.periodMismatch > 0 ? '少し偏りあり' : 'おおむね安定'}</strong></div>`;
    $('hellReport').innerHTML = H.slice(1).map((name, i) => {
      const status = G.capacityStatus(i);
      return `<button type="button" class="hell-row hell-row-button" onclick="EnmaUI.openHellView(${i + 1})" aria-label="${name}の様子を見る">
        <span class="hell-row-heading"><b>${name}</b><span class="condition">${status.label}</span></span>
        <span class="pixel-meter"><i style="width:${Math.max(Math.min(status.ratio, 10) * 100, status.count ? 4 : 0)}%"></i></span>
      </button>`;
    }).join('');
    setText('reviewNextText', s.mode === 'sandbox' ? '設定に応じて次の期へ進みます。' : s.period === C.clearPeriod ? '5期の運営結果を確認します。' : '次の期へ進みます。');
    $('nextPeriodButton').textContent = s.mode === 'sandbox' ? '次の期へ' : s.period === C.clearPeriod ? '任期満了の結果を見る' : '次の期へ';
    if (!isDebugPreview) G.saveAutoSave();
  }

  function renderStaffEvent() {
    const s = G.state;
    if (!s) { route('index.html'); return; }
    const event = G.ensurePeriodStaffEvent();
    setText('eventPeriod', `第${s.period}期`);
    setText('eventSpeaker', event.speaker);
    setText('eventTitle', event.title);
    setText('eventText', event.text);
    const options = $('eventChoices');
    const result = $('eventResult');
    if (event.selectedChoice === null) {
      options.innerHTML = event.choices.map((choice, index) =>
        `<button class="pixel-button event-option" onclick="EnmaUI.chooseStaffEvent(${index})">${esc(choice.label)}</button>`
      ).join('');
      result.classList.add('hidden');
      $('eventContinue').classList.add('hidden');
    } else {
      options.innerHTML = '';
      result.classList.remove('hidden');
      setText('eventReaction', `「${event.reaction}」`);
      setText('eventResultText', event.result);
      setText('eventEffectText', event.effectSummary);
      setText('eventAIText', event.aiComment || '選択内容を記録しました。');
      $('eventContinue').classList.remove('hidden');
      $('eventContinue').textContent = G.gameOverReason() ? '結果を見る' : '振り返りへ';
    }
  }

  function chooseStaffEvent(index) {
    const result = G.choosePeriodStaffEvent(index);
    if (result.ok) renderStaffEvent();
  }

  function continueFromStaffEvent() {
    if (G.gameOverReason()) { route('gameover.html'); return; }
    if (G.shouldSkipReviewThisPeriod()) { G.saveAutoSave(); nextPeriod(); return; }
    route('review.html');
  }

  // 裁判説明は新しいゲームごとに表示し、「二度と表示しない」で全モード共通に停止します。
  function openTutorial(type) {
    const text = type === 'event'
      ? `<p>獄卒からの相談や報告に対して、選択肢を選びます。選択によって求心力や地獄の状況が少し変化します。相談者の反応を確認してから、振り返りへ進みます。</p>`
      : type === 'review'
      ? `<p>期末には地獄ごとの混雑状況、獄卒からの評価、累計の判決数、判決履歴、今期の判決傾向を確認できます。</p><p>「行いの記録」では、これまでに見た行いを新しい順に確認できます。</p>`
      : `<p>表示された3つの行いを上から確認し、亡者がどのような行いをしたのか把握しましょう。</p>
         <p>次に、判決欄で送り先の地獄を選び、刑期を設定します。選択した地獄に応じて刑期の上限が変化します。内容を確認したら「判決を確定する」を押してください。</p>
         <p>また、亡者は嘘をつくことがあります。不審な申告があれば「嘘をついている」で指摘してください。</p>
         <p>判決の妥当性や評価の考え方はChatGPTが考えたものです。実際の法律・制度を示すものではありません。</p>`;
    showModal(`<div class="modal-heading"><h2>${type === 'event' ? '獄卒イベント' : type === 'review' ? '期末の振り返り' : '裁判の判定について'}</h2></div>${text}
      <div class="button-row"><button class="pixel-button primary" onclick="EnmaUI.finishTutorial('${type}')">分かった</button><button class="pixel-button" onclick="EnmaUI.neverShowTutorial()">二度と表示しない</button></div>`, true);
  }
  function finishTutorial(type) { G.dismissTutorial(type); closeModal(); }
  function neverShowTutorial() { S.setNeverShowTutorial(); closeModal(); }

  function showLocalServerHelp() {
    showModal(`<div class="modal-heading"><h2>起動方法をご確認ください</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>
      <p>このゲームは画面ごとにHTMLファイルを分けているため、<b>index.htmlを直接ダブルクリックする方法（file://）ではなく、ローカルサーバーで起動してください。</b></p>
      <ol><li>ゲームのフォルダをVS Codeで開く</li><li>拡張機能「Live Server」をインストールする</li><li>index.htmlを右クリックして「Open with Live Server」を選ぶ</li></ol>
      <p class="muted">ブラウザのアドレスが <code>http://127.0.0.1:5500/</code> などになっていればOKです。</p>`);
  }
  function renderAvatarChoices() {
    const holder = $('avatarChoices');
    if (!holder) return;
    const unlocked = new Set(S.getUnlockedAvatars());
    const selected = G.state?.rulerAvatar || 'default';
    holder.innerHTML = AVATAR_IDS.map((id, index) => {
      const available = unlocked.has(id);
      const active = available && selected === id;
      return `<button type="button" class="avatar-choice ${active ? 'selected' : ''} ${available ? '' : 'locked'}"
        aria-label="アバター ${index + 1}" aria-pressed="${active ? 'true' : 'false'}"
        ${available ? `onclick="EnmaUI.selectAvatar('${id}')"` : 'disabled'}>
        <img src="${avatarFile(id)}" alt="" draggable="false">
      </button>`;
    }).join('');
  }

  function selectAvatar(avatarId) {
    if (!G.setRulerAvatar(avatarId)) return;
    renderAvatarChoices();
  }

  function startNewGame() {
    if (window.location.protocol === 'file:') { showLocalServerHelp(); return; }
    pendingNewGameMode = $('modeSelect')?.value || currentMode() || 'normal';

    // 初回だけ注意書きを確認してから開始します。表示済み状態はモード共通です。
    if (!S.hasSeenFirstNotice()) {
      showModal(`<div class="modal-heading"><h2>注意</h2></div>
        <p>このゲームはChatGPTを用いて作成しました。</p>
        <p>判決の妥当性や評価の考え方は、ChatGPTが考えたものです。実際の法律・制度・専門的な判断を示すものではありません。</p>
        <p>本作は「のばまんゲームス」の二次創作であり、のばまんゲームス・のばまんさんご本人とは関係のない非公式作品です。</p>
        <p>以上をご理解のうえ、お楽しみください。</p>
        <div class="button-row"><button class="pixel-button primary" onclick="EnmaUI.acknowledgeFirstNotice()">確認して開始</button></div>`, true);
      return;
    }
    beginNewGame(pendingNewGameMode);
  }

  function acknowledgeFirstNotice() {
    if (!S.markFirstNoticeSeen()) {
      showModal(`<div class="modal-heading"><h2>設定を保存できませんでした</h2></div>
        <p>注意書きの確認状態を保存できませんでした。ブラウザの保存領域を確認してから、もう一度お試しください。</p>
        <div class="button-row"><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div>`, true);
      return;
    }
    closeModal();
    beginNewGame(pendingNewGameMode);
  }

  function beginNewGame(mode) {
    setMode(mode);
    G.newGame(mode);
    if (!G.saveActive() || !S.getActive(mode)?.state) {
      showModal(`<div class="modal-heading"><h2>セーブ領域を利用できません</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div><p>ブラウザの保存領域にゲームデータを書き込めませんでした。通常のブラウザウィンドウで開き、サイトデータの保存が許可されていることを確認してください。</p>`);
      return;
    }
    route('appointment.html');
  }
  function startCourtWithName() {
    const safeName = sanitizeNameMarkup($('rulerNameInput')?.value || '') || '閻魔大王';
    if (!G.setRulerName(safeName)) {
      showModal(`<div class="modal-heading"><h2>名前を保存できませんでした</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div><p>ブラウザの保存領域を確認して、もう一度お試しください。</p>`);
      return;
    }
    route('court.html');
  }

  function openSaveSelection() {
    if (window.location.protocol === 'file:') { showLocalServerHelp(); return; }
    // タイトル画面からは、最新データへ即時移動せずセーブ枠を選べるようにします。
    openSave(true);
  }

  function nextPeriod() {
    const result = G.finishPeriod();
    if (result.ending) route('ending.html'); else { G.saveActive(); route('court.html'); }
  }
  function continueAfterClear() { G.continueAfterClear(); G.saveActive(); route('court.html'); }
  function showGameOver(markSeen = true) {
    const result = G.gameOverReason();
    if (!result) { route('court.html'); return; }
    if (markSeen) S.markEndingSeen(result.id);
    setText('gameoverTitle', result.title); setText('gameoverReason', result.reason); setText('gameoverAI', result.ai);
  }
  function backToTitle() { route('index.html'); }

  function confirmClearAllData() {
    showModal(`<div class="modal-heading"><h2>全てのデータを削除しますか？</h2></div>
      <p>この操作を実行すると、次のデータがすべて削除されます。</p>
      <ul><li>全モードのセーブデータ・オートセーブ</li><li>行いの記録</li><li>発見済みエンディングと解放したアバター</li><li>チュートリアルの表示設定、現在のゲーム進行</li></ul>
      <p class="danger-text">削除したデータは元に戻せません。本当に削除してよい場合だけ「OK」を押してください。</p>
      <div class="button-row"><button class="pixel-button" onclick="EnmaUI.closeModal()">キャンセル</button><button class="pixel-button danger" onclick="EnmaUI.clearAllData()">OK</button></div>`, true);
  }

  function clearAllData() {
    if (!S.clearAllGameData()) {
      showModal(`<div class="modal-heading"><h2>削除できませんでした</h2><button class="pixel-button" onclick="EnmaUI.closeModal()">閉じる</button></div><p>ブラウザの保存領域を利用できませんでした。ブラウザの設定を確認してください。</p>`);
      return;
    }
    G.clearAndReturnTitle();
    route('index.html');
  }

  window.EnmaUI = {
    closeModal, openCollection, openHellView, openJudgementHistory, openEndings, openSave, saveSlot, deleteSlot, loadSlot, loadAutoSave, openHelp, showCredits, confirmClearAllData, clearAllData,
    openSandboxSettings, previewSandboxSlider, setSandboxSetting,
    acknowledgeFirstNotice,
    onHellChange, onRangeInput, onYearsInput, confirmVerdict, advanceAfterVerdict, checkLie,
    startNewGame, startCourtWithName, selectAvatar, openSaveSelection, nextPeriod, continueAfterClear, showGameOver, backToTitle, finishTutorial, neverShowTutorial, chooseStaffEvent, continueFromStaffEvent,
    debugNavigate, exitDebugMode
  };

  document.addEventListener('keydown', event => {
    const target = event.target;
    if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    if (event.ctrlKey || event.altKey || event.metaKey || event.key.length !== 1) return;
    debugInputBuffer = (debugInputBuffer + event.key.toUpperCase()).slice(-DEBUG_CODE.length);
    if (debugInputBuffer === DEBUG_CODE) {
      debugInputBuffer = '';
      toggleDebugMode();
    }
  });

  // HTMLのdata-pageを見て、その画面で必要な初期化だけを実行します。
  if (isDebugPreview && page !== 'home') ensureDebugGameState();

  if (page === 'home') {
    // タイトル画面では、最後にプレイしたモードを初期選択にします。
    if ($('modeSelect')) $('modeSelect').value = currentMode();
    $('startGame')?.addEventListener('click', startNewGame);
    $('continueGame')?.addEventListener('click', openSaveSelection);
    $('endingsButton')?.addEventListener('click', openEndings);
  } else if (page === 'appointment') {
    const mode = currentMode();
    if (!isDebugPreview && !G.loadActive(mode)) route('index.html');
    else {
      if (!isDebugPreview) G.loadActive(mode);
      $('rulerNameInput').value = G.state.rulerName || '';
      G.state.rulerAvatar = AVATAR_IDS.includes(G.state.rulerAvatar)
        ? G.state.rulerAvatar : 'default';
      renderAvatarChoices();
    }
  } else if (page === 'court') {
    const mode = currentMode();
    if (!isDebugPreview && !G.loadActive(mode)) { route('index.html'); }
    else {
      if (!isDebugPreview) G.loadActive(mode);
      renderCourtCase();
      if (!isDebugPreview && !S.neverShowTutorial() && !G.state.courtTutorialDismissed) openTutorial('court');
    }
  } else if (page === 'event') {
    const mode = currentMode();
    if (!isDebugPreview && !G.loadActive(mode)) route('index.html');
    else if (!isDebugPreview && G.gameOverReason() && G.state.periodStaffEvent?.selectedChoice == null) route('gameover.html');
    else if (!isDebugPreview && G.state.caseIndex < G.state.periodCases) route('court.html');
    else {
      if (!isDebugPreview) G.loadActive(mode);
      if (!isDebugPreview && G.shouldSkipStaffEventThisPeriod() && !G.state.periodStaffEvent) {
        G.skipPeriodStaffEvent();
        if (G.shouldSkipReviewThisPeriod()) { G.saveAutoSave(); nextPeriod(); }
        else route('review.html');
      } else {
        G.ensurePeriodStaffEvent();
        renderStaffEvent();
        if (!isDebugPreview && !S.neverShowTutorial() && !G.state.eventTutorialDismissed) openTutorial('event');
      }
    }
  } else if (page === 'review') {
    const mode = currentMode();
    if (!isDebugPreview && !G.loadActive(mode)) route('index.html');
    else if (!isDebugPreview && G.gameOverReason()) route('gameover.html');
    else if (!isDebugPreview && G.state.caseIndex < G.state.periodCases) route('court.html');
    else if (!isDebugPreview && (!G.state.periodStaffEvent || G.state.periodStaffEvent.selectedChoice === null)) route('event.html');
    else {
      if (!isDebugPreview) G.loadActive(mode);
      if (!isDebugPreview && G.shouldSkipReviewThisPeriod()) {
        G.saveAutoSave();
        nextPeriod();
      } else {
        renderReview();
        if (!isDebugPreview && !S.neverShowTutorial() && !G.state.reviewTutorialDismissed) openTutorial('review');
      }
    }
  } else if (page === 'ending') {
    const mode = currentMode();
    if (!isDebugPreview && !G.loadActive(mode)) route('index.html');
    else {
      if (!isDebugPreview) G.loadActive(mode);
      if (!isDebugPreview) S.markEndingSeen('clear');
      const endingMessage = isDebugPreview
        ? 'デバッグモードでクリア画面をプレビューしています。'
        : (G.state.appeal >= 45 ? '5期の運営、お疲れさまでした。大きな問題はありましたが、地獄庁は存続しています。' : '任期は満了しましたが、獄卒の皆さんは最後まで複雑な表情でした。');
      setText('endingAI', endingMessage);
    }
  } else if (page === 'gameover') {
    const mode = currentMode();
    if (!isDebugPreview && !G.loadActive(mode)) route('index.html');
    else {
      if (!isDebugPreview) G.loadActive(mode);
      // 本当にゲームオーバー条件を満たしている場合は、プレビュー中でも実際の結果を優先します。
      if (isDebugPreview && !G.gameOverReason()) renderDebugGameOver();
      else showGameOver(!isDebugPreview);
    }
  }
  updateSandboxMenuButton();
})();
