(function (root) {
  "use strict";

  const TYPES = {
    reveal: { name: "全体公開", image: "001-card-front.png", kind: "event", effect: "カードを1枚、全体公開する" },
    search: { name: "調査", image: "004-card-front.png", kind: "event", effect: "カードを3枚、自分だけ確認する" },
    extra: { name: "追加ターン", image: "005-card-front.png", kind: "event", effect: "追加で1ターンを得る" },
    skip: { name: "スキップ", image: "006-card-front.png", kind: "event", effect: "相手の次のターンをスキップする" },
    lens: { name: "透視", image: "011-card-front-01.png", kind: "item", effect: "毎ターン終了時に、カードを1枚だけ確認する" },
    shuffle: { name: "シャッフル", image: "016-card-front.png", kind: "item", effect: "場を1度だけシャッフルする" },
    alien0: { name: "赤のエイリアン", image: "001-E-card-front.png", kind: "alien" },
    alien1: { name: "青のエイリアン", image: "002-E-card-front.png", kind: "alien" },
    alien2: { name: "緑のエイリアン", image: "003-E-card-front.png", kind: "alien" },
    alien3: { name: "紫のエイリアン", image: "004-E-card-front.png", kind: "alien" }
  };
  const DECK = ["reveal", "search", "extra", "skip", "lens", "shuffle"];

  class Game {
    constructor({ random = Math.random, difficulty = "normal" } = {}) {
      this.random = random;
      this.difficulty = difficulty;
      this.newMatch();
    }

    shuffled(values) {
      const result = [...values];
      for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    }

    announce(message) {
      this.message = message;
      this.history.unshift(message);
      this.history = this.history.slice(0, 5);
    }

    newMatch() {
      this.scores = [0, 0];
      this.round = 1;
      this.prepareRound();
    }

    prepareRound() {
      this.phase = "setup";
      this.board = this.shuffled(DECK.flatMap((type) => [type, type])).map((type) => ({ type, public: false }));
      this.placement = [];
      this.cpuPlacement = [];
      this.selected = [];
      this.memory = [new Map(), new Map()];
      this.items = [new Set(), new Set()];
      this.reserve = [true, true];
      this.effect = null;
      this.extraTurn = false;
      this.lensUsed = false;
      this.cpuExposed = false;
      this.turnNumber = 0;
      this.lastPair = [];
      this.history = [];
      this.turn = 0;
      this.announce("手札の赤いカードを2枚、好きな場所へ配置してください。");
    }

    alienType(player) {
      return player === 0 ? "alien0" : "alien1";
    }

    place() {
      if (this.phase !== "setup" || this.placement.length >= 2) return null;
      const index = this.board.length;
      this.board.push({ type: this.alienType(0), public: false });
      this.placement.push(index);
      this.memory[0].set(index, this.alienType(0));
      this.message = this.placement.length === 2 ? "2枚を追加しました。「配置を終える」でCPUへ交代します。" : `あと${2 - this.placement.length}枚追加してください。`;
      return index;
    }

    startRound() {
      if (this.phase !== "setup" || this.placement.length !== 2) return false;
      this.phase = "cpuSetup";
      this.turn = 1;
      this.announce("CPUがカードを2枚追加します。");
      return true;
    }

    placeCpuAlien() {
      if (this.phase !== "cpuSetup") return null;
      const index = this.board.length;
      this.board.push({ type: this.alienType(1), public: false });
      this.cpuPlacement.push(index);
      this.memory[1].set(index, this.alienType(1));
      if (this.cpuPlacement.length < 2) {
        this.message = "CPUが残りの1枚を追加しています。";
        return index;
      }
      this.turn = 0;
      this.turnNumber = 1;
      this.phase = "turn";
      this.announce("あなたの番です。カードを2枚めくってください。");
      return index;
    }

    observe(index, viewers = [0, 1]) {
      const card = this.board[index];
      if (!card) return;
      viewers.forEach((viewer) => this.memory[viewer].set(index, card.type));
      if (viewers.includes(0) && card.type === this.alienType(1)) this.cpuExposed = true;
    }

    canFlip(index, actor) {
      return this.phase === "turn" && actor === this.turn && !!this.board[index] && !this.selected.includes(index);
    }

    flip(index, actor = 0) {
      if (!this.canFlip(index, actor)) return false;
      this.selected.push(index);
      this.observe(index);
      if (this.selected.length === 2) {
        this.phase = "resolving";
        this.message = "2枚のカードを確認しています。";
      } else {
        this.message = actor === 0 ? "もう1枚めくってください。" : "CPUが2枚目を選んでいます。";
      }
      return true;
    }

    resolve() {
      if (this.phase !== "resolving") return false;
      const [first, second] = this.selected;
      const a = this.board[first];
      const b = this.board[second];
      this.lastPair = this.selected.map((index) => ({ index, type: this.board[index].type }));
      if (a.type !== b.type) {
        this.announce(`${this.turn === 0 ? "あなた" : "CPU"}：ペアはそろいませんでした。`);
        this.finishTurn();
        return true;
      }
      const type = TYPES[a.type];
      if (type.kind === "alien") {
        const owner = a.type === this.alienType(0) ? 0 : 1;
        const winner = owner === this.turn ? 1 - this.turn : this.turn;
        this.scores[winner]++;
        this.roundWinner = winner;
        this.phase = this.scores[winner] >= 3 ? "matchEnd" : "roundEnd";
        this.announce(owner === this.turn ? `自分のエイリアンがそろいました。${winner === 0 ? "あなた" : "CPU"}に1点。` : `${winner === 0 ? "あなた" : "CPU"}が相手のエイリアンを発見。1点獲得！`);
        return true;
      }
      this.board[first] = null;
      this.board[second] = null;
      this.selected = [];
      this.memory.forEach((memory) => { memory.delete(first); memory.delete(second); });
      this.announce(`${this.turn === 0 ? "あなた" : "CPU"}が「${type.name}」を獲得。`);
      if (type.kind === "item") this.items[this.turn].add(a.type);
      if (a.type === "reveal") this.beginEffect("reveal", 1);
      else if (a.type === "search") this.beginEffect("peek", 3);
      else {
        this.extraTurn = a.type === "extra" || a.type === "skip";
        if (this.extraTurn) this.announce(a.type === "skip" ? "相手を1回スキップ。続けて同じプレイヤーの番です。" : "追加ターンを獲得しました。");
        this.finishTurn();
      }
      return true;
    }

    effectChoices() {
      return this.board.map((card, index) => index).filter((index) => this.board[index] && !this.board[index].public && !this.effect?.targets.includes(index));
    }

    beginEffect(kind, count) {
      this.effect = { kind, actor: this.turn, targets: [], remaining: count };
      this.effect.remaining = Math.min(count, this.effectChoices().length);
      if (!this.effect.remaining) {
        this.effect = null;
        this.finishTurn();
        return;
      }
      this.phase = "effect";
      this.selected = [];
      this.message = this.turn === 0 ? `${kind === "reveal" ? "全体公開" : "自分だけ確認"}：カードを${this.effect.remaining}枚選んでください。` : `CPUがカードを${this.effect.remaining}枚${kind === "reveal" ? "公開" : "確認"}します。`;
    }

    selectEffect(index, actor = 0) {
      if (this.phase !== "effect" || actor !== this.turn || !this.effectChoices().includes(index)) return false;
      const effect = this.effect;
      effect.targets.push(index);
      effect.remaining--;
      if (effect.kind === "reveal") {
        this.board[index].public = true;
        this.observe(index);
      } else this.observe(index, [actor]);
      if (!effect.remaining) {
        this.phase = "review";
        this.message = actor === 0 ? "カードを確認できました。" : "CPUが確認を終えました。";
      } else this.message = actor === 0 ? `あと${effect.remaining}枚確認できます。` : "CPUが次のカードを確認しています。";
      return true;
    }

    finishEffect() {
      if (this.phase !== "review") return false;
      this.effect = null;
      this.finishTurn();
      return true;
    }

    finishTurn() {
      this.selected = [];
      if (this.items[this.turn].has("lens") && !this.lensUsed) {
        this.lensUsed = true;
        this.beginEffect("peek", 1);
        return;
      }
      if (this.difficulty === "easy") {
        for (const [index, type] of this.memory[1]) {
          if (!this.board[index]?.public && type !== this.alienType(1) && this.random() < 0.25) this.memory[1].delete(index);
        }
      }
      if (!this.extraTurn) this.turn = 1 - this.turn;
      this.extraTurn = false;
      this.lensUsed = false;
      this.turnNumber++;
      this.phase = "turn";
      this.message = this.turn === 0 ? "あなたの番です。カードを2枚めくってください。" : "CPUがカードを選んでいます。";
    }

    shuffleBoard() {
      this.board = this.shuffled(this.board);
      this.memory.forEach((memory) => memory.clear());
      this.board.forEach((card, index) => { if (card?.public) this.observe(index); });
      this.cpuExposed = false;
      this.lastPair = [];
    }

    atBoundary(actor) {
      return this.phase === "turn" && this.turn === actor && this.selected.length === 0;
    }

    addReserve(actor = 0) {
      if (!this.atBoundary(actor) || !this.reserve[actor]) return false;
      const card = { type: this.alienType(actor), public: false };
      this.board.push(card);
      this.reserve[actor] = false;
      this.shuffleBoard();
      this.announce(`${actor === 0 ? "あなた" : "CPU"}がエイリアンを追加。場をシャッフルしました。`);
      return true;
    }

    useShuffle(actor = 0) {
      if (!this.atBoundary(actor) || !this.items[actor].has("shuffle")) return false;
      this.items[actor].delete("shuffle");
      this.shuffleBoard();
      this.announce(`${actor === 0 ? "あなた" : "CPU"}がアイテムで場をシャッフルしました。`);
      return true;
    }

    nextRound() {
      if (this.phase !== "roundEnd") return false;
      this.round++;
      this.prepareRound();
      return true;
    }

    // CPU decisions use observed positions, never the types of hidden cards.
    cpuChoice() {
      if (this.turn !== 1) return null;
      const available = this.board.map((card, index) => index).filter((index) => this.board[index] && !this.selected.includes(index));
      const memory = this.memory[1];
      if (this.phase === "effect") {
        const choices = this.effectChoices();
        const unknown = choices.filter((index) => !memory.has(index));
        return this.pick(unknown.length ? unknown : choices);
      }
      if (this.phase !== "turn") return null;
      if (this.selected.length) {
        const firstType = memory.get(this.selected[0]);
        const mate = available.find((index) => memory.get(index) === firstType && firstType !== this.alienType(1));
        if (mate !== undefined) return mate;
      } else {
        const groups = new Map();
        available.forEach((index) => {
          const type = memory.get(index);
          if (!type || type === this.alienType(1)) return;
          if (!groups.has(type)) groups.set(type, []);
          groups.get(type).push(index);
        });
        const pairs = [...groups].filter(([, indices]) => indices.length >= 2);
        pairs.sort(([typeA], [typeB]) => Number(typeB === this.alienType(0)) - Number(typeA === this.alienType(0)));
        if (pairs.length) return pairs[0][1][0];
      }
      const unknown = available.filter((index) => !memory.has(index));
      const safe = available.filter((index) => memory.get(index) !== this.alienType(1));
      return this.pick(unknown.length ? unknown : safe.length ? safe : available);
    }

    pick(values) {
      return values.length ? values[Math.floor(this.random() * values.length)] : null;
    }

    visible(index, viewer = 0) {
      if (["setup", "cpuSetup"].includes(this.phase)) return null;
      const card = this.board[index];
      if (!card) return null;
      if (["roundEnd", "matchEnd"].includes(this.phase) || card.public || this.selected.includes(index)) return card.type;
      if (this.effect?.kind === "peek" && this.effect.actor === viewer && this.effect.targets.includes(index)) return card.type;
      return null;
    }
  }

  const api = { Game, TYPES, DECK };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SenpukushaTrial = api;
})(typeof window !== "undefined" ? window : globalThis);
