/* ゲーム進行。判決評価と状態管理を担当し、画面表示は ui.js に任せます。 */
window.EnmaGame = (() => {
  const C = window.EnmaConfig;
  const D = window.EnmaData;
  const H = window.EnmaHellNames;
  const CONTENT = window.EnmaContent;
  let state = null;
  let ghost = null;
  let deeds = [];
  let verdictDone = false;
  let lastAiText = '';
  let lastVerdict = null;

  const AI = CONTENT.ai.verdict;

  const pick = list => list[Math.floor(Math.random() * list.length)];
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // 基本滞在期間は刑期ではなく、収容先の地獄に応じて決めます。
  function stayPeriodsForHell(hell, shorten = false) {
    if (hell < 1 || hell > 8) return 0;
    const base = C.baseStayPeriodsByHell[hell - 1] || hell + 1;
    return shorten ? Math.max(1, base - 1) : base;
  }

  function createInitialInmates() {
    // 開始時点から各地獄に既存の亡者がいる状態にします。配列の長さが人数です。
    // 初期亡者の刑期も各地獄の上限内に調整しています。
    // 初期亡者は既に収容済みのため、基本滞在期間をそのまま適用します。
    const startingTerms = [
      [18, 32, 55, 78],
      [80, 160, 300],
      [150, 350, 750],
      [800, 1800],
      [2000, 6000],
      [12000],
      [25000],
      [120000]
    ];
    return startingTerms.map((terms, hellIndex) => terms.map((termYears, i) => ({
      termYears, remainingStayPeriods: stayPeriodsForHell(hellIndex + 1),
      name: `既存の亡者${hellIndex + 1}-${i + 1}`, background: true
    })));
  }

  // 新しいゲームの初期状態。調整値は config.js、初期亡者は createInitialInmates() で管理します。
  function newState(mode) {
    return {
      mode, period: 1, caseIndex: 0, periodCases: C.casesPerPeriod, rulerName: '', rulerAvatar: 'default', periodStaffEvent: null, periodAiText: '',
      courtTutorialDismissed: false, reviewTutorialDismissed: false, eventTutorialDismissed: false,
      hellInmates: createInitialInmates(), hellCapacityAdjustments: Array(8).fill(0),
      appeal: C.appealStart, history: [], collection: EnmaStorage.getCollection(mode),
      periodSevere: 0, periodLight: 0, periodMismatch: 0, periodReturnCount: 0, totalReturnCount: 0, cleared: false
    };
  }

  // 画面を移動しても裁判を再開できるよう、進行状態と現在の亡者情報をセットで保存します。
  function saveActive() {
    if (!state) return false;
    return EnmaStorage.setActive(state.mode, { state: clone(state), context: getContext() });
  }
  function getContext() {
    return { ghost: clone(ghost), deedIds: deeds.map(d => d.id), verdictDone, lastAiText, lastVerdict: clone(lastVerdict) };
  }
  function setContext(context) {
    ghost = context.ghost;
    deeds = context.deedIds.map(id => D.DEED_BY_ID[id]).filter(Boolean);
    verdictDone = context.verdictDone;
    lastAiText = context.lastAiText;
    lastVerdict = context.lastVerdict;
  }

  function newGame(mode = 'normal') {
    state = newState(mode);
    ghost = null; deeds = []; verdictDone = false; lastAiText = ''; lastVerdict = null;
    beginPeriod();
    saveActive();
    return state;
  }

  function beginPeriod() {
    state.caseIndex = 0;
    state.periodSevere = 0;
    state.periodLight = 0;
    state.periodMismatch = 0;
    state.periodReturnCount = 0;
    state.periodStaffEvent = null;
    state.periodAiText = pick(CONTENT.ai.periodStart).replaceAll('{period}', String(state.period));
    state.periodCases = C.casesPerPeriod;
    createGhost();
    saveActive();
  }

  // 通常の亡者に割り当てる行いを3件選びます。同じ亡者の中で重複しないようにします。
  function regularDeeds(exclude = []) {
    const pool = [
      ...D.ORIGINAL_DEEDS.map(d => ({ ...d, kind: 'original', sourceLabel: 'オリジナル' })),
      ...D.NEUTRAL_DEEDS.map(d => ({ ...d, kind: 'neutral', sourceLabel: '善行・日常の行動' })),
      ...D.ANONYMOUS_VIDEO_DEEDS.map(d => ({ ...d, kind: 'anonymousVideo', sourceLabel: '動画ネタ枠' }))
    ];
    const chosen = [];
    for (let i = 0; i < 3; i++) {
      let candidates = pool.filter(d => !chosen.some(x => x.id === d.id) && !exclude.includes(d.id));
      if (!candidates.length) candidates = pool.filter(d => !chosen.some(x => x.id === d.id));
      chosen.push(pick(candidates));
    }
    return chosen;
  }

  function createGhost() {
    verdictDone = false;
    lastVerdict = null;
    // 第5期までの各期5人目は、出現率に関係なく名前付き亡者にします。
    const guaranteedNamed = state.period <= C.clearPeriod && state.caseIndex === C.casesPerPeriod - 1;
    if (guaranteedNamed || Math.random() < C.namedNpcChance) {
      const npc = pick(D.NAMED_NPC_TEMPLATES);
      const unique = D.DEED_BY_ID[npc.deed.id];
      deeds = [unique, ...regularDeeds([unique.id]).filter(d => d.id !== unique.id).slice(0, 2)];
      ghost = { id: npc.id, name: npc.name, tag: '特別NPC', sprite: 'named', specialReaction: npc.reaction || '' };
    } else {
      deeds = regularDeeds();
      const names = ['名もなき亡者','元・自称発明家','元・経営者','元・権力者','元・自動化推進委員','元・アーティスト'];
      ghost = { id: `soul-${Date.now()}-${Math.random().toString(16).slice(2)}`, name: pick(names), tag: '一般亡者', sprite: 'ghost' };
    }
    saveActive();
  }

  // 入力を32bit符号付き整数として扱います。範囲を超えた値は仕様どおり折り返します。
  function parseInt32(raw) {
    const value = String(raw).trim();
    if (!/^[+-]?\d+$/.test(value)) return { ok: false };
    // 桁数は安全上限まで許可し、BigIntで正確に読み取ってから32bitへ折り返します。
    if (value.replace(/^[+-]/, '').length > C.maxInputDigits) return { ok: false, tooLong: true };
    try { return { ok: true, value: Number(BigInt.asIntN(32, BigInt(value))) }; }
    catch { return { ok: false }; }
  }

  // 3件の行いのうち、最も重い行いの行き先を基本の評価基準にします。
  function targetHell() { return Math.max(...deeds.map(d => d.targetHell)); }

  // 送り先の差と刑期を評価します。具体的な評価ルールはプレイヤーには公開しません。
  function evaluate(hell, years) {
    const targets = deeds.map(d => Number(d.targetHell) || 0).sort((a, b) => b - a);
    const target = targets[0] ?? 0;
    const lesserDeedsSum = (targets[1] || 0) + (targets[2] || 0);
    const gap = hell - target;
    const heaven = hell === 0;
    const cap = heaven ? null : C.hellCaps[hell - 1];
    const returnToLife = !heaven && years <= 0;
    // 0年以下は極端に軽い、上限年数以上は極端に重い扱いです。
    const tooShort = !heaven && years <= 0;
    const tooLong = !heaven && years >= cap;
    const slightGap = C.hellJudgementTolerance + 1;
    const hasHeavySupportingDeeds = lesserDeedsSum >= C.judgementBalanceThreshold;

    // 地獄の選択そのものに対する評価を先に決めます。
    let tooLightByGround = gap <= -(slightGap + 1);
    let slightlyLightByGround = gap === -slightGap || (gap === -1 && hasHeavySupportingDeeds);
    const tooHarshByGround = gap >= slightGap + 1;
    const slightlyHarshByGround = gap === slightGap || (gap === 1 && !hasHeavySupportingDeeds);

    let judgementLabel = tooShort ? '極端に軽い'
      : tooLong ? '極端に重い'
      : tooLightByGround ? '極端に軽い'
      : slightlyLightByGround ? '少し軽い'
      : tooHarshByGround ? '極端に重い'
      : slightlyHarshByGround ? '少し重い'
      : '妥当';

    // 刑期が上限の10%以下なら、妥当→少し軽い、少し軽い→極端に軽いへ変更します。
    // 少し重い以上、または既に極端に軽い場合は追加変更しません。
    const shortTermThreshold = heaven ? null : Math.floor(cap * 0.1);
    const shortTermAdjusted = !heaven && years > 0 && years <= shortTermThreshold
      && (judgementLabel === '妥当' || judgementLabel === '少し軽い');
    if (shortTermAdjusted) {
      if (judgementLabel === '妥当') {
        judgementLabel = '少し軽い';
        slightlyLightByGround = true;
      } else {
        judgementLabel = '極端に軽い';
        slightlyLightByGround = false;
        tooLightByGround = true;
      }
    }

    const tooLight = judgementLabel === '極端に軽い';
    const tooHarsh = judgementLabel === '極端に重い';
    return {
      target, lesserDeedsSum, gap, heaven, cap, returnToLife, tooShort, tooLong,
      tooLightByGround, slightlyLightByGround, tooHarshByGround, slightlyHarshByGround,
      extremeLight: tooLight, extremeHarsh: tooHarsh, judgementLabel,
      shortTermThreshold, shortTermAdjusted,
      stayPeriods: heaven || returnToLife ? 0 : stayPeriodsForHell(hell, shortTermAdjusted)
    };
  }

  function recordReturnToLife() {
    state.periodReturnCount++;
    state.totalReturnCount++;
  }

  function reactionFor(evaluation, years, hell) {
    if (evaluation.returnToLife) return pick(CONTENT.reactions.returnedToLife);
    if (evaluation.extremeHarsh) return pick(CONTENT.reactions.extremeHarsh);
    if (evaluation.extremeLight) return pick(evaluation.tooShort ? CONTENT.reactions.extremeTermLight : CONTENT.reactions.extremeLight);
    if (evaluation.slightlyLightByGround) return pick(CONTENT.reactions.slightLight);
    if (evaluation.slightlyHarshByGround) return pick(CONTENT.reactions.slightHarsh);
    if (hell === 0) return pick(CONTENT.reactions.heaven);
    return pick(CONTENT.reactions.appropriate);
  }

  function makeAiComment(evaluation, hell) {
    // コメントは1つの文として選び、別々の説明文を連結しないようにします。
    if (evaluation.returnToLife) return pick(AI.returnToLife);
    if (evaluation.shortTermAdjusted && evaluation.judgementLabel === '極端に軽い') return pick(AI.shortTermExtreme);
    if (evaluation.shortTermAdjusted) return pick(AI.shortTermSlight);
    if (evaluation.tooShort) return pick(AI.extremeTermLight);
    if (evaluation.tooLong) return pick(AI.extremeTermHarsh);
    if (evaluation.tooLightByGround) return pick(AI.extremeLight);
    if (evaluation.tooHarshByGround) return pick(AI.extremeHarsh);
    if (evaluation.slightlyLightByGround) return pick(AI.slightLight);
    if (evaluation.slightlyHarshByGround) return pick(AI.slightHarsh);
    if (hell === 0) return pick(AI.heaven);
    return pick(AI.normal);
  }

  // 判決を確定し、収容・現世への返還・獄卒の信頼・履歴をまとめて更新します。
  function judge(hell, rawYears) {
    if (verdictDone) return { ok: false, reason: 'already-judged' };
    let years = 0;
    if (hell === 0) {
      // 天国には刑期を設定しません。0年判決（現世へ戻る）とは区別します。
      years = 0;
    } else {
      const parsed = parseInt32(rawYears);
      if (!parsed.ok) return { ok: false, reason: parsed.tooLong ? 'too-long' : 'invalid' };
      years = parsed.value;
    }

    const ev = evaluate(hell, years);

    if (ev.returnToLife) {
      recordReturnToLife();
    } else if (hell > 0 && years > 0) {
      // 地獄が妥当でなくても、正の刑期なら選択された地獄に収容されます。
      state.hellInmates[hell - 1].push({
        termYears: years,
        remainingStayPeriods: ev.stayPeriods,
        name: ghost.name
      });
    }

    let penalty = 0;
    if (ev.returnToLife) penalty += C.penaltyNegativeTerm;
    else if (ev.tooShort) penalty += C.penaltyTooShort;
    if (ev.tooLightByGround) penalty += C.penaltyTooLightHell;
    if (ev.tooHarshByGround) penalty += C.penaltyTooHarsh;
    if (ev.tooLong) penalty += C.penaltyTooHarsh;
    if (penalty > 0) state.appeal -= penalty;
    if (ev.extremeLight || ev.extremeHarsh) state.periodSevere++;
    if (ev.judgementLabel.includes('軽い')) state.periodLight++;
    if (Math.abs(ev.gap) >= C.hellJudgementTolerance + 1 || ev.shortTermAdjusted) state.periodMismatch++;

    // 新しく見た行いだけを先頭へ追加します。再登場した行いの位置は変えません。
    const newlySeen = deeds.filter(deed => !state.collection.includes(deed.id)).map(deed => deed.id);
    state.collection = [...newlySeen, ...state.collection];
    EnmaStorage.setCollection(state.mode, state.collection);

    lastAiText = makeAiComment(ev, hell);
    const standardReaction = reactionFor(ev, years, hell);
    const reaction = ghost?.specialReaction && !ev.extremeLight && !ev.extremeHarsh && !ev.returnToLife
      ? ghost.specialReaction : standardReaction;
    lastVerdict = { hell, years, reaction, aiText: lastAiText, returnedToLife: ev.returnToLife };
    // 判決履歴には、実際にプレイヤーへ表示された情報だけを保存します。
    // 判定の内部基準や隠し評価に関する情報は履歴画面へ出しません。
    state.history.push({
      period: state.period, caseNumber: state.caseIndex + 1, ghostName: ghost?.name || '亡者',
      hell, years, deeds: deeds.map(d => d.id), reaction, aiText: lastAiText
    });
    verdictDone = true;
    saveActive();
    return { ok: true, years, hell, evaluation: ev, aiText: lastAiText, reaction, gameOver: gameOverReason() };
  }

  // 結果ポップアップの「次の亡者へ」から呼ばれ、次の裁判または期末画面へ進みます。
  function advanceCase() {
    if (!verdictDone) return { review: false };
    const over = gameOverReason();
    if (over) return { gameOver: over };
    state.caseIndex++;
    if (state.caseIndex >= state.periodCases) { saveActive(); return { event: true }; }
    createGhost();
    saveActive();
    return { review: false };
  }

  // 期末画面用の混雑状況。人数は内部計算だけに使い、画面には割合ゲージと状態名を出します。
  function capacityStatus(index) {
    const count = state.hellInmates[index].length;
    const capacity = Math.max(1, C.hellCapacity[index] + (state.hellCapacityAdjustments?.[index] || 0));
    const ratio = count / capacity;
    let label = '余裕あり';
    if (ratio >= 1) label = '収容限界';
    else if (ratio >= C.capacityWarningRatio) label = 'かなり混雑';
    else if (ratio >= 0.4) label = 'やや混雑';
    return { count, capacity, ratio: Math.min(1, ratio), label };
  }

  function gameOverReason() {
    const full = state.hellInmates.findIndex((list, i) => list.length > Math.max(1, C.hellCapacity[i] + (state.hellCapacityAdjustments?.[i] || 0)));
    if (full >= 0) return {
      id: 'hell_capacity', title: `${H[full + 1]}の収容限界を超えました`,
      reason: `${H[full + 1]}に亡者が集中し、これ以上の受け入れができなくなりました。獄卒から緊急報告が届いています。`,
      ai: '施設の拡張申請は提出しましたが、決裁が間に合いませんでした。'
    };
    if (state.totalReturnCount >= C.maxReturnedSouls) return {
      id: 'return_count', title: '現世への帰還者が増えすぎました',
      reason: `現世へ戻った亡者が累計${C.maxReturnedSouls}人に達しました。地獄庁として見過ごせない状況になっています。`,
      ai: '現世への帰還手続きが想定を超えています。報告書の束が机から崩れ落ちました。'
    };
    if (state.appeal <= C.appealGameOver) return {
      id: 'staff_appeal', title: '獄卒たちの信頼を失いました',
      reason: '極端な判決が続き、獄卒たちの不満が限界に達しました。ついに裁判所は機能を停止してしまいました。',
      ai: '獄卒の皆さんが全員、休憩室に集まっています。私ひとりでは裁判を続けられません。'
    };
    return null;
  }

  function mood() {
    if (state.appeal >= 75) return '落ち着いている';
    if (state.appeal >= 45) return '少し不満がある';
    if (state.appeal >= 20) return '不満が広がっている';
    return '深刻な状態';
  }

  function staffEvaluation() {
    if (state.appeal >= 80 && state.periodSevere <= 1) {
      return { label: '高評価', text: '獄卒たちから、今期は安定していたとの声が届いています。大王への信頼も厚いようです。' };
    }
    if (state.appeal >= 60) {
      return { label: 'おおむね良好', text: '大きな不満は出ていません。何人かの獄卒から細かな改善要望が届いています。' };
    }
    if (state.appeal >= 35) {
      return { label: 'やや不満', text: '判決の基準について、獄卒の間で意見が分かれています。次の期の様子を見たいとのことです。' };
    }
    return { label: '不信感が強い', text: '獄卒たちは大王の判断に不安を感じています。説明や対話の機会を設けてほしいようです。' };
  }

  // イベント文章と選択肢は、編集しやすいよう content.js に分離しています。

  function ensurePeriodStaffEvent() {
    if (!state.periodStaffEvent) {
      const template = pick(CONTENT.staffEvents);
      state.periodStaffEvent = { ...clone(template), selectedChoice: null, reaction: '', result: '' };
      saveActive();
    }
    return state.periodStaffEvent;
  }

  // 選択は1期につき1回だけ適用し、選択後の獄卒の反応もセーブします。
  function choosePeriodStaffEvent(choiceIndex) {
    const event = ensurePeriodStaffEvent();
    if (event.selectedChoice !== null) return { ok: false, event };
    const choice = event.choices[Number(choiceIndex)];
    if (!choice) return { ok: false, event };

    const appealBefore = state.appeal;
    state.appeal = Math.max(0, Math.min(100, state.appeal + (choice.appeal || 0)));
    const appealDelta = state.appeal - appealBefore;
    let capacityDelta = 0;
    if (Number.isInteger(choice.hellIndex) && Number.isFinite(choice.capacity)) {
      const index = choice.hellIndex;
      const before = state.hellCapacityAdjustments[index] || 0;
      const after = Math.max(-2, Math.min(2, before + choice.capacity));
      state.hellCapacityAdjustments[index] = after;
      capacityDelta = after - before;
    }

    event.selectedChoice = Number(choiceIndex);
    event.reaction = choice.reaction;
    event.result = choice.result;
    event.effectSummary = [
      appealDelta >= 4 ? '獄卒の求心力が大きく上昇しました。' : appealDelta > 0 ? '獄卒の求心力が少し上昇しました。' : appealDelta <= -4 ? '獄卒の求心力が大きく低下しました。' : appealDelta < 0 ? '獄卒の求心力が少し低下しました。' : '',
      capacityDelta !== 0 ? `${H[choice.hellIndex + 1]}の収容余力が${Math.abs(capacityDelta) >= 2 ? '大きく' : '少し'}${capacityDelta > 0 ? '改善' : '低下'}しました。` : ''
    ].filter(Boolean).join(' ');
    if (!event.effectSummary) event.effectSummary = '求心力や地獄の状況に大きな変化はありませんでした。';
    // イベントごとに専用コメントが設定されている場合はそちらを優先します。
    // 既存イベントなど専用コメントがない場合は、効果に応じた共通コメントを表示します。
    event.aiComment = choice.aiComment || (appealDelta >= 3 ? pick(CONTENT.ai.eventChoice.positive)
      : appealDelta <= -2 ? pick(CONTENT.ai.eventChoice.negative)
      : capacityDelta !== 0 ? pick(CONTENT.ai.eventChoice.capacity)
      : pick(CONTENT.ai.eventChoice.neutral));
    saveActive();
    return { ok: true, event, gameOver: gameOverReason() };
  }

  function reviewData() {
    const counts = state.hellInmates.map(list => list.length);
    const near = counts.some((count, i) => count / Math.max(1, C.hellCapacity[i] + (state.hellCapacityAdjustments?.[i] || 0)) >= C.capacityWarningRatio);
    let ai = pick(CONTENT.ai.review.balanced);
    if (near) ai = pick(CONTENT.ai.review.crowded);
    else if (state.appeal < 45) ai = pick(CONTENT.ai.review.lowAppeal);
    else if (state.periodSevere >= 4) ai = pick(CONTENT.ai.review.severe);

    return { ai, mood: mood(), counts, near, staff: staffEvaluation() };
  }

  // 期が切り替わるたびに混雑計算用の残り滞在期数を1つ進めます。
  // 判決として記録した刑期年数（termYears）は書き換えません。
  function advanceTime() {
    for (const list of state.hellInmates) {
      for (const inmate of list) inmate.remainingStayPeriods -= 1;
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i].remainingStayPeriods <= 0) list.splice(i, 1);
      }
    }
  }

  function finishPeriod() {
    advanceTime();
    if (state.period === C.clearPeriod && !state.cleared) {
      state.cleared = true;
      saveActive();
      return { ending: true, endingId: 'clear' };
    }
    state.period++;
    beginPeriod();
    return { ending: false };
  }

  function continueAfterClear() {
    state.period++;
    state.cleared = false;
    beginPeriod();
  }

  // 手動セーブ枠。画面名も保存するため、ロード後に同じ画面へ戻せます。
  function saveSlot(index, page) {
    const saves = EnmaStorage.getSaves(state.mode);
    saves[index] = { savedAt: new Date().toISOString(), page, state: clone(state), context: getContext() };
    return EnmaStorage.setSaves(state.mode, saves);
  }

  function loadSlot(mode, index) {
    const saves = EnmaStorage.getSaves(mode);
    const slot = saves[index];
    // この版で作成したデータだけを読み込みます。旧版データの変換・補正は行いません。
    if (!slot?.state || slot.state.mode !== mode) return null;
    state = slot.state;
    setContext(slot.context);
    saveActive();
    return { page: slot.page, period: state.period };
  }

  // 振り返り画面に到達するたび、専用の1枠を最新状態で上書きします。
  function saveAutoSave() {
    if (!state) return false;
    return EnmaStorage.setAutoSave(state.mode, { savedAt: new Date().toISOString(), page: 'review', state: clone(state), context: getContext() });
  }

  function loadAutoSave(mode) {
    const slot = EnmaStorage.getAutoSave(mode);
    if (!slot?.state || slot.state.mode !== mode) return null;
    state = slot.state;
    setContext(slot.context);
    saveActive();
    return { page: slot.page || 'review', period: state.period };
  }

  // 就任手続きで設定した名前はセーブデータに含め、画面をまたいで引き継ぎます。
  function setRulerName(name) {
    if (!state) return false;
    state.rulerName = String(name || '').trim() || '閻魔大王';
    return saveActive();
  }

  function setRulerAvatar(avatarId) {
    if (!state || !EnmaStorage.getUnlockedAvatars().includes(avatarId)) return false;
    state.rulerAvatar = avatarId;
    return saveActive();
  }

  // 簡易説明はゲームごとに一度だけ閉じた状態を保存します。
  function dismissTutorial(type) {
    if (!state) return;
    if (type === 'court') state.courtTutorialDismissed = true;
    if (type === 'review') state.reviewTutorialDismissed = true;
    if (type === 'event') state.eventTutorialDismissed = true;
    saveActive();
  }

  function clearAndReturnTitle() {
    state = null; ghost = null; deeds = []; verdictDone = false; lastAiText = ''; lastVerdict = null;
  }

  function loadActive(mode) {
    const active = EnmaStorage.getActive(mode);
    if (!active?.state || active.state.mode !== mode) return false;
    state = active.state;
    setContext(active.context);
    return true;
  }

  function contextForSave(page) { return { page, ...getContext() }; }
  function setFromActiveContext(context) { setContext(context || {}); }

  return {
    newGame, beginPeriod, createGhost, advanceCase, judge, parseInt32, evaluate, targetHell, stayPeriodsForHell, setRulerName, setRulerAvatar, dismissTutorial,
    gameOverReason, reviewData, capacityStatus, ensurePeriodStaffEvent, choosePeriodStaffEvent, finishPeriod, continueAfterClear,
    saveActive, saveSlot, loadSlot, saveAutoSave, loadAutoSave, loadActive, getContext, setContext,
    setFromActiveContext, contextForSave,
    get state() { return state; }, get ghost() { return ghost; }, get deeds() { return deeds; },
    get verdictDone() { return verdictDone; }, get lastAiText() { return lastAiText; },
    get lastVerdict() { return lastVerdict; }, set lastAiText(value) { lastAiText = value; },
    clearAndReturnTitle, escapeHtml: esc
  };
})();
