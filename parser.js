"use strict";

const Token = require("./lexer").Token;
const LexerTokenType = require("./lexer").LexerTokenType;

const operatorPrecedence = {
	"|": 0,
	".": 1,
	"*": 2
};

class Node {
	/**
	 * 
	 * @param {Token} val 
	 */
	constructor(val) {
		this.val = val;
		/**
		 * @type {Node}
		 */
		this.left = null;
		/**
		 * @type {Node}
		 */
		this.right = null;
	}

	/**
	 * @returns {boolean}
	 */
	isLeaf() {
		return this.left == null && this.right == null;
	}
}

/**
 * 
 * @param {[Token]} tokens 
 * @param {number} start
 * @param {number} end
 * @returns {Node}
 */
function tokensToAST(tokens, start, end) {
	if (!tokens || !Array.isArray(tokens) || tokens.length == 0) {
		return null;
	}

	if (start >= end) {
		return null;
	}

	if (start + 1 == end) {
		return new Node(tokens[start]);
	}

	let insideOfParenthesis = 0;
	/**
	 * @type {Token}
	 */
	let tok = null;
	/**
	 * @type {number}
	 */
	let idx = null;

	for (let i = start; i < end; ++i) {
		let token = tokens[i];
		let tokenType = token.tokenType;
		if (tokenType == LexerTokenType.LEFTPARENTHESIS) {
			insideOfParenthesis++;
		} else if (tokenType == LexerTokenType.RIGHTPARENTHESIS) {
			insideOfParenthesis--;
		} else if (tokenType == LexerTokenType.UNION ||
			tokenType == LexerTokenType.CONCATENATION ||
			tokenType == LexerTokenType.CLOSURE) {
			if (insideOfParenthesis == 0) {
				if (tok == null) {
					tok = token;
					idx = i;
				} else {
					if (operatorPrecedence[token.content] >= operatorPrecedence[tok.content]) {
						tok = token;
						idx = i;
					}
				}
			}
		}
	}

	if (tok == null) {
		return tokensToAST(tokens, start + 1, end - 1);
	}

	let element = new Node(tok);
	element.left = tokensToAST(tokens, start, idx);
	element.right = tokensToAST(tokens, idx + 1, end);

	return element;
}

module.exports = {
	tokensToAST: tokensToAST,
	Node: Node
};