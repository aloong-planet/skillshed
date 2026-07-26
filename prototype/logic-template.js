// 逻辑模块骨架(正本在 prototype skill;生成时复制并替换 {{...}} 占位)。
// 约定见 STATE-MACHINE.md:零 I/O、零 DOM、面板单向依赖;JSDoc 保留类型(可被 TS 检查、可提升进真代码)。
// file:// 下 ES module import 受 CORS 限制,故挂 window 而非 export。

/** @typedef {{{STATUS_UNION}}} Status */
/** @typedef {{{FAIL_REASON_UNION}}} FailReason */
/**
 * @typedef {Object} {{STATE_TYPE}}
 * @property {Status} status
 * @property {string|null} illegal 上一个被拒绝的非法事件(现实中静默忽略;原型里外显,供驾驶者看见"歪路被挡")
 * {{EXTRA_STATE_FIELDS}}
 */
/**
 * @typedef {{{ACTION_UNION}}} Action
 */

/** 终态集合:只此一处定义,消费方引用它,不抄字面量数组 @type {ReadonlySet<Status>} */
const TERMINAL = new Set([{{TERMINAL_STATES}}]);

/**
 * 入场:产出初态。空态由面板用 null 表达,不进本函数。
 * @param {{{INITIAL_PARAMS}}}
 * @returns {{{STATE_TYPE}}}
 */
function initial({{INITIAL_ARGS}}) {
  return {
    status: {{INITIAL_STATUS}},
    illegal: null
    {{INITIAL_EXTRA}}
  };
}

/**
 * 唯一的规则出处。非法事件不抛异常——返回带 illegal 原因的原状态(现实中静默忽略)。
 * @param {{{STATE_TYPE}}} s
 * @param {Action} a
 * @returns {{{STATE_TYPE}}}
 */
function reduce(s, a) {
  /** @param {string} why */
  const deny = (why) => ({ ...s, illegal: `${a.type} 被忽略:${why}` });
  /** @param {Partial<{{STATE_TYPE}}>} patch */
  const ok = (patch) => ({ ...s, illegal: null, ...patch });

  if (TERMINAL.has(s.status)) return deny('已是终态,现实中该事件被静默忽略');

  switch (a.type) {
    {{TRANSITIONS}}
    default:
      return deny('未知事件');
  }
}

/** 每种事件的代表样例(仅用于可达性查询;参数不影响合法性判断) @type {Action[]} */
const ALL_ACTIONS = [
  {{ALL_ACTIONS}}
];

/**
 * 准入条件查询:当前状态下哪些事件合法,非法者附原因。
 * **不重写规则**——对每个事件试跑 reduce,被 deny 即非法。规则永远只有 reduce 一处。
 * @param {{{STATE_TYPE}}|null} s null = 空态(无实体在驾驶):一切事件非法,唯一出路是入场
 * @returns {Record<string,{legal:boolean, why:string|null}>} 以 action.type 为键
 */
function legal(s) {
  /** @type {Record<string,{legal:boolean, why:string|null}>} */
  const out = {};
  for (const a of ALL_ACTIONS) {
    if (s === null) {
      out[a.type] = { legal: false, why: '空态:还没有实体,先入场' };
      continue;
    }
    const next = reduce(s, a);
    out[a.type] = next.illegal
      ? { legal: false, why: next.illegal.replace(/^\S+ 被忽略:/, '') }
      : { legal: true, why: null };
  }
  return out;
}

window.StateMachine = { initial, reduce, legal, ALL_ACTIONS, TERMINAL };
