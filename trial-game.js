(function () {
  "use strict";
  const root = document.querySelector("[data-cpu-trial]");
  if (!root || !window.SenpukushaTrial) return;
  const { Game, TYPES } = window.SenpukushaTrial;

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const image = (type) => {
    const img = make("img");
    img.src = `./素材/${TYPES[type].image}`;
    img.alt = "";
    img.width = 816;
    img.height = 1112;
    img.draggable = false;
    return img;
  };

  class Trial {
    constructor() {
      this.game = new Game();
      this.paused = false;
      this.timer = null;
      this.cpuPreparedTurn = null;
      this.board = root.querySelector("[data-trial-board]");
      this.dialog = root.querySelector("[data-trial-dialog]");
      this.dialogPause = false;
      const header = document.querySelector(".site-header");
      if (header) {
        const resize = () => root.style.setProperty("--trial-header-height", `${header.getBoundingClientRect().height}px`);
        resize();
        if ("ResizeObserver" in window) new ResizeObserver(resize).observe(header);
        else window.addEventListener("resize", resize);
      }
      root.hidden = false;
      this.makeAlienPicker();
      root.addEventListener("click", (event) => this.onClick(event));
      root.querySelector("[data-trial-difficulty]").addEventListener("change", (event) => {
        this.game.difficulty = event.target.value;
      });
      this.dialog.addEventListener("close", () => {
        if (this.dialogPause) {
          this.dialogPause = false;
          this.paused = false;
          this.render();
          this.drive();
        }
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && !["setup", "roundEnd", "matchEnd"].includes(this.game.phase)) {
          this.paused = true;
          this.clearTimer();
          this.render();
        }
      });
      window.addEventListener("pagehide", () => this.clearTimer());
      this.render();
    }

    makeAlienPicker() {
      const picker = root.querySelector("[data-trial-aliens]");
      for (let i = 0; i < 4; i++) {
        const button = make("button", "trial-alien-choice");
        button.type = "button";
        button.dataset.trialAlien = i;
        button.setAttribute("aria-label", `${TYPES[`alien${i}`].name}を選ぶ`);
        button.title = TYPES[`alien${i}`].name;
        button.append(image(`alien${i}`));
        picker.append(button);
      }
    }

    clearTimer() {
      if (this.timer !== null) window.clearTimeout(this.timer);
      this.timer = null;
    }

    schedule(action, delay) {
      if (this.timer !== null || this.paused) return;
      this.timer = window.setTimeout(() => {
        this.timer = null;
        if (this.paused) return;
        action();
        this.render();
        this.drive();
      }, delay);
    }

    drive() {
      const game = this.game;
      if (this.paused) return;
      if (game.phase === "resolving") {
        this.schedule(() => game.resolve(), 1300);
      } else if (game.turn === 1 && game.phase === "review") {
        this.schedule(() => game.finishEffect(), 900);
      } else if (game.turn === 1 && game.phase === "effect") {
        this.schedule(() => {
          const index = game.cpuChoice();
          if (index !== null) game.selectEffect(index, 1);
        }, 1000);
      } else if (game.turn === 1 && game.phase === "turn") {
        const turnKey = `${game.round}:${game.turnNumber}`;
        if (!game.selected.length && this.cpuPreparedTurn !== turnKey) {
          this.cpuPreparedTurn = turnKey;
          const knownOpponent = [...game.memory[1].values()].filter((type) => type === game.alienType(0)).length;
          if (game.cpuExposed && knownOpponent < 2) {
            if (!game.useShuffle(1)) game.addReserve(1);
          }
          this.render();
        }
        this.schedule(() => {
          const index = game.cpuChoice();
          if (index !== null) game.flip(index, 1);
        }, 1000);
      }
    }

    onClick(event) {
      const inspect = event.target.closest("[data-trial-inspect]");
      if (inspect) {
        this.inspect(inspect.dataset.trialInspect);
        return;
      }
      const action = event.target.closest("[data-trial-action]")?.dataset.trialAction;
      if (action === "close-card") {
        this.dialog.close();
        return;
      }
      if (action === "pause") {
        this.paused = !this.paused;
        this.clearTimer();
        this.render();
        this.drive();
        return;
      }
      if (action === "reset") {
        this.clearTimer();
        this.paused = false;
        this.cpuPreparedTurn = null;
        this.game.newMatch();
      } else {
        if (this.paused) return;
        const alien = event.target.closest("[data-trial-alien]");
        const slot = event.target.closest("[data-trial-slot]");
        if (alien) this.game.chooseAlien(Number(alien.dataset.trialAlien));
        else if (slot) {
          const index = Number(slot.dataset.trialSlot);
          if (this.game.phase === "setup") this.game.place(index);
          else if (this.game.phase === "effect") this.game.selectEffect(index);
          else this.game.flip(index);
        } else if (action === "reserve") this.game.addReserve();
        else if (action === "shuffle") this.game.useShuffle();
        else if (action === "advance") {
          if (this.game.phase === "setup") this.game.startRound();
          else if (this.game.phase === "review") this.game.finishEffect();
          else if (this.game.phase === "roundEnd") this.game.nextRound();
          else if (this.game.phase === "matchEnd") {
            this.cpuPreparedTurn = null;
            this.game.newMatch();
          }
        } else return;
      }
      this.render();
      this.drive();
    }

    inspect(type) {
      if (!TYPES[type]) return;
      this.dialogPause = !this.paused && !["setup", "roundEnd", "matchEnd"].includes(this.game.phase);
      if (this.dialogPause) {
        this.paused = true;
        this.clearTimer();
        this.render();
      }
      const img = root.querySelector("[data-trial-dialog-image]");
      img.src = `./素材/${TYPES[type].image}`;
      img.alt = TYPES[type].name;
      this.dialog.showModal();
    }

    renderBoard() {
      const game = this.game;
      const slotCount = Math.max(18, game.board.length);
      while (this.board.children.length < slotCount) {
        const button = make("button", "trial-card");
        button.type = "button";
        button.dataset.trialSlot = this.board.children.length;
        this.board.append(button);
      }
      while (this.board.children.length > slotCount) this.board.lastChild.remove();
      [...this.board.children].forEach((button, index) => {
        const type = game.visible(index);
        const setup = game.phase === "setup";
        const empty = index >= game.board.length || (!setup && !game.board[index]);
        const peeking = game.effect?.targets.includes(index) && game.effect.kind === "peek";
        button.className = "trial-card";
        button.classList.toggle("is-face-up", !!type);
        button.classList.toggle("is-empty", empty);
        button.classList.toggle("is-placement", setup && !!type);
        button.classList.toggle("is-peeking", !!peeking);
        let enabled = (setup && !empty) || game.canFlip(index, 0) || (game.phase === "effect" && game.turn === 0 && game.effectChoices().includes(index));
        if (setup && game.placement.length === 2 && !type) enabled = false;
        button.disabled = this.paused || !enabled;
        button.setAttribute("aria-label", `${index + 1}番：${type ? TYPES[type].name : empty ? "獲得済み" : setup ? "エイリアンを隠す場所" : "裏向きのカード"}`);
        if (setup) button.setAttribute("aria-pressed", String(!!type));
        else button.removeAttribute("aria-pressed");
        button.title = type ? TYPES[type].effect || TYPES[type].name : `${index + 1}番`;
        button.replaceChildren();
        if (type) button.append(image(type));
        else if (!empty) {
          const back = make("span", "trial-back");
          const logo = make("img");
          logo.src = "./素材/ヘッダー.png";
          logo.alt = "";
          logo.width = 792;
          logo.height = 171;
          back.append(logo);
          button.append(back);
        }
        button.append(make("span", "trial-card-number", String(index + 1).padStart(2, "0")));
        if (game.board[index]?.public) button.append(make("span", "trial-card-mark", "公開"));
        else if (peeking && !type) button.append(make("span", "trial-card-mark", "確認"));
      });
    }

    renderPreview() {
      const game = this.game;
      let entries = game.lastPair;
      if (game.effect?.kind === "peek" && game.effect.actor === 0 && game.effect.targets.length) {
        entries = game.effect.targets.map((index) => ({ index, type: game.board[index].type }));
      } else if (game.selected.length) {
        entries = game.selected.map((index) => ({ index, type: game.board[index].type }));
      }
      const preview = root.querySelector("[data-trial-preview]");
      preview.replaceChildren();
      if (!entries.length) {
        preview.append(make("span", "trial-none", "—"));
        return;
      }
      entries.forEach(({ index, type }) => {
        const button = make("button", "trial-preview-card");
        button.type = "button";
        button.dataset.trialInspect = type;
        button.setAttribute("aria-label", `${TYPES[type].name}を拡大`);
        button.title = "カードを拡大";
        button.append(image(type), make("span", "trial-preview-name", `${index + 1}番 · ${TYPES[type].name}`));
        preview.append(button);
      });
    }

    render() {
      const game = this.game;
      const labels = {
        setup: `配置 ${game.placement.length} / 2`,
        turn: game.turn === 0 ? "あなたの番" : "CPUの番",
        resolving: "カードを照合中",
        effect: "カードの効果",
        review: "カードを確認中",
        roundEnd: `${game.roundWinner === 0 ? "あなた" : "CPU"}に1点`,
        matchEnd: game.roundWinner === 0 ? "あなたの勝利！" : "CPUの勝利"
      };
      root.dataset.phase = game.phase;
      root.querySelector("[data-trial-phase]").textContent = this.paused ? "一時停止中" : labels[game.phase];
      root.querySelector("[data-trial-round]").textContent = `ラウンド${game.round}`;
      root.querySelector("[data-trial-message]").textContent = this.paused ? "一時停止中" : game.message;
      for (let player = 0; player < 2; player++) {
        root.querySelector(`[data-trial-score="${player}"]`).textContent = game.scores[player];
        root.querySelector(`[data-trial-avatar="${player}"]`).src = `./素材/${TYPES[game.alienType(player)].image}`;
        root.querySelector(`[data-trial-player="${player}"]`).classList.toggle("is-active", game.turn === player && !["setup", "roundEnd", "matchEnd"].includes(game.phase));
      }
      const picker = root.querySelector("[data-trial-picker]");
      picker.hidden = game.phase !== "setup";
      picker.querySelectorAll("[data-trial-alien]").forEach((button) => {
        button.setAttribute("aria-pressed", String(Number(button.dataset.trialAlien) === game.alien));
      });
      const advance = root.querySelector('[data-trial-action="advance"]');
      const primary = { setup: "対戦開始", review: "続ける", roundEnd: "次のラウンド", matchEnd: "もう一度遊ぶ" };
      advance.hidden = !primary[game.phase] || (game.phase === "review" && game.turn === 1);
      advance.textContent = primary[game.phase] || "続ける";
      advance.disabled = this.paused || (game.phase === "setup" && game.placement.length !== 2);
      const boundary = game.atBoundary(0) && !this.paused;
      root.querySelector('[data-trial-action="reserve"]').disabled = !boundary || !game.reserve[0];
      root.querySelector("[data-trial-reserve-image]").src = `./素材/${TYPES[game.alienType(0)].image}`;
      root.querySelector("[data-trial-reserve-label]").textContent = game.reserve[0] ? "残り1枚" : "使用済み";
      root.querySelector('[data-trial-action="shuffle"]').disabled = !boundary || !game.items[0].has("shuffle");
      const lens = root.querySelector("[data-trial-lens]");
      lens.classList.toggle("is-owned", game.items[0].has("lens"));
      lens.querySelector("small").textContent = game.items[0].has("lens") ? "所持中" : "未獲得";
      const pause = root.querySelector('[data-trial-action="pause"]');
      pause.disabled = ["setup", "roundEnd", "matchEnd"].includes(game.phase);
      pause.title = this.paused ? "再開" : "一時停止";
      pause.setAttribute("aria-label", pause.title);
      pause.querySelector("img").src = `./assets/icons/${this.paused ? "play" : "pause"}.svg`;
      this.renderBoard();
      this.renderPreview();
      const log = root.querySelector("[data-trial-log]");
      log.replaceChildren(...game.history.map((entry) => make("li", null, entry)));
    }
  }

  new Trial();
})();
