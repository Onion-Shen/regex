"use strict";

const LexerTokenType = {
	EXPR: "EXPR",
	LEFTPARENTHESIS: "LEFTPARENTHESIS",
	RIGHTPARENTHESIS: "RIGHTPARENTHESIS",
	EPSILON: "EPSILON",
	UNION: "UNION",
	CONCATENATION: "CONCATENATION",
	CLOSURE: "CLOSURE"
};

Object.freeze(LexerTokenType);

class Token {
	/**
     *
     * @param {string} content
     * @param {LexerTokenType} tokenType
     */
	constructor(content, tokenType) {
		this.content = content;
		this.tokenType = tokenType;
	}
}

/**
 *
 * @param {string} regex
 * @returns {[Token]}
 */
function getRegexTokens(regex) {
	if (regex == null || typeof (regex) !== "string") {
		return null;
	}
	let tokens = [];
	const size = regex.length;
	/**
	 * @type {Token}
	 */
	let lastTok = null;

	for (let i = 0; i < size; ++i) {
		let ch = regex[i];
		if (ch == "*") {
			let token = new Token(ch, LexerTokenType.CLOSURE);
			tokens.push(token);
		} else if (ch == "|") {
			let token = new Token(ch, LexerTokenType.UNION);
			tokens.push(token);
		} else if (ch == "(") {
			if (lastTok && lastTok.tokenType == LexerTokenType.EXPR) {
				let concat = new Token(".", LexerTokenType.CONCATENATION);
				tokens.push(concat);
			}

			let token = new Token(ch, LexerTokenType.LEFTPARENTHESIS);
			tokens.push(token);
		} else if (ch == ")") {
			let token = new Token(ch, LexerTokenType.RIGHTPARENTHESIS);
			tokens.push(token);
		} else {
			if (lastTok) {
				if (lastTok.tokenType == LexerTokenType.EXPR ||
					lastTok.tokenType == LexerTokenType.RIGHTPARENTHESIS) {
					let concat = new Token(".", LexerTokenType.CONCATENATION);
					tokens.push(concat);
				}
			}

			let token = new Token(ch, LexerTokenType.EXPR);
			tokens.push(token);
		}

		if (tokens.length > 0) {
			lastTok = tokens[tokens.length - 1];
		}
	}

	return tokens;
}

module.exports = {
	getRegexTokens: getRegexTokens,
	Token: Token,
	LexerTokenType: LexerTokenType
};