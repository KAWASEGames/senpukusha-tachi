(function () {
  "use strict";
  const root = document.querySelector("[data-cpu-trial]");
  if (!root || !window.SenpukushaTrial) return;
  const { Game, TYPES } = window.SenpukushaTrial;
  // Default positions stay stable; user moves are stored separately for the current round.
  const cardAngles = [-30, -15, -48, 14, 70, 57, 16, 31, -68, 64, -25, -21, -31, 53, 73, 26, 15, 39];

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
      this.board.addEventListener("keydown", (event) => {
        if (event.target !== this.board || this.selectedHand === null || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        const area = this.board.getBoundingClientRect();
        this.placeHand(this.selectedHand, this.boardPoint(area.left + area.width / 2, area.top + area.height / 2));
        this.render();
        this.drive();
      });
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

    placeHand(hand, position) {
      const game = this.game;
      if (!position || this.paused) return false;
      let index;
      if (hand === 2) {
        index = game.board.length;
        if (!game.addReserve()) return false;
      } else {
        if (game.phase !== "setup" || hand < 0 || hand > 1 || this.handPositions[hand] !== null) return false;
        index = game.place();
        if (index === null) return false;
        this.handPositions[hand] = index;
      }
      this.clearTimer();
      this.cardPositions.set(index, { ...position, z: ++this.topCard });
      this.selectedHand = null;
      return true;
    }

    boardPoint(x, y) {
      const area = this.board.getBoundingClientRect();
      if (x < area.left || x > area.right || y < area.top || y > area.bottom) return null;
      return { x: (x - area.left) / area.width * 100, y: (y - area.top) / area.height * 100 };
    }

    placeCpuCard() {
      const index = this.game.placeCpuAlien();
      if (index === null) return;
      this.render();
      const card = this.board.children[index];
      const area = this.board.getBoundingClientRect();
      const rect = card.getBoundingClientRect();
      const occupied = [...this.board.children].filter((other) => other !== card && !other.classList.contains("is-empty")).map((other) => other.getBoundingClientRect());
      let best;
      // CPU placement uses visible geometry only, never hidden card identities.
      for (const y of [34, 66, 50, 18, 82]) {
        for (const x of [50, 25, 75, 12, 88]) {
          const left = area.left + area.width * x / 100 - rect.width / 2;
          const top = area.top + area.height * y / 100 - rect.height / 2;
          if (left < area.left + 4 || top < area.top + 4 || left + rect.width > area.right - 4 || top + rect.height > area.bottom - 4) continue;
          const overlap = occupied.reduce((total, other) => total + Math.max(0, Math.min(left + rect.width, other.right) - Math.max(left, other.left)) * Math.max(0, Math.min(top + rect.height, other.bottom) - Math.max(top, other.top)), 0);
          if (!best || overlap < best.overlap) best = { x, y, overlap };
        }
      }
      this.cardPositions.set(index, { x: best?.x ?? 50, y: best?.y ?? 50, z: ++this.topCard });
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
        moved: false, ghost: null
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
      this.board.classList.toggle("is-drop-hover", !!this.boardPoint(drag.x, drag.y));
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
      this.board.classList.remove("is-drop-hover");
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
      const position = drag.moved && drag.slot === null ? this.boardPoint(event.clientX, event.clientY) : null;
      this.cancelDrag(false);
      if (!drag.moved) {
        // Touch capture can suppress the native click after dragging another card.
        if (event.pointerType !== "mouse") {
          event.preventDefault();
          this.suppressedClick = null;
          drag.source.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1, clientX: event.clientX, clientY: event.clientY }));
          this.suppressedClick = { hand: drag.hand, slot: drag.slot, phase: this.game.phase, until: performance.now() + 350 };
        }
        this.drive();
        return;
      }
      event.preventDefault();
      this.suppressedClick = { hand: drag.hand, slot: drag.slot, board: !!position, boardDrag: drag.slot !== null, phase: this.game.phase, until: performance.now() + 350 };
      if (position) this.placeHand(drag.hand, position);
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
      if (game.phase === "cpuSetup") {
        this.schedule(() => this.placeCpuCard(), 1000);
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
      if (this.suppressedClick && (this.suppressedClick.boardDrag || this.game.phase === this.suppressedClick.phase) && performance.now() < this.suppressedClick.until && ((hand && Number(hand.dataset.trialHand) === this.suppressedClick.hand) || (slot && Number(slot.dataset.trialSlot) === this.suppressedClick.slot) || (this.suppressedClick.board && this.board.contains(event.target)))) return;
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
          if ((this.game.phase === "setup" && index < 2 && this.handPositions[index] === null) || (index === 2 && this.game.atBoundary(0) && this.game.reserve[0])) {
            this.selectedHand = this.selectedHand === index ? null : index;
            this.game.message = this.selectedHand !== null ? "カードを置く場所を選んでください。" : "手札の赤いカードを2枚、好きな場所へ配置してください。";
          }
        }
        else if (this.board.contains(event.target) && this.selectedHand !== null) {
          const area = this.board.getBoundingClientRect();
          const keyboard = event.detail === 0 && !event.clientX && !event.clientY;
          this.placeHand(this.selectedHand, this.boardPoint(keyboard ? area.left + area.width / 2 : event.clientX, keyboard ? area.top + area.height / 2 : event.clientY));
        }
        else if (slot) {
          const index = Number(slot.dataset.trialSlot);
          if (this.game.phase === "effect") this.game.selectEffect(index);
          else this.game.flip(index);
        } else if (action === "finish-setup") {
          this.selectedHand = null;
          this.game.startRound();
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
      const slotCount = game.board.length;
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
        const angle = cardAngles[index] ?? 0;
        const x = index < 12 ? 12 + (index % 4) * 25 : 50;
        const y = index < 12 ? 18 + Math.floor(index / 4) * 32 : 50;
        button.style.setProperty("--card-x", `${x}%`);
        button.style.setProperty("--card-y", `${y}%`);
        button.style.setProperty("--card-angle", `${angle}deg`);
        button.style.setProperty("--mobile-x", `${14 + (index % 4) * 24}%`);
        button.style.setProperty("--mobile-y", `${index < 12 ? 17 + Math.floor(index / 4) * 32 : 50}%`);
        button.style.setProperty("--mobile-angle", `${[-9, 7, -5, 11, 6, -11, 9, -7][index % 8]}deg`);
        button.classList.toggle("is-face-up", !!type);
        button.classList.toggle("is-empty", empty);
        button.classList.toggle("is-peeking", !!peeking);
        const enabled = (setup && !empty) || game.canFlip(index, 0) || (game.phase === "effect" && game.turn === 0 && game.effectChoices().includes(index));
        button.disabled = this.paused || empty;
        button.setAttribute("aria-disabled", String(!enabled || this.paused));
        button.setAttribute("aria-label", `${index + 1}番：${type ? TYPES[type].name : empty ? "獲得済み" : "裏向きのカード"}`);
        button.removeAttribute("aria-pressed");
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
        cpuSetup: "CPUが配置中",
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
      const finishSetup = root.querySelector('[data-trial-action="finish-setup"]');
      finishSetup.hidden = game.phase !== "setup";
      finishSetup.disabled = this.paused || game.placement.length !== 2;
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
