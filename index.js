"use strict";

const getRegexTokens = require("./lexer").getRegexTokens;
const tokensToAST = require("./parser").tokensToAST;
const { astToNFA, NFA } = require("./NFA");

class Regex {
	/**
     * 
     * @param {string} pattern 
     */
    constructor(pattern) {
        this.pattern = pattern;
		/**
         * @type {NFA}
         */
        this.nfa = null;
        this.compile();
    }

    compile() {
        if (this.pattern == null ||
            typeof (this.pattern) != "string" ||
            this.pattern.length == 0) {
            return false;
        }

        let tokens = getRegexTokens(this.pattern);
        if (tokens == null || tokens.length == 0) {
            return false;
        }

        let ast = tokensToAST(tokens, 0, tokens.length);
        if (ast == null) {
            return false;
        }

        let nfa = astToNFA(ast);
        if (nfa == null) {
            return false;
        }

        this.nfa = nfa;
    }

	/**
     * 
     * @param {string} target
     * @returns {boolean} 
     */
    search(target) {
        if (this.nfa == null) {
            return false;
        }
        return this.nfa.search(target);
    }
}