const WHATSAPP_NUMBER = "628970788800";
const DESKTOP_BREAKPOINT = 980;
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const header = document.querySelector(".header");
const nav = document.querySelector(".nav");
const navToggle = document.querySelector(".nav-toggle");
const navToggleText = navToggle?.querySelector(".nav-toggle-text");
const navMenu = document.querySelector(".nav-menu");
const navBackdrop = document.querySelector(".nav-backdrop");
const navLinks = document.querySelectorAll(".nav-menu a[href^='#']");
const yearEl = document.getElementById("year");
const revealElements = document.querySelectorAll(".reveal");
const counters = document.querySelectorAll(".counter");
const faqItems = document.querySelectorAll(".faq-item");
const waLinks = document.querySelectorAll(".wa-link");
const waNumberFields = document.querySelectorAll("[data-wa-number]");
const contactForm = document.getElementById("contact-form");

const buildWaUrl = (message = "") => {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
};

const syncWhatsAppLinks = () => {
  waLinks.forEach((link) => {
    const message = link.dataset.message || "";
    link.href = buildWaUrl(message);
  });

  waNumberFields.forEach((field) => {
    field.textContent = WHATSAPP_NUMBER;
  });
};

const handleHeaderState = () => {
  if (!header) {
    return;
  }

  header.classList.toggle("scrolled", window.scrollY > 16);
};

const setNavState = (isOpen) => {
  if (!nav || !navMenu || !navToggle) {
    return;
  }

  nav.classList.toggle("nav-open", isOpen);
  navMenu.classList.toggle("is-open", isOpen);
  navToggle.setAttribute("aria-expanded", String(isOpen));
  navToggle.setAttribute("aria-label", isOpen ? "Tutup menu" : "Buka menu");
  document.body.classList.toggle("menu-open", isOpen && window.innerWidth < DESKTOP_BREAKPOINT);

  if (navToggleText) {
    navToggleText.textContent = isOpen ? "Tutup" : "Menu";
  }
};

const closeNav = () => setNavState(false);
const openNav = () => setNavState(true);

if (navToggle && navMenu && nav) {
  navToggle.addEventListener("click", () => {
    const isOpen = navMenu.classList.contains("is-open");
    if (isOpen) {
      closeNav();
      return;
    }

    openNav();
  });

  navBackdrop?.addEventListener("click", closeNav);

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) {
      closeNav();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeNav();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= DESKTOP_BREAKPOINT) {
      closeNav();
    }
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", closeNav);
});

faqItems.forEach((item) => {
  const button = item.querySelector(".faq-question");
  const answer = item.querySelector(".faq-answer");

  if (!button || !answer) {
    return;
  }

  button.addEventListener("click", () => {
    const isOpen = item.classList.contains("is-open");

    faqItems.forEach((faqItem) => {
      const currentButton = faqItem.querySelector(".faq-question");
      const currentAnswer = faqItem.querySelector(".faq-answer");

      faqItem.classList.remove("is-open");
      currentButton?.setAttribute("aria-expanded", "false");

      if (currentAnswer) {
        currentAnswer.style.maxHeight = null;
      }
    });

    if (!isOpen) {
      item.classList.add("is-open");
      button.setAttribute("aria-expanded", "true");
      answer.style.maxHeight = `${answer.scrollHeight}px`;
    }
  });
});

const revealImmediately = () => {
  revealElements.forEach((element) => element.classList.add("is-visible"));
};

if ("IntersectionObserver" in window && !prefersReducedMotion.matches) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.18 });

  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealImmediately();
}

const setCounterValue = (counter, value) => {
  const suffix = counter.dataset.suffix || "";
  counter.textContent = `${value.toLocaleString("id-ID")}${suffix}`;
};

const animateCounter = (counter) => {
  const target = Number(counter.dataset.target || 0);
  const duration = 1300;
  const startTime = performance.now();

  const updateCounter = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(target * eased);

    setCounterValue(counter, currentValue);

    if (progress < 1) {
      window.requestAnimationFrame(updateCounter);
    }
  };

  window.requestAnimationFrame(updateCounter);
};

if ("IntersectionObserver" in window && !prefersReducedMotion.matches) {
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        return;
      }

      animateCounter(entry.target);
      counterObserver.unobserve(entry.target);
    });
  }, { threshold: 0.7 });

  counters.forEach((counter) => counterObserver.observe(counter));
} else {
  counters.forEach((counter) => {
    setCounterValue(counter, Number(counter.dataset.target || 0));
  });
}

if (contactForm) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const payload = {
      name: formData.get("name")?.toString().trim(),
      phone: formData.get("phone")?.toString().trim(),
      service: formData.get("service")?.toString().trim(),
      message: formData.get("message")?.toString().trim()
    };

    const waMessage = [
      "Halo Indo Sejuk AC, saya ingin konsultasi layanan.",
      "",
      `Nama: ${payload.name}`,
      `Nomor WhatsApp: ${payload.phone}`,
      `Jenis Layanan: ${payload.service}`,
      `Detail Kebutuhan: ${payload.message}`
    ].join("\n");

    window.open(buildWaUrl(waMessage), "_blank", "noopener");
    contactForm.reset();
  });
}

if (yearEl) {
  yearEl.textContent = new Date().getFullYear();
}

syncWhatsAppLinks();
handleHeaderState();
window.addEventListener("scroll", handleHeaderState, { passive: true });
