const test = require("node:test");
const assert = require("node:assert/strict");
const { Game, DECK } = require("../trial-engine.js");

function seeded(seed = 1) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function fixture(actor = 0) {
  const game = new Game({ random: seeded() });
  game.place(0);
  game.place(1);
  game.startRound();
  game.board = [...DECK.flatMap((type) => [type, type]), "alien0", "alien0", "alien1", "alien1"].map((type) => ({ type, public: false }));
  game.memory = [new Map([[12, "alien0"], [13, "alien0"]]), new Map([[14, "alien1"], [15, "alien1"]])];
  game.turn = actor;
  return game;
}

function pair(game, a, b) {
  const actor = game.turn;
  assert.equal(game.flip(a, actor), true);
  assert.equal(game.flip(b, actor), true);
  assert.equal(game.phase, "resolving");
  assert.equal(game.resolve(), true);
}

test("setup requires two distinct positions and creates eight pairs", () => {
  const game = new Game({ random: seeded() });
  assert.equal(game.startRound(), false);
  assert.equal(game.place(-1), false);
  game.place(2);
  game.place(2);
  assert.equal(game.placement.length, 0);
  game.place(2);
  game.place(7);
  assert.equal(game.place(8), false);
  assert.equal(game.startRound(), true);
  assert.equal(game.board.length, 16);
  for (const type of [...DECK, "alien0", "alien1"]) assert.equal(game.board.filter((card) => card.type === type).length, 2);
  assert.equal(game.memory[1].size, 2);
  assert.equal([...game.memory[1].values()].every((type) => type === "alien1"), true);
});

test("only the current player can flip, and a card cannot be selected twice", () => {
  const game = fixture();
  assert.equal(game.flip(0, 1), false);
  assert.equal(game.flip(0), true);
  assert.equal(game.flip(0), false);
  assert.equal(game.addReserve(), false);
  assert.equal(game.flip(2), true);
  assert.equal(game.flip(4), false);
  game.resolve();
  assert.equal(game.turn, 1);
  assert.equal(game.visible(0), null);
  assert.equal(game.memory[1].get(0), "reveal");
});

test("opponent aliens score for the finder; own aliens score for the opponent", () => {
  const game = fixture();
  pair(game, 14, 15);
  assert.deepEqual(game.scores, [1, 0]);
  assert.equal(game.phase, "roundEnd");
  const own = fixture();
  pair(own, 12, 13);
  assert.deepEqual(own.scores, [0, 1]);
  const cpu = fixture(1);
  pair(cpu, 14, 15);
  assert.deepEqual(cpu.scores, [1, 0]);
});

test("three points ends a match and a new match resets all round state", () => {
  const game = fixture();
  game.scores = [2, 1];
  pair(game, 14, 15);
  assert.equal(game.phase, "matchEnd");
  assert.equal(game.nextRound(), false);
  game.newMatch();
  assert.equal(game.phase, "setup");
  assert.deepEqual(game.scores, [0, 0]);
  assert.deepEqual(game.reserve, [true, true]);
  assert.equal(game.effect, null);
});

test("public reveals survive shuffling, which clears private location memory", () => {
  const game = fixture();
  pair(game, 0, 1);
  assert.equal(game.phase, "effect");
  assert.equal(game.selectEffect(12), true);
  game.finishEffect();
  assert.equal(game.turn, 1);
  assert.equal(game.addReserve(1), true);
  assert.equal(game.reserve[1], false);
  assert.equal(game.addReserve(1), false);
  const publicIndex = game.board.findIndex((card) => card?.public);
  assert.equal(game.visible(publicIndex), "alien0");
  assert.equal(game.memory[0].size, 1);
  assert.equal(game.memory[1].size, 1);
  assert.equal(game.memory[1].get(publicIndex), "alien0");
});

test("private inspection is visible and remembered only by its actor", () => {
  for (const actor of [0, 1]) {
    const game = fixture(actor);
    pair(game, 2, 3);
    for (const index of [4, 6, 8]) {
      assert.equal(game.selectEffect(index, actor), true);
      assert.equal(game.visible(index, actor), game.board[index].type);
      assert.equal(game.visible(index, 1 - actor), null);
      assert.equal(game.memory[1 - actor].has(index), false);
      assert.equal(game.board[index].public, false);
    }
    assert.equal(game.phase, "review");
    game.finishEffect();
    assert.equal(game.visible(4, actor), null);
    assert.equal(game.memory[actor].get(4), "extra");
  }
});

test("extra turn and skip retain the same player for one extra turn", () => {
  for (const indices of [[4, 5], [6, 7]]) {
    const game = fixture();
    pair(game, ...indices);
    assert.equal(game.turn, 0);
    assert.equal(game.turnNumber, 2);
    pair(game, 0, 2);
    assert.equal(game.turn, 1);
  }
});

