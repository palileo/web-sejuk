const WHATSAPP_NUMBER = "628970788800";

const header = document.querySelector(".header");
const nav = document.querySelector(".nav");
const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.querySelector(".nav-menu");
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
  header.classList.toggle("scrolled", window.scrollY > 16);
};

const closeNav = () => {
  if (!nav || !navMenu || !navToggle) {
    return;
  }

  nav.classList.remove("nav-open");
  navMenu.classList.remove("is-open");
  navToggle.setAttribute("aria-expanded", "false");
};

const openNav = () => {
  if (!nav || !navMenu || !navToggle) {
    return;
  }

  nav.classList.add("nav-open");
  navMenu.classList.add("is-open");
  navToggle.setAttribute("aria-expanded", "true");
};

if (navToggle) {
  navToggle.addEventListener("click", () => {
    const isOpen = navMenu.classList.contains("is-open");
    if (isOpen) {
      closeNav();
      return;
    }

    openNav();
  });

  document.addEventListener("click", (event) => {
    if (!nav.contains(event.target)) {
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

  button.addEventListener("click", () => {
    const isOpen = item.classList.contains("is-open");

    faqItems.forEach((faqItem) => {
      faqItem.classList.remove("is-open");
      faqItem.querySelector(".faq-question").setAttribute("aria-expanded", "false");
      faqItem.querySelector(".faq-answer").style.maxHeight = null;
    });

    if (!isOpen) {
      item.classList.add("is-open");
      button.setAttribute("aria-expanded", "true");
      answer.style.maxHeight = `${answer.scrollHeight}px`;
    }
  });
});

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

const animateCounter = (counter) => {
  const target = Number(counter.dataset.target || 0);
  const suffix = counter.dataset.suffix || "";
  const duration = 1300;
  const startTime = performance.now();

  const updateCounter = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const currentValue = Math.round(target * eased);

    counter.textContent = `${currentValue.toLocaleString("id-ID")}${suffix}`;

    if (progress < 1) {
      window.requestAnimationFrame(updateCounter);
    }
  };

  window.requestAnimationFrame(updateCounter);
};

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
