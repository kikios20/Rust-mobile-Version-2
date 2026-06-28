/* =========================
   RUSTCHEM UI LOGIC v1
========================= */

// Smooth scroll by menu
document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener("click", (e) => {
        e.preventDefault();
        const target = document.querySelector(link.getAttribute("href"));
        if (target) {
            target.scrollIntoView({ behavior: "smooth" });
        }
    });
});

// Connect buttons
document.querySelectorAll(".card .btn").forEach(btn => {
    btn.addEventListener("click", () => {
        btn.innerText = "Подключение...";
        btn.disabled = true;

        setTimeout(() => {
            btn.innerText = "Подключено ✓";
            btn.style.background = "linear-gradient(135deg, #00ff99, #00e5ff)";
        }, 1200);
    });
});
