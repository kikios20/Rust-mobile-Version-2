/* =========================
   RUSTCHEM ANIMATIONS - OPTIMIZED
========================= */

// Add show class immediately (no IntersectionObserver)
document.querySelectorAll(
    ".server-card, .rule-card, .feature-card, .shop-banner"
).forEach(el => el.classList.add("show"));

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