test("lens inspects once at turn end, including subsequent turns", () => {
  const game = fixture();
  pair(game, 8, 9);
  assert.equal(game.items[0].has("lens"), true);
  assert.equal(game.phase, "effect");
  assert.equal(game.effect.remaining, 1);
  game.selectEffect(4);
  game.finishEffect();
  assert.equal(game.turn, 1);
  game.turn = 0;
  pair(game, 0, 2);
  assert.equal(game.effect.remaining, 1);
  game.selectEffect(5);
  game.finishEffect();
  assert.equal(game.turn, 1);
});

test("shuffle item is single use and cannot be used mid-turn", () => {
  const game = fixture();
  pair(game, 10, 11);
  game.turn = 0;
  game.flip(0);
  assert.equal(game.useShuffle(), false);
  game.flip(2);
  game.resolve();
  game.turn = 0;
  assert.equal(game.useShuffle(), true);
  assert.equal(game.useShuffle(), false);
  assert.equal(game.reserve[0], true);
});

test("reserve can add a seventeenth card without losing or duplicating a card", () => {
  const game = fixture();
  assert.equal(game.addReserve(), true);
  assert.equal(game.board.length, 17);
  assert.equal(game.board.filter((card) => card?.type === "alien0").length, 3);
  assert.equal(game.addReserve(), false);
});

test("CPU chooses only from its observations and prioritizes a known opponent pair", () => {
  const game = fixture(1);
  game.memory[1].set(12, "alien0");
  game.memory[1].set(13, "alien0");
  assert.equal(game.cpuChoice(), 12);
  game.flip(12, 1);
  assert.equal(game.cpuChoice(), 13);
  const hidden = fixture(1);
  hidden.board.forEach((card, index) => {
    if (!hidden.memory[1].has(index)) Object.defineProperty(card, "type", { get() { throw new Error("CPU read a hidden card"); } });
  });
  assert.equal(typeof hidden.cpuChoice(), "number");
});

test("changing hidden identities does not change CPU choice", () => {
  const a = fixture(1);
  const b = fixture(1);
  [b.board[0], b.board[10]] = [b.board[10], b.board[0]];
  a.random = seeded(42);
  b.random = seeded(42);
  assert.equal(a.cpuChoice(), b.cpuChoice());
});

test("round changes reset hand, memory and placements while keeping scores", () => {
  const game = fixture();
  pair(game, 14, 15);
  assert.equal(game.nextRound(), true);
  assert.equal(game.round, 2);
  assert.deepEqual(game.scores, [1, 0]);
  assert.deepEqual(game.placement, []);
  assert.equal(game.memory[0].size, 0);
  assert.equal(game.items[0].size, 0);
});

test("twenty simulated matches complete without stuck phases or invalid scores", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const game = new Game({ random: seeded(seed), difficulty: seed % 2 ? "normal" : "easy" });
    let actions = 0;
    while (game.phase !== "matchEnd" && actions++ < 1500) {
      if (game.phase === "setup") {
        game.place(0);
        game.place(7);
        game.startRound();
      } else if (game.phase === "roundEnd") game.nextRound();
      else if (game.phase === "resolving") game.resolve();
      else if (game.phase === "review") game.finishEffect();
      else if (game.phase === "effect") {
        const choices = game.effectChoices();
        const unknown = choices.filter((index) => !game.memory[game.turn].has(index));
        game.selectEffect((unknown.length ? unknown : choices)[0], game.turn);
      } else if (game.turn === 1) game.flip(game.cpuChoice(), 1);
      else {
        const available = game.board.map((card, index) => index).filter((index) => game.board[index] && !game.selected.includes(index));
        const memory = game.memory[0];
        let choice;
        if (game.selected.length) {
          const first = memory.get(game.selected[0]);
          choice = available.find((index) => memory.get(index) === first && first !== game.alienType(0));
        } else {
          choice = available.find((index) => memory.has(index) && memory.get(index) !== game.alienType(0) && available.some((other) => other !== index && memory.get(other) === memory.get(index)));
        }
        if (choice === undefined) {
          const unknown = available.filter((index) => !memory.has(index));
          const safe = available.filter((index) => memory.get(index) !== game.alienType(0));
          choice = game.pick(unknown.length ? unknown : safe.length ? safe : available);
        }
        assert.equal(game.flip(choice, 0), true);
      }
      assert.equal(game.scores.every((score) => score >= 0 && score <= 3), true);
    }
    assert.equal(game.phase, "matchEnd", `seed ${seed} did not finish`);
    assert.equal(Math.max(...game.scores), 3);
  }
});
