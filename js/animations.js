/* =========================
   RUSTCHEM ANIMATIONS
========================= */

// Smooth fade-in on scroll
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add("show");
        }
    });
});

document.querySelectorAll(
    ".server-card, .rule-card, .feature-card, .shop-banner"
).forEach(el => observer.observe(el));

/* =========================
   FLOATING CRYSTALS
========================= */

document.querySelectorAll(".crystal").forEach((crystal, i) => {
    let speed = 0.2 + i * 0.1;

    function animate() {
        let y = Math.sin(Date.now() * speed * 0.001) * 10;
        let x = Math.cos(Date.now() * speed * 0.001) * 8;

        crystal.style.transform = `translate(${x}px, ${y}px) rotate(25deg)`;
        requestAnimationFrame(animate);
    }

    animate();
});

/* =========================
   HERO CRYSTAL PULSE
========================= */

const mainCrystal = document.querySelector(".main-crystal");

if (mainCrystal) {
    setInterval(() => {
        mainCrystal.style.filter = "brightness(1.2)";
        setTimeout(() => {
            mainCrystal.style.filter = "brightness(1)";
        }, 300);
    }, 2000);
}

/* =========================
   BUTTON MICRO INTERACTIONS
========================= */

document.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("mouseenter", () => {
        btn.style.letterSpacing = "1px";
    });

    btn.addEventListener("mouseleave", () => {
        btn.style.letterSpacing = "0px";
    });
});