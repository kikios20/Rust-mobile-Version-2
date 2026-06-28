/* =========================
   RUSTCHEM ANIMATIONS
========================= */


// Smooth fade-in on scroll
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add("show");
            // Once revealed, stop watching it — no need to keep
            // checking elements that have already animated in.
            observer.unobserve(entry.target);
        }
    });
});


document.querySelectorAll(
    ".server-card, .rule-card, .feature-card, .shop-banner"
).forEach(el => observer.observe(el));


/* =========================
   FLOATING CRYSTALS & HERO PULSE
   Moved to pure CSS (@keyframes floatCrystal / pulseGlow in
   style.css). The old version ran requestAnimationFrame forever
   for every crystal, and a setInterval/setTimeout pair for the
   hero crystal pulse — both running on the main thread even when
   the elements were off-screen. CSS animations are handled by
   the browser's own animation engine, which is far cheaper,
   especially on mobile, and they pause automatically when not
   visible.
========================= */


/* =========================
   BUTTON MICRO INTERACTIONS
========================= */


// Only attach hover-driven effects on devices that actually
// support hover (mouse/trackpad). On touch screens, "mouseenter"
// fires on tap but "mouseleave" often doesn't, which used to
// leave buttons stuck with expanded letter-spacing after a tap.
if (window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("mouseenter", () => {
            btn.style.letterSpacing = "1px";
        });


        btn.addEventListener("mouseleave", () => {
            btn.style.letterSpacing = "0px";
        });
    });
}