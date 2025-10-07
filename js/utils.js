export function createBackgroundFromArtwork(artworkElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = artworkElement.width;
    canvas.height = artworkElement.height;
    
    ctx.drawImage(artworkElement, 0, 0, canvas.width, canvas.height);
    
    try {
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
        
        const darkenFactor = 0.6;
        const vibranceFactor = 1.4;
        
        r = Math.min(255, Math.floor(r * vibranceFactor * darkenFactor));
        g = Math.min(255, Math.floor(g * vibranceFactor * darkenFactor));
        b = Math.min(255, Math.floor(b * vibranceFactor * darkenFactor));
        
        const gradient1 = `linear-gradient(135deg, rgba(${r},${g},${b},0.9) 0%, rgba(${r},${g},${b},0.7) 100%)`;
        const gradient2 = `linear-gradient(225deg, rgba(${r},${g},${b},0.8) 0%, rgba(${r},${g},${b},0.6) 100%)`;
        
        const selectedGradient = Math.random() > 0.5 ? gradient1 : gradient2;
        
        return {
            background: selectedGradient,
            brightness: (r * 299 + g * 587 + b * 114) / 1000,
            r, g, b  
        };
    } catch (error) {
        console.warn('Could not adapt background:', error);
        return null;
    }
}

export function parseXmlMetadata(xmlText) {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

        const currentTrack = xmlDoc.querySelector('CurrentTrack TRACK');
        if (currentTrack) {
            return {
                artist: currentTrack.getAttribute('ARTIST') || 'Unknown Artist',
                title: currentTrack.getAttribute('TITLE') || 'Unknown Track',
                album: currentTrack.getAttribute('ALBUM') || 'Unknown Album',
                duration: currentTrack.getAttribute('DURATION') ? 
                    parseFloat(currentTrack.getAttribute('DURATION')) : null
            };
        }
        return null;
    } catch (error) {
        console.error('Metadata parsing error:', error);
        return null;
    }
}

export function processArtworkSource(rawData, defaultArtwork) {
    try {
        let src = defaultArtwork;

        if (rawData) {
            rawData = rawData.replace(/^"|"$/g, '').trim();

            if (rawData.startsWith('http') || rawData.startsWith('data:image')) {
                src = rawData;
            } else if (/^[A-Za-z0-9+/=]+$/.test(rawData)) {
                src = `data:image/jpeg;base64,${rawData}`;
            }
        }

        return src;
    } catch (error) {
        console.error('Artwork processing error:', error);
        return defaultArtwork;
    }
}