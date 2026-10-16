(function () {
  "use strict";
  const root = document.querySelector("[data-cpu-trial]");
  if (!root || !window.SenpukushaTrial) return;
  const { Game, TYPES } = window.SenpukushaTrial;
  // Default positions stay stable; user moves are stored separately for the current round.
  const tablePositions = [
    [9, 18, -30], [25, 19, -15], [42, 17, -48], [58, 18, 14], [75, 18, 70], [91, 19, 57],
    [9, 50, 16], [25, 51, 31], [42, 49, -68], [58, 50, 64], [75, 50, -25], [91, 50, -21],
    [9, 81, -31], [25, 82, 53], [75, 81, 73], [91, 82, 26], [42, 81, 15], [58, 81, 39]
  ];

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
      this.handPositions = [null, null];
      this.cardPositions = new Map();
      this.topCard = 2;
      this.selectedHand = null;
      this.drag = null;
      this.dragFrame = null;
      this.suppressedClick = null;
      this.board = root.querySelector("[data-trial-board]");
      this.dialog = root.querySelector("[data-trial-dialog]");
      this.dialogPause = false;
      if ("ResizeObserver" in window) new ResizeObserver(() => {
        if (this.drag) this.cancelDrag();
        [...this.board.children].forEach((card, index) => this.applyCardPosition(card, index));
        this.drive();
      }).observe(this.board);
      const header = document.querySelector(".site-header");
      if (header) {
        const resize = () => root.style.setProperty("--trial-header-height", `${header.getBoundingClientRect().height}px`);
        resize();
        if ("ResizeObserver" in window) new ResizeObserver(resize).observe(header);
        else window.addEventListener("resize", resize);
      }
      root.hidden = false;
      root.addEventListener("click", (event) => this.onClick(event));
      root.addEventListener("pointerdown", (event) => this.startDrag(event));
      root.addEventListener("pointermove", (event) => this.moveDrag(event));
      root.addEventListener("pointerup", (event) => this.endDrag(event));
      const interruptDrag = () => {
        if (!this.drag) return;
        if (this.drag.moved) this.suppressedClick = { hand: this.drag.hand, slot: this.drag.slot, boardDrag: true, until: performance.now() + 350 };
        this.cancelDrag();
        this.drive();
      };
      root.addEventListener("pointercancel", interruptDrag);
      root.addEventListener("lostpointercapture", (event) => {
        if (event.target === this.drag?.source && event.pointerId === this.drag.pointer) interruptDrag();
      });
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
        if (document.hidden) {
          this.cancelDrag();
          this.clearTimer();
        }
        if (document.hidden && !["setup", "roundEnd", "matchEnd"].includes(this.game.phase)) {
          this.paused = true;
          this.clearTimer();
          this.render();
        }
        if (!document.hidden) this.drive();
      });
      window.addEventListener("pagehide", () => { this.clearTimer(); this.cancelDrag(); });
      this.render();
    }

    placeHand(hand, index) {
      const game = this.game;
      if (game.phase !== "setup" || hand < 0 || hand > 1 || index < 0 || index >= 16) return false;
      const previous = this.handPositions[hand];
      if (previous === index) return true;
      if (game.placement.includes(index)) return false;
      this.clearTimer();
      if (previous !== null) game.place(previous);
      game.place(index);
      this.handPositions[hand] = index;
      this.selectedHand = null;
      return true;
    }

    dropTarget(x, y) {
      const slot = document.elementFromPoint(x, y)?.closest("[data-trial-slot]");
      if (!slot || !root.contains(slot)) return null;
      const index = Number(slot.dataset.trialSlot);
      if (this.game.phase === "setup" && (index >= 16 || this.game.placement.includes(index))) return null;
      return slot;
    }

    startDrag(event) {
      const source = event.target.closest("[data-trial-hand], [data-trial-slot]");
      if (!source || source.disabled || this.paused || event.button !== 0 || event.isPrimary === false) return;
      const slot = source.hasAttribute("data-trial-slot") ? Number(source.dataset.trialSlot) : null;
      const rect = source.getBoundingClientRect();
      this.suppressedClick = null;
      this.clearTimer();
      this.drag = {
        source, slot, hand: slot === null ? Number(source.dataset.trialHand) : null,
        pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
        x: event.clientX, y: event.clientY,
        offsetX: event.clientX - (rect.left + rect.width / 2),
        offsetY: event.clientY - (rect.top + rect.height / 2),
        originalPosition: this.cardPositions.get(slot),
        moved: false, ghost: null, target: null
      };
      try { source.setPointerCapture(event.pointerId); } catch { /* Synthetic pointer events may not own a pointer. */ }
    }

    applyCardPosition(card, index) {
      const position = this.cardPositions.get(index);
      if (!position) {
        card.style.removeProperty("left");
        card.style.removeProperty("top");
        card.style.removeProperty("z-index");
        return;
      }
      const area = this.board.getBoundingClientRect();
      if (!area.width || !area.height) return;
      const rect = card.getBoundingClientRect();
      const marginX = (rect.width / 2 + 4) / area.width * 100;
      const marginY = (rect.height / 2 + 4) / area.height * 100;
      position.x = Math.max(marginX, Math.min(100 - marginX, position.x));
      position.y = Math.max(marginY, Math.min(100 - marginY, position.y));
      card.style.left = `${position.x}%`;
      card.style.top = `${position.y}%`;
      card.style.zIndex = position.z;
    }

    moveDrag(event) {
      const drag = this.drag;
      if (!drag || drag.pointer !== event.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (!drag.moved && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 8) return;
      event.preventDefault();
      if (!drag.moved) {
        drag.moved = true;
        if (drag.slot === null) {
          drag.ghost = image("alien0");
          drag.ghost.className = "trial-drag-ghost";
          document.body.append(drag.ghost);
          drag.source.classList.add("is-drag-source");
        } else {
          drag.source.classList.add("is-moving");
          drag.z = ++this.topCard;
        }
        root.classList.add("is-dragging");
        this.autoScrollDrag();
      }
      this.updateDragTarget();
    }

    updateDragTarget() {
      const drag = this.drag;
      if (!drag?.moved) return;
      if (drag.slot !== null) {
        const area = this.board.getBoundingClientRect();
        this.cardPositions.set(drag.slot, { x: (drag.x - drag.offsetX - area.left) / area.width * 100, y: (drag.y - drag.offsetY - area.top) / area.height * 100, z: drag.z });
        this.applyCardPosition(drag.source, drag.slot);
        return;
      }
      drag.ghost.style.left = `${drag.x}px`;
      drag.ghost.style.top = `${drag.y}px`;
      drag.target?.classList.remove("is-drop-hover");
      drag.target = this.dropTarget(drag.x, drag.y);
      drag.target?.classList.add("is-drop-hover");
    }

    autoScrollDrag() {
      const drag = this.drag;
      if (!drag?.moved) return;
      const board = this.board.getBoundingClientRect();
      if (drag.y > window.innerHeight - 60 && board.bottom > window.innerHeight - 20) window.scrollBy(0, 10);
      else if (drag.y < 110 && board.top < 110 && window.scrollY > 0) window.scrollBy(0, -10);
      this.updateDragTarget();
      this.dragFrame = window.requestAnimationFrame(() => this.autoScrollDrag());
    }

    cancelDrag(restore = true) {
      const drag = this.drag;
      this.drag = null;
      if (this.dragFrame !== null) window.cancelAnimationFrame(this.dragFrame);
      this.dragFrame = null;
      drag?.ghost?.remove();
      drag?.target?.classList.remove("is-drop-hover");
      drag?.source.classList.remove("is-drag-source");
      drag?.source.classList.remove("is-moving");
      if (restore && drag?.slot !== null && drag?.slot !== undefined && drag.moved) {
        if (drag.originalPosition) this.cardPositions.set(drag.slot, drag.originalPosition);
        else this.cardPositions.delete(drag.slot);
        this.applyCardPosition(drag.source, drag.slot);
      }
      root.classList.remove("is-dragging");
      if (drag?.source.hasPointerCapture(drag.pointer)) drag.source.releasePointerCapture(drag.pointer);
    }

    endDrag(event) {
      const drag = this.drag;
      if (!drag || drag.pointer !== event.pointerId) return;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (drag.moved) this.updateDragTarget();
      const target = drag.moved && drag.slot === null ? this.dropTarget(event.clientX, event.clientY) : null;
      this.cancelDrag(false);
      if (!drag.moved) {
        // Touch capture can suppress the native click after dragging another card.
        if (event.pointerType !== "mouse") {
          event.preventDefault();
          this.suppressedClick = null;
          drag.source.click();
          this.suppressedClick = { hand: drag.hand, slot: drag.slot, phase: this.game.phase, until: performance.now() + 350 };
        }
        this.drive();
        return;
      }
      event.preventDefault();
      const index = target ? Number(target.dataset.trialSlot) : null;
      this.suppressedClick = { hand: drag.hand, slot: drag.slot ?? index, boardDrag: drag.slot !== null, phase: this.game.phase, until: performance.now() + 350 };
      if (index !== null) {
        if (drag.hand === 2) this.game.addReserve();
        else this.placeHand(drag.hand, index);
      }
      this.render();
      this.drive();
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
      if (this.paused || this.drag) return;
      if (game.phase === "setup" && game.placement.length === 2) {
        this.schedule(() => game.startRound(), 900);
      } else if (game.phase === "resolving") {
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
      const hand = event.target.closest("[data-trial-hand]");
      const slot = event.target.closest("[data-trial-slot]");
      if (this.suppressedClick && (this.suppressedClick.boardDrag || this.game.phase === this.suppressedClick.phase) && performance.now() < this.suppressedClick.until && ((hand && Number(hand.dataset.trialHand) === this.suppressedClick.hand) || (slot && Number(slot.dataset.trialSlot) === this.suppressedClick.slot))) return;
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
        this.cancelDrag();
        this.paused = false;
        this.cpuPreparedTurn = null;
        this.handPositions = [null, null];
        this.cardPositions.clear();
        this.topCard = 2;
        this.selectedHand = null;
        this.game.newMatch();
      } else {
        if (this.paused) return;
        if (hand) {
          const index = Number(hand.dataset.trialHand);
          if (this.game.phase === "setup" && index < 2 && this.handPositions[index] === null) {
            this.selectedHand = this.selectedHand === index ? null : index;
            this.game.message = this.selectedHand !== null ? "カードを置く場所を選んでください。" : "手札の赤いカードを2枚、好きな場所へ配置してください。";
          } else if (index === 2) this.game.addReserve();
        }
        else if (slot) {
          const index = Number(slot.dataset.trialSlot);
          if (this.game.phase === "setup") {
            if (this.selectedHand !== null) this.placeHand(this.selectedHand, index);
            else if (this.game.placement.includes(index)) {
              this.clearTimer();
              this.game.place(index);
              this.handPositions[this.handPositions.indexOf(index)] = null;
            }
          }
          else if (this.game.phase === "effect") this.game.selectEffect(index);
          else this.game.flip(index);
        } else if (action === "shuffle") {
          if (!this.game.addReserve()) this.game.useShuffle();
        }
        else if (action === "advance") {
          if (this.game.phase === "review") this.game.finishEffect();
          else if (this.game.phase === "roundEnd") {
            this.handPositions = [null, null];
            this.cardPositions.clear();
            this.topCard = 2;
            this.selectedHand = null;
            this.game.nextRound();
          }
          else if (this.game.phase === "matchEnd") {
            this.cpuPreparedTurn = null;
            this.handPositions = [null, null];
            this.cardPositions.clear();
            this.topCard = 2;
            this.selectedHand = null;
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
      this.board.classList.toggle("has-reserve", game.board.length > 16);
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
        let [x, y, angle] = tablePositions[index];
        if (game.board.length === 16 && index >= 6 && index < 16) {
          x = 10 + ((index - 6) % 5) * 20;
          y = index < 11 ? 50 : 81;
        } else if (game.board.length === 17 && index >= 12 && index < 17) x = 10 + (index - 12) * 20;
        button.style.setProperty("--card-x", `${x}%`);
        button.style.setProperty("--card-y", `${y}%`);
        button.style.setProperty("--card-angle", `${angle}deg`);
        button.style.setProperty("--mobile-x", `${14 + (index % 4) * 24}%`);
        button.style.setProperty("--mobile-y", `${game.board.length > 16 ? 11 + Math.floor(index / 4) * 19 : 13 + Math.floor(index / 4) * 24}%`);
        button.style.setProperty("--mobile-angle", `${[-9, 7, -5, 11, 6, -11, 9, -7][index % 8]}deg`);
        button.classList.toggle("is-face-up", !!type);
        button.classList.toggle("is-empty", empty);
        button.classList.toggle("is-placement", setup && !!type);
        button.classList.toggle("is-drop-slot", setup && !type && !empty);
        button.classList.toggle("is-reserved-slot", index >= game.board.length);
        button.classList.toggle("is-peeking", !!peeking);
        let enabled = (setup && !empty) || game.canFlip(index, 0) || (game.phase === "effect" && game.turn === 0 && game.effectChoices().includes(index));
        if (setup && game.placement.length === 2 && !type) enabled = false;
        button.disabled = this.paused || empty;
        button.setAttribute("aria-disabled", String(!enabled || this.paused));
        button.setAttribute("aria-label", `${index + 1}番：${type ? TYPES[type].name : empty ? "獲得済み" : setup ? "エイリアンを隠す場所" : "裏向きのカード"}`);
        if (setup) button.setAttribute("aria-pressed", String(!!type));
        else button.removeAttribute("aria-pressed");
        button.title = type ? TYPES[type].effect || TYPES[type].name : `${index + 1}番`;
        this.applyCardPosition(button, index);
        button.replaceChildren();
        if (type) button.append(image(type));
        else if (!empty) {
          const back = make("span", "trial-back");
          const logo = make("img");
          logo.src = "./素材/ヘッダー.png";
          logo.alt = "";
          logo.width = 792;
          logo.height = 171;
          logo.draggable = false;
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

    renderHand() {
      const game = this.game;
      let count = 0;
      root.querySelectorAll("[data-trial-hand]").forEach((button) => {
        const index = Number(button.dataset.trialHand);
        const used = index < 2 ? game.phase !== "setup" || this.handPositions[index] !== null : !game.reserve[0];
        if (!used) count++;
        button.classList.toggle("is-used", used);
        button.disabled = this.paused || used || (index === 2 ? !game.atBoundary(0) : game.phase !== "setup");
        button.classList.toggle("is-locked", index === 2 && button.disabled && !used);
        button.setAttribute("aria-pressed", String(this.selectedHand === index && !used));
        button.querySelector("[data-hand-note]").textContent = used ? "配置済" : index === 2 ? "予備" : "配置";
      });
      root.querySelector("[data-trial-hand-count]").textContent = `${count}枚`;
      root.querySelector("[data-trial-cpu-reserve]").classList.toggle("is-used", !game.reserve[1]);
      const remaining = Number(game.reserve[0]) + Number(game.items[0].has("shuffle"));
      const shuffle = root.querySelector('[data-trial-action="shuffle"]');
      shuffle.disabled = this.paused || !game.atBoundary(0) || remaining === 0;
      shuffle.title = game.reserve[0] ? "予備の赤カードを追加して場をシャッフル" : "獲得したアイテムで場をシャッフル";
      root.querySelector("[data-trial-shuffle-label]").textContent = game.phase === "setup" ? "配置後に使用" : remaining === 0 ? "残り0回" : game.turn !== 0 ? "あなたの番で使用" : game.selected.length ? "2枚の処理後に使用" : `残り${remaining}回`;
    }

    render() {
      const game = this.game;
      const labels = {
        setup: game.placement.length === 2 ? "準備完了" : `準備：あと${2 - game.placement.length}枚配置`,
        turn: game.turn === 0 ? `あなたの番：あと${2 - game.selected.length}枚` : "CPUの番",
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
        root.querySelector(`[data-trial-player="${player}"]`).classList.toggle("is-active", game.turn === player && !["setup", "roundEnd", "matchEnd"].includes(game.phase));
      }
      const advance = root.querySelector('[data-trial-action="advance"]');
      const primary = { review: "続ける", roundEnd: "次のラウンド", matchEnd: "もう一度遊ぶ" };
      advance.hidden = !primary[game.phase] || (game.phase === "review" && game.turn === 1);
      advance.textContent = primary[game.phase] || "続ける";
      advance.disabled = this.paused;
      this.renderHand();
      const lens = root.querySelector("[data-trial-lens]");
      lens.classList.toggle("is-owned", game.items[0].has("lens"));
      lens.hidden = !game.items[0].has("lens");
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
