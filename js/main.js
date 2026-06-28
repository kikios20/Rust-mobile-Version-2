// RUSTCHEM - Main JavaScript

const burger = document.getElementById("burger");
const menu = document.getElementById("mobileMenu");

burger.addEventListener("click", () => {
    menu.classList.toggle("active");
});