const PRODUCT_CONFIG = {
  title: "潜伏者たち",
  price: "税込 2,800円",
  buyUrl: "https://shiyutaku.com/home",
  ctaLabel: "テストプレイ",
  players: "2〜4人",
  playTime: "15-20分",
  age: "6歳以上",
  images: {
    cards: {
      alien: "",
      event: "",
      item: ""
    },
    qr: {
      web: "",
      youtube: ""
    }
  },
  videoUrl: ""
};

const HOWTO_VIDEO_STEPS = [
  {
    title: "記憶と推理で正体を探る",
    copy: "場のカードの位置を覚えながら、相手が見た情報と行動を読み合います。"
  },
  {
    title: "カードを並べる",
    copy: "イベント、アイテム、はずれカードを混ぜ、エイリアンカードを場に隠します。"
  },
  {
    title: "2枚めくる",
    copy: "自分のターンに場のカードを2枚選び、同じカードなら獲得します。"
  },
  {
    title: "相手の記憶を読む",
    copy: "どのカードを見たか、どこへ戻したか。小さな行動がヒントになります。"
  },
  {
    title: "エイリアンを追加する",
    copy: "1ラウンドに1回、手元のエイリアンカードを場に追加できます。"
  },
  {
    title: "正体を暴く",
    copy: "相手のエイリアンカードを2枚そろえると得点。先に3点で勝利です。"
  }
];

const setText = (key, value) => {
  document.querySelectorAll(`[data-config="${key}"]`).forEach((node) => {
    node.textContent = value;
  });
};

const replaceWithImage = (element, src, alt) => {
  element.classList.add("has-image");
  element.innerHTML = `<img src="${src}" alt="${alt}">`;
};

const applyProductConfig = () => {
  Object.entries(PRODUCT_CONFIG).forEach(([key, value]) => {
    if (typeof value === "string") setText(key, value);
  });

  document.title = `${PRODUCT_CONFIG.title} | UNDERCOVER ALIENS`;

  document.querySelectorAll("[data-buy-link]").forEach((link) => {
    link.href = PRODUCT_CONFIG.buyUrl || "#shiyutaku";
  });

  Object.entries(PRODUCT_CONFIG.images.cards).forEach(([id, src]) => {
    if (!src) return;
    const card = document.querySelector(`[data-card-id="${id}"]`);
    if (card) replaceWithImage(card, src, `${PRODUCT_CONFIG.title}の${id}カード`);
  });

  Object.entries(PRODUCT_CONFIG.images.qr).forEach(([id, src]) => {
    if (!src) return;
    const qr = document.querySelector(`[data-qr-id="${id}"]`);
    if (qr) replaceWithImage(qr, `${src}`, `${id}のQRコード`);
  });

  const videoButton = document.querySelector("[data-video-button]");
  if (videoButton && PRODUCT_CONFIG.videoUrl) {
    videoButton.addEventListener("click", () => {
      window.open(PRODUCT_CONFIG.videoUrl, "_blank", "noopener");
    });
  }
};

const revealOnScroll = () => {
  const targets = document.querySelectorAll(".reveal");

  if (!("IntersectionObserver" in window)) {
    targets.forEach((target) => target.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.14 }
  );

  targets.forEach((target) => observer.observe(target));
};

const setCurrentYear = () => {
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = new Date().getFullYear();
  });
};

const initHowtoVideo = () => {
  const root = document.querySelector("[data-howto-video]");
  if (!root) return;

  const title = root.querySelector("[data-video-title]");
  const copy = root.querySelector("[data-video-copy]");
  const progress = root.querySelector("[data-video-progress]");
  const toggle = root.querySelector("[data-video-toggle]");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let index = 0;
  let timer = null;
  let paused = reduceMotion;

  const render = () => {
    root.classList.remove(...HOWTO_VIDEO_STEPS.map((_, stepIndex) => `step-${stepIndex}`));
    root.classList.add(`step-${index}`);
    title.textContent = HOWTO_VIDEO_STEPS[index].title;
    copy.textContent = HOWTO_VIDEO_STEPS[index].copy;
    progress.style.width = `${((index + 1) / HOWTO_VIDEO_STEPS.length) * 100}%`;
  };

  const start = () => {
    if (paused || timer) return;
    timer = window.setInterval(() => {
      index = (index + 1) % HOWTO_VIDEO_STEPS.length;
      render();
    }, 3600);
  };

  const stop = () => {
    if (!timer) return;
    window.clearInterval(timer);
    timer = null;
  };

  toggle.addEventListener("click", () => {
    paused = !paused;
    root.classList.toggle("is-paused", paused);
    toggle.textContent = paused ? "再生" : "一時停止";
    if (paused) {
      stop();
    } else {
      start();
    }
  });

  root.classList.toggle("is-paused", paused);
  toggle.textContent = paused ? "再生" : "一時停止";
  render();
  start();
};

applyProductConfig();
setCurrentYear();
revealOnScroll();
initHowtoVideo();
