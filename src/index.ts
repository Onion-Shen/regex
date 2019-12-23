import { getRegexTokens } from "./lexer";
import { tokensToAST } from "./parser";
import { astToNFA, NFA } from "./NFA";

class Regex {
    pattern: string;
    nfa: NFA | null = null;

    constructor(pattern: string) {
        this.pattern = pattern;
    }

    public compile(): boolean {
        if (this.pattern == null ||
            typeof (this.pattern) !== "string" ||
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

        return true;
    }

    public search(target: string): boolean {
        if (this.nfa == null) {
            return false;
        }
        return this.nfa.search(target);
    }
}

export {
    Regex
}