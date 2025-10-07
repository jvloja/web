import config from './config.js';
import * as utils from './utils.js';
import RadioPlayer from './radio-player.js';

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Ensure DOM is fully loaded before initializing
    const radioPlayer = new RadioPlayer();
    
    // Enhanced mobile compatibility
    handleMobileCompatibility();
    
    // Handle orientation changes
    window.addEventListener('orientationchange', () => {
        setTimeout(() => {
            // Recalculate layout after orientation change
            const artwork = document.getElementById('artist-artwork');
            if (artwork) {
                artwork.style.height = artwork.offsetWidth + 'px';
            }
        }, 100);
    });
});

function handleMobileCompatibility() {
    // Detect mobile devices
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
        document.body.classList.add('mobile-device');
        
        // Prevent double tap zoom
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault();
            }
            lastTouchEnd = now;
        }, { passive: false });
        
        // Prevent zoom on double tap
        document.addEventListener('touchstart', (event) => {
            if (event.touches.length > 1) {
                event.preventDefault();
            }
        }, { passive: false });
        
        // Handle iOS specific issues
        if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            document.body.classList.add('ios-device');
            
            // Fix for iOS audio context
            const fixIOSScroll = () => {
                setTimeout(() => {
                    window.scrollTo(0, 0);
                }, 100);
            };
            
            window.addEventListener('load', fixIOSScroll);
            window.addEventListener('orientationchange', fixIOSScroll);
        }
        
        // Handle Android specific issues
        if (/Android/i.test(navigator.userAgent)) {
            document.body.classList.add('android-device');
            
            // Fix for Android viewport issues
            const viewport = document.querySelector('meta[name=viewport]');
            if (viewport) {
                viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
            }
        }
    }
    
    // Cross-browser audio support
    const audio = document.getElementById('radio-player');
    
    // Ensure audio element has proper attributes for mobile
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
    
    // Handle browser compatibility for audio formats
    const canPlayMP3 = audio.canPlayType('audio/mpeg');
    const canPlayAAC = audio.canPlayType('audio/aac');
    
    if (!canPlayMP3 && !canPlayAAC) {
        console.warn('Audio format not supported on this browser');
    }
}

// Handle browser-specific quirks
(function handleBrowserQuirks() {
    // Chrome requires user interaction for audio
    if (/Chrome/i.test(navigator.userAgent)) {
        document.body.classList.add('chrome-browser');
    }
    
    // Firefox has different audio context handling
    if (/Firefox/i.test(navigator.userAgent)) {
        document.body.classList.add('firefox-browser');
    }
    
    // Safari has specific audio requirements
    if (/Safari/i.test(navigator.userAgent) && !/Chrome/i.test(navigator.userAgent)) {
        document.body.classList.add('safari-browser');
    }
})();