import { Token, LexerTokenType } from "./lexer";

const operatorPrecedence: { [key: string]: number } = {
    "|": 0,
    ".": 1,
    "*": 2
};

class Node {
    val: Token;
    left: Node | null;
    right: Node | null;

    constructor(val: Token) {
        this.val = val;
        this.left = null;
        this.right = null;
    }

    isLeaf(): boolean {
        return this.left == null && this.right == null;
    }
}

function tokensToAST(tokens: Array<Token>, start: number, end: number): Node | null {
    if (tokens == null || !Array.isArray(tokens) || tokens.length == 0) {
        return null;
    }

    if (start >= end) {
        return null;
    }

    if (start + 1 == end) {
        return new Node(tokens[start]);
    }

    let insideOfParenthesis = 0;
    let tok: Token | null = null;
    let idx: number | null = null;

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

    if (idx == null) {
        return null;
    }

    let element = new Node(tok);
    element.left = tokensToAST(tokens, start, idx);
    element.right = tokensToAST(tokens, idx + 1, end);
    return element;
}

export {
    tokensToAST,
    Node
}