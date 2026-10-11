// Logic module skeleton (the canonical copy lives in the prototype skill; when generating, copy it and replace the {{...}} placeholders).
// Conventions in STATE-MACHINE.md: zero I/O, zero DOM, the panel depends on this one way; JSDoc keeps the types (checkable by TS, liftable into real code).
// Under file://, ES module imports are blocked by CORS, so the module hangs off window instead of exporting.

/** @typedef {{{STATUS_UNION}}} Status */
/** @typedef {{{FAIL_REASON_UNION}}} FailReason */
/**
 * @typedef {Object} {{STATE_TYPE}}
 * @property {Status} status
 * @property {string|null} illegal the last illegal event that was rejected (silently ignored in reality; surfaced in the prototype so the driver sees "the wrong path was blocked")
 * {{EXTRA_STATE_FIELDS}}
 */
/**
 * @typedef {{{ACTION_UNION}}} Action
 */

/** The set of terminal states: defined only here; consumers reference it instead of copying a literal array @type {ReadonlySet<Status>} */
const TERMINAL = new Set([{{TERMINAL_STATES}}]);

/**
 * Entry: produce the initial state. The empty state is expressed by the panel as null and never enters this function.
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
 * The single source of the rules. An illegal event does not throw — it returns the unchanged state with an illegal reason (silently ignored in reality).
 * @param {{{STATE_TYPE}}} s
 * @param {Action} a
 * @returns {{{STATE_TYPE}}}
 */
function reduce(s, a) {
  /** @param {string} why */
  const deny = (why) => ({ ...s, illegal: `${a.type} ignored: ${why}` });
  /** @param {Partial<{{STATE_TYPE}}>} patch */
  const ok = (patch) => ({ ...s, illegal: null, ...patch });

  if (TERMINAL.has(s.status)) return deny('already in a terminal state; in reality the event is silently ignored');

  switch (a.type) {
    {{TRANSITIONS}}
    default:
      return deny('unknown event');
  }
}

/** One representative sample per event type (used only by the reachability query; the parameters do not affect legality) @type {Action[]} */
const ALL_ACTIONS = [
  {{ALL_ACTIONS}}
];

/**
 * Admission query: which events are legal in the current state, with a reason for each illegal one.
 * **The rules are not rewritten** — every event is tried through reduce, and one that is denied is illegal. The rules live only in reduce.
 * @param {{{STATE_TYPE}}|null} s null = the empty state (no entity being driven): every event is illegal; the only way out is entry
 * @returns {Record<string,{legal:boolean, why:string|null}>} keyed by action.type
 */
function legal(s) {
  /** @type {Record<string,{legal:boolean, why:string|null}>} */
  const out = {};
  for (const a of ALL_ACTIONS) {
    if (s === null) {
      out[a.type] = { legal: false, why: 'empty state: no entity yet, enter first' };
      continue;
    }
    const next = reduce(s, a);
    out[a.type] = next.illegal
      ? { legal: false, why: next.illegal.replace(/^\S+ ignored: /, '') }
      : { legal: true, why: null };
  }
  return out;
}

window.StateMachine = { initial, reduce, legal, ALL_ACTIONS, TERMINAL };
