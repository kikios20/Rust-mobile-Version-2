// RUSTCHEM - Main JavaScript


const burger = document.getElementById("burger");
const menu = document.getElementById("mobileMenu");


// Guard in case the markup ever changes and one of these IDs goes
// missing — without this, a missing element would throw an error
// and silently stop every script after it from running.
if (burger && menu) {
    burger.addEventListener("click", () => {
        menu.classList.toggle("active");
    });


    // Close the mobile menu when a link inside it is tapped,
    // instead of leaving it open over the page content.
    menu.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            menu.classList.remove("active");
        });
    });
}
// Mobile browsers often don't trigger the CSS :active state on plain
// divs (like .feature-card) unless there's a touch listener present
// somewhere on the page. This empty listener "wakes up" :active
// styling site-wide without changing any behavior.
// Use a JS-driven "pressed" class instead of CSS :active, since
// :active on mobile only tracks the exact element the touch started
// on and can behave inconsistently across a card's full surface.
document.querySelectorAll('.server-card, .rule-card, .feature-card').forEach(function(card) {
    card.addEventListener('touchstart', function() {
        card.classList.add('pressed');
    }, { passive: true });
    card.addEventListener('touchend', function() {
        card.classList.remove('pressed');
    });
    card.addEventListener('touchcancel', function() {
        card.classList.remove('pressed');
    });
});
