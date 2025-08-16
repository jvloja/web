import config from './config.js';
import * as utils from './utils.js';

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

        // New property for EventSource
        this.metadataEventSource = null;

        // Visualizer properties
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.audioVisualizerContainer = document.getElementById('audio-visualizer');

        // Bind methods
        this.togglePlayPause = this.togglePlayPause.bind(this);
        this.updateVolume = this.updateVolume.bind(this);
        this.handlePlaybackError = this.handlePlaybackError.bind(this);
        this.fetchMetadata = this.fetchMetadata.bind(this);
        this.updateProgressBar = this.updateProgressBar.bind(this);
        this.handleMetadataUpdate = this.handleMetadataUpdate.bind(this);

        this.setupEventListeners();
        this.initializePlayer();
    }

    setupEventListeners() {
        // Play/Pause button listener
        this.playPauseButton.addEventListener('click', this.togglePlayPause);

        // Volume control listener
        this.volumeControl.addEventListener('input', this.updateVolume);

        // Audio element event listeners
        this.audioElement.addEventListener('error', this.handlePlaybackError);
        this.audioElement.addEventListener('canplay', () => {
            this.updateTotalTime();
        });
        this.audioElement.addEventListener('timeupdate', this.updateProgressBar);
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

    togglePlayPause() {
        if (this.audioElement.paused) {
            this.audioElement.play()
                .then(() => {
                    this.playPauseIcon.classList.remove('fa-play');
                    this.playPauseIcon.classList.add('fa-pause');
                    this.startMetadataPolling();
                    
                    // Ensure audio context is resumed and visualizer is initialized
                    if (this.audioContext && this.audioContext.state === 'suspended') {
                        this.audioContext.resume();
                    }
                    
                    // Initialize or restart visualizer
                    if (!this.analyser) {
                        this.initializeVisualizer();
                    } else {
                        // Restart animation
                        this.animateVisualizer();
                    }
                })
                .catch(this.handlePlaybackError);
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

    updateVolume() {
        const volume = parseFloat(this.volumeControl.value);
        this.audioElement.volume = volume;

        // Update volume icon
        if (volume === 0) {
            this.volumeIcon.classList.replace('fa-volume-up', 'fa-volume-mute');
        } else if (volume < 0.5) {
            this.volumeIcon.classList.replace('fa-volume-up', 'fa-volume-down');
        } else {
            this.volumeIcon.classList.replace('fa-volume-mute', 'fa-volume-up');
            this.volumeIcon.classList.replace('fa-volume-down', 'fa-volume-up');
        }
    }

    async fetchMetadata() {
        try {
            const response = await fetch(config.METADATA_API_URL);
            const xmlText = await response.text();
            
            const metadata = utils.parseXmlMetadata(xmlText);
            if (metadata) {
                this.artistNameElement.textContent = metadata.artist;
                this.trackTitleElement.textContent = metadata.title;
                this.albumInfoElement.textContent = metadata.album;

                // Update artwork
                const artworkResponse = await fetch(config.ARTWORK_API_URL);
                const artworkData = await artworkResponse.text();
                const processedArtwork = utils.processArtworkSource(artworkData, config.DEFAULT_ARTWORK);
                this.artistArtwork.src = processedArtwork;

                // Dynamic background adaptation
                const backgroundInfo = utils.createBackgroundFromArtwork(this.artistArtwork);
                if (backgroundInfo) {
                    document.body.style.background = backgroundInfo.background;
                }
            }
        } catch (error) {
            console.error('Metadata fetching error:', error);
            this.handlePlaybackError(error);
        }
    }

    startMetadataPolling() {
        this.stopMetadataPolling(); // Clear any existing polling or EventSource

        // Use EventSource for real-time metadata updates
        try {
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
                // Fallback to traditional metadata fetching
                this.fetchMetadata();
            };
        } catch (error) {
            console.error('EventSource initialization error:', error);
            this.fetchMetadata(); // Fallback method
        }
    }

    handleMetadataUpdate(metadata) {
        if (metadata && metadata.streamTitle) {
            // Split stream title into artist and track
            const parts = metadata.streamTitle.split(' - ');
            const artist = parts[0] || 'Unknown Artist';
            const title = parts[1] || 'Unknown Track';

            // Update track information
            this.artistNameElement.textContent = artist;
            this.trackTitleElement.textContent = title;
            this.albumInfoElement.textContent = '';

            // Fetch artwork and estimate track duration
            this.fetchArtworkForTrack(artist, title);
            
            // Estimate track duration (optional)
            this.estimateTrackDuration(title);
        }
    }

    async fetchArtworkForTrack(artist, title) {
        try {
            const params = new URLSearchParams({
                term: `${artist} ${title}`,
                entity: 'musicTrack',
                limit: 1
            });

            const response = await fetch(`${config.ITUNES_ARTWORK_SEARCH_URL}?${params}`);
            const data = await response.json();

            let artworkUrl = config.DEFAULT_ARTWORK;
            if (data.results && data.results.length > 0) {
                // Get high-resolution artwork by replacing 100x100 with 600x600
                artworkUrl = data.results[0].artworkUrl100.replace('100x100', '600x600');
            }

            const processedArtwork = utils.processArtworkSource(artworkUrl, config.DEFAULT_ARTWORK);
            this.artistArtwork.src = processedArtwork;

            // Wait for image to load before processing colors
            await new Promise((resolve) => {
                this.artistArtwork.onload = resolve;
            });

            // Dynamic background and player color adaptation
            const backgroundInfo = utils.createBackgroundFromArtwork(this.artistArtwork);
            if (backgroundInfo) {
                // More advanced color adaptation with smoother transitions
                const { r, g, b, brightness } = backgroundInfo;

                // Adaptive background with more nuanced gradient and smoother transition
                document.body.style.transition = 'background 0.5s ease';
                document.body.style.background = `linear-gradient(135deg, 
                    rgba(${r}, ${g}, ${b}, 0.9) 0%, 
                    rgba(${r}, ${g}, ${b}, 0.7) 50%, 
                    rgba(${r}, ${g}, ${b}, 0.5) 100%)`;

                // Player container with semi-transparent background and smooth transition
                const playerContainer = document.getElementById('player-container');
                playerContainer.style.transition = 'all 0.5s ease';
                playerContainer.style.background = `rgba(${r}, ${g}, ${b}, 0.2)`;
                playerContainer.style.backdropFilter = 'blur(15px)';

                // Adaptive text and control colors with smooth transition
                const textColor = brightness > 128 ? '#000' : '#fff';
                playerContainer.style.color = textColor;

                // Play button with dynamic color and smooth transition
                const playButton = this.playPauseButton;
                playButton.style.transition = 'all 0.5s ease';
                playButton.style.background = `rgba(${r}, ${g}, ${b}, 0.8)`;
                playButton.style.color = textColor;

                // Progress bar with artwork-based color and smooth transition
                const progressBar = this.progressBar;
                progressBar.style.transition = 'background 0.5s ease';
                progressBar.style.background = `rgba(${r}, ${g}, ${b}, 0.6)`;

                // Volume slider with dynamic thumb color and smooth transition
                const volumeControl = this.volumeControl;
                volumeControl.style.setProperty('--thumb-color', `rgb(${r}, ${g}, ${b})`);
                volumeControl.style.transition = 'all 0.5s ease';
            }

            // Fallback to multicolor background if artwork processing fails
            if (!backgroundInfo) {
                this.applyMulticolorBackground();
            }

        } catch (error) {
            console.error('iTunes artwork fetching error:', error);
            this.applyMulticolorBackground();
        }
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
        // If no estimated duration, use audio element's duration
        const duration = this.currentTrackDuration || this.audioElement.duration || 0;
        
        if (duration > 0) {
            // Use current time from the stream as a proxy for the track's progress
            const currentTime = this.audioElement.currentTime;
            const progressPercent = Math.min((currentTime / duration) * 100, 100);
            
            this.progressBar.style.width = `${progressPercent}%`;
            this.currentTimeElement.textContent = this.formatTime(currentTime);
        }
    }

    updateTotalTime(duration = null) {
        const trackDuration = duration || (this.audioElement.duration || this.currentTrackDuration || 0);
        this.totalTimeElement.textContent = this.formatTime(trackDuration);
        
        // Store the duration for reference
        this.currentTrackDuration = trackDuration;
        
        // Ensure the progress bar's max width reflects the full track duration
        this.progressBar.style.maxWidth = '100%';
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

    async estimateTrackDuration(title) {
        try {
            const params = new URLSearchParams({
                term: title,
                entity: 'musicTrack',
                limit: 1
            });

            const response = await fetch(`${config.ITUNES_ARTWORK_SEARCH_URL}?${params}`);
            const data = await response.json();

            if (data.results && data.results.length > 0) {
                const trackDuration = data.results[0].trackTimeMillis / 1000; // Convert to seconds
                this.updateTotalTime(trackDuration);
            } else {
                // Fallback to a default duration if no track found
                this.updateTotalTime(180); // Default to 3 minutes
            }
        } catch (error) {
            console.error('Track duration estimation error:', error);
            this.updateTotalTime(180); // Default to 3 minutes on error
        }
    }

    formatTime(seconds) {
        if (isNaN(seconds) || seconds <= 0) return '0:00';
        
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

    initializeVisualizer() {
        // Ensure audio context is created only once
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Recreate analyser each time
        this.analyser = this.audioContext.createAnalyser();
        
        // Configure analyser
        this.analyser.fftSize = 256;
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);

        // Ensure audio source is connected correctly
        try {
            // Disconnect any existing connections first
            const audioSource = this.audioContext.createMediaElementSource(this.audioElement);
            
            // Connect audio source to analyser and destination
            audioSource.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            // Create visualizer bars
            this.createVisualizerBars(bufferLength);

            // Start animation frame
            this.animateVisualizer();

            console.log('Visualizer initialized successfully');
        } catch (error) {
            console.error('Visualizer initialization error:', error);
        }
    }

    createVisualizerBars(bufferLength) {
        // Clear existing bars
        this.audioVisualizerContainer.innerHTML = '';
        
        // Create a fixed number of bars for better visual appeal
        const maxBars = 32;
        const step = Math.max(1, Math.floor(bufferLength / maxBars));
        
        for (let i = 0; i < maxBars; i++) {
            const bar = document.createElement('div');
            bar.classList.add('visualizer-bar');
            this.audioVisualizerContainer.appendChild(bar);
        }
    }

    animateVisualizer() {
        // Check if analyser exists and audio is playing
        if (!this.analyser || this.audioElement.paused) {
            return;
        }

        // Get frequency data
        this.analyser.getByteFrequencyData(this.dataArray);
        const bars = this.audioVisualizerContainer.children;
        
        // Adjust sensitivity and smoothing
        const sensitivity = 0.8; // Reduced for more subtle movement
        const maxHeight = 50; // Maximum bar height

        for (let i = 0; i < bars.length; i++) {
            // Use frequency data index that provides good visual representation
            const dataIndex = Math.floor(i * (this.dataArray.length / bars.length));
            
            // Calculate bar height based on frequency data
            let height = Math.min(
                maxHeight, 
                (this.dataArray[dataIndex] / 255) * maxHeight * sensitivity
            );
            
            // Smooth out sudden changes
            bars[i].style.height = `${height}px`;
        }

        // Continue animation
        requestAnimationFrame(() => this.animateVisualizer());
    }
}