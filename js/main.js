const audio = document.getElementById('audio-player');
  const songTitle = document.getElementById('song-title');
  const artistName = document.getElementById('artist-name');
  const albumCover = document.getElementById('album-cover');
  const playStopButton = document.getElementById('play-stop-button');
  const volumeSlider = document.getElementById('volume-slider');
  const progressBar = document.getElementById('progress');
  const currentTimeDisplay = document.getElementById('current-time');
  const durationDisplay = document.getElementById('duration');
  const durationBar = document.getElementById('duration-bar');
  const historyModal = document.getElementById('history-modal');
  const socialMediaModal = document.getElementById('social-media-modal');
  const tvModal = document.getElementById('tv-modal');
  const tvButton = document.getElementById('tv-button');
  const tvStream = document.getElementById('tv-stream');

  let songStartTime = 0;
  let songDuration = 0;
  let isPlaying = false;
  let currentSongIndex = 0;
  let playlist = [];

  function togglePlayStop() {
    if (isPlaying) {
      audio.pause();
      playStopButton.innerHTML = '<div class="play-icon"></div>';
      playStopButton.classList.remove('playing');
    } else {
      audio.play();
      playStopButton.innerHTML = '<div class="stop-icon"></div>';
      playStopButton.classList.add('playing');
    }
    isPlaying = !isPlaying;
  }

  volumeSlider.addEventListener('input', function() {
    audio.volume = this.value;
  });

  function fetchAlbumCover(artist, title) {
    fetchItunesData(artist, title).then(data => {
      if (data.artworkUrl100) {
        const albumCoverUrl = data.artworkUrl100.replace('100x100', '600x600');
        albumCover.src = albumCoverUrl;
        songDuration = data.trackTimeMillis ? data.trackTimeMillis / 1000 : 0;
        updateDurationDisplay(songDuration);
      } else {
        albumCover.src = 'imgs/portada.jpg'; // cambiar la portada 
        songDuration = 0;
        updateDurationDisplay(0);
      }
    });
  }

  function updateDurationDisplay(duration) {
    durationDisplay.textContent = formatTime(duration);
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  function updateProgressBar() {
    if (songDuration > 0 && isPlaying) {
      const currentTime = (Date.now() - songStartTime) / 1000;
      const progress = (currentTime / songDuration) * 100;
      progressBar.style.width = `${Math.min(progress, 100)}%`;
      currentTimeDisplay.textContent = formatTime(currentTime);

      if (currentTime >= songDuration) {
        playNextSong();
      }
    }
  }

  setInterval(updateProgressBar, 1000);

  function playNextSong() {
    currentSongIndex = (currentSongIndex + 1) % playlist.length;
    playSong(playlist[currentSongIndex]);
  }

  function playSong(song) {
    songTitle.textContent = song.title;
    artistName.textContent = song.artist;
    fetchAlbumCover(song.artist, song.title);
    songStartTime = Date.now();
    progressBar.style.width = '0%';
    currentTimeDisplay.textContent = '0:00';
  }

  durationBar.addEventListener('click', function(e) {
    const clickPosition = e.clientX - this.getBoundingClientRect().left;
    const clickPercentage = clickPosition / this.offsetWidth;
    const seekTime = songDuration * clickPercentage;
    
    songStartTime = Date.now() - (seekTime * 1000);
    currentTimeDisplay.textContent = formatTime(seekTime);
    progressBar.style.width = `${clickPercentage * 100}%`;
  });

  function startMetadataUpdates() {
    const eventSource = new EventSource('https://api.zeno.fm/mounts/metadata/subscribe/y4t2vaqeny8uv'); // cambiar el id para los metadatos de zeno fm rg2qdap7a5zuv no borra / poner su id

    eventSource.onmessage = function(event) {
      const data = JSON.parse(event.data);
      if (data.streamTitle) {
        const parts = data.streamTitle.split(' - ');
        if (parts.length >= 2) {
          const artist = parts.pop();
          const title = parts.join(' - ');
          
          const newSong = { artist, title };
          if (!playlist.some(song => song.artist === artist && song.title === title)) {
            playlist.push(newSong);
          }
          
          currentSongIndex = playlist.findIndex(song => song.artist === artist && song.title === title);
          
          songTitle.textContent = title;
          artistName.textContent = artist;
          fetchAlbumCover(artist, title);
          songStartTime = Date.now();
          progressBar.style.width = '0%';
          currentTimeDisplay.textContent = '0:00';
        } else {
          songTitle.textContent = data.streamTitle;
          artistName.textContent = 'Artista desconocido';
          albumCover.src = 'imgs/portada.jpg';
          songDuration = 0;
          updateDurationDisplay(0);
        }
      }
    };

    eventSource.onerror = function(error) {
      console.error('Error en la conexión EventSource:', error);
      eventSource.close();
      setTimeout(startMetadataUpdates, 5000);
    };
  }

  const historyButton = document.getElementById('history-button');
  const socialMediaButton = document.getElementById('social-media-button');
  const closeButton = document.querySelectorAll('.close');
  const songHistoryList = document.getElementById('song-history-list');

  historyButton.onclick = function() {
    historyModal.style.display = "block";
    updateSongHistory();
  }

  socialMediaButton.onclick = function() {
    socialMediaModal.style.display = "block";
  }

  tvButton.onclick = function() {
    tvModal.style.display = "block";
    tvStream.play();
  }

  closeButton.forEach(button => {
    button.onclick = function() {
      this.closest('.modal').style.display = "none";
      if (this.closest('.modal') === tvModal) {
        tvStream.pause();
      }
    }
  });

  window.onclick = function(event) {
    if (event.target == historyModal || event.target == socialMediaModal || event.target == tvModal) {
      historyModal.style.display = "none";
      socialMediaModal.style.display = "none";
      tvModal.style.display = "none";
      tvStream.pause();
    }
  }

  function updateSongHistory() {
    songHistoryList.innerHTML = '';
    playlist.slice().reverse().forEach(song => {
      const li = document.createElement('li');
      fetchItunesData(song.artist, song.title).then(itunesData => {
        li.innerHTML = `
          <img src="${itunesData.artworkUrl100}"  alt="${song.title} cover">
          <strong>${song.title}</strong> - ${song.artist}
          
          ${itunesData.previewUrl ? `imgs/portada.jpg` : ''} // cambiar la portada
        `;
        songHistoryList.appendChild(li);
      });
    });
  }

  function fetchItunesData(artist, title) {
    const itunesApiUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artist + ' ' + title)}&entity=song&limit=1`;
    return fetch(itunesApiUrl)
      .then(response => response.json())
      .then(data => {
        if (data.results && data.results.length > 0) {
          return data.results[0];
        }
        return {};
      })
      .catch(error => {
        console.error('Error fetching iTunes data:', error);
        return {};
      });
  }

  startMetadataUpdates();