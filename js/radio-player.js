import config from './config.js';
import * as utils from './utils.js';

// Global callback for JSONP
window.handleDeezerResponse = function(data) {
    const artworkElement = document.getElementById('artist-artwork');
    if (data.data && data.data.length > 0 && data.data[0].album) {
        // Prefer the largest available cover and force a cache-busting param so newer hi-res images load
        const album = data.data[0].album;
        const artworkUrl = album.cover_xl || album.cover_big || album.cover_medium || config.DEFAULT_ARTWORK;
        const finalUrl = artworkUrl + (artworkUrl.includes('?') ? '&' : '?') + '_=' + Date.now();

        // Ensure crossOrigin and high-fidelity loading; set src/srcset to prefer XL for crisp rendering
        artworkElement.crossOrigin = 'anonymous';
        artworkElement.decoding = 'async';
        artworkElement.style.filter = 'none';
        artworkElement.style.imageRendering = 'auto';

        // Use the CDN URL directly for src and include srcset with XL and Big variants so browser picks best resolution
        artworkElement.src = finalUrl;
        artworkElement.srcset = [
            (album.cover_xl ? album.cover_xl : artworkUrl) + (artworkUrl.includes('?') ? '&' : '?') + '_=' + Date.now() + ' 2x',
            (album.cover_big ? album.cover_big : artworkUrl) + (artworkUrl.includes('?') ? '&' : '?') + '_=' + Date.now() + ' 1x'
        ].join(', ');
        artworkElement.sizes = '(max-width: 600px) 70vw, 300px';

        // Also try fetching as blob for best fidelity (non-blocking)
        fetch(finalUrl, { mode: 'cors' })
            .then(res => res.blob())
            .then(blob => {
                const objectUrl = URL.createObjectURL(blob);
                // Only replace if the browser still has the placeholder or a lower-res image
                artworkElement.src = objectUrl;
                // revoke blob URL after image loads to free memory
                artworkElement.onload = () => {
                    URL.revokeObjectURL(objectUrl);
                };
            })
            .catch(() => {
                // fallback already set via src/srcset
            });
    }
};

