import { Node } from "./parser";
import { LexerTokenType } from "./lexer";

class State {
    end: boolean;
    transition: Map<string, State>;
    epsilonTransitions: Array<State>;

    constructor(end: boolean) {
        this.end = end;
        this.transition = new Map<string, State>();
        this.epsilonTransitions = new Array<State>();
    }

    addEpsilonTransition(to: State) {
        this.epsilonTransitions.push(to);
    }

    addTransition(to: State, symbol: string) {
        this.transition.set(symbol, to);
    }
}

class NFA {
    start: State;
    end: State;

    constructor(start: State, end: State) {
        this.start = start;
        this.end = end;
    }

    search(target: string): boolean {
        if (target == null || typeof (target) !== "string") {
            return false;
        }

        return this.DFS(this.start, target, 0);
    }

    DFS(source: State, target: string, index: number): boolean {
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

function fromSymbol(symbol: string): NFA {
    const start = new State(false);
    const end = new State(true);
    start.addTransition(end, symbol);
    return new NFA(start, end);
}

function concat(first: NFA | null, second: NFA | null): NFA | null {
    if (first == null) {
        return second;
    } else if (second == null) {
        return first;
    }

    first.end.addEpsilonTransition(second.start);
    first.end.end = false;
    return new NFA(first.start, second.end);
}

function union(first: NFA | null, second: NFA | null): NFA | null {
    if (first == null || second == null) {
        return null;
    }

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

function closure(nfa: NFA | null): NFA | null {
    if (nfa == null) {
        return null;
    }

    const start = new State(false);
    const end = new State(true);

    start.addEpsilonTransition(end);
    start.addEpsilonTransition(nfa.start);

    nfa.end.addEpsilonTransition(end);
    nfa.end.addEpsilonTransition(nfa.start);
    nfa.end.end = false;

    return new NFA(start, end);
}

function astToNFA(root: Node): NFA | null {
    if (root == null || root.val == null || root.val.content == null) {
        return null;
    }

    if (root.isLeaf()) {
        return fromSymbol(root.val.content);
    }

    let left: NFA | null = null;
    if (root.left) {
        left = astToNFA(root.left);
    }

    let right: NFA | null = null;
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

export {
    astToNFA,
    NFA,
    State
}