(() => {
  const generateButton = document.querySelector('#generate');
  const mascot = document.querySelector('#generate-mascot');
  if (!generateButton) return;

  const voices = [
    './voice/1.mp3',
    './voice/2.mp3'
  ];

  let currentAudio = null;
  let mascotTimer = null;

  function randomVoice() {
    if (!voices.length) return null;
    return voices[Math.floor(Math.random() * voices.length)];
  }

  function playRandomVoice() {
    const source = randomVoice();
    if (!source) return;

    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    currentAudio = new Audio(source);
    currentAudio.volume = 0.55;
    currentAudio.play().catch(() => {
      // Browser playback restrictions or loading errors should never block generation.
    });
  }

  function showMascot() {
    if (!mascot) return;
    clearTimeout(mascotTimer);
    mascot.classList.remove('is-popping');
    void mascot.offsetWidth;
    mascot.classList.add('is-popping');
    mascotTimer = setTimeout(() => mascot.classList.remove('is-popping'), 1900);
  }

  generateButton.addEventListener('click', () => {
    playRandomVoice();
    showMascot();
  });
})();
