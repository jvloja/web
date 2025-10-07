document.addEventListener('DOMContentLoaded', () => {
    const socialMenuToggle = document.getElementById('social-menu-toggle');
    const socialMenu = document.getElementById('social-menu');

    // Ensure menu is initially hidden
    socialMenu.style.display = 'none';
    socialMenu.classList.remove('active');

    socialMenuToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const isActive = socialMenu.classList.contains('active');
        
        if (isActive) {
            socialMenu.classList.remove('active');
            socialMenu.style.display = 'none';
        } else {
            socialMenu.classList.add('active');
            socialMenu.style.display = 'flex';
        }
    });

    // Handle keyboard support
    socialMenuToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            socialMenuToggle.click();
        }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (event) => {
        if (!socialMenuToggle.contains(event.target) && !socialMenu.contains(event.target)) {
            socialMenu.classList.remove('active');
            socialMenu.style.display = 'none';
        }
    });

    // Close menu when clicking on social links
    const socialLinks = socialMenu.querySelectorAll('.social-icon');
    socialLinks.forEach(link => {
        link.addEventListener('click', () => {
            socialMenu.classList.remove('active');
            socialMenu.style.display = 'none';
        });
    });
});