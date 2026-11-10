/*
 * ゲーム全体の調整値です。
 * 難易度や進行ペースを変更したい場合は、まずこのファイルの数値を調整してください。
 */
window.EnmaConfig = {
  // 1期あたりの裁判数と、クリアまでの期数
  casesPerPeriod: 5,
  clearPeriod: 5,
  // 基本滞在期間は地獄ごとに固定します。第一地獄2期～第八地獄9期です。
  baseStayPeriodsByHell: [2, 3, 4, 5, 6, 7, 8, 9],

  // 現世へ戻った亡者の累計がこの人数に達するとゲームオーバー
  maxReturnedSouls: 8,

  // 地獄番号は1～8。0は天国です。配列の順番は第一～第八地獄に対応します。
  hellCaps: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000],
  // 深い地獄ほど滞在期間が長いため、受け入れ人数にも段階的な余裕を持たせます。
  hellCapacity: [10, 12, 14, 16, 18, 20, 22, 24],
  hellJudgementTolerance: 1, // 大きな差の判定に使う許容差
  judgementBalanceThreshold: 5, // 3件のうち軽い2件の行き先番号の合計による補正境界
  capacityWarningRatio: 0.75, // この割合以上で「かなり混雑」と表示します。

  // 閻魔大王への獄卒の信頼と、極端な判決による減点
  appealStart: 100,
  appealGameOver: 0,
  penaltyNegativeTerm: 12,
  penaltyTooHarsh: 7,
  penaltyTooShort: 7,
  penaltyTooLightHell: 7,

  // セーブ・出現率・刑期入力の安全上限
  saveSlots: 3,
  namedNpcChance: 0.05,
  maxInputDigits: 1000
};

// 0番目を天国として、地獄の選択肢にも同じ配列を使います。
window.EnmaHellNames = ['天国','第一地獄','第二地獄','第三地獄','第四地獄','第五地獄','第六地獄','第七地獄','第八地獄'];

// エンディングの記録と、初回到達時に解禁するアバターの対応表です。
window.EnmaEndingCatalog = [
  { id: 'clear', title: '任期満了', description: '最初の5期の裁判を終え、任期を満了した。', avatar: 'green' },
  { id: 'hell_capacity', title: '地獄の収容限界', description: 'いずれかの地獄が収容限界を超えた。', avatar: 'yellow' },
  { id: 'return_count', title: '現世への帰還者増加', description: '現世へ戻った亡者が増え、地獄庁の運営に影響が出た。', avatar: 'blue' },
  { id: 'staff_appeal', title: '獄卒の信頼喪失', description: '獄卒たちの信頼を失い、裁判所が機能を停止した。', avatar: 'purple' }
];
