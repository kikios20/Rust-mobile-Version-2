// RUSTCHEM - Main JavaScript

const burger = document.getElementById("burger");
const menu = document.getElementById("mobileMenu");

// Burger menu toggle
burger.addEventListener("click", () => {
    menu.classList.toggle("active");
});

// Close mobile menu when clicking a link
menu.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", () => {
        menu.classList.remove("active");
    });
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute("href"));
        if (target) {
            target.scrollIntoView({ behavior: "smooth" });
        }
    });
});

// Copy server IP to clipboard
document.querySelectorAll(".copy-ip").forEach(btn => {
    btn.addEventListener("click", function() {
        const ip = this.dataset.ip;
        navigator.clipboard.writeText(ip).then(() => {
            const original = this.textContent;
            this.textContent = "Скопировано!";
            setTimeout(() => {
                this.textContent = original;
            }, 1500);
        });
    });
});

// Modal logic
const loginModal = document.getElementById("loginModal");
const registerModal = document.getElementById("registerModal");
const closeLogin = document.getElementById("closeLogin");
const closeRegister = document.getElementById("closeRegister");
const switchToRegister = document.getElementById("switchToRegister");
const switchToLogin = document.getElementById("switchToLogin");
const openLogin = document.getElementById("openLogin");
const openRegister = document.getElementById("openRegister");

function openModal(modal) {
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
}

function closeModal(modal) {
    modal.classList.remove("active");
    document.body.style.overflow = "";
}

if (openLogin) openLogin.addEventListener("click", (e) => { e.preventDefault(); openModal(loginModal); });
if (openRegister) openRegister.addEventListener("click", (e) => { e.preventDefault(); openModal(registerModal); });
if (closeLogin) closeLogin.addEventListener("click", () => closeModal(loginModal));
if (closeRegister) closeRegister.addEventListener("click", () => closeModal(registerModal));

if (switchToRegister) switchToRegister.addEventListener("click", (e) => {
    e.preventDefault();
    closeModal(loginModal);
    setTimeout(() => openModal(registerModal), 100);
});

if (switchToLogin) switchToLogin.addEventListener("click", (e) => {
    e.preventDefault();
    closeModal(registerModal);
    setTimeout(() => openModal(loginModal), 100);
});

// Close modal on background click
[loginModal, registerModal].forEach(modal => {
    if (modal) modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal);
    });
});
