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
