const PRODUCT_CONFIG = {
  title: "潜伏者たち",
  price: "税込 2,800円",
  buyUrl: "#buy",
  ctaLabel: "販売リンク準備中",
  players: "2人",
  playTime: "15-25分",
  age: "10歳以上",
  images: {
    product: "",
    cards: {
      alien: "",
      event: "",
      item: ""
    }
  }
};

const setText = (key, value) => {
  document.querySelectorAll(`[data-config="${key}"]`).forEach((node) => {
    node.textContent = value;
  });
};

const applyProductConfig = () => {
  Object.entries(PRODUCT_CONFIG).forEach(([key, value]) => {
    if (typeof value === "string") {
      setText(key, value);
    }
  });

  document.title = `${PRODUCT_CONFIG.title} | 推理×神経衰弱のボードゲーム`;
  document.querySelectorAll("[data-buy-link]").forEach((link) => {
    link.href = PRODUCT_CONFIG.buyUrl || "#buy";
  });

  const productFrame = document.querySelector('[data-image-frame="product"]');
  if (productFrame && PRODUCT_CONFIG.images.product) {
    productFrame.classList.add("has-image");
    productFrame.innerHTML = `<img src="${PRODUCT_CONFIG.images.product}" alt="${PRODUCT_CONFIG.title}の商品画像">`;
  }

  Object.entries(PRODUCT_CONFIG.images.cards).forEach(([id, src]) => {
    if (!src) return;

    const card = document.querySelector(`[data-card-id="${id}"]`);
    if (!card) return;

    card.classList.add("has-image");
    card.innerHTML = `<img src="${src}" alt="${PRODUCT_CONFIG.title}の${id}カード画像">`;
  });
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
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.16 }
  );

  targets.forEach((target) => observer.observe(target));
};

const setCurrentYear = () => {
  document.querySelectorAll("[data-year]").forEach((node) => {
    node.textContent = new Date().getFullYear();
  });
};

applyProductConfig();
setCurrentYear();
revealOnScroll();
