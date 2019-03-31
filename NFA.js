"use strict";

const Node = require("./parser").Node;
const LexerTokenType = require("./lexer").LexerTokenType;

class State {
	/**
     * 
     * @param {boolean} end 
     */
	constructor(end) {
		this.end = end;
		/**
         * @type {Map<string,State>}
         */
		this.transition = new Map();
		/**
         * @type {Array<State>}
         */
		this.epsilonTransitions = [];
	}

	/**
     * 
     * @param {State} to 
     */
	addEpsilonTransition(to) {
		this.epsilonTransitions.push(to);
	}

	/**
     * 
     * @param {State} to 
     * @param {string} symbol 
     */
	addTransition(to, symbol) {
		this.transition.set(symbol, to);
	}
}

class NFA {
	/**
	 * 
	 * @param {State} start 
	 * @param {State} end 
	 */
	constructor(start, end) {
		/**
		 * @type {State}
		 */
		this.start = start;
		/**
		 * @type {State}
		 */
		this.end = end;
	}

	/**
	 * 
	 * @param {string} target
	 * @returns {boolean} 
	 */
	search(target) {
		if (target == null || typeof (target) != "string") {
			return false;
		}

		return this.DFS(this.start, target, 0);
	}

	/**
	 * 
	 * @param {State} source  
	 * @param {string} target 
	 * @param {number} index 
	 * @returns {boolean}
	 */
	DFS(source, target, index) {
		if (index >= target.length) {
			for (let epsilonState of source.epsilonTransitions) {
				if (epsilonState.end) {
					return true;
				}

				let match = this.DFS(epsilonState, target, index);
				if (match) {
					return true;
				}
			}

			return false;
		}

		const state = source.transition.get(target[index]);
		if (state) {
			if (state.end) {
				return true;
			}

			return this.DFS(state, target, index + 1);
		}

		for (let epsilonState of source.epsilonTransitions) {
			if (epsilonState.end) {
				return true;
			}

			let match = this.DFS(epsilonState, target, index);
			if (match) {
				return true;
			}
		}

		return false;
	}
}

/**
 * 
 * @param {string} symbol 
 * @returns {NFA}
 */
function fromSymbol(symbol) {
	const start = new State(false);
	const end = new State(true);
	start.addTransition(end, symbol);
	return new NFA(start, end);
}

/**
 * 
 * @param {NFA} first 
 * @param {NFA} second 
 * @returns {NFA}
 */
function concat(first, second) {
	first.end.addEpsilonTransition(second.start);
	first.end.end = false;
	return new NFA(first.start, second.end);
}

/**
 * 
 * @param {NFA} first 
 * @param {NFA} second 
 * @returns {NFA}
 */
function union(first, second) {
	const start = new State(false);
	start.addEpsilonTransition(first.start);
	start.addEpsilonTransition(second.start);

	const end = new State(true);
	first.end.addEpsilonTransition(end);
	first.end.end = false;
	second.end.addEpsilonTransition(end);
	second.end.end = false;

	return new NFA(start, end);
}

/**
 * 
 * @param {NFA} nfa 
 * @returns {NFA}
 */
function closure(nfa) {
	const start = new State(false);
	const end = new State(true);

	start.addEpsilonTransition(end);
	start.addEpsilonTransition(nfa.start);

	nfa.end.addEpsilonTransition(end);
	nfa.end.addEpsilonTransition(nfa.start);
	nfa.end.end = false;

	return new NFA(start, end);
}

/**
 * 
 * @param {Node} root 
 * @returns {NFA}
 */
function astToNFA(root) {
	if (root == null || root.val == null || root.val.content == null) {
		return null;
	}

	if (root.isLeaf()) {
		return fromSymbol(root.val.content);
	}

	/**
	 * @type {NFA}
	 */
	let left = null;
	if (root.left) {
		left = astToNFA(root.left);
	}

	/**
	 * @type {NFA}
	 */
	let right = null;
	if (root.right) {
		right = astToNFA(root.right);
	}

	let tokenType = root.val.tokenType;
	if (tokenType == LexerTokenType.UNION) {
		return union(left, right);
	} else if (tokenType == LexerTokenType.CONCATENATION) {
		return concat(left, right);
	} else if (tokenType == LexerTokenType.CLOSURE) {
		return closure(left);
	}

	return null;
}

module.exports = {
	astToNFA: astToNFA,
	NFA: NFA,
	State: State
};