// Add global callback for background artwork
window.handleBackgroundDeezerResponse = function(data) {
    const backgroundArtwork = document.getElementById('background-artwork');
    if (!backgroundArtwork) {
        // Background element removed — nothing to do here
        return;
    }
    if (data.data && data.data.length > 0 && data.data[0].album) {
        const artworkUrl = data.data[0].album.cover_xl || data.data[0].album.cover_big || data.data[0].album.cover_medium || './img/cover.png';
        const finalUrl = artworkUrl + (artworkUrl.includes('?') ? '&' : '?') + '_=' + Date.now();

        // Fetch as blob for better fidelity, then set as background src and remove heavy blur
        fetch(finalUrl, { mode: 'cors' })
            .then(res => res.blob())
            .then(blob => {
                const objectUrl = URL.createObjectURL(blob);
                backgroundArtwork.src = objectUrl;
                // Keep background sharp; only adjust brightness slightly
                backgroundArtwork.style.filter = 'brightness(0.75)';
                backgroundArtwork.onload = () => {
                    URL.revokeObjectURL(objectUrl);
                };
            })
            .catch(() => {
                backgroundArtwork.src = finalUrl;
                backgroundArtwork.style.filter = 'brightness(0.75)';
            });
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
        this.currentStreamIndex = 0;
        this.retryCount = 0;
        this.maxRetries = 3;

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
        this.audioElement.addEventListener('loadstart', () => {
            console.log('Audio loading started');
        });
        this.audioElement.addEventListener('loadeddata', () => {
            console.log('Audio data loaded');
        });
        this.audioElement.addEventListener('canplaythrough', () => {
            console.log('Audio can play through');
        });
        
        // Handle mobile playback restrictions
        this.audioElement.addEventListener('loadedmetadata', () => {
            console.log('Audio metadata loaded');
        });
    }

    initializePlayer() {
        // Set initial volume
        this.audioElement.volume = 1.0;
        this.volumeControl.value = 1.0;

        // Set stream URL with crossorigin handling
        this.setupStreamSource();
    }

    setupStreamSource() {
        // Set crossorigin attribute for CORS
        this.audioElement.setAttribute('crossorigin', 'anonymous');
        
        // Try primary stream
        this.audioElement.src = config.RADIO_STREAM_URL;
        this.audioElement.load();
    }

    changeTitlePage(title = config.RADIO_NAME) {
        document.title = title;
        // Also update the on-page radio station name above metadata if present
        const stationEl = document.getElementById('radio-station-name');
        if (stationEl) stationEl.textContent = title;
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
        // Handle mobile autoplay restrictions with retry logic
        const attemptPlay = () => {
            const playPromise = this.audioElement.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    this.playPauseIcon.classList.remove('fa-play');
                    this.playPauseIcon.classList.add('fa-pause');
                    this.startMetadataPolling();
                    console.log('Playback started successfully');
                    this.retryCount = 0;
                }).catch((error) => {
                    console.error('Playback failed:', error);
                    this.handlePlaybackError(error);
                });
            } else {
                // Fallback for older browsers
                this.audioElement.play().catch(this.handlePlaybackError);
            }
        };

        // Attempt to play
        attemptPlay();
    }

    tryFallbackStream() {
        if (this.retryCount < this.maxRetries && config.FALLBACK_STREAM_URLS[this.currentStreamIndex + 1]) {
            this.currentStreamIndex++;
            this.audioElement.src = config.FALLBACK_STREAM_URLS[this.currentStreamIndex];
            this.audioElement.load();
            this.retryCount++;
            
            setTimeout(() => {
                this.playAudio();
            }, 1000);
        } else {
            this.errorMessageElement.textContent = 'Unable to play stream. Please check your connection.';
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
        // Try ShoutCast RPC JSONP first (uses callback global)
        try {
            const callbackName = `shoutcastCallback_${Date.now()}`;
            // Attach global callback to process RPC response
            window[callbackName] = (data) => {
                try {
                    // Clean up injected script and global callback
                    const injected = document.getElementById(callbackName);
                    if (injected) injected.remove();
                    delete window[callbackName];

                    // The RPC returns a wrapper; find data array
                    if (data && data.data && data.data.length > 0) {
                        const item = data.data[0];
                        // Normalize metadata to object expected by handleMetadataUpdate
                        const metadata = {
                            songtitle: item.rawmeta || `${item.track.artist} - ${item.track.title}`,
                            icestats: {
                                source: {
                                    server_name: item.server || config.RADIO_NAME,
                                    title: item.rawmeta || `${item.track.artist} - ${item.track.title}`,
                                    // Strip any HTML from summary (removes anchor tags like the FreeSHOUTCAST link)
                                    genre: item.summary ? item.summary.replace(/<[^>]*>/g, '').trim() : ''
                                }
                            },
                            _shoutcast_track: item.track // pass through for artwork url if present
                        };
                        
                        // Clean up songtitle and server title to remove "FreeSHOUTCAST AutoDJ - " and any HTML
                        if (metadata.songtitle) {
                            metadata.songtitle = metadata.songtitle.replace(/FreeSHOUTCAST AutoDJ\s*-\s*/i, '').replace(/<[^>]*>/g, '').trim();
                        }
                        if (metadata.icestats && metadata.icestats.source && metadata.icestats.source.title) {
                            metadata.icestats.source.title = metadata.icestats.source.title.replace(/FreeSHOUTCAST AutoDJ\s*-\s*/i, '').replace(/<[^>]*>/g, '').trim();
                        }

                        this.handleMetadataUpdate(metadata);
                    } else {
                        throw new Error('No data in ShoutCast RPC response');
                    }
                } catch (err) {
                    console.error('ShoutCast callback error:', err);
                    this.fallbackMetadataFetch();
                }
            };

            // Build JSONP URL (use provided RPC endpoint with callback param name)
            const url = `https://usa13.fastcast4u.com/external/rpc.php?callback=${callbackName}&m=streaminfo.get&username=radioactivahd&rid=radioactivahd`;
            const script = document.createElement('script');
            script.src = url;
            script.id = callbackName;
            script.async = true;
            document.body.appendChild(script);
        } catch (error) {
            console.warn('ShoutCast RPC JSONP failed, falling back:', error);
            this.fallbackMetadataFetch();
        }
    }

    fallbackMetadataFetch() {
        // Fallback to EventSource for metadata
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
            };
        } catch (error) {
            console.error('EventSource error:', error);
        }
    }

    handleMetadataUpdate(metadata) {
        console.log('Received metadata:', metadata);
        
        if (metadata && metadata.songtitle) {
            // Split stream title into artist and track
            const parts = metadata.songtitle.split(' - ');
            const artist = parts[0] || 'Unknown Artist';
            const title = parts[1] || 'Unknown Track';
            
            // Update track information
            this.artistNameElement.textContent = artist;
            this.trackTitleElement.textContent = title;
            
            // Always prefer Deezer search (higher fidelity) — use Centova image only as a last resort
            this.refreshCover(title, artist);
            this.refreshBackgroundCover(title, artist);
            // Also try iTunes artwork lookup for additional fallback options
            this.fetchItunesArtwork(artist, title);
            // If RPC provided an explicit image URL (legacy Centova/AutoDJ) keep it as a final fallback after a short delay
            const rpcTrack = metadata._shoutcast_track;
            if (rpcTrack && rpcTrack.imageurl) {
                setTimeout(() => {
                    const currentSrc = document.getElementById('artist-artwork').src || '';
                    if (!currentSrc || currentSrc.includes('placeholder')) {
                        const imgUrl = rpcTrack.imageurl;
                        const finalRpcUrl = imgUrl + (imgUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
                        this.artistArtwork.decoding = 'async';
                        this.artistArtwork.src = finalRpcUrl;
                        const bgEl = document.getElementById('background-artwork');
                        if (bgEl) bgEl.src = finalRpcUrl;
                    }
                }, 1200);
            }
            
            // Update dynamic colors based on artwork
            // dynamic color updates disabled
            this.lastMetadataUpdate = Date.now();
            
            // If metadata provides duration, use it to drive per-song progress bar
            let durationSeconds = null;
            if (metadata.duration && !isNaN(Number(metadata.duration))) {
                durationSeconds = Number(metadata.duration);
            } else if (rpcTrack && rpcTrack.duration && !isNaN(Number(rpcTrack.duration))) {
                durationSeconds = Number(rpcTrack.duration);
            } else if (metadata.icestats && metadata.icestats.source && metadata.icestats.source.duration && !isNaN(Number(metadata.icestats.source.duration))) {
                durationSeconds = Number(metadata.icestats.source.duration);
            }

            if (durationSeconds && durationSeconds > 0) {
                this.currentTrackDuration = durationSeconds;
                this.updateTotalTime(durationSeconds);
                this.progressBar.style.width = '0%';
                this.currentTimeElement.textContent = '0:00';
            } else {
                // Live stream / unknown duration
                this.currentTrackDuration = 0;
                this.progressBar.style.width = '100%';
                this.currentTimeElement.textContent = 'LIVE';
                this.totalTimeElement.textContent = 'LIVE';
            }
        } else if (metadata && metadata.icestats && metadata.icestats.source) {
            // Handle Icecast-style metadata
            const source = metadata.icestats.source;
            const artist = source.server_name || 'Jailson Webradio';
            const title = source.title || 'Live Stream';
            
            this.artistNameElement.textContent = artist;
            this.trackTitleElement.textContent = title;
            
            this.refreshCover(title, artist);
            this.refreshBackgroundCover(title, artist);
        }
    }

    formatDuration(seconds) {
        if (!seconds || seconds <= 0) return '';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }

    refreshCover(song = '', artist) {
        const artworkElement = document.getElementById('artist-artwork');
        const backgroundElement = document.getElementById('background-artwork');
        
        // Add exit animation
        artworkElement.classList.add('image-exit');
        if (backgroundElement) backgroundElement.style.opacity = '0.3';
        
        setTimeout(() => {
            // Create script for new artwork
            const script = document.createElement('script');
            script.src = `https://api.deezer.com/search?q=${encodeURIComponent(artist + ' ' + song)}&output=jsonp&callback=handleDeezerResponse`;
            document.body.appendChild(script);
            
            // After script loads, add enter animation
            setTimeout(() => {
                artworkElement.classList.remove('image-exit');
                artworkElement.classList.add('image-enter');
                if (backgroundElement) backgroundElement.style.opacity = '1';
                
                setTimeout(() => {
                    artworkElement.classList.remove('image-enter');
                }, 800);
            }, 100);
        }, 600);
    }

    refreshBackgroundCover(song = '', artist) {
        const backgroundElement = document.getElementById('background-artwork');
        if (!backgroundElement) return; // no background element present
        
        // Fade out current background
        backgroundElement.style.transform = 'scale(1.02) rotate(0deg)';
        backgroundElement.style.filter = 'brightness(0.8)';
        
        setTimeout(() => {
            const script = document.createElement('script');
            script.src = `https://api.deezer.com/search?q=${encodeURIComponent(artist + ' ' + song)}&output=jsonp&callback=handleBackgroundDeezerResponse`;
            document.body.appendChild(script);
            
            // Smooth transition in
            setTimeout(() => {
                backgroundElement.style.transform = 'scale(1.0) rotate(0deg)';
                backgroundElement.style.filter = 'brightness(0.85)';
            }, 100);
        }, 400);
    }

    startMetadataPolling() {
        this.lastMetadataUpdate = Date.now();
        
        // Try Sonic Panel API first, fallback to EventSource
        try {
            this.fetchMetadata();
        } catch (error) {
            console.warn('Sonic Panel API not available, using EventSource fallback');
            this.fallbackMetadataFetch();
        }
        
        // Set up periodic polling for Sonic Panel API
        this.metadataInterval = setInterval(() => {
            this.fetchMetadata();
        }, config.METADATA_POLLING_INTERVAL);
    }

    stopMetadataPolling() {
        if (this.metadataEventSource) {
            this.metadataEventSource.close();
            this.metadataEventSource = null;
        }
        
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
            
            if (elapsed >= duration) {
                this.progressBar.style.width = '0%';
                this.currentTimeElement.textContent = '0:00';
                // song finished: request fresh metadata immediately so metadata/artwork update
                this.lastMetadataUpdate = Date.now();
                try { this.fetchMetadata(); } catch (e) { /* ignore fetch errors */ }
            }
        } else {
            // Live stream / unknown duration: show full bar, LIVE as total time,
            // but display an increasing elapsed clock for current time.
            this.progressBar.style.width = '100%';
            this.totalTimeElement.textContent = 'LIVE';
            // Prefer audio element currentTime when available, otherwise derive from metadata timestamp
            const audioElapsed = (this.audioElement && isFinite(this.audioElement.currentTime) && this.audioElement.currentTime > 0)
                ? this.audioElement.currentTime
                : Math.max(0, Math.floor((Date.now() - this.lastMetadataUpdate) / 1000));
            this.currentTimeElement.textContent = this.formatTime(audioElapsed);
        }
    }

    updateTotalTime(duration = null) {
        const trackDuration = (duration != null) ? duration : (this.currentTrackDuration || 0);

        if (isFinite(trackDuration) && trackDuration > 0) {
            this.totalTimeElement.textContent = this.formatTime(trackDuration);
            this.currentTrackDuration = trackDuration;
        } else {
            // Unknown / live stream
            this.totalTimeElement.textContent = 'LIVE';
            this.currentTrackDuration = 0;
        }
    }

    handlePlaybackError(error) {
        console.error('Playback error:', error);
        
        // Handle specific error types
        if (error.code === 4 || error.message?.includes('MEDIA_ERR_SRC_NOT_SUPPORTED')) {
            // Try fallback streams
            this.tryFallbackStream();
            return;
        }
        
        let errorMsg = 'Unable to play stream. ';
        
        // Handle mobile-specific errors
        if (error.name === 'NotAllowedError') {
            errorMsg += 'Please tap to play.';
        } else if (error.name === 'NotSupportedError') {
            errorMsg += 'Audio format not supported on this browser.';
        } else {
            errorMsg += 'Please check your connection.';
        }
        
        this.errorMessageElement.textContent = errorMsg;
        
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
            
            @keyframes color-pulse {
                0% { filter: hue-rotate(0deg) saturate(1); }
                50% { filter: hue-rotate(30deg) saturate(1.2); }
                100% { filter: hue-rotate(0deg) saturate(1); }
            }
            
            #background-artwork {
                animation: color-pulse 8s ease-in-out infinite;
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

    updateDynamicColors() {
        // No-op: dynamic color changes disabled per user request.
    }

    // New: Query iTunes Search API for artwork fallback (uses JSON)
    fetchItunesArtwork(artist = '', title = '') {
        try {
            const term = encodeURIComponent(`${artist} ${title}`.trim());
            const url = `https://itunes.apple.com/search?term=${term}&entity=song&limit=1`;
            fetch(url)
                .then(res => res.json())
                .then(json => {
                    if (json.resultCount && json.results && json.results.length > 0) {
                        const r = json.results[0];
                        // Use 100x100 artwork and replace with higher size if available
                        const artworkUrl = r.artworkUrl100 ? r.artworkUrl100.replace(/100x100bb/, '600x600bb') : null;
                        if (artworkUrl) {
                            const finalArtwork = artworkUrl + (artworkUrl.includes('?') ? '&' : '?') + '_=' + Date.now();
                            const artworkElement = document.getElementById('artist-artwork');
                            const backgroundElement = document.getElementById('background-artwork');
                            artworkElement.decoding = 'async';
                            artworkElement.src = finalArtwork;
                            artworkElement.srcset = `${finalArtwork} 1x, ${finalArtwork} 2x`;
                            artworkElement.sizes = '(max-width: 600px) 70vw, 300px';
                            backgroundElement.src = finalArtwork;
                            // update colors after a slight delay to ensure image loaded
                            setTimeout(() => this.updateDynamicColors(), 800);
                        }
                    }
                })
                .catch(err => {
                    console.warn('iTunes artwork fetch failed:', err);
                });
        } catch (error) {
            console.warn('iTunes lookup error:', error);
        }
    }
}