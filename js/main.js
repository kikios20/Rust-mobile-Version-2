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