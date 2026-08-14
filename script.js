const PRODUCT_CONFIG = {
  title: "潜伏者たち",
  price: "税込 2,800円",
  buyUrl: "#trial",
  ctaLabel: "試遊会を見る",
  players: "2人",
  playTime: "15-20分",
  age: "8歳以上",
  images: {
    product: "",
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
    link.href = PRODUCT_CONFIG.buyUrl || "#trial";
  });

  Object.entries(PRODUCT_CONFIG.images.cards).forEach(([id, src]) => {
    if (!src) return;
    const card = document.querySelector(`[data-card-id="${id}"]`);
    if (card) replaceWithImage(card, src, `${PRODUCT_CONFIG.title}の${id}カード`);
  });

  if (PRODUCT_CONFIG.images.product) {
    const product = document.querySelector("[data-product-id='box']");
    if (product) replaceWithImage(product, PRODUCT_CONFIG.images.product, `${PRODUCT_CONFIG.title}の商品画像`);
  }

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

applyProductConfig();
setCurrentYear();
revealOnScroll();
