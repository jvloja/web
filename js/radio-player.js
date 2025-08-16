import config from './config.js';
import * as utils from './utils.js';

// Global callback for JSONP
window.handleDeezerResponse = function(data) {
    const artworkElement = document.getElementById('artist-artwork');
    if (data.data && data.data.length > 0 && data.data[0].album) {
        const artworkUrl = data.data[0].album.cover_xl || 
                          data.data[0].album.cover_big || 
                          data.data[0].album.cover_medium || 
                          config.DEFAULT_ARTWORK;
        artworkElement.src = artworkUrl;
    }
};

export default class RadioPlayer {
    constructor() {
        // Initialize DOM elements
        this.audioElement = document.getElementById('radio-player');
        this.playPauseButton = document.getElementById('play-pause-btn');
        this.playPauseIcon = this.playPauseButton.querySelector('i');
        this.artistArtwork = document.getElementById('artist-artwork');
        this.artistNameElement = document.getElementById('artist-name');
        this.trackTitleElement = document.getElementById('track-title');
        this.albumInfoElement = document.getElementById('album-info');
        this.errorMessageElement = document.getElementById('error-message');
        this.progressBar = document.getElementById('progress-bar');
        this.currentTimeElement = document.getElementById('current-time');
        this.totalTimeElement = document.getElementById('total-time');
        this.volumeControl = document.getElementById('volume-control');
        this.volumeIcon = document.getElementById('volume-icon');

        // Additional properties
        this.currentTrackDuration = 0;
        this.metadataInterval = null;
        this.lastMetadataUpdate = Date.now();

        // New property for EventSource
        this.metadataEventSource = null;

        // Add audio context for mobile compatibility
        this.audioContext = null;
        this.setupAudioContext();

        // Bind methods
        this.togglePlayPause = this.togglePlayPause.bind(this);
        this.updateVolume = this.updateVolume.bind(this);
        this.handlePlaybackError = this.handlePlaybackError.bind(this);
        this.fetchMetadata = this.fetchMetadata.bind(this);
        this.updateProgressBar = this.updateProgressBar.bind(this);
        this.handleMetadataUpdate = this.handleMetadataUpdate.bind(this);

        this.setupEventListeners();
        this.initializePlayer();
        this.changeTitlePage();
    }

