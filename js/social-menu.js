document.addEventListener('DOMContentLoaded', () => {
    const socialMenuToggle = document.getElementById('social-menu-toggle');
    const socialMenu = document.getElementById('social-menu');

    socialMenuToggle.addEventListener('click', () => {
        socialMenu.classList.toggle('active');
    });

    // Optional: Close menu when clicking outside
    document.addEventListener('click', (event) => {
        if (!socialMenuToggle.contains(event.target) && !socialMenu.contains(event.target)) {
            socialMenu.classList.remove('active');
        }
    });
});