    setupAudioContext() {
        // Create audio context for mobile compatibility
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            try {
                this.audioContext = new AudioContext();
                
                // Resume audio context on first user interaction
                const resumeAudio = () => {
                    if (this.audioContext && this.audioContext.state === 'suspended') {
                        this.audioContext.resume().catch(console.error);
                    }
                    // Remove event listeners after first interaction
                    document.removeEventListener('click', resumeAudio);
                    document.removeEventListener('touchstart', resumeAudio);
                };
                
                document.addEventListener('click', resumeAudio);
                document.addEventListener('touchstart', resumeAudio);
            } catch (error) {
                console.warn('AudioContext not supported:', error);
            }
        }
    }

    setupEventListeners() {
        // Play/Pause button listener with touch support
        this.playPauseButton.addEventListener('click', this.togglePlayPause);
        this.playPauseButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.togglePlayPause();
        });

        // Volume control listener with better mobile support
        this.volumeControl.addEventListener('input', this.updateVolume);
        this.volumeControl.addEventListener('change', this.updateVolume);

        // Audio element event listeners
        this.audioElement.addEventListener('error', this.handlePlaybackError);
        this.audioElement.addEventListener('canplay', () => {
            this.updateTotalTime();
        });
        this.audioElement.addEventListener('timeupdate', this.updateProgressBar);
        
        // Handle mobile playback restrictions
        this.audioElement.addEventListener('loadedmetadata', () => {
            console.log('Audio metadata loaded');
        });
    }

    initializePlayer() {
        // Set initial volume
        this.audioElement.volume = 1.0;
        this.volumeControl.value = 1.0;

        // Set stream URL
        this.audioElement.src = config.RADIO_STREAM_URL;

        // Start metadata fetching
        this.fetchMetadata();
    }

    changeTitlePage(title = config.RADIO_NAME) {
        document.title = title;
    }

    togglePlayPause() {
        if (this.audioElement.paused) {
            // Ensure audio context is resumed for mobile
            if (this.audioContext && this.audioContext.state === 'suspended') {
                this.audioContext.resume().then(() => {
                    this.playAudio();
                }).catch((error) => {
                    console.error('AudioContext resume failed:', error);
                    this.handlePlaybackError(error);
                });
            } else {
                this.playAudio();
            }
        } else {
            this.audioElement.pause();
            this.playPauseIcon.classList.remove('fa-pause');
            this.playPauseIcon.classList.add('fa-play');
            this.stopMetadataPolling();

            // Suspend audio context to save resources
            if (this.audioContext) {
                this.audioContext.suspend();
            }
        }
    }

    playAudio() {
        // Handle mobile autoplay restrictions
        const playPromise = this.audioElement.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                this.playPauseIcon.classList.remove('fa-play');
                this.playPauseIcon.classList.add('fa-pause');
                this.startMetadataPolling();
                console.log('Playback started successfully');
            }).catch((error) => {
                console.error('Playback failed:', error);
                
                // Handle specific mobile errors
                if (error.name === 'NotAllowedError') {
                    // Show user interaction required message
                    this.errorMessageElement.textContent = 'Tap to play audio';
                    setTimeout(() => {
                        this.errorMessageElement.textContent = '';
                    }, 3000);
                } else if (error.name === 'NotSupportedError') {
                    this.errorMessageElement.textContent = 'Audio format not supported';
                } else {
                    this.handlePlaybackError(error);
                }
            });
        } else {
            // Fallback for older browsers
            this.audioElement.play().catch(this.handlePlaybackError);
        }
    }

    updateVolume() {
        const volume = parseFloat(this.volumeControl.value);
        this.audioElement.volume = volume;

        // Update volume icon
        if (volume === 0) {
            this.volumeIcon.className = 'fas fa-volume-mute';
        } else if (volume < 0.5) {
            this.volumeIcon.className = 'fas fa-volume-down';
        } else {
            this.volumeIcon.className = 'fas fa-volume-up';
        }
    }

    fetchMetadata() {
        try {
            // This method is now mainly for fallback
            // The main artwork fetching happens via EventSource/Zeno metadata
            this.metadataEventSource = new EventSource(config.ZENO_METADATA_URL);
            
            this.metadataEventSource.onmessage = (event) => {
                try {
                    const metadata = JSON.parse(event.data);
                    this.handleMetadataUpdate(metadata);
                } catch (parseError) {
                    console.error('Metadata parsing error:', parseError);
                }
            };

            this.metadataEventSource.onerror = (error) => {
                console.error('EventSource error:', error);
                this.stopMetadataPolling();
            };
        } catch (error) {
            console.error('EventSource error:', error);
        }
    }

    handleMetadataUpdate(metadata) {
        if (metadata && metadata.streamTitle) {
            // Split stream title into artist and track
            const parts = metadata.streamTitle.split(' - ');
            const artist = parts[0] || 'Unknown Artist';
            const title = parts[1] || 'Unknown Track';
            const duration = metadata.duration || 0;

            // Validate duration
            const validDuration = isFinite(duration) && duration > 0 ? duration : 180; // Default to 3 minutes if no duration

            // Update track information
            this.artistNameElement.textContent = artist;
            this.trackTitleElement.textContent = title;
            // Remove the album info text, leave it empty to only show the progress bar
            this.albumInfoElement.textContent = '';

            // Update total time display
            this.currentTrackDuration = validDuration;
            this.updateTotalTime(validDuration);

            // Fetch artwork
            this.refreshCover(title, artist);
            
            // Reset progress when new track starts
            this.lastMetadataUpdate = Date.now();
            this.progressBar.style.width = '0%';
            this.currentTimeElement.textContent = '0:00';
        }
    }

    formatDuration(seconds) {
        if (!seconds || seconds <= 0) return '';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }

    refreshCover(song = '', artist) {
        const script = document.createElement('script');
        script.src = `https://api.deezer.com/search?q=${encodeURIComponent(artist + ' ' + song)}&output=jsonp&callback=handleDeezerResponse`;
        document.body.appendChild(script);
        script.remove();
    }

    startMetadataPolling() {
        this.lastMetadataUpdate = Date.now();
        this.fetchMetadata();
    }

    stopMetadataPolling() {
        if (this.metadataEventSource) {
            this.metadataEventSource.close();
            this.metadataEventSource = null;
        }
        
        // Clear any existing interval as a fallback
        if (this.metadataInterval) {
            clearInterval(this.metadataInterval);
            this.metadataInterval = null;
        }
    }

    updateProgressBar() {
        const duration = this.currentTrackDuration;
        
        if (duration > 0 && isFinite(duration)) {
            const elapsed = (Date.now() - this.lastMetadataUpdate) / 1000;
            const progressPercent = Math.min((elapsed / duration) * 100, 100);
            
            this.progressBar.style.width = `${progressPercent}%`;
            this.currentTimeElement.textContent = this.formatTime(elapsed);
            
            // Auto-reset when track duration is reached
            if (elapsed >= duration) {
                this.progressBar.style.width = '0%';
                this.currentTimeElement.textContent = '0:00';
                this.lastMetadataUpdate = Date.now();
            }
        } else {
            // Show live stream indicator
            this.progressBar.style.width = '100%';
            this.currentTimeElement.textContent = 'LIVE';
            this.totalTimeElement.textContent = 'LIVE';
        }
    }

    updateTotalTime(duration = null) {
        const trackDuration = duration || this.currentTrackDuration || 0;
        
        if (isFinite(trackDuration) && trackDuration > 0) {
            this.totalTimeElement.textContent = this.formatTime(trackDuration);
            this.currentTrackDuration = trackDuration;
        } else {
            this.totalTimeElement.textContent = '0:00';
            this.currentTrackDuration = 0;
        }
    }

    handlePlaybackError(error) {
        console.error('Playback error:', error);
        this.errorMessageElement.textContent = 'Unable to play stream. Please try again later.';
        
        // Clear error message after some time
        setTimeout(() => {
            this.errorMessageElement.textContent = '';
        }, config.ERROR_DISPLAY_DURATION);

        // Reset play button
        this.playPauseIcon.classList.remove('fa-pause');
        this.playPauseIcon.classList.add('fa-play');
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds <= 0 || !isFinite(seconds)) return '0:00';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }

    // New method to apply multicolor background
    applyMulticolorBackground() {
        // Apply animated multicolor gradient
        document.body.style.background = 'var(--multicolor-gradient-animated)';
        document.body.style.backgroundSize = '400% 400%';
        document.body.style.animation = 'gradient-shift 15s ease infinite';

        // Add keyframes for gradient animation
        const styleSheet = document.createElement('style');
        styleSheet.type = 'text/css';
        styleSheet.innerText = `
            @keyframes gradient-shift {
                0% {background-position: 0% 50%;}
                50% {background-position: 100% 50%;}
                100% {background-position: 0% 50%;}
            }
        `;
        document.head.appendChild(styleSheet);

        // Semi-transparent player container
        const playerContainer = document.getElementById('player-container');
        playerContainer.style.background = 'rgba(255, 255, 255, 0.1)';
        playerContainer.style.backdropFilter = 'blur(15px)';
    }

    // Optional: Method to extract artwork colors (you can reuse existing color extraction logic)
    getArtworkColors() {
        const artworkElement = this.artistArtwork;
        if (!artworkElement) return null;

        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = artworkElement.width;
            canvas.height = artworkElement.height;
            
            ctx.drawImage(artworkElement, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            
            let r = 0, g = 0, b = 0;
            let count = 0;
            
            for (let i = 0; i < data.length; i += 4) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
            }
            
            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);
            
            return { r, g, b };
        } catch (error) {
            console.warn('Could not extract artwork colors:', error);
            return null;
        }
    }